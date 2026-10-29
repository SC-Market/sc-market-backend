/**
 * API tokens are restricted to the orgs in their contractor_ids, but the v2
 * lists that name no org (GET /orders?role=seller, /shops/mine,
 * /offers/search, ...) built their seller side from every org the user
 * belongs to. A token granted no org (or another org) listed the org's shop
 * orders, shops, offers, private listings, requisitions and roster.
 *
 * The queries are compiled against a mock pg client and inspected: an API
 * token's org grant must narrow every org-membership lookup; sessions and
 * full/admin tokens keep every org; personal rows are untouched.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => {
  // Controllers pull in the CDN client, which needs B2 credentials.
  process.env.B2_KEY_ID ||= "test"
  process.env.B2_APP_KEY ||= "test"
  return { db: null as unknown }
})
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const { OrdersV2Controller } = await import("../orders/OrdersV2Controller.js")
const { ShopsV2Controller } = await import("../shops/ShopsV2Controller.js")
const { OffersV2Controller } = await import("../offers/OffersV2Controller.js")
const { ListingsV2Controller } = await import("../listings/ListingsV2Controller.js")
const { BuyOrdersV2Controller } = await import("../buy-orders/BuyOrdersV2Controller.js")
const { RequisitionsV2Controller } = await import("../requisitions/RequisitionsV2Controller.js")
const { SuppliersV2Controller } = await import("../suppliers/SuppliersV2Controller.js")
const { InventoryV2Controller } = await import("../inventory/InventoryV2Controller.js")
const { WishlistsController } = await import("../game-data/wishlists/WishlistsController.js")

let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.select(/^select count\(\*\)/i).response([{ count: 0, total: 0 }])
  tracker.on.select(() => true).response([])
})

const user = { user_id: "me", role: "user", rsi_confirmed: true }
type Who = "session" | "no-org" | "org-1" | "full"
function req(who: Who) {
  const tokenInfo =
    who === "session"
      ? undefined
      : {
          id: "t",
          name: "t",
          scopes: who === "full" ? ["full"] : ["market:read", "orders:read", "offers:read"],
          contractor_ids: who === "org-1" ? ["org-1"] : [],
        }
  return { user, __tokenInfo: tokenInfo, query: {}, params: {} } as never
}

const selects = () => tracker.history.select
/** knex's rendering of whereIn(col, []): matches nothing. */
const EMPTY_IN = /\b1 = (0|\?|\$\d+)/
/** The queries reading org memberships. */
const memberships = () => selects().filter((q) => q.sql.includes('"contractor_members"'))

/**
 * Every contractor_members lookup must be narrowed to the token's grant:
 * `in (?)` with the granted org for org-1, the empty `1 = 0` for no-org, and
 * no narrowing at all for sessions and full tokens.
 */
function expectMembershipScope(who: Who) {
  const qs = memberships()
  expect(qs.length).toBeGreaterThan(0)
  for (const q of qs) {
    if (who === "no-org") expect(q.sql).toMatch(EMPTY_IN)
    else if (who === "org-1") {
      expect(q.sql).toMatch(/"contractor_id" in \((\?|\$\d+)\)/)
      expect(q.bindings).toContain("org-1")
    } else {
      expect(q.sql).not.toMatch(EMPTY_IN)
      expect(q.bindings).not.toContain("org-1")
    }
  }
}

