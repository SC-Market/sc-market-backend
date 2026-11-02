/**
 * Admin › Orders (services/admin-orders, GET /admin/orders and
 * /admin/orders/analytics): orders involving a test buyer, seller, org or
 * shop are left out of the list, its counts and the stats by default, and
 * shown (flagged is_test) with include_test. knex-mock-client database
 * (test-utils/mock-knex-db.ts); these check the SQL each query runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type RawQuery, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)

vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: {} }))

// Ratings and CDN avatar links are not what these tests are about.
vi.mock("../../api/routes/v1/util/formatting.js", () => ({
  formatOrderStubOptimized: vi.fn(async (row: Record<string, unknown>) => ({
    order_id: row.order_id,
    contractor: null,
    assigned_to: null,
    customer: {
      username: row.customer_username,
      display_name: row.customer_username,
      avatar: "",
      rating: { avg_rating: 0, rating_count: 0, total_rating: 0, streak: 0 },
    },
    shop: null,
    status: row.status,
    timestamp: "2026-11-01T00:00:00.000Z",
    cost: "100",
    title: "t",
    payment_type: "one-time",
    count: 1,
    service_name: null,
  })),
}))

const { listAdminOrders, adminOrderAnalytics } = await import("./admin-orders.service.js")
const { AdminOrdersV2Controller } = await import("../../api/routes/v2/admin/AdminOrdersV2Controller.js")

/** The test-realm predicates notTestOrder adds, one per party. */
const TEST_PARTY_CHECKS = [
  /_ta\.user_id = orders\.customer_id AND _ta\.is_test/,
  /_ta\.user_id = orders\.assigned_id AND _ta\.is_test/,
  /_tc\.contractor_id = orders\.contractor_id AND _tc\.is_test/,
  /_ts\.shop_id = orders\.shop_id AND _ts\.is_test/,
]

let tracker: Tracker
beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  tracker = createTracker(db)
  h.db = db
})

const baseSearch = {
  index: 0,
  page_size: 10,
  sort_method: "timestamp" as const,
  reverse_sort: true,
}

/** The four selects of search_orders_optimized, in order. */
function answerSearch(items: Array<Record<string, unknown>>) {
  tracker.on.select("orders").responseOnce(items.map((i) => ({ order_id: i.order_id, status: i.status })))
  tracker.on.select("orders").responseOnce([{ status: "not-started", count: String(items.length) }])
  tracker.on.select("orders").responseOnce([{ count: "1" }])
  tracker.on.select("orders").responseOnce(items)
}

describe("listAdminOrders", () => {
  it("leaves out orders involving a test buyer, seller, org or shop by default", async () => {
    answerSearch([{ order_id: "o1", status: "not-started", kind: "Delivery", customer_username: "buyer", is_test: false }])
    const page = await listAdminOrders({ ...baseSearch, includeTest: false })

    // The filter runs in the first query, so the counts and the page both follow it.
    const filterSql = tracker.history.select[0].sql
    for (const check of TEST_PARTY_CHECKS) expect(filterSql).toMatch(check)
    expect(filterSql).toMatch(/NOT EXISTS/)

    expect(page.item_counts).toEqual({
      fulfilled: 0,
      "in-progress": 0,
      "not-started": 1,
      cancelled: 0,
      unassigned: 1,
    })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ order_id: "o1", kind: "Delivery", is_test: false })
  })

  it("include_test keeps them and flags each order", async () => {
    answerSearch([
      { order_id: "o1", status: "not-started", kind: "Delivery", customer_username: "buyer", is_test: false },
      { order_id: "o2", status: "not-started", kind: "Delivery", customer_username: "~test-buyer", is_test: true },
    ])
    const page = await listAdminOrders({ ...baseSearch, includeTest: true })

    const filterSql = tracker.history.select[0].sql
    expect(filterSql).not.toMatch(/is_test/)
    expect(page.items.map((i) => [i.order_id, i.is_test])).toEqual([
      ["o1", false],
      ["o2", true],
    ])
    // The page query computes the flag from every party.
    const pageSql = tracker.history.select[3].sql
    expect(pageSql).toMatch(/customer_account\.is_test/)
    expect(pageSql).toMatch(/assigned_account\.is_test/)
    expect(pageSql).toMatch(/contractors\.is_test/)
    expect(pageSql).toMatch(/shops\.is_test/)
  })

  it("no matching orders: zero counts, no page query", async () => {
    tracker.on.select("orders").responseOnce([])
    const page = await listAdminOrders({ ...baseSearch, includeTest: false })
    expect(page).toEqual({
      item_counts: { fulfilled: 0, "in-progress": 0, "not-started": 0, cancelled: 0, unassigned: 0 },
      items: [],
    })
    expect(tracker.history.select).toHaveLength(1)
  })
})

