/**
 * Characterization of every destination post (Phase 5): the JSON each
 * webhook and Discord alert channel receives, captured at the transport
 * (the pinned webhook fetch, the Discord REST client, the staff webhook's
 * fetch). The file snapshot is the byte-level contract with third parties.
 *
 * Each scenario runs twice: through the legacy sender (the snapshot was
 * written against the code before Phase 5 and must not change), then through
 * notify()'s destination plans and adapters, which must post exactly the
 * same JSON to the same destinations in the same order.
 *
 * Mocked DB (no Postgres); the Postgres-backed parity (legacy vs notify(),
 * through the real call sites) is destinations.char.test.ts in the CI
 * characterization suite.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const sent = vi.hoisted(() => ({
  webhook: [] as { url: string; body: unknown }[],
  discord: [] as { route: string; body: unknown }[],
  staff: [] as { url: string; body: unknown; redirect?: string }[],
  /** Next HTTP status per webhook URL (default 204). */
  status: new Map<string, number>(),
  /** Next Discord REST error per channel route (default: none). */
  discordError: new Map<string, { status: number; code: number }>(),
}))

const tables = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }))

vi.mock("../../test-accounts/isolation.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await import("../../../test-utils/isolation-noop.js")).allPartiesReal,
  actingAsTestAccount: () => false,
}))

// A minimal query chain over in-memory rows: where/whereNot/select/distinct
// filter nothing beyond equality, which is all these posts query.
vi.mock("../../../clients/database/knex-db.js", () => {
  const chain = (table: string) => {
    let rows = [...(tables.rows[table] ?? [])]
    const q: Record<string, unknown> = {}
    const self = () => q
    q.where = (crit: Record<string, unknown>) => {
      if (crit && typeof crit === "object") {
        rows = rows.filter((r) => Object.entries(crit).every(([k, v]) => r[k] === v))
      }
      return q
    }
    q.whereNot = self
    q.select = self
    q.distinct = self
    q.update = async () => 1
    q.first = async () => rows[0]
    q.pluck = async (col: string) => rows.map((r) => r[col])
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows).then(res, rej)
    q.catch = (rej: (e: unknown) => unknown) => Promise.resolve(rows).catch(rej)
    return q
  }
  const knex = Object.assign((t: string) => chain(t), { fn: { now: () => "now()" }, raw: (s: string) => s })
  return { getKnex: () => knex, database: {} }
})

vi.mock("../../../api/util/webhook-ip-guard.js", () => ({
  fetchPublicDestination: async (url: string, init?: { body?: string }) => {
    sent.webhook.push({ url, body: init?.body ? JSON.parse(init.body) : undefined })
    const status = sent.status.get(url) ?? 204
    return {
      response: new Response(status === 204 ? null : "nope", { status }),
      release: async () => undefined,
    }
  },
}))

vi.mock("@discordjs/rest", () => {
  class REST {
    setToken() {
      return this
    }
    async post(route: string, opts?: { body?: unknown }) {
      sent.discord.push({ route, body: opts?.body })
      const err = sent.discordError.get(route)
      if (err) throw Object.assign(new Error(`DiscordAPIError[${err.code}]`), err)
      return { id: "m1" }
    }
    get = async () => ({})
    put = async () => ({})
    patch = async () => ({})
    delete = async () => ({})
  }
  return { REST }
})

const WEBHOOKS: Record<string, { webhook_id: string; webhook_url: string; name: string }[]> = {}
const hook = (id: string) => ({
  webhook_id: id,
  webhook_url: `https://discord.com/api/webhooks/${id}/token`,
  name: id,
})
vi.mock("../../../api/routes/v1/notifications/database.js", () => ({
  getNotificationWebhooksByAction: vi.fn(async (where: Record<string, unknown>, action: string) => {
    const owner = Object.values(where)[0] ?? "site"
    return WEBHOOKS[`${String(owner)}:${action}`] ?? []
  }),
}))