describe("GET /orders?role=seller", () => {
  const run = (who: Who) =>
    new OrdersV2Controller().getOrders(undefined, "seller", undefined, undefined, 1, 20, undefined, undefined, req(who))
  const ordersQuery = () => selects().find((q) => /from "orders"/.test(q.sql) && !/count\(/.test(q.sql))!

  it("a token without org access gets no org shops and no org orders assigned to the user", async () => {
    await run("no-org")
    expectMembershipScope("no-org")
    // Assigned orders: personal (no org) only.
    expect(ordersQuery().sql).toMatch(/"orders"\."contractor_id" is null or 1 = /)
  })

  it("a token granted the org keeps that org's orders", async () => {
    await run("org-1")
    expectMembershipScope("org-1")
    expect(ordersQuery().sql).toMatch(/"orders"\."contractor_id" is null or "orders"\."contractor_id" in/)
    expect(ordersQuery().bindings).toContain("org-1")
  })

  it("sessions and full tokens are unaffected", async () => {
    for (const who of ["session", "full"] as const) {
      tracker.resetHistory()
      await run(who)
      expectMembershipScope(who)
      expect(ordersQuery().sql).not.toContain('"orders"."contractor_id" is null')
    }
  })
})

describe("GET /shops/mine", () => {
  const run = (who: Who) => new ShopsV2Controller().getMyShops(req(who))

  it("lists only the orgs the token was granted (and the personal shop)", async () => {
    await run("no-org")
    expectMembershipScope("no-org")
    const shops = selects().find((q) => /from "shops"/.test(q.sql))!
    expect(shops.sql).toMatch(/"owner_user_id" = (\?|\$\d+)/)
    tracker.resetHistory()
    await run("org-1")
    expectMembershipScope("org-1")
  })

  it("sessions see every org shop", async () => {
    await run("session")
    expectMembershipScope("session")
  })
})

describe("GET /offers/search", () => {
  const run = (who: Who, role?: "seller" | "customer") =>
    new OffersV2Controller().searchOffers(req(who), role, undefined, 1, 20)
  const offerQuery = () => selects().find((q) => /from "offer_sessions"/.test(q.sql))!

  it("a token without org access sees no org offers on the seller side", async () => {
    await run("no-org", "seller")
    expectMembershipScope("no-org")
    expect(offerQuery().sql).toMatch(/"contractor_id" is null or 1 = /)
  })

  it("keeps the customer's own offers", async () => {
    await run("no-org")
    expect(offerQuery().sql).toMatch(/"customer_id" = (\?|\$\d+)/)
  })

  it("a granted org and sessions keep org offers", async () => {
    await run("org-1", "seller")
    expectMembershipScope("org-1")
    tracker.resetHistory()
    await run("session", "seller")
    expectMembershipScope("session")
  })
})

describe("GET /listings/search (private org listings)", () => {
  function run(who: Who) {
    type Args = Parameters<InstanceType<typeof ListingsV2Controller>["searchListings"]>
    const args = new Array(24).fill(undefined) as Args
    args[8] = 1
    args[9] = 20
    args[23] = req(who)
    return new ListingsV2Controller().searchListings(...args)
  }

  it("a token without org access gets no org's private listings", async () => {
    await run("no-org")
    expectMembershipScope("no-org")
  })

  it("a granted org and sessions keep them", async () => {
    await run("org-1")
    expectMembershipScope("org-1")
    tracker.resetHistory()
    await run("session")
    expectMembershipScope("session")
  })
})

describe("GET /buy-orders/search (orders directed at an org)", () => {
  const run = (who: Who) => new BuyOrdersV2Controller().searchBuyOrders(req(who))

  it("roster/private orders reached through an org follow the token's grant", async () => {
    await run("no-org")
    expectMembershipScope("no-org")
    tracker.resetHistory()
    await run("org-1")
    expectMembershipScope("org-1")
    tracker.resetHistory()
    await run("session")
    expectMembershipScope("session")
  })
})

describe("GET /requisitions, /suppliers, /suppliers/as-supplier", () => {
  it("narrow the user's orgs to the token's grant", async () => {
    for (const who of ["no-org", "org-1", "session"] as const) {
      tracker.resetHistory()
      await new RequisitionsV2Controller().getRequisitions(req(who), "supplier")
      await new SuppliersV2Controller().getMySuppliers(req(who))
      await new SuppliersV2Controller().getMyAggregators(req(who))
      expectMembershipScope(who)
    }
  })

  it("requisitions assigned to the user drop other orgs for a token", async () => {
    await new RequisitionsV2Controller().getRequisitions(req("no-org"), "supplier")
    const q = selects().find((s) => /from "orders"/.test(s.sql))!
    expect(q.sql).toMatch(/"orders"\."contractor_id" is null or 1 = /)
  })
})

describe("GET /game-data/wishlists (org collaborative lists)", () => {
  it("follows the token's grant", async () => {
    for (const who of ["no-org", "org-1", "session"] as const) {
      tracker.resetHistory()
      await new WishlistsController().getWishlists(req(who))
      expectMembershipScope(who)
    }
  })
})

describe("GET /inventory (the user's lots in org listings)", () => {
  const run = (who: Who) => new InventoryV2Controller().getInventory(req(who))
  const lots = () => selects().find((q) => /from "listing_item_lots"/.test(q.sql))!

  it("a token leaves out lots in listings of orgs it wasn't granted", async () => {
    await run("no-org")
    expect(lots().sql).toContain('"lil"."listing_id" is null or not exists')
    expect(lots().sql).toContain('"own_s"."owner_contractor_id" is not null')
    tracker.resetHistory()
    await run("org-1")
    expect(lots().bindings).toContain("org-1")
  })

  it("sessions see every lot", async () => {
    await run("session")
    expect(lots().sql).not.toContain("own_s")
  })
})
