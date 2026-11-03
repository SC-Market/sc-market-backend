/**
 * The wipe, its one message per user, and Relist all (listing-wipe.service.ts).
 * The database is knex-mock-client through mock-knex-db; notify(), the shop
 * permissions and the refresh are mocked (they have their own tests).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({
  db: null as unknown,
  notify: vi.fn(),
  orgMembers: vi.fn(),
  shopsForUser: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../notify/dispatcher.js", () => ({ notify: h.notify }))
vi.mock("../notify/recipients.js", () => ({
  orgMembersWithPermission: h.orgMembers,
}))
vi.mock("../shops/shop-permissions.service.js", () => ({
  getShopsForUser: h.shopsForUser,
}))
vi.mock("../market-v2/listing-refresh.service.js", () => ({
  applyListingRefresh: h.refresh,
}))

const svc = await import("./listing-wipe.service.js")
const { CATALOG } = await import("../notify/catalog.js")

const WIPE = "aaaaaaaa-0000-4000-8000-000000000001"
let db: Knex
let tracker: Tracker

const planned = (n: number) => ({
  planned: Array.from({ length: n }, () => ({})),
  delivered: Array.from({ length: n }, () => ({})),
  failed: [],
  duplicate: [],
})
const shop = (shop_id: string, can_manage: boolean) => ({
  shop_id,
  permissions: { can_manage },
})

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.DISCORD_DM_DISABLED_EVENTS
  db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  h.notify.mockResolvedValue(planned(1))
})

describe("event", () => {
  it("market category (org mutes apply): in-app, push and Discord DM on, email opt-in", () => {
    const def = CATALOG["listing.paused_by_wipe"]
    expect(def.category).toBe("market")
    expect(def.legacyAction).toBe("listing_paused_by_wipe")
    expect(def.defaults).toEqual({
      in_app: true,
      push: true,
      email: false,
      discord_dm: true,
    })
  })

  it("says the approved text and links to the relist banner", () => {
    const m = svc.wipeMessages("en", WIPE)
    expect(`${m.push.title}. ${m.push.body}`).toBe(
      "Your listings were paused for the wipe. Relist them in one tap.",
    )
    expect(m.push.data.url).toBe("https://sc-market.space/market/me")
    expect(m.discord_dm.allowed_mentions).toEqual({ parse: [] })
    expect(m.discord_dm.embeds[0].description).toContain(
      "(https://sc-market.space/market/me)",
    )
    expect(m.email.data.wipeRelist).toEqual({
      wipe_id: WIPE,
      path: "/market/me",
    })
    expect(svc.wipeMessages("de", WIPE).push.title).toBe(
      "Ihre Inserate wurden für den Wipe pausiert",
    )
  })
})

describe("the wipe", () => {
  it("records the wipe, pauses active listings and tags each with the wipe id, in one transaction", async () => {
    tracker.on
      .insert("listing_wipes")
      .response([{ wipe_id: WIPE, ran_at: new Date("2026-11-03T12:00:00Z") }])
    tracker.on.any(/insert into listing_wipe_items/i).response({ rowCount: 3 })
    tracker.on.update("listing_wipes").response(1)
    const result = await svc.runWipe(db, "admin1")
    expect(result).toEqual({
      wipe_id: WIPE,
      ran_at: "2026-11-03T12:00:00.000Z",
      affected: 3,
    })
    const tag = tracker.history.any.find((q) =>
      /listing_wipe_items/.test(q.sql),
    )!
    expect(tag.sql).toMatch(
      /UPDATE listings\s+SET status = 'expired'.*WHERE status = 'active'/s,
    )
    expect(tag.bindings).toEqual([WIPE])
    expect(tracker.history.update[0].bindings).toContain(3)
    expect(tracker.history.transactions.length).toBe(1)
  })
})

describe("one message per user", () => {
  it("one entry per user across their personal shop and the org shops they manage", () => {
    const r = svc.groupRecipients(
      [
        { shop_id: "s1", owner_user_id: "u1", owner_contractor_id: null },
        { shop_id: "s2", owner_user_id: null, owner_contractor_id: "org1" },
        { shop_id: "s3", owner_user_id: null, owner_contractor_id: "org1" },
        { shop_id: "s4", owner_user_id: null, owner_contractor_id: "org2" },
      ],
      new Map([
        ["org1", ["u1", "u2"]],
        ["org2", ["u2"]],
      ]),
    )
    expect(r).toEqual([
      { userId: "u1", personal: true, contractorIds: ["org1"] },
      { userId: "u2", personal: false, contractorIds: ["org1", "org2"] },
    ])
  })

  it("queues manage_market members and owners, never test shops or test accounts, at most once", async () => {
    tracker.on.select("shops").response([
      { shop_id: "s1", owner_user_id: "u1", owner_contractor_id: null },
      { shop_id: "s2", owner_user_id: null, owner_contractor_id: "org1" },
    ])
    h.orgMembers.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
      { userId: "tester" },
    ])
    tracker.on
      .select("accounts")
      .response([{ user_id: "u1" }, { user_id: "u2" }])
    tracker.on
      .insert("listing_wipe_notices")
      .response([{ user_id: "u1" }, { user_id: "u2" }])

    expect(await svc.queueWipeNotices(db, WIPE)).toBe(2)
    expect(h.orgMembers).toHaveBeenCalledWith("org1", "manage_market")
    const [shops, accounts] = tracker.history.select
    expect(shops.sql).toContain('"s"."is_test" = ')
    expect(accounts.sql).toContain('"is_test" = ')
    expect(accounts.sql).toContain('"deleted_at" is null')
    const insert = tracker.history.insert[0]
    expect(insert.sql).toContain(
      'on conflict ("wipe_id", "user_id") do nothing',
    )
    expect(insert.bindings).not.toContain("tester")
  })

  it("personal shop owner: one notify under Personal, deduped per wipe and user", async () => {
    expect(
      await svc.sendOne({
        wipe_id: WIPE,
        user_id: "u1",
        personal: true,
        contractor_ids: ["org1"],
      }),
    ).toBe("sent")
    expect(h.notify).toHaveBeenCalledTimes(1)
    const [event, recipients, opts] = h.notify.mock.calls[0]
    expect(event).toBe("listing.paused_by_wipe")
    expect(recipients).toEqual([{ userId: "u1", contractorId: null }])
    expect(opts).toMatchObject({ entityId: WIPE, dedupeKey: `${WIPE}:u1` })
    expect(opts.channels).toContain("discord_dm")
  })

  it("org member: the next org when the first lets nothing through (muted and in-app off); never two", async () => {
    h.notify.mockResolvedValueOnce(planned(0)).mockResolvedValueOnce(planned(1))
    await svc.sendOne({
      wipe_id: WIPE,
      user_id: "u2",
      personal: false,
      contractor_ids: ["org1", "org2", "org3"],
    })
    expect(h.notify.mock.calls.map((c) => c[1][0].contractorId)).toEqual([
      "org1",
      "org2",
    ])
  })

  it("everything off: nothing sent, outcome off", async () => {
    h.notify.mockResolvedValue(planned(0))
    expect(
      await svc.sendOne({
        wipe_id: WIPE,
        user_id: "u2",
        personal: false,
        contractor_ids: ["org1"],
      }),
    ).toBe("off")
  })

  it("the Discord DM kill switch drops the DM only", async () => {
    process.env.DISCORD_DM_DISABLED_EVENTS = "listing.paused_by_wipe"
    await svc.sendOne({
      wipe_id: WIPE,
      user_id: "u1",
      personal: true,
      contractor_ids: [],
    })
    expect(h.notify.mock.calls[0][2].channels).toEqual([
      "in_app",
      "push",
      "email",
    ])
  })

  it("sends claimed batches until none are left and records each; a second run sends nothing", async () => {
    const claim = /update listing_wipe_notices n/i
    tracker.on.any(claim).responseOnce({
      rows: [
        {
          wipe_id: WIPE,
          user_id: "u1",
          personal: true,
          contractor_ids: [],
          locale: "fr",
        },
        {
          wipe_id: WIPE,
          user_id: "u2",
          personal: false,
          contractor_ids: ["org1"],
          locale: null,
        },
      ],
    })
    tracker.on.any(claim).response({ rows: [] })
    tracker.on.update("listing_wipe_notices").response(1)

    expect(await svc.sendWipeNotices({ pauseMs: 0, batchSize: 2 })).toEqual({
      sent: 2,
      skipped: 0,
      failed: 0,
    })
    expect(h.notify).toHaveBeenCalledTimes(2)
    expect(h.notify.mock.calls[0][2].messages.push.title).toBe(
      "Vos annonces ont été mises en pause pour le wipe",
    )
    const first = tracker.history.any[0]
    expect(first.sql).toContain("FOR UPDATE SKIP LOCKED")
    expect(first.sql).toContain("sent_at IS NULL")
    expect(first.bindings).toEqual([2])
    expect(tracker.history.update.map((q) => q.bindings.slice(-2))).toEqual([
      [WIPE, "u1"],
      [WIPE, "u2"],
    ])

    h.notify.mockClear()
    expect(await svc.sendWipeNotices({ pauseMs: 0 })).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
    })
    expect(h.notify).not.toHaveBeenCalled()
  })

  it("a failed message is recorded and not retried", async () => {
    const claim = /update listing_wipe_notices n/i
    tracker.on
      .any(claim)
      .responseOnce({
        rows: [
          { wipe_id: WIPE, user_id: "u1", personal: true, contractor_ids: [] },
        ],
      })
    tracker.on.any(claim).response({ rows: [] })
    tracker.on.update("listing_wipe_notices").response(1)
    h.notify.mockRejectedValueOnce(new Error("boom"))
    expect(await svc.sendWipeNotices({ pauseMs: 0 })).toEqual({
      sent: 0,
      skipped: 0,
      failed: 1,
    })
    expect(tracker.history.update[0].bindings).toContain("failed")
  })
})

describe("relist all", () => {
  const paused = [
    { listing_id: "l1", status: "expired", expires_at: null },
    { listing_id: "l2", status: "expired", expires_at: null },
  ]

  it("only that wipe's still-paused, not-relisted listings in shops the user can manage", async () => {
    h.shopsForUser.mockResolvedValue([shop("s1", true), shop("s2", false)])
    tracker.on.select("listing_wipe_items").response(paused)
    expect(await svc.relistAll(db, "u1", null, WIPE)).toEqual({ relisted: 2 })
    const q = tracker.history.select[0]
    expect(q.sql).toContain('"l"."shop_id" in (')
    expect(q.bindings).toContain("s1")
    expect(q.bindings).not.toContain("s2")
    expect(q.sql).toContain('"l"."status" = ')
    expect(q.bindings).toContain("expired")
    expect(q.sql).toContain('"i"."relisted_at" is null')
    expect(q.bindings).toContain(WIPE)
    expect(h.refresh.mock.calls.map((c) => [c[1].listing_id, c[2]])).toEqual([
      ["l1", "u1"],
      ["l2", "u1"],
    ])
  })

  it("running it twice changes nothing the second time", async () => {
    h.shopsForUser.mockResolvedValue([shop("s1", true)])
    tracker.on.select("listing_wipe_items").responseOnce(paused)
    tracker.on.select("listing_wipe_items").response([])
    await svc.relistAll(db, "u1", null, WIPE)
    h.refresh.mockClear()
    expect(await svc.relistAll(db, "u1", null, WIPE)).toEqual({ relisted: 0 })
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it("a shop the user can't manage: nothing, without touching the listings", async () => {
    h.shopsForUser.mockResolvedValue([shop("s1", true), shop("s2", false)])
    expect(await svc.relistAll(db, "u1", null, WIPE, "s2")).toEqual({
      relisted: 0,
    })
    expect(await svc.relistSummary(db, "u1", null, "s2")).toBeNull()
    expect(tracker.history.select).toHaveLength(0)
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it("passes the API token's org grant to the shop lookup", async () => {
    h.shopsForUser.mockResolvedValue([])
    await svc.relistSummary(db, "u1", ["org1"])
    expect(h.shopsForUser).toHaveBeenCalledWith("u1", ["org1"])
  })

  it("the banner: latest wipe with something to relist, and how many", async () => {
    h.shopsForUser.mockResolvedValue([shop("s1", true)])
    tracker.on
      .select("listing_wipe_items")
      .response({
        wipe_id: WIPE,
        ran_at: new Date("2026-11-03T12:00:00Z"),
        count: 7,
      })
    expect(await svc.relistSummary(db, "u1", null, "s1")).toEqual({
      wipe_id: WIPE,
      ran_at: "2026-11-03T12:00:00.000Z",
      count: 7,
    })
    expect(tracker.history.select[0].sql).toContain(
      'order by "w"."ran_at" desc',
    )
  })
})

describe("admin", () => {
  it("last wipe: paused, relisted so far, messages", async () => {
    tracker.on
      .select("listing_wipes")
      .response({
        wipe_id: WIPE,
        ran_at: new Date("2026-11-03T12:00:00Z"),
        paused_count: 40,
      })
    tracker.on.select("listing_wipe_items").response([{ relisted: 12 }])
    tracker.on.select("listing_wipe_notices").response([{ queued: 9, sent: 8 }])
    expect(await svc.lastWipeStats(db)).toEqual({
      wipe_id: WIPE,
      ran_at: "2026-11-03T12:00:00.000Z",
      paused: 40,
      relisted: 12,
      messages_queued: 9,
      messages_sent: 8,
    })
  })

  it("no wipe yet: null", async () => {
    tracker.on.select("listing_wipes").response(undefined)
    expect(await svc.lastWipeStats(db)).toBeNull()
  })
})

describe("relisted bookkeeping", () => {
  it("marks the listing's open wipe items relisted", async () => {
    tracker.on.update("listing_wipe_items").response(1)
    await svc.markWipeRelisted(db, ["l1"])
    const q = tracker.history.update[0]
    expect(q.sql).toContain('"relisted_at" is null')
    expect(q.bindings).toContain("l1")
  })
})