const users: Record<string, { user_id: string; username: string; display_name: string; avatar: string }> = {}
for (const u of ["customer", "seller", "bidder", "actor", "reviewer"]) {
  users[u] = {
    user_id: u,
    username: `${u}_name`,
    display_name: `${u[0].toUpperCase()}${u.slice(1)}`,
    avatar: `https://cdn.example/${u}.png`,
  }
}
vi.mock("../../../api/routes/v1/profiles/database.js", () => ({
  getMinimalUser: vi.fn(async ({ user_id }: { user_id: string }) => users[user_id]),
  getUser: vi.fn(async ({ user_id }: { user_id: string }) => users[user_id]),
  getUserDiscordId: vi.fn(async () => null),
}))
vi.mock("../../../api/routes/v1/offers/database.js", () => ({
  getMostRecentOrderOffer: vi.fn(async (sessionId: string) => ({
    id: `${sessionId}-offer`,
    title: "Medical Supplies",
    description: "x5 please",
    cost: "125000",
    kind: "Delivery",
    collateral: sessionId === "sess-collat" ? "50000" : null,
    timestamp: new Date("2026-11-01T10:00:00Z"),
  })),
}))
vi.mock("../../../api/routes/v1/market/database.js", () => ({
  getOfferMarketListings: vi.fn(async (offerId: string) =>
    offerId.startsWith("sess-items") ? [{ listing_id: "l1", quantity: 3 }] : [],
  ),
  getMarketListingComplete: vi.fn(async () => ({ details: { title: "Quantainium" } })),
}))
vi.mock("../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async (id: string) => (id ? `${id}?resolved` : null)) },
  external_resource_regex: /^$/,
}))
vi.mock("../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
// notification_deliveries: claims and outcomes, in memory.
const deliveries = vi.hoisted(() => ({
  claimed: new Map<string, Record<string, unknown>>(),
  finished: [] as { key: string; status: string; error?: string }[],
}))
vi.mock("../deliveries.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  claimDeliveries: vi.fn(async (claims: { idempotencyKey: string }[]) => {
    const won = new Set<string>()
    for (const c of claims) {
      if (deliveries.claimed.has(c.idempotencyKey)) continue
      deliveries.claimed.set(c.idempotencyKey, c as never)
      won.add(c.idempotencyKey)
    }
    return won
  }),
  finishDelivery: vi.fn(async (key: string, status: string, error?: string) => {
    deliveries.finished.push({ key, status, ...(error ? { error } : {}) })
  }),
}))
// The public-contract user alert (not a destination) is notify()'s, tested elsewhere.
vi.mock("../dispatcher.js", () => ({ notify: vi.fn(async () => ({ planned: [], delivered: [], failed: [], duplicate: [] })) }))

const webhookUtil = await import("../../../api/routes/v1/util/webhooks.js")
const { postOrderAlert, postOfferAlert } = await import("../../discord/order-alerts.js")
const { notifyPublicContractCreated } = await import("../../contracts/public-contract-alerts.js")
const { sendStaffEnquiryAlerts } = await import("../../storefront/staff-alerts.js")

const { notifyDestinations } = await import("../destinations.js")
const webhookPlans = await import("../../webhooks/webhook-plans.js")
const { orderAlertPlan, offerAlertPlan } = await import("../../discord/order-alerts.js")
const { publicContractPlans } = await import("../../contracts/public-contract-alerts.js")
const { staffEnquiryPlan } = await import("../../storefront/staff-alerts.js")
type Plan = Awaited<ReturnType<typeof webhookPlans.orderCreatedWebhookPlan>>

const NOW = new Date("2026-11-06T12:00:00Z")

const order = (o: Record<string, unknown> = {}) =>
  ({
    order_id: "order-1",
    title: "Haul 500 SCU",
    description: "Pick up at Area18",
    cost: "250000",
    kind: "Hauling",
    rush: false,
    collateral: null,
    status: "not-started",
    customer_id: "customer",
    assigned_id: null,
    contractor_id: "org-1",
    shop_id: "shop-1",
    timestamp: new Date("2026-11-01T09:00:00Z"),
    ...o,
  }) as never

const session = (o: Record<string, unknown> = {}) =>
  ({ id: "sess-1", customer_id: "customer", assigned_id: null, contractor_id: "org-1", shop_id: "shop-1", ...o }) as never

function staffFetch() {
  return vi.fn(async (url: string, init: { body: string; redirect?: string }) => {
    sent.staff.push({ url: "[staff webhook]", body: JSON.parse(init.body), redirect: init.redirect })
    void url
    return new Response(null, { status: 204 })
  })
}

/**
 * Every destination post, as the call sites make it. Each returns nothing;
 * what matters is what reached the transports.
 */