/** Answers the analytics queries: three raw period series, top shops, top users, summary. */
function answerAnalytics() {
  tracker.on.any(/generate_series/).response({ rows: [] })
  tracker.on.select("orders").response((q: RawQuery) =>
    /total_value/.test(q.sql)
      ? [{ total_orders: "3", active_orders: "1", completed_orders: "2", total_value: "500" }]
      : [],
  )
}

function analyticsSql(): string[] {
  return [...tracker.history.all].map((q) => q.sql)
}

describe("adminOrderAnalytics", () => {
  it("every series, top list and total leaves out test orders by default", async () => {
    answerAnalytics()
    const stats = await adminOrderAnalytics(false)
    const sqls = analyticsSql()
    expect(sqls).toHaveLength(6)
    for (const sql of sqls) {
      for (const check of TEST_PARTY_CHECKS) {
        // Top shops and users alias orders as "o".
        const aliased = new RegExp(check.source.replace(/orders\\\./g, "(orders|o)\\."))
        expect(sql).toMatch(aliased)
      }
    }
    expect(stats.summary).toEqual({ total_orders: 3, active_orders: 1, completed_orders: 2, total_value: 500 })
  })

  it("include_test counts them", async () => {
    answerAnalytics()
    await adminOrderAnalytics(true)
    const sqls = analyticsSql()
    expect(sqls).toHaveLength(6)
    for (const sql of sqls) expect(sql).not.toMatch(/is_test/)
  })
})

describe("AdminOrdersV2Controller", () => {
  const admin = { user_id: "a1", role: "admin" }

  it("GET /admin/orders excludes test orders unless include_test=true", async () => {
    tracker.on.select("orders").response([])
    const c = new AdminOrdersV2Controller()
    await c.listAdminOrders({ user: admin } as never)
    await c.listAdminOrders({ user: admin } as never, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, false)
    await c.listAdminOrders({ user: admin } as never, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true)
    const [byDefault, explicitFalse, included] = tracker.history.select.map((q) => q.sql)
    expect(byDefault).toMatch(/_ta\.is_test/)
    expect(explicitFalse).toMatch(/_ta\.is_test/)
    expect(included).not.toMatch(/is_test/)
  })

  it("GET /admin/orders/analytics passes include_test", async () => {
    answerAnalytics()
    const c = new AdminOrdersV2Controller()
    await c.getAdminOrderAnalytics({ user: admin } as never, true)
    for (const sql of analyticsSql()) expect(sql).not.toMatch(/is_test/)
  })

  it.each([
    ["anonymous", undefined],
    ["a regular user", { user_id: "u1", role: "user" }],
    ["a test admin", { user_id: "t1", role: "admin", is_test: true }],
  ])("refuses %s", async (_label, user) => {
    const c = new AdminOrdersV2Controller()
    await expect(c.listAdminOrders({ user } as never)).rejects.toThrow()
    await expect(c.getAdminOrderAnalytics({ user } as never)).rejects.toThrow()
    expect(tracker.history.all).toHaveLength(0)
  })
})
