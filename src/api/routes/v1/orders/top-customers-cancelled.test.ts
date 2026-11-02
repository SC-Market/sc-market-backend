/**
 * The Org Orders "top customers" widget must not count cancelled orders.
 *
 * - getContractorOrderMetrics (GET /api/orders/contractor/:spectrum_id/metrics,
 *   the widget's source) filters them out of its top-customers query.
 * - getUserOrderMetrics (the assigned-orders variant) skips them when it
 *   tallies customers in memory.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

type Call = { method: string; args: unknown[] }
type Query = { table: string; calls: Call[] }

const state: { queries: Query[] } = { queries: [] }

/**
 * A knex stand-in that records every chained call per query. Each query
 * resolves to `[]` when awaited and to `{}` from `.first()`.
 */
function makeBuilder(table: string) {
  const query: Query = { table, calls: [] }
  state.queries.push(query)
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve)
        }
        if (prop === "first") {
          return (...args: unknown[]) => {
            query.calls.push({ method: "first", args })
            return Promise.resolve({})
          }
        }
        return (...args: unknown[]) => {
          query.calls.push({ method: prop, args })
          return builder
        }
      },
    },
  )
  return builder
}

vi.mock("../../../../clients/database/knex-db.js", () => {
  const knex = Object.assign((table: string) => makeBuilder(table), {
    raw: (sql: string) => sql,
  })
  return { database: { knex }, getKnex: () => knex }
})

vi.mock("../chats/database.js", () => ({}))
vi.mock("../contractors/database.js", () => ({}))
vi.mock("../profiles/database.js", () => ({
  getUser: vi.fn(async ({ user_id }: { user_id: string }) => ({ username: `name-${user_id}` })),
}))
vi.mock("./database.js", () => ({ getOrders: vi.fn() }))
vi.mock("../offers/database.js", () => ({}))
vi.mock("../market/database.js", () => ({}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: {},
}))
vi.mock("../../../../services/discord/discord.service.js", () => ({ discordService: {} }))
vi.mock("../../../../services/discord/order-alerts.js", () => ({
  postOfferAlert: vi.fn(),
  postOrderAlert: vi.fn(),
}))
vi.mock("../../../../services/chats/chat-participant.service.js", () => ({
  chatParticipantService: {},
}))
vi.mock("../../../../services/allocation/order-lifecycle.service.js", () => ({
  OrderLifecycleService: class {},
}))
vi.mock("../chats/helpers.js", () => ({ sendSystemMessage: vi.fn() }))
vi.mock("../util/permissions.js", () => ({ has_permission: vi.fn(), is_member: vi.fn() }))
vi.mock("../../../../services/allocation/allocation-mode.service.js", () => ({
  getShopAllocationMode: vi.fn(),
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const helpers = await import("./helpers.js")
const orderDb = await import("./database.js")

/** The top-customers query is the only one joining accounts. */
function topCustomersQuery(): Query {
  const q = state.queries.find((q) => q.calls.some((c) => c.method === "join" && c.args[0] === "accounts"))
  if (!q) throw new Error("top customers query not built")
  return q
}

describe("top customers leave out cancelled orders", () => {
  beforeEach(() => {
    state.queries = []
  })

  it("org metrics: the top-customers query excludes cancelled orders", async () => {
    await helpers.getContractorOrderMetrics("org-1")
    const q = topCustomersQuery()
    expect(q.calls).toContainEqual({ method: "whereNot", args: ["orders.status", "cancelled"] })
    expect(q.calls).toContainEqual({ method: "where", args: [{ contractor_id: "org-1" }] })
  })

  it("shop-scoped metrics: still excludes cancelled orders", async () => {
    await helpers.getContractorOrderMetrics("org-1", "shop-1")
    const q = topCustomersQuery()
    expect(q.calls).toContainEqual({ method: "whereNot", args: ["orders.status", "cancelled"] })
    expect(q.calls).toContainEqual({ method: "where", args: [{ shop_id: "shop-1" }] })
  })

  it("only the top-customers query drops cancelled orders; status counts keep them", async () => {
    await helpers.getContractorOrderMetrics("org-1")
    const others = state.queries.filter((q) => q !== topCustomersQuery())
    for (const q of others) {
      expect(q.calls.some((c) => c.method === "whereNot")).toBe(false)
    }
  })

  it("assigned metrics: a customer with only cancelled orders is not a top customer", async () => {
    const order = (customer_id: string, status: string, cost: number) => ({
      customer_id,
      status,
      cost,
      timestamp: new Date().toISOString(),
    })
    ;(orderDb.getOrders as unknown as Mock).mockResolvedValue([
      order("a", "fulfilled", 100),
      order("a", "cancelled", 5000),
      order("b", "cancelled", 9000),
      order("c", "in-progress", 50),
    ])

    const metrics = await helpers.getUserOrderMetrics("user-1")

    expect(metrics.top_customers).toEqual([
      { username: "name-a", order_count: 1, total_value: 100 },
      { username: "name-c", order_count: 1, total_value: 50 },
    ])
    // The status breakdown still reports the cancelled orders.
    expect(metrics.status_counts.cancelled).toBe(2)
  })
})
