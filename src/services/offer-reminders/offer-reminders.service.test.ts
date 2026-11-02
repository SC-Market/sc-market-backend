/**
 * Pending-offer reminders (services/offer-reminders): the due-offer SQL, who
 * gets which stage, the caps, the kill switch, recording before sending and
 * the messages. The database is knex-mock-client (test-utils/mock-knex-db.ts);
 * notify() and the org recipients are mocked. No DM is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({
  db: null as unknown,
  notify: vi.fn(),
  managers: vi.fn(),
}))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../notify/dispatcher.js", () => ({ notify: h.notify }))
vi.mock("../notify/recipients.js", () => ({ orgMembersWithPermission: h.managers }))

const svc = await import("./offer-reminders.service.js")
const { CATALOG } = await import("../notify/catalog.js")
const { renderEmailTemplate } = await import("../email/template-engine.js")

const SELLER = "aaaaaaaa-0000-4000-8000-000000000001"
const MANAGER = "aaaaaaaa-0000-4000-8000-000000000002"
const BUYER = "bbbbbbbb-0000-4000-8000-000000000001"
const ORG = "cccccccc-0000-4000-8000-000000000001"

let tracker: Tracker

function due(over: Partial<import("./offer-reminders.service.js").DueOffer> = {}) {
  return {
    session_id: "11111111-0000-4000-8000-000000000001",
    offer_id: "22222222-0000-4000-8000-000000000001",
    title: "10 SCU [Laranite](x)",
    offer_at: new Date("2026-11-03T00:00:00Z"),
    customer_id: BUYER,
    customer_name: "buyer",
    assigned_id: SELLER,
    contractor_id: null,
    seller_name: "Lara's",
    first_due: true,
    final_due: false,
    buyer_due: false,
    final_sent: false,
    ...over,
  }
}

/** Mocks for one run: the due offers, who may be reminded, what was sent, who is capped. */
function world(opts: {
  offers: ReturnType<typeof due>[]
  remindable?: string[]
  sent?: { offer_id: string; stage: string; user_id: string }[]
  capped?: string[]
}) {
  tracker.on.any((q) => q.sql.includes("WITH pending AS")).response({ rows: opts.offers })
  tracker.on.select("accounts").response((opts.remindable ?? [SELLER, MANAGER, BUYER]).map((user_id) => ({ user_id })))
  tracker.on.select((q) => q.sql.includes("offer_reminders") && q.sql.includes("having")).response(
    (opts.capped ?? []).map((user_id) => ({ user_id })),
  )
  tracker.on.select("offer_reminders").response(opts.sent ?? [])
  tracker.on.insert("offer_reminders").response((q: { bindings: unknown[] }) =>
    // Every offer id in the insert was claimed.
    q.bindings.filter((b) => typeof b === "string" && b.startsWith("22222222")).map((offer_id) => ({ offer_id })),
  )
}

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
  h.notify.mockReset().mockResolvedValue({ planned: [], delivered: [], failed: [], duplicate: [] })
  h.managers.mockReset().mockResolvedValue([])
  delete process.env.OFFER_REMINDERS_ENABLED
  delete process.env.DISCORD_DM_DISABLED_EVENTS
})

describe("catalog", () => {
  it("three reminder events; Discord DM on by default for the seller ones, email off", () => {
    expect(CATALOG["reminder.offer_pending"]).toMatchObject({
      category: "reminders",
      legacyAction: "offer_pending_reminder",
      defaults: { in_app: true, push: true, email: false, discord_dm: true },
    })
    expect(CATALOG["reminder.offer_pending_final"]).toMatchObject({
      legacyAction: "offer_pending_final_reminder",
      defaults: { in_app: true, push: true, email: false, discord_dm: true },
    })
    expect(CATALOG["reminder.offer_waiting_buyer"]).toMatchObject({
      legacyAction: "offer_waiting_buyer",
      defaults: { in_app: true, push: true, email: false, discord_dm: false },
    })
    for (const k of ["reminder.offer_pending", "reminder.offer_pending_final", "reminder.offer_waiting_buyer"] as const) {
      expect((CATALOG[k] as { discordDmLocked?: true }).discordDmLocked).toBeUndefined()
    }
  })
})

