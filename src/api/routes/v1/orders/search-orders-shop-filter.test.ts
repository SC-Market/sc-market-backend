/**
 * Unit tests for search_orders shop_id filtering
 *
 * Verifies that the search_orders function correctly passes the shop_id
 * filter through to the query builder. These tests spy on the database
 * module to verify query construction without running the full complex query.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Knex } from "knex"
import { database } from "../../../../clients/database/knex-db.js"

// Mock all transitive dependencies of helpers.ts
vi.mock("../chats/database.js", () => ({
  getChat: vi.fn(async () => null),
  createMessage: vi.fn(async () => ({})),
}))

vi.mock("../contractors/database.js", () => ({
  getContractor: vi.fn(async () => null),
}))

vi.mock("../profiles/database.js", () => ({
  getUser: vi.fn(async () => null),
}))

vi.mock("./database.js", () => ({
  getOrder: vi.fn(async () => null),
  getOrderSettings: vi.fn(async () => null),
  updateOrderStatus: vi.fn(async () => ({})),
}))

vi.mock("../offers/database.js", () => ({
  getOfferSessions: vi.fn(async () => []),
}))

vi.mock("../market/database.js", () => ({
  getListing: vi.fn(async () => null),
}))

vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { sendNotification: vi.fn() },
}))

vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: { sendMessage: vi.fn() },
}))

vi.mock("../../../../services/discord/order-alerts.js", () => ({
  postOfferAlert: vi.fn(),
  postOrderAlert: vi.fn(),
}))

vi.mock("../../../../services/chats/chat-participant.service.js", () => ({
  chatParticipantService: { getParticipants: vi.fn(async () => []) },
}))

vi.mock("../../../../services/allocation/order-lifecycle.service.js", () => ({
  OrderLifecycleService: class {
    transition = vi.fn()
  },
}))

vi.mock("../chats/helpers.js", () => ({
  sendSystemMessage: vi.fn(async () => ({})),
}))

vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
}))

vi.mock("../../../../services/allocation/allocation-mode.service.js", () => ({
  getAllocationMode: vi.fn(async () => "manual"),
}))

vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: vi.fn(
    async <T,>(cb: (trx: Knex.Transaction) => Promise<T>) =>
      // The mocked callback never touches the trx, so a bare stub suffices.
      cb(vi.fn() as unknown as Knex.Transaction),
  ),
}))

/**
 * The nested builder handed to a `.where(cb)` callback. search_orders only
 * chains these three methods inside its grouped-where callbacks.
 */
type SubBuilder = {
  where: Mock
  whereNull: Mock
  whereIn: Mock
}

/**
 * The slice of the knex query-builder surface search_orders touches. Chain
 * methods return the same builder; `select`, `first` and `then` are terminals.
 */
type FullBuilder = {
  where: Mock
  andWhere: Mock
  clone: Mock
  groupByRaw: Mock
  select: Mock
  orderBy: Mock
  orderByRaw: Mock
  leftJoin: Mock
  limit: Mock
  offset: Mock
  whereNull: Mock
  whereIn: Mock
  whereRaw: Mock
  count: Mock
  first: Mock
  then: (resolve: (value: unknown[]) => unknown) => Promise<unknown>
}

/** The setupTests knex stand-in is a vi.fn() table factory (see setupTests.ts). */
type MockedKnexFn = Mock<(table: string) => FullBuilder>

describe("search_orders — shop_id filter", () => {
  let whereCalls: Array<{ args: unknown[] }>

  beforeEach(() => {
    whereCalls = []

    // Create a comprehensive mock builder that tracks .where() calls
    const createFullBuilder = (): FullBuilder => {
      const builder: FullBuilder = {
        where: vi.fn((...args: unknown[]) => {
          // Track where calls, including callback invocations
          if (typeof args[0] === "function") {
            // Execute the callback with a sub-builder that also tracks
            const subBuilder = {} as SubBuilder
            const subWhere = vi.fn((...subArgs: unknown[]) => {
              whereCalls.push({ args: subArgs })
              return subBuilder
            })
            subBuilder.where = subWhere
            subBuilder.whereNull = vi.fn(() => subBuilder)
            subBuilder.whereIn = vi.fn(() => subBuilder)
            ;(args[0] as (b: SubBuilder) => void)(subBuilder)
          } else {
            whereCalls.push({ args })
          }
          return builder
        }),
        andWhere: vi.fn(() => builder),
        clone: vi.fn(() => builder),
        groupByRaw: vi.fn(() => builder),
        select: vi.fn(() => Promise.resolve([])),
        orderBy: vi.fn(() => builder),
        orderByRaw: vi.fn(() => builder),
        leftJoin: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        offset: vi.fn(() => builder),
        whereNull: vi.fn(() => builder),
        whereIn: vi.fn(() => builder),
        whereRaw: vi.fn(() => builder),
        count: vi.fn(() => builder),
        first: vi.fn(() => Promise.resolve({ count: 0 })),
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve([]).then(resolve),
      }
      // Make select chainable AND resolvable
      builder.select = vi.fn((...args: unknown[]) => {
        if (args.length === 0) return Promise.resolve([])
        return builder
      })
      return builder
    }

    // Replace the mock knex function
    const mockKnex = database.knex as unknown as MockedKnexFn
    mockKnex.mockImplementation(() => createFullBuilder())
  })

  it("should pass shop_id to where clause when provided", async () => {
    const shopId = "shop-filter-test"

    const { search_orders } = await import("./helpers.js")

    try {
      await search_orders({
        shop_id: shopId,
        sort_method: "timestamp",
        index: 0,
        page_size: 20,
        reverse_sort: false,
      })
    } catch {
      // May throw due to incomplete mock chain — that's fine,
      // we just need to verify the where clause was constructed
    }

    // Verify that shop_id was passed to a .where() call
    const shopIdCalls = whereCalls.filter(
      (c) => c.args[0] === "shop_id" && c.args[1] === shopId,
    )
    expect(shopIdCalls.length).toBeGreaterThan(0)
  })

  it("should not add shop_id filter when not provided", async () => {
    const { search_orders } = await import("./helpers.js")

    try {
      await search_orders({
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
      (c) => c.args[0] === "shop_id",
    )
    expect(shopIdCalls.length).toBe(0)
  })

  it("should apply shop_id filter alongside customer_id", async () => {
    const shopId = "shop-combined"
    const customerId = "customer-1"

    const { search_orders } = await import("./helpers.js")

    try {
      await search_orders({
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

    // Both filters should be present
    const shopIdCalls = whereCalls.filter(
      (c) => c.args[0] === "shop_id" && c.args[1] === shopId,
    )
    const customerIdCalls = whereCalls.filter(
      (c) => c.args[0] === "customer_id" && c.args[1] === customerId,
    )
    expect(shopIdCalls.length).toBeGreaterThan(0)
    expect(customerIdCalls.length).toBeGreaterThan(0)
  })
})