const REVIEW = {
  review_id: "rev-1",
  order_id: "order-1",
  user_author: "reviewer",
  contractor_author: null,
  content: "Fast and *careful*",
  rating: 4,
  role: "customer",
  timestamp: new Date("2026-11-02T08:00:00Z"),
} as never
const LISTING_V1 = {
  listing: { listing_id: "l-1", contractor_seller_id: "org-1", user_seller_id: null, sale_type: "auction" },
  details: { title: "Polaris" },
  unique: { listing_id: "l-1" },
} as never
const BID_V1 = { bid_id: "bid-1", user_bidder_id: "bidder", bid: 1500000, timestamp: new Date("2026-11-03T08:00:00Z") } as never
const LISTING_V2 = { listing_id: "l-2", title: "Idris", shop_id: "shop-1" }
const CONTRACT = {
  id: "contract-1",
  title: "Escort to Pyro",
  description: "Two fighters needed",
  kind: "Escort",
  cost: "300000",
  collateral: "20000",
  payment_type: "one-time",
  customer_id: "customer",
  timestamp: new Date("2026-11-04T08:00:00Z"),
} as never
const ENQUIRY = {
  enquiry_id: "enq-1",
  target_type: "org",
  target: "ACME",
  requested_subdomain: "acme",
  message: "We'd like a *branded* storefront [please](https://x)",
  contact_method: "discord",
  status: "open",
  submitted_by_username: "boss_name",
  created_at: "2026-11-05T08:00:00Z",
  updated_at: "2026-11-05T08:00:00Z",
} as never
const ENQUIRY_TARGET = { type: "org", id: "org-1", handle: "ACME", name: "Acme Corp", is_test: false } as const

interface Scenario {
  /** The legacy sender, as the call site invokes it. */
  legacy: () => Promise<unknown>
  /** notify()'s plans for the same occurrence. */
  plans: () => Promise<Plan[]>
}

const one = (p: Promise<Plan>) => p.then((x) => [x])
const assigned = () => order({ assigned_id: "seller" })
const status = (s: string): Scenario => ({
  legacy: () => webhookUtil.sendOrderStatusWebhooks(assigned(), s, "actor"),
  plans: () => one(webhookPlans.orderStatusWebhookPlan(assigned(), s, "actor")),
})

/** Every destination post. What matters is what reached the transports. */
const SCENARIOS: Record<string, Scenario> = {
  "webhook order.created": {
    legacy: () => webhookUtil.sendOrderWebhooks(order({ collateral: "1000" })),
    plans: () => one(webhookPlans.orderCreatedWebhookPlan(order({ collateral: "1000" }))),
  },
  "webhook order.assigned": {
    legacy: () => webhookUtil.sendOrderAssignedWebhooks(assigned()),
    plans: () => one(webhookPlans.orderAssignedWebhookPlan(assigned())),
  },
  "webhook order.status_changed in-progress": status("in-progress"),
  "webhook order.status_changed fulfilled": status("fulfilled"),
  "webhook order.status_changed cancelled": status("cancelled"),
  "webhook order.status_changed not-started": status("not-started"),
  "webhook offer.received create": {
    legacy: () => webhookUtil.sendOfferWebhooks(session(), "offer_create"),
    plans: () => one(webhookPlans.offerWebhookPlan(session(), "offer_create")),
  },
  "webhook offer.received counter": {
    legacy: () => webhookUtil.sendOfferWebhooks(session(), "counter_offer_create"),
    plans: () => one(webhookPlans.offerWebhookPlan(session(), "counter_offer_create")),
  },
  "webhook order.review": {
    legacy: () => webhookUtil.sendOrderReviewWebhooks(assigned(), REVIEW),
    plans: () => one(webhookPlans.orderReviewWebhookPlan(assigned(), REVIEW)),
  },
  "webhook market.bid v1": {
    legacy: () => webhookUtil.sendBidWebhooks(LISTING_V1, BID_V1),
    plans: () => one(webhookPlans.bidWebhookPlan(LISTING_V1, BID_V1)),
  },
  "webhook market.bid v2": {
    legacy: () => webhookUtil.sendBidWebhooksV2(LISTING_V2, 2500000, "bidder"),
    plans: () => one(webhookPlans.bidWebhookPlanV2(LISTING_V2, 2500000, "bidder", "bid-2")),
  },
  "discord_channel order.created (v1 items)": {
    legacy: () => postOrderAlert(order({ order_id: "order-items", collateral: "1000" })),
    plans: () => one(orderAlertPlan(order({ order_id: "order-items", collateral: "1000" }))),
  },
  "discord_channel order.created (v2 items)": {
    legacy: () => postOrderAlert(order({ order_id: "order-v2" })),
    plans: () => one(orderAlertPlan(order({ order_id: "order-v2" }))),
  },
  "discord_channel offer.received org": {
    legacy: () => postOfferAlert(session({ id: "sess-items" })),
    plans: () => one(offerAlertPlan(session({ id: "sess-items" }))),
  },
  "discord_channel offer.received personal": {
    legacy: () => postOfferAlert(session({ id: "sess-collat", contractor_id: null, assigned_id: "seller" })),
    plans: () => one(offerAlertPlan(session({ id: "sess-collat", contractor_id: null, assigned_id: "seller" }))),
  },
  "webhook+discord_channel contract.public_created": {
    legacy: () => notifyPublicContractCreated(CONTRACT),
    plans: () => publicContractPlans(CONTRACT),
  },
  "webhook admin.storefront_enquiry (staff)": {
    legacy: () => sendStaffEnquiryAlerts(ENQUIRY, ENQUIRY_TARGET),
    plans: async () => [staffEnquiryPlan(ENQUIRY, ENQUIRY_TARGET)],
  },
}