describe("dueOffersSql", () => {
  const { sql, bindings } = svc.dueOffersSql(svc.OFFER_REMINDER_CUTOVER)
  const flat = sql.replace(/\s+/g, " ")

  it("pending: open session, newest revision is the customer's, after the cutover", () => {
    expect(flat).toContain("WHERE s.status = 'active' AND o.actor_id = s.customer_id")
    expect(flat).toContain("ORDER BY oo.timestamp DESC, oo.id DESC LIMIT 1")
    expect(flat).toContain("o.timestamp >= ?::timestamptz")
    expect(bindings).toEqual([svc.OFFER_REMINDER_CUTOVER.toISOString()])
    expect(svc.OFFER_REMINDER_CUTOVER.toISOString()).toBe("2026-11-02T18:00:00.000Z")
  })

  it("any seller-side message since the revision is a response", () => {
    expect(flat).toContain(
      "WHERE c.session_id = s.id AND m.author IS NOT NULL AND m.author <> s.customer_id AND m.timestamp > o.timestamp",
    )
  })

  it("test accounts are excluded", () => {
    expect(flat).toContain("NOT EXISTS (SELECT 1 FROM accounts ta WHERE ta.user_id = s.customer_id AND ta.is_test)")
  })

  it("stages: first 24-72 h, final 72-120 h, buyer 24-72 h after the final nudge", () => {
    expect(flat).toContain("(st.offer_at > now() - INTERVAL '72 hours' AND st.offer_at <= now() - INTERVAL '24 hours') AS first_due")
    expect(flat).toContain("(st.offer_at <= now() - INTERVAL '72 hours' AND st.offer_at > now() - INTERVAL '120 hours') AS final_due")
    expect(flat).toContain(
      "WHEN st.final_sent_at IS NOT NULL THEN st.final_sent_at <= now() - INTERVAL '24 hours' AND st.final_sent_at > now() - INTERVAL '72 hours'",
    )
    expect(flat).toContain("(st.final_sent_at IS NOT NULL) AS final_sent")
  })

  it("no final nudge (nobody on the seller side to remind): the buyer is told at 96 h anyway", () => {
    expect(svc.BUYER_FALLBACK_HOURS).toBe(96)
    expect(flat).toContain(
      "ELSE st.offer_at <= now() - INTERVAL '96 hours' AND st.offer_at > now() - INTERVAL '144 hours' END AS buyer_due",
    )
    expect(flat).toContain("o.timestamp > now() - INTERVAL '192 hours'")
  })
})

describe("stages and recipients", () => {
  it("final replaces first; buyer is separate", () => {
    expect(svc.stagesOf(due())).toEqual(["first"])
    expect(svc.stagesOf(due({ first_due: false, final_due: true }))).toEqual(["final"])
    expect(svc.stagesOf(due({ first_due: false, final_due: false, buyer_due: true }))).toEqual(["buyer"])
  })

  it("seller side: the assignee plus the org's manage_orders members, once each, never the customer", async () => {
    h.managers.mockResolvedValue([{ userId: SELLER }, { userId: MANAGER }, { userId: BUYER }])
    expect(await svc.stageRecipients(due({ contractor_id: ORG }), "first")).toEqual([SELLER, MANAGER])
    expect(h.managers).toHaveBeenCalledWith(ORG, "manage_orders")
    expect(await svc.stageRecipients(due({ contractor_id: ORG }), "buyer")).toEqual([BUYER])
  })

  it("one digest per user per run: the most urgent stage, then capped", () => {
    const a = due()
    const b = due({ offer_id: "22222222-0000-4000-8000-000000000002", session_id: "s2" })
    const { digests, capped } = svc.buildDigests(
      [
        { user_id: SELLER, stage: "first", offer: a },
        { user_id: SELLER, stage: "final", offer: b },
        { user_id: SELLER, stage: "final", offer: b },
        { user_id: MANAGER, stage: "first", offer: a },
      ],
      1,
    )
    expect(digests).toHaveLength(1)
    expect(digests[0]).toMatchObject({ user_id: SELLER, stage: "final" })
    expect(digests[0].offers.map((o) => o.offer_id)).toEqual([b.offer_id])
    expect(capped).toBe(1)
  })
})

