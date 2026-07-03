/**
 * Unit tests for search_offer_sessions_optimized shop_id filtering
 *
 * Verifies that search_offer_sessions_optimized correctly passes the
 * shop_id filter to the query builder. Uses spy-based approach to verify
 * query construction without running the full complex query.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { database } from "../../../../clients/database/knex-db.js"

// Mock all transitive dependencies of offers/helpers.ts
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
}))

vi.mock("./database.js", () => ({
  getOfferSessions: vi.fn(async () => []),
  getOfferSession: vi.fn(async () => null),
}))

vi.mock("../market/database.js", () => ({
  getListing: vi.fn(async () => null),
}))

vi.mock("../orders/helpers.js", () => ({
  createOffer: vi.fn(async () => ({})),
  handleStatusUpdate: vi.fn(async () => ({})),
}))

vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe("search_offer_sessions_optimized — shop_id filter", () => {
  let whereCalls: Array<{ args: unknown[] }>

  beforeEach(() => {
    whereCalls = []

    const createFullBuilder = () => {
      const builder: any = {
        where: vi.fn((...args: unknown[]) => {
          if (typeof args[0] === "function") {
            const subBuilder: any = {}
            const subWhere = vi.fn((...subArgs: unknown[]) => {
              whereCalls.push({ args: subArgs })
              return subBuilder
            })
            subBuilder.where = subWhere
            subBuilder.whereNull = vi.fn(() => subBuilder)
            subBuilder.whereIn = vi.fn(() => subBuilder)
            ;(args[0] as Function)(subBuilder)
          } else {
            whereCalls.push({ args })
          }
          return builder
        }),
        andWhere: vi.fn(() => builder),
        clone: vi.fn(() => builder),
        groupByRaw: vi.fn(() => builder),
        groupBy: vi.fn(() => builder),
        select: vi.fn(() => Promise.resolve([])),
        orderBy: vi.fn(() => builder),
        orderByRaw: vi.fn(() => builder),
        leftJoin: vi.fn(() => builder),
        join: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        offset: vi.fn(() => builder),
        whereNull: vi.fn(() => builder),
        whereIn: vi.fn(() => builder),
        whereRaw: vi.fn(() => builder),
        whereNotIn: vi.fn(() => builder),
        count: vi.fn(() => builder),
        countDistinct: vi.fn(() => builder),
        first: vi.fn(() => Promise.resolve({ count: 0 })),
        distinct: vi.fn(() => builder),
        then: (resolve: any) => Promise.resolve([]).then(resolve),
      }
      builder.select = vi.fn((...args: unknown[]) => {
        if (args.length === 0) return Promise.resolve([])
        return builder
      })
      return builder
    }

    const mockKnex = database.knex as any
    mockKnex.mockImplementation(() => createFullBuilder())
    // Mock knex.raw for the subquery
    mockKnex.raw = vi.fn(() => "mock_raw_sql")
  })

  it("should pass shop_id to where clause when provided", async () => {
    const shopId = "shop-offer-test"

    const { search_offer_sessions_optimized } = await import("./helpers.js")

    try {
      await search_offer_sessions_optimized({
        shop_id: shopId,
        sort_method: "timestamp",
        index: 0,
        page_size: 20,
        reverse_sort: false,
      })
    } catch {
      // May throw due to incomplete mock chain
    }

    // Verify that offer_sessions.shop_id was passed to a .where() call
    const shopIdCalls = whereCalls.filter(
      (c) =>
        (c.args[0] === "offer_sessions.shop_id" || c.args[0] === "shop_id") &&
        c.args[1] === shopId,
    )
    expect(shopIdCalls.length).toBeGreaterThan(0)
  })

  it("should not add shop_id filter when not provided", async () => {
    const { search_offer_sessions_optimized } = await import("./helpers.js")

    try {
      await search_offer_sessions_optimized({
        sort_method: "timestamp",
        index: 0,
        page_size: 20,
        reverse_sort: false,
      })
    } catch {
      // May throw due to incomplete mock
    }

    // Verify no shop_id where clause was added
    const shopIdCalls = whereCalls.filter(
      (c) =>
        c.args[0] === "offer_sessions.shop_id" || c.args[0] === "shop_id",
    )
    expect(shopIdCalls.length).toBe(0)
  })

  it("should apply shop_id alongside customer_id filter", async () => {
    const shopId = "shop-combo"
    const customerId = "customer-combo"

    const { search_offer_sessions_optimized } = await import("./helpers.js")

    try {
      await search_offer_sessions_optimized({
        shop_id: shopId,
        customer_id: customerId,
        sort_method: "timestamp",
        index: 0,
        page_size: 20,
        reverse_sort: false,
      })
    } catch {
      // May throw due to incomplete mock
    }

    const shopIdCalls = whereCalls.filter(
      (c) =>
        (c.args[0] === "offer_sessions.shop_id" || c.args[0] === "shop_id") &&
        c.args[1] === shopId,
    )
    const customerIdCalls = whereCalls.filter(
      (c) =>
        (c.args[0] === "offer_sessions.customer_id" || c.args[0] === "customer_id") &&
        c.args[1] === customerId,
    )
    expect(shopIdCalls.length).toBeGreaterThan(0)
    expect(customerIdCalls.length).toBeGreaterThan(0)
  })
})
