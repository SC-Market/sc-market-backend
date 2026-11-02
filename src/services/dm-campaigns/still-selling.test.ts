/**
 * "Still selling?" campaign: the signed links, the kill switch, throttling,
 * one DM per person, the DM itself and the links' actions. The database is
 * knex-mock-client (test-utils/mock-knex-db.ts) with dm_campaign_recipients
 * simulated in memory; Discord is a fake. No DM is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../discord/discord.service.js", () => ({
  discordService: {
    trySendDirectMessage: vi.fn(async () => ({
      ok: false,
      error: "real Discord must not be used",
    })),
  },
}))
vi.mock("../discord/dm-reachability.js", () => ({
  discordDmReachableUsers: vi.fn(async () => {
    throw new Error("tests inject reachability")
  }),
}))
vi.mock("../audit/audit.service.js", () => ({
  auditService: { log: vi.fn(async () => {}), logBatch: vi.fn(async () => {}) },
}))
vi.mock("../market-v2/listing-refresh.service.js", () => ({
  applyListingRefresh: vi.fn(async () => ({
    renewal: false,
    reactivated: false,
  })),
}))

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret"

const tokens = await import("./campaign-action-token.js")
const msg = await import("./still-selling-message.js")
const svc = await import("./still-selling.service.js")
const { discordService } = await import("../discord/discord.service.js")
const { applyListingRefresh } =
  await import("../market-v2/listing-refresh.service.js")

const SECRET = "s3cret"
const U1 = "11111111-2222-4333-8444-555555555555"
const U2 = "22222222-2222-4333-8444-555555555555"
const L1 = "aaaaaaaa-0000-4000-8000-000000000001"
const L2 = "aaaaaaaa-0000-4000-8000-000000000002"
const L3 = "aaaaaaaa-0000-4000-8000-000000000003"
const L4 = "aaaaaaaa-0000-4000-8000-000000000004"
const NOW = new Date("2026-11-02T12:00:00Z")

let tracker: Tracker

function uuid(i: number) {
  return `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
}

function candidate(i: number) {
  return {
    user_id: uuid(i),
    discord_id: String(100000000000000000 + i),
    locale: "en",
    listing_ids: [L1, L2],
    newest_update: new Date("2026-08-15T00:00:00Z"),
    shop_slugs: ["shop"],
  }
}

/**
 * dm_campaign_recipients in memory: the candidates query leaves out claimed
 * users (its NOT EXISTS), the claim insert is ON CONFLICT DO NOTHING.
 */
function simulateCampaignTable(people: ReturnType<typeof candidate>[]) {
  const claimed = new Set<string>()
  tracker.on
    .any(/WITH stale AS/)
    .response(() => ({ rows: people.filter((p) => !claimed.has(p.user_id)) }))
  tracker.on
    .any(/INSERT INTO dm_campaign_recipients/)
    .response((q: { bindings: unknown[] }) => {
      const user = q.bindings[1] as string
      if (claimed.has(user)) return { rows: [] }
      claimed.add(user)
      return { rows: [{ user_id: user }] }
    })
  tracker.on.update("dm_campaign_recipients").response(1)
  return claimed
}

const everyoneReachable = async (ids: string[]) => new Set(ids)

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
  svc.resetRunStateForTests()
  vi.mocked(discordService.trySendDirectMessage).mockClear()
  vi.mocked(applyListingRefresh).mockClear()
})

afterEach(() => {
  delete process.env[svc.KILL_SWITCH_ENV]
})

describe("campaign action token", () => {
  it("round-trips one user and one action, valid 30 days", () => {
    const t = tokens.createCampaignActionToken(
      { campaign: "still_selling_2026_11", userId: U1, action: "keep" },
      { now: NOW, secret: SECRET },
    )
    const r = tokens.verifyCampaignActionToken(t, { now: NOW, secret: SECRET })
    expect(r).toEqual({
      ok: true,
      claim: {
        campaign: "still_selling_2026_11",
        userId: U1,
        action: "keep",
        expiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
        test: false,
      },
    })
  })

  it("expires after TOKEN_TTL_DAYS", () => {
    const t = tokens.createCampaignActionToken(
      { campaign: "c", userId: U1, action: "pause" },
      { now: NOW, secret: SECRET },
    )
    const day29 = new Date(NOW.getTime() + 29 * 86_400_000)
    const day30 = new Date(NOW.getTime() + 30 * 86_400_000)
    expect(
      tokens.verifyCampaignActionToken(t, { now: day29, secret: SECRET }).ok,
    ).toBe(true)
    expect(
      tokens.verifyCampaignActionToken(t, { now: day30, secret: SECRET }),
    ).toEqual({ ok: false, reason: "expired" })
  })

  it("rejects a tampered payload, another key, another prefix and junk", () => {
    const t = tokens.createCampaignActionToken(
      { campaign: "c", userId: U1, action: "keep" },
      { now: NOW, secret: SECRET },
    )
    const [p, payload, sig] = t.split(".")
    const forged = Buffer.from(
      JSON.stringify({ c: "c", u: U2, a: "keep", x: 9999999999 }),
    ).toString("base64url")
    const pauseInstead = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString()),
        a: "pause",
      }),
    ).toString("base64url")
    for (const bad of [
      `${p}.${forged}.${sig}`,
      `${p}.${pauseInstead}.${sig}`,
      `u1.${payload}.${sig}`,
      `${p}.${payload}.${sig.slice(0, -2)}`,
      "",
      "a.b",
      "x".repeat(600),
    ]) {
      expect(
        tokens.verifyCampaignActionToken(bad, { now: NOW, secret: SECRET }),
      ).toEqual({ ok: false, reason: "invalid" })
    }
    expect(
      tokens.verifyCampaignActionToken(t, { now: NOW, secret: "other" }),
    ).toEqual({ ok: false, reason: "invalid" })
  })

  it("is not an email unsubscribe token (separate key)", async () => {
    const { createUnsubscribeToken } =
      await import("../email/unsubscribe-token.js")
    const u = createUnsubscribeToken(
      { userId: U1, scope: { kind: "key_defaults" }, contractorId: null },
      SECRET,
    )
    expect(
      tokens.verifyCampaignActionToken(u, { now: NOW, secret: SECRET }).ok,
    ).toBe(false)
  })
})