describe("processOfferReminders", () => {
  it("records, then notifies the seller with a Personal digest on every channel", async () => {
    world({ offers: [due()] })
    const stats = await svc.processOfferReminders()
    expect(stats).toMatchObject({ enabled: true, due_offers: 1, users: 1, sent: { first: 1, final: 0, buyer: 0 } })
    const insert = tracker.history.insert.find((q) => q.sql.includes("offer_reminders"))!
    expect(insert.sql).toMatch(/on conflict \("offer_id", "stage", "user_id"\) do nothing/i)
    expect(insert.bindings).toEqual(expect.arrayContaining([SELLER, "first"]))
    const [event, recipients, opts] = h.notify.mock.calls[0]
    expect(event).toBe("reminder.offer_pending")
    expect(recipients).toEqual([{ userId: SELLER, contractorId: null }])
    expect(opts.channels).toEqual(["in_app", "push", "email", "discord_dm"])
    expect(opts.entityId).toBe(opts.dedupeKey)
    expect(opts.messages.discord_dm.embeds[0].title).toBe("An offer is waiting for your reply")
  })

  it("the kill switch stops everything", async () => {
    process.env.OFFER_REMINDERS_ENABLED = "false"
    expect((await svc.processOfferReminders()).enabled).toBe(false)
    expect(tracker.history.all).toHaveLength(0)
    expect(h.notify).not.toHaveBeenCalled()
  })

  it("DISCORD_DM_DISABLED_EVENTS drops only the Discord DM", async () => {
    process.env.DISCORD_DM_DISABLED_EVENTS = "reminder.offer_pending"
    world({ offers: [due()] })
    await svc.processOfferReminders()
    expect(h.notify.mock.calls[0][2].channels).toEqual(["in_app", "push", "email"])
  })

  it("never twice, never test/deleted/banned accounts, and the daily cap defers", async () => {
    h.managers.mockResolvedValue([{ userId: MANAGER }])
    world({
      offers: [due({ contractor_id: ORG })],
      remindable: [SELLER, MANAGER],
      sent: [{ offer_id: due().offer_id, stage: "first", user_id: SELLER }],
    })
    await svc.processOfferReminders()
    expect(h.notify.mock.calls.map((c) => c[1][0].userId)).toEqual([MANAGER])

    h.notify.mockClear()
    tracker.reset()
    world({ offers: [due()], remindable: [] })
    await svc.processOfferReminders()
    expect(h.notify).not.toHaveBeenCalled()

    tracker.reset()
    world({ offers: [due()], capped: [SELLER] })
    const stats = await svc.processOfferReminders()
    expect(h.notify).not.toHaveBeenCalled()
    expect(stats.capped_daily).toBe(1)
  })

  it("the buyer stage without a seller reminder is recorded as such", async () => {
    // An org offer whose seller side has nobody to remind: no final nudge.
    world({ offers: [due({ assigned_id: null, contractor_id: ORG, first_due: false, buyer_due: true, final_sent: false })] })
    await svc.processOfferReminders()
    expect(h.notify.mock.calls.map((c) => [c[0], c[1][0].userId])).toEqual([["reminder.offer_waiting_buyer", BUYER]])
    const insert = tracker.history.insert.find((q) => q.sql.includes("offer_reminders"))!
    expect(insert.sql).toContain('"seller_reminded"')
    expect(insert.bindings).toEqual(expect.arrayContaining([BUYER, "buyer", false]))
  })

  it("seller reminders leave seller_reminded empty", async () => {
    world({ offers: [due()] })
    await svc.processOfferReminders()
    const insert = tracker.history.insert.find((q) => q.sql.includes("offer_reminders"))!
    expect(insert.bindings).toEqual(expect.arrayContaining([SELLER, "first", null]))
  })

  it("the buyer stage goes to the customer", async () => {
    world({ offers: [due({ first_due: false, buyer_due: true, final_sent: true })] })
    await svc.processOfferReminders()
    const [event, recipients, opts] = h.notify.mock.calls[0]
    expect(event).toBe("reminder.offer_waiting_buyer")
    expect(recipients).toEqual([{ userId: BUYER, contractorId: null }])
    const buttons = opts.messages.discord_dm.components[0].components
    expect(buttons.map((b: { label: string }) => b.label)).toEqual(["Message the seller", "Withdraw the offer"])
    expect(buttons[1].url).toMatch(/\/offer\/11111111-0000-4000-8000-000000000001\?action=withdraw$/)
    expect(opts.messages.discord_dm.embeds[0].description).toContain("To keep waiting, you don't need to do anything.")
  })

  it("a run that loses the claim to another sends nothing", async () => {
    tracker.on.any((q) => q.sql.includes("WITH pending AS")).response({ rows: [due()] })
    tracker.on.select("accounts").response([{ user_id: SELLER }])
    tracker.on.select("offer_reminders").response([])
    tracker.on.insert("offer_reminders").response([])
    await svc.processOfferReminders()
    expect(h.notify).not.toHaveBeenCalled()
  })
})