function resetWorld() {
  sent.webhook.length = 0
  sent.discord.length = 0
  sent.staff.length = 0
  sent.status.clear()
  sent.discordError.clear()
  deliveries.claimed.clear()
  deliveries.finished.length = 0
  for (const k of Object.keys(WEBHOOKS)) delete WEBHOOKS[k]
  WEBHOOKS["shop-1:order_create"] = [hook("shop-created")]
  WEBHOOKS["shop-1:order_assigned"] = [hook("shop-assigned")]
  WEBHOOKS["seller:order_assigned"] = [hook("seller-assigned")]
  for (const a of ["order_status_in_progress", "order_status_fulfilled", "order_status_cancelled", "order_status_not_started"]) {
    WEBHOOKS[`shop-1:${a}`] = [hook(`shop-${a}`)]
    WEBHOOKS[`customer:${a}`] = [hook(`customer-${a}`)]
  }
  WEBHOOKS["shop-1:order_review"] = [hook("shop-review")]
  WEBHOOKS["org-1:market_item_bid"] = [hook("org-bid"), hook("shared-bid")]
  WEBHOOKS["shop-1:market_item_bid"] = [hook("shop-bid"), hook("shared-bid")]
  WEBHOOKS["site:public_contract_create"] = [hook("contract-feed")]
  tables.rows = {
    market_orders: [{ order_id: "order-items", listing_id: "l1", quantity: 2 }],
    order_market_items_v2: [{ order_id: "order-v2", listing_id: "lv2", quantity: 4 }],
    listings: [{ listing_id: "lv2", title: "Laranite" }],
    shops: [{ shop_id: "shop-1", owner_contractor_id: "org-1", owner_user_id: null }],
    discord_channel_setups: [
      { channel_id: "800000000000000001", alerts: true, contracts: true, owner_type: "shop", owner_id: "shop-1" },
    ],
  }
}

vi.mock("../../discord/channel-setups.js", () => ({
  getAlertChannels: vi.fn(async (t: { shop_id?: string | null; contractor_id?: string | null; user_id?: string | null }) => {
    const out: string[] = []
    if (t.shop_id === "shop-1") out.push("800000000000000001")
    if (t.contractor_id === "org-1") out.push("800000000000000002")
    else if (t.user_id === "seller") out.push("800000000000000003")
    return out
  }),
}))

function captured() {
  return {
    webhooks: sent.webhook.map((w) => ({ to: w.url.replace("https://discord.com/api/webhooks/", ""), body: w.body })),
    discord: sent.discord.map((d) => ({ route: d.route, body: d.body })),
    staff: sent.staff,
  }
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  process.env.STAFF_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/staff/secret"
  delete process.env.STAFF_ALERT_EMAIL
  vi.stubGlobal("fetch", staffFetch())
})
afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete process.env.STAFF_DISCORD_WEBHOOK_URL
})
beforeEach(() => resetWorld())

// Test names (the snapshot keys) are the ones the pre-Phase-5 snapshot was written under.
describe("destination payloads (legacy senders)", () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(name, async () => {
      await scenario.legacy()
      const legacy = captured()
      expect(legacy).toMatchSnapshot()
      expect(legacy.webhooks.length + legacy.discord.length + legacy.staff.length).toBeGreaterThan(0)

      resetWorld()
      for (const plan of await scenario.plans()) {
        const r = await notifyDestinations(plan)
        expect(r.failed).toEqual([])
        expect(r.delivered).toEqual(r.planned)
      }
      expect(captured()).toEqual(legacy)
      // One delivery row per post, each sent.
      expect(deliveries.finished.map((f) => f.status)).toEqual(
        Array(legacy.webhooks.length + legacy.discord.length + legacy.staff.length).fill("sent"),
      )
    })
  }
})