describe("kill switch", () => {
  it(`${svc.KILL_SWITCH_ENV}=true only; unset is off`, () => {
    expect(svc.campaignEnabled({})).toBe(false)
    expect(svc.campaignEnabled({ [svc.KILL_SWITCH_ENV]: "1" })).toBe(false)
    expect(svc.campaignEnabled({ [svc.KILL_SWITCH_ENV]: "TRUE" })).toBe(false)
    expect(svc.campaignEnabled({ [svc.KILL_SWITCH_ENV]: "true" })).toBe(true)
    delete process.env[svc.KILL_SWITCH_ENV]
    expect(svc.campaignEnabled()).toBe(false)
  })

  it("off: Send is refused before any query or DM", async () => {
    const send = vi.fn()
    const r = await svc.startCampaign(10, {
      reachable: everyoneReachable,
      send,
    })
    expect(r).toEqual({ ok: false, reason: "disabled" })
    expect(tracker.history.all).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
    expect(discordService.trySendDirectMessage).not.toHaveBeenCalled()
  })

  it("turned off mid-run: stops before the next DM", async () => {
    simulateCampaignTable([1, 2, 3, 4, 5, 6].map(candidate))
    let on = true
    const send = vi.fn(async () => {
      if (send.mock.calls.length === 3) on = false
      return { ok: true as const }
    })
    const state = await svc.runCampaign(100, {
      reachable: everyoneReachable,
      send,
      sleep: async () => {},
      enabled: () => on,
    })
    expect(send).toHaveBeenCalledTimes(3)
    expect(state.finish_reason).toBe("disabled")
  })

  it("on, through the env var: a run starts", async () => {
    process.env[svc.KILL_SWITCH_ENV] = "true"
    simulateCampaignTable([candidate(1)])
    const send = vi.fn(async () => ({ ok: true as const }))
    const r = await svc.startCampaign(1, {
      reachable: everyoneReachable,
      send,
      sleep: async () => {},
    })
    expect(r.ok).toBe(true)
    await vi.waitFor(() => expect(svc.runState().running).toBe(false))
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe("throttling", () => {
  it(`sends batches of ${svc.BATCH_SIZE}, DMs ${svc.DM_SPACING_MS} ms apart, ${svc.BATCH_PAUSE_MS} ms between batches`, async () => {
    simulateCampaignTable(
      Array.from({ length: 23 }, (_, i) => candidate(i + 1)),
    )
    const events: string[] = []
    const send = vi.fn(async () => {
      events.push("dm")
      return { ok: true as const }
    })
    const sleep = vi.fn(async (ms: number) => {
      events.push(`sleep:${ms}`)
    })
    const state = await svc.runCampaign(100, {
      reachable: everyoneReachable,
      send,
      sleep,
      enabled: () => true,
    })
    expect(send).toHaveBeenCalledTimes(23)
    expect(state.finish_reason).toBe("done")
    const batches = events
      .join(",")
      .split(`sleep:${svc.BATCH_PAUSE_MS}`)
      .map((b) => b.split(",").filter((e) => e === "dm").length)
      .filter((n) => n > 0)
    expect(batches).toEqual([10, 10, 3])
    // Within a batch, every DM after the first waits DM_SPACING_MS.
    expect(
      sleep.mock.calls.filter(([ms]) => ms === svc.DM_SPACING_MS),
    ).toHaveLength(9 + 9 + 2)
    // At most BATCH_SIZE DMs per BATCH_PAUSE_MS: 10 a minute.
    expect(svc.BATCH_SIZE).toBe(10)
    expect(svc.BATCH_PAUSE_MS).toBe(60_000)
  })

  it("never sends more than the confirmed count", async () => {
    simulateCampaignTable(
      Array.from({ length: 15 }, (_, i) => candidate(i + 1)),
    )
    const send = vi.fn(async () => ({ ok: true as const }))
    const state = await svc.runCampaign(4, {
      reachable: everyoneReachable,
      send,
      sleep: async () => {},
      enabled: () => true,
    })
    expect(send).toHaveBeenCalledTimes(4)
    expect(state.finish_reason).toBe("limit")
  })

  it("refuses to start when more people are eligible than confirmed", async () => {
    simulateCampaignTable([1, 2, 3].map(candidate))
    const send = vi.fn()
    const r = await svc.startCampaign(2, {
      reachable: everyoneReachable,
      send,
      enabled: () => true,
    })
    expect(r).toEqual({ ok: false, reason: "count_changed", recipients: 3 })
    expect(send).not.toHaveBeenCalled()
  })
})

/** The WHERE of the stale-listings CTE: the only place listings make anyone eligible. */
function staleWhere(): string {
  const { sql } = svc.candidatesSql()
  const cte = sql.slice(
    sql.indexOf("WITH stale AS"),
    sql.indexOf("sellers AS ("),
  )
  return cte.slice(cte.indexOf("WHERE"))
}

describe("eligibility: only live listings count", () => {
  it("requires status 'active' and nothing else (one status test, no OR / IN)", () => {
    const where = staleWhere()
    expect(where.match(/l\.status\s*(=|IN|<>|!=)/g)).toEqual(["l.status ="])
    expect(where).toMatch(/l\.status = 'active'/)
    expect(where).not.toMatch(/\bOR\s+l\.status|l\.status\s+IN/i)
  })

  it.each(["inactive", "sold", "expired", "cancelled", "archived", "paused"])(
    "a %s listing can't make anyone eligible or count in N",
    (status) => {
      // The only status the predicate accepts is 'active'; no other status
      // value appears anywhere in the eligibility query.
      const { sql } = svc.candidatesSql()
      expect(sql).not.toContain(`'${status}'`)
      expect(staleWhere()).toMatch(/l\.status = 'active'/)
    },
  )

  it.each(["private", "unlisted"])(
    "a %s listing doesn't count (public only)",
    (visibility) => {
      expect(staleWhere()).toMatch(/l\.visibility = 'public'/)
      expect(svc.candidatesSql().sql).not.toContain(`'${visibility}'`)
    },
  )

  it("needs listed stock: a listed lot with quantity_total > 0", () => {
    const where = staleWhere()
    expect(where).toMatch(
      /EXISTS \(\s*SELECT 1 FROM listing_items li\s+JOIN listing_item_lots lil ON lil\.item_id = li\.item_id\s+WHERE li\.listing_id = l\.listing_id\s+AND lil\.listed = true\s+AND lil\.quantity_total > 0/,
    )
  })

  it("staleness is measured on those live listings, test shops and test orgs out", () => {
    const where = staleWhere()
    expect(where).toMatch(
      /l\.updated_at < now\(\) - make_interval\(days => \?\)/,
    )
    expect(where).toMatch(/_ts\.is_test/)
    expect(where).toMatch(/c\.is_test/)
    // The N in the DM and the listing ids come only from that CTE.
    const { sql } = svc.candidatesSql()
    expect(sql).toMatch(/array_agg\(DISTINCT st\.listing_id\) AS listing_ids/)
    expect(sql).toMatch(/JOIN stale st ON st\.seller_key = c\.seller_key/)
  })

  it("reads V2 listings only: no V1 market tables, no orders", () => {
    const { sql } = svc.candidatesSql()
    for (const t of [
      "market_listings",
      "market_unique_listings",
      "market_orders",
      "orders",
      "offer_sessions",
    ]) {
      expect(sql).not.toMatch(new RegExp(`\\b${t}\\b`))
    }
    expect(sql).toMatch(/FROM listings l/)
  })
})

describe("hard cap", () => {
  it(`${"STILL_SELLING_MAX_RECIPIENTS"}: default 150, a non-negative integer otherwise`, () => {
    expect(svc.maxRecipients({})).toBe(150)
    expect(svc.maxRecipients({ STILL_SELLING_MAX_RECIPIENTS: "40" })).toBe(40)
    expect(svc.maxRecipients({ STILL_SELLING_MAX_RECIPIENTS: "lots" })).toBe(
      150,
    )
    expect(svc.maxRecipients({ STILL_SELLING_MAX_RECIPIENTS: "-1" })).toBe(150)
  })

  it("more eligible than the cap: Send is refused even with the switch on", async () => {
    simulateCampaignTable([1, 2, 3, 4].map(candidate))
    const send = vi.fn()
    const r = await svc.startCampaign(100, {
      reachable: everyoneReachable,
      send,
      enabled: () => true,
      maxRecipients: () => 3,
    })
    expect(r).toEqual({ ok: false, reason: "over_cap", recipients: 4, cap: 3 })
    expect(send).not.toHaveBeenCalled()
    expect(svc.runState().running).toBe(false)
  })
})

describe("dry run summary", () => {
  it("sellers, listings by age, cap warning and the 10 largest by display name", () => {
    const day = 86_400_000
    const at = (d: number) => new Date(NOW.getTime() - d * day).toISOString()
    const people = Array.from({ length: 12 }, (_, i) => ({
      ...candidate(i + 1),
      display_name: `Seller ${i + 1}`,
      listing_ids: Array.from({ length: i + 1 }, (_, j) => `l-${i}-${j}`),
      listing_updated: Object.fromEntries(
        Array.from({ length: i + 1 }, (_, j) => [
          `l-${i}-${j}`,
          at(j % 3 === 0 ? 45 : j % 3 === 1 ? 75 : 200),
        ]),
      ),
      seller_keys: [i < 2 ? "c:org" : `u:${i}`],
    }))
    const s = svc.summarize(people, 10, NOW)
    expect(s.recipients).toBe(12)
    expect(s.sellers).toBe(11) // two org members, one org
    expect(s.listings).toBe(78)
    expect(
      s.listing_age.days_30_60 +
        s.listing_age.days_60_90 +
        s.listing_age.days_90_plus,
    ).toBe(78)
    expect(s.listing_age).toEqual({
      days_30_60: 30,
      days_60_90: 26,
      days_90_plus: 22,
    })
    expect(s.over_cap).toBe(true)
    expect(s.top).toHaveLength(10)
    expect(s.top[0]).toEqual({ display_name: "Seller 12", listings: 12 })
    expect(Object.keys(s.top[0]).sort()).toEqual(["display_name", "listings"])
  })
})

describe("one DM per person", () => {
  it("the candidates query leaves out anyone already claimed for the campaign", () => {
    const { sql, bindings } = svc.candidatesSql("still_selling_2026_11")
    expect(sql).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM dm_campaign_recipients r\s+WHERE r\.campaign = \? AND r\.user_id = c\.user_id/,
    )
    expect(bindings).toEqual([
      svc.STALE_DAYS,
      svc.INACTIVE_DAYS,
      "still_selling_2026_11",
    ])
    // One row per person (deduplicated across shops and orgs), test accounts out.
    expect(sql).toMatch(/GROUP BY c\.user_id/)
    expect(sql).toMatch(/a\.is_test IS NOT TRUE/)
    expect(sql).toMatch(/manage_orders = true OR cr\.manage_market = true/)
  })

  it("a claimed row is never sent again, even by a second sender", async () => {
    simulateCampaignTable([candidate(1)])
    const send = vi.fn(async () => ({ ok: true as const }))
    const deps = { reachable: everyoneReachable, send }
    const [a, b] = await Promise.all([
      svc.sendOne(candidate(1), deps),
      svc.sendOne(candidate(1), deps),
    ])
    expect([a, b].sort()).toEqual(["delivered", "skipped"])
    expect(send).toHaveBeenCalledTimes(1)
    expect(await svc.sendOne(candidate(1), deps)).toBe("skipped")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("a failed DM is recorded with Discord's code and not retried", async () => {
    simulateCampaignTable([candidate(1)])
    const send = vi.fn(async () => ({
      ok: false as const,
      error: "Cannot send",
      code: 50007,
      status: 403,
    }))
    const state = await svc.runCampaign(10, {
      reachable: everyoneReachable,
      send,
      sleep: async () => {},
      enabled: () => true,
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(state.sent_this_run).toBe(1)
    const upd = tracker.history.update.find((q) =>
      q.sql.includes("dm_campaign_recipients"),
    )!
    expect(upd.bindings).toEqual(expect.arrayContaining(["failed", 50007, 403]))
  })

  it("only DM-reachable people are candidates", async () => {
    simulateCampaignTable([1, 2, 3].map(candidate))
    const reachable = vi.fn(async () => new Set([uuid(2)]))
    const people = await svc.eligibleRecipients({ reachable })
    expect(people.map((p) => p.user_id)).toEqual([uuid(2)])
    expect(reachable).toHaveBeenCalledWith(
      [uuid(1), uuid(2), uuid(3)],
      expect.anything(),
    )
  })

  it("DMs through trySendDirectMessage (recorded in discord_dm_attempts) by default", async () => {
    simulateCampaignTable([candidate(7)])
    await svc.sendOne(candidate(7), { reachable: everyoneReachable })
    expect(discordService.trySendDirectMessage).toHaveBeenCalledWith(
      candidate(7).discord_id,
      expect.objectContaining({
        content: expect.stringContaining("Still selling?"),
      }),
      { userId: uuid(7), source: `campaign:${svc.CAMPAIGN}` },
    )
  })
})

describe("the DM", () => {
  it("says how many listings and months, with three link buttons", () => {
    const r = svc.messageFor(
      {
        user_id: U1,
        locale: "en",
        listing_ids: [L1, L2, L3],
        newest_update: new Date("2026-08-20T00:00:00Z"),
        shop_slugs: ["my-shop"],
      },
      NOW,
    )
    expect(r.text).toBe(
      "You have 3 listings on SC Market that haven't been updated in 2 months. Still selling?",
    )
    expect(r.buttons.map((b) => b.label)).toEqual([
      "Keep them live",
      "Pause them",
      "Manage listings",
    ])
    const keep = r.buttons[0].url.split("/still-selling/")[1]
    const pause = r.buttons[1].url.split("/still-selling/")[1]
    expect(tokens.verifyCampaignActionToken(keep, { now: NOW })).toMatchObject({
      ok: true,
      claim: { userId: U1, action: "keep" },
    })
    expect(tokens.verifyCampaignActionToken(pause, { now: NOW })).toMatchObject(
      { ok: true, claim: { userId: U1, action: "pause" } },
    )
    expect(r.buttons[2].url).toMatch(/\/shop\/my-shop\/listings$/)
    const discord = msg.toDiscordMessage(r) as {
      content: string
      components: { components: { style: number }[] }[]
    }
    expect(discord.components[0].components.map((c) => c.style)).toEqual([
      5, 5, 5,
    ])
  })

  it("singular, and with several shops the manage link opens the one with the most listings", () => {
    const r = svc.messageFor(
      {
        user_id: U1,
        locale: null,
        listing_ids: [L1],
        newest_update: new Date("2026-09-25T00:00:00Z"),
        shop_slugs: ["a", "b", "b"],
      },
      NOW,
    )
    expect(r.text).toBe(
      "You have 1 listing on SC Market that hasn't been updated in 1 month. Still selling?",
    )
    expect(r.buttons[0].label).toBe("Keep it live")
    expect(r.buttons[2].url).toMatch(/\/shop\/b\/listings$/)
  })

  it("managePath: the shop with the most listings, ties alphabetical, the shop list only with no shop", () => {
    expect(svc.managePath(["z", "a", "z"])).toBe("/shop/z/listings")
    expect(svc.managePath(["b", "a"])).toBe("/shop/a/listings")
    expect(svc.managePath(["a", "b", "b", "a", "c"])).toBe("/shop/a/listings")
    expect(svc.managePath(["only"])).toBe("/shop/only/listings")
    expect(svc.managePath([])).toBe("/dashboard/shops")
    expect(svc.managePath([""])).toBe("/dashboard/shops")
  })

  it("is translated for all 8 locales, picked from accounts.locale", () => {
    expect(msg.campaignLocale("zh-TW")).toBe("zh-TW")
    expect(msg.campaignLocale("zh-CN")).toBe("zh-CN")
    expect(msg.campaignLocale("zh")).toBe("zh-CN")
    expect(msg.campaignLocale("de-DE")).toBe("de")
    expect(msg.campaignLocale("pt")).toBe("en")
    const texts = new Set<string>()
    for (const locale of msg.CAMPAIGN_LOCALES) {
      const r = svc.sampleMessage(locale)
      expect(r.text).toMatch(/3/)
      expect(r.text).toMatch(/2/)
      expect(r.buttons).toHaveLength(3)
      texts.add(r.text)
    }
    expect(texts.size).toBe(8)
    expect(svc.sampleMessage("uk").text).toContain("3 оголошення")
    expect(
      msg.renderStillSelling({
        locale: "uk",
        listings: 5,
        months: 5,
        keepUrl: "",
        pauseUrl: "",
        manageUrl: "",
      }).text,
    ).toContain("5 оголошень")
  })
})

describe("the links' actions", () => {
  const old = new Date("2026-08-01T00:00:00Z")
  const listings = [
    {
      listing_id: L1,
      shop_id: "s1",
      title: "Stale",
      status: "active",
      updated_at: old,
      expires_at: null,
      slug: "my-shop",
    },
    {
      listing_id: L2,
      shop_id: "s1",
      title: "Fresh",
      status: "active",
      updated_at: new Date(NOW.getTime() - 3600_000),
      expires_at: null,
      slug: "my-shop",
    },
    {
      listing_id: L3,
      shop_id: "s1",
      title: "Paused",
      status: "expired",
      updated_at: old,
      expires_at: null,
      slug: "my-shop",
    },
    {
      listing_id: L4,
      shop_id: "s2",
      title: "Not theirs any more",
      status: "active",
      updated_at: old,
      expires_at: null,
      slug: "other",
    },
  ]
  const canModify = async (l: { shop_id: string }) => l.shop_id === "s1"

  function link(action: "keep" | "pause", userId = U1) {
    return tokens.createCampaignActionToken(
      { campaign: svc.CAMPAIGN, userId, action },
      { now: NOW },
    )
  }

  beforeEach(() => {
    tracker.on.select("dm_campaign_recipients").response({
      listing_ids: [L1, L2, L3, L4],
      kept_at: null,
      paused_at: null,
    })
    tracker.on.select("listings").response(listings)
    tracker.on.update("dm_campaign_recipients").response(1)
    tracker.on.select("dm_campaign_feedback").response(undefined)
  })

  it("keep refreshes the stale and paused listings the user still manages", async () => {
    const r = await svc.applyAction(link("keep"), { canModify, now: () => NOW })
    expect(r).toEqual({
      ok: true,
      action: "keep",
      changed: 2,
      total: 3,
      managePath: "/shop/my-shop/listings",
      test: false,
    })
    expect(
      vi
        .mocked(applyListingRefresh)
        .mock.calls.map((c) => (c[1] as { listing_id: string }).listing_id)
        .sort(),
    ).toEqual([L1, L3])
    expect(
      vi.mocked(applyListingRefresh).mock.calls.every((c) => c[2] === U1),
    ).toBe(true)
    // Only that user's row.
    expect(tracker.history.select[0].bindings).toEqual(
      expect.arrayContaining([svc.CAMPAIGN, U1]),
    )
  })

  it("pause pauses the active ones, deletes nothing", async () => {
    tracker.on.update("listings").response(2)
    const r = await svc.applyAction(link("pause"), {
      canModify,
      now: () => NOW,
    })
    expect(r).toMatchObject({ ok: true, action: "pause", changed: 2 })
    const upd = tracker.history.update.find((q) =>
      q.sql.includes('"listings"'),
    )!
    expect(upd.bindings).toEqual(
      expect.arrayContaining(["expired", L1, L2, "active"]),
    )
    expect(upd.bindings).not.toContain(L4)
    expect(upd.bindings).not.toContain(L3)
    expect(tracker.history.delete).toHaveLength(0)
    expect(applyListingRefresh).not.toHaveBeenCalled()
  })

  it("an expired or forged link does nothing", async () => {
    const expired = tokens.createCampaignActionToken(
      { campaign: svc.CAMPAIGN, userId: U1, action: "pause" },
      { now: new Date(NOW.getTime() - 31 * 86_400_000) },
    )
    expect(
      await svc.applyAction(expired, { canModify, now: () => NOW }),
    ).toEqual({ ok: false, reason: "expired" })
    expect(
      await svc.applyAction("ca1.bogus.sig", { canModify, now: () => NOW }),
    ).toEqual({ ok: false, reason: "invalid" })
    expect(tracker.history.all).toHaveLength(0)
  })

  it("a link for someone the campaign never DMed is invalid", async () => {
    tracker.reset()
    tracker.on.select("dm_campaign_recipients").response(undefined)
    expect(
      await svc.applyAction(link("keep", U2), { canModify, now: () => NOW }),
    ).toEqual({ ok: false, reason: "invalid" })
    expect(applyListingRefresh).not.toHaveBeenCalled()
  })
})

describe("test links (dry run)", () => {
  function testLink(action: "keep" | "pause") {
    return tokens.createCampaignActionToken(
      { campaign: svc.CAMPAIGN, userId: U1, action, test: true },
      { now: NOW },
    )
  }

  it("carry a test claim, and each test link is unique", () => {
    const a = testLink("keep")
    expect(tokens.verifyCampaignActionToken(a, { now: NOW })).toMatchObject({
      ok: true,
      claim: { test: true, action: "keep", userId: U1 },
    })
    expect(testLink("keep")).not.toBe(a)
  })

  it.each(["keep", "pause"] as const)(
    "%s: the full flow runs, but no listing is changed and no recipient row is read or written",
    async (action) => {
      tracker.on.select("dm_campaign_feedback").response(undefined)
      tracker.on.any(/FROM listings l/).response({ rows: [] })
      const preview = await svc.lookupAction(testLink(action), {
        now: () => NOW,
      })
      expect(preview).toMatchObject({ ok: true, test: true, action })
      const r = await svc.applyAction(testLink(action), { now: () => NOW })
      expect(r).toMatchObject({ ok: true, test: true, action, changed: 3 })
      expect(applyListingRefresh).not.toHaveBeenCalled()
      // The only listings query is the read of which shops the user sells in.
      const touched = tracker.history.all.filter(
        (q) =>
          /listings|dm_campaign_recipients|audit_trail/.test(q.sql) &&
          !/^\s*SELECT l\.listing_id, l\.updated_at, s\.slug/.test(q.sql),
      )
      expect(touched).toEqual([])
      expect(tracker.history.update).toHaveLength(0)
      expect(tracker.history.insert).toHaveLength(0)
    },
  )

  it("Manage listings opens the user's shop with the most live listings, as in the test DM", async () => {
    tracker.on.select("dm_campaign_feedback").response(undefined)
    tracker.on.any(/FROM listings l/).response({
      rows: [
        { listing_id: L1, updated_at: new Date(0), slug: "small" },
        { listing_id: L2, updated_at: new Date(0), slug: "big" },
        { listing_id: L3, updated_at: new Date(0), slug: "big" },
      ],
    })
    const preview = await svc.lookupAction(testLink("keep"), { now: () => NOW })
    expect(preview).toMatchObject({
      ok: true,
      test: true,
      managePath: "/shop/big/listings",
    })
    const r = await svc.applyAction(testLink("keep"), { now: () => NOW })
    expect(r).toMatchObject({ ok: true, managePath: "/shop/big/listings" })
    const q = tracker.history.all.find((x) => /FROM listings l/.test(x.sql))!
    expect(q.bindings).toEqual([U1, U1])
  })

  it("a forged test claim (any value but 1) is rejected", () => {
    const t = testLink("pause")
    const [p, payload, sig] = t.split(".")
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    const bad = Buffer.from(JSON.stringify({ ...data, t: true })).toString(
      "base64url",
    )
    expect(
      tokens.verifyCampaignActionToken(`${p}.${bad}.${sig}`, { now: NOW }).ok,
    ).toBe(false)
  })
})

describe("feedback", () => {
  const fb = () => import("./still-selling-feedback.js")

  function realLink(action: "keep" | "pause") {
    return tokens.createCampaignActionToken(
      { campaign: svc.CAMPAIGN, userId: U1, action },
      { now: NOW },
    )
  }

  function feedbackTable() {
    const seen = new Set<string>()
    tracker.on
      .any(/INSERT INTO dm_campaign_feedback/)
      .response((q: { bindings: unknown[] }) => {
        const id = q.bindings[3] as string
        if (seen.has(id)) return { rows: [] }
        seen.add(id)
        return { rows: [{ feedback_id: seen.size }] }
      })
  }

  it("strips HTML and control characters, caps at 500", async () => {
    const { cleanText } = await fb()
    expect(cleanText("<b>hi</b> <script>alert(1)</script>there")).toBe(
      "hi alert(1) there",
    )
    expect(cleanText("a<img src=x onerror=1")).toBe("a")
    expect(cleanText("x\u0000y")).toBe("x y")
    expect(cleanText("   ")).toBeNull()
    expect(cleanText(42)).toBeNull()
    expect(cleanText("a".repeat(900))!.length).toBe(500)
  })

  it("pause: stores the picked reasons and cleaned text, once per link", async () => {
    const { submitFeedback } = await fb()
    tracker.on.select("dm_campaign_recipients").response({ user_id: U1 })
    feedbackTable()
    const link = realLink("pause")
    const body = {
      reasons: ["not_playing", "about_sc_market", "not_playing"],
      about_sc_market: "<i>fees</i> too high",
    }
    expect(await submitFeedback(link, body, h.db as never, NOW)).toEqual({
      ok: true,
      test: false,
    })
    const ins = tracker.history.all.find((q) =>
      q.sql.includes("INSERT INTO dm_campaign_feedback"),
    )!
    expect(ins.bindings).toEqual(
      expect.arrayContaining([
        svc.CAMPAIGN,
        U1,
        "pause",
        false,
        ["not_playing", "about_sc_market"],
        "fees too high",
      ]),
    )
    expect(ins.bindings[3]).toBe(tokens.tokenId(link))
    expect(await submitFeedback(link, body, h.db as never, NOW)).toEqual({
      ok: false,
      reason: "already",
    })
  })

  it("keep: free text only; empty or unknown reasons are refused", async () => {
    const { submitFeedback } = await fb()
    tracker.on.select("dm_campaign_recipients").response({ user_id: U1 })
    feedbackTable()
    expect(
      await submitFeedback(
        realLink("keep"),
        { easier_text: "  " },
        h.db as never,
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: "empty",
    })
    expect(
      await submitFeedback(
        realLink("pause"),
        { reasons: ["<script>"] },
        h.db as never,
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: "bad_request",
    })
    expect(
      await submitFeedback(
        realLink("keep"),
        { easier_text: "bulk edit" },
        h.db as never,
        NOW,
      ),
    ).toEqual({
      ok: true,
      test: false,
    })
  })

  it("a real link needs its recipient row; a test link is stored as a test", async () => {
    const { submitFeedback } = await fb()
    tracker.on.select("dm_campaign_recipients").response(undefined)
    feedbackTable()
    expect(
      await submitFeedback(
        realLink("keep"),
        { easier_text: "x" },
        h.db as never,
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: "invalid",
    })
    const test = tokens.createCampaignActionToken(
      { campaign: svc.CAMPAIGN, userId: U1, action: "pause", test: true },
      { now: NOW },
    )
    expect(
      await submitFeedback(test, { reasons: ["other"] }, h.db as never, NOW),
    ).toEqual({ ok: true, test: true })
    const ins = tracker.history.all
      .filter((q) => q.sql.includes("INSERT INTO dm_campaign_feedback"))
      .pop()!
    expect(ins.bindings[4]).toBe(true)
  })

  it("admin summary keeps test answers out of the real counts", async () => {
    const { feedbackSummary } = await fb()
    tracker.on.any(/SELECT is_test, COUNT/).response({
      rows: [
        { is_test: false, responses: 2 },
        { is_test: true, responses: 1 },
      ],
    })
    tracker.on.any(/unnest\(reasons\)/).response({
      rows: [
        { is_test: false, reason: "not_enough_buyers", n: 2 },
        { is_test: true, reason: "other", n: 1 },
      ],
    })
    tracker.on.any(/JOIN accounts a/).response({
      rows: [
        {
          created_at: NOW,
          is_test: false,
          action: "keep",
          display_name: "Trader",
          about_sc_market: null,
          other_text: null,
          easier_text: "bulk edit",
        },
        {
          created_at: NOW,
          is_test: true,
          action: "pause",
          display_name: "Admin",
          about_sc_market: null,
          other_text: "testing",
          easier_text: null,
        },
      ],
    })
    const s = await feedbackSummary(svc.CAMPAIGN, h.db as never)
    expect(s.real.responses).toBe(2)
    expect(s.real.reasons.not_enough_buyers).toBe(2)
    expect(s.real.reasons.other).toBe(0)
    expect(s.test.reasons.other).toBe(1)
    expect(s.real.texts).toEqual([
      {
        created_at: NOW.toISOString(),
        display_name: "Trader",
        action: "keep",
        field: "easier",
        text: "bulk edit",
      },
    ])
    expect(s.test.texts).toHaveLength(1)
  })
})

describe("Send test DM to me", () => {
  const ADMIN = U1
  const ADMIN_DISCORD = "123456789012345678"

  function setupDb(
    opts: {
      recent?: number
      discord?: string | null
      listings?: unknown[]
    } = {},
  ) {
    tracker.on
      .select("discord_dm_attempts")
      .response([{ n: String(opts.recent ?? 0) }])
    tracker.on
      .select("accounts")
      .response({
        locale: "en",
        provider_id: opts.discord === undefined ? ADMIN_DISCORD : opts.discord,
      })
    tracker.on.any(/FROM listings l/).response({ rows: opts.listings ?? [] })
  }

  it("reaches only the caller, works with the switch off, never touches recipient rows", async () => {
    setupDb()
    const send = vi.fn(async () => ({ ok: true as const }))
    const r = await svc.sendTestDm(
      ADMIN,
      {},
      { send, enabled: () => false, now: () => NOW },
    )
    expect(r).toMatchObject({ ok: true, sample: true })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(ADMIN_DISCORD, expect.anything(), {
      userId: ADMIN,
      source: "campaign:still-selling:test",
    })
    expect(
      tracker.history.all.some((q) => q.sql.includes("dm_campaign_recipients")),
    ).toBe(false)
    expect(tracker.history.insert).toHaveLength(0)
    expect(tracker.history.update).toHaveLength(0)
    // The caller's own Discord id is looked up by their own user id only.
    const acct = tracker.history.select.find((q) => q.sql.includes("accounts"))!
    expect(acct.bindings).toContain(ADMIN)
  })

  it("buttons are test links for the caller; sample numbers say so in the footer", async () => {
    setupDb()
    const send = vi.fn(async () => ({ ok: true as const }))
    const r = await svc.sendTestDm(
      ADMIN,
      { locale: "de" },
      { send, now: () => NOW },
    )
    if (!r.ok) throw new Error("expected ok")
    expect(r.message.locale).toBe("de")
    expect(r.message.text).toMatch(/^Sie haben 3 Angebote/)
    expect(r.message.text).toMatch(/Test message/)
    expect(r.message.text).toMatch(/numbers are made up/)
    for (const b of r.message.buttons.slice(0, 2)) {
      const tok = b.url.split("/still-selling/")[1]
      expect(tokens.verifyCampaignActionToken(tok, { now: NOW })).toMatchObject(
        {
          ok: true,
          claim: { userId: ADMIN, test: true },
        },
      )
    }
  })

  it("uses the admin's real live listing counts when there are some", async () => {
    const old = new Date(NOW.getTime() - 95 * 86_400_000)
    setupDb({
      listings: [
        { listing_id: L1, updated_at: old, slug: "mine" },
        { listing_id: L2, updated_at: old, slug: "mine" },
      ],
    })
    const send = vi.fn(async () => ({ ok: true as const }))
    const r = await svc.sendTestDm(ADMIN, {}, { send, now: () => NOW })
    if (!r.ok) throw new Error("expected ok")
    expect(r.sample).toBe(false)
    expect(r.message.text).toMatch(
      /^You have 2 listings on SC Market that haven't been updated in 3 months/,
    )
    expect(r.message.text).not.toMatch(/made up/)
    expect(r.message.buttons[2].url).toMatch(/\/shop\/mine\/listings$/)
  })

  it(`at most ${"5"} per hour per admin, counted from discord_dm_attempts`, async () => {
    setupDb({ recent: 5 })
    const send = vi.fn()
    expect(await svc.sendTestDm(ADMIN, {}, { send, now: () => NOW })).toEqual({
      ok: false,
      reason: "rate_limited",
    })
    expect(send).not.toHaveBeenCalled()
    const q = tracker.history.select.find((x) =>
      x.sql.includes("discord_dm_attempts"),
    )!
    expect(q.bindings).toEqual(
      expect.arrayContaining([ADMIN, "campaign:still-selling:test"]),
    )
    expect(svc.TEST_DMS_PER_HOUR).toBe(5)
  })

  it("no Discord linked: nothing is sent", async () => {
    setupDb({ discord: null })
    const send = vi.fn()
    expect(await svc.sendTestDm(ADMIN, {}, { send, now: () => NOW })).toEqual({
      ok: false,
      reason: "no_discord",
    })
    expect(send).not.toHaveBeenCalled()
  })

  it("real sends still require the switch, after a test DM too", async () => {
    setupDb()
    const send = vi.fn(async () => ({ ok: true as const }))
    await svc.sendTestDm(ADMIN, {}, { send, now: () => NOW })
    delete process.env[svc.KILL_SWITCH_ENV]
    const real = vi.fn()
    expect(
      await svc.startCampaign(10, { reachable: everyoneReachable, send: real }),
    ).toEqual({
      ok: false,
      reason: "disabled",
    })
    expect(real).not.toHaveBeenCalled()
    expect(svc.runState().running).toBe(false)
  })
})