describe("messages", () => {
  const now = new Date("2026-11-04T06:00:00Z")
  const digest = (stage: "first" | "final" | "buyer", n = 1) => ({
    batch_id: "b1",
    user_id: SELLER,
    stage,
    offers: Array.from({ length: n }, (_, i) => due({ session_id: `s${i}`, offer_id: `o${i}` })),
  })

  it("user text cannot inject Discord links or formatting", () => {
    const dm = svc.reminderDm(digest("first"), now)
    expect(dm.embeds![0].description).toContain("[10 SCU Laranitex](")
    expect(dm.embeds![0].description).toContain("buyer has waited 1 day")
    expect(dm.allowed_mentions).toEqual({ parse: [] })
  })

  it("final says the buyer will be told; many offers are counted", () => {
    const dm = svc.reminderDm(digest("final", 7), now)
    expect(dm.embeds![0].title).toBe("Last reminder: 7 offers are still waiting for your reply")
    expect(dm.embeds![0].description).toContain("the buyer will be told it's still waiting")
    expect(dm.embeds![0].description).toContain("…and 2 more")
  })

  it("push and email carry the same text and link", () => {
    const m = svc.reminderMessages(digest("buyer"), now)
    expect(m.push!.title).toBe("Your offer is still waiting for the seller")
    expect(m.push!.data!.url).toMatch(/\/offer\/s0$/)
    expect((m.email!.data.offerReminder as { withdraw_url: string }).withdraw_url).toMatch(/\?action=withdraw$/)
  })

  it.each(["offer_pending_reminder", "offer_pending_final_reminder", "offer_waiting_buyer"])(
    "%s email renders, escaping the offer title",
    async (template) => {
      const m = svc.reminderMessages(
        { ...digest("buyer"), offers: [due({ title: "<script>alert(1)</script>" })] },
        now,
      )
      const data = {
        userName: "u",
        userDisplayName: "U",
        locale: "en",
        notificationType: template,
        notificationTitle: "t",
        notificationBody: "b",
        actionUrl: "https://sc-market.space/offer/s0",
        siteName: "SC Market",
        siteUrl: "https://sc-market.space",
        logoUrl: "https://sc-market.space/scmarket-logo.png",
        unsubscribeUrl: "https://sc-market.space/email/unsubscribe/t",
        preferencesUrl: "https://sc-market.space/settings",
        offerReminder: m.email!.data.offerReminder,
      }
      const html = await renderEmailTemplate(template, data as never, "html")
      expect(html).not.toContain("<script>")
      expect(html).toContain("&lt;script&gt;")
      const text = await renderEmailTemplate(template, data as never, "txt")
      expect(text).toContain("https://sc-market.space/offer/")
    },
  )
})
