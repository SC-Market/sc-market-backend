/**
 * Unit tests for ShopsV2Controller — blocklist and customers endpoints.
 *
 * Tests:
 * - getShopBlocklist: returns blocked users, rejects non-managers
 * - blockUserFromShop: adds user to blocklist, handles not-found user
 * - unblockUserFromShop: removes user from blocklist, rejects non-managers
 * - getShopCustomers: returns aggregated customer data with pagination
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request as ExpressRequest } from "express"
import type { Knex } from "knex"
import { ShopsV2Controller } from "./ShopsV2Controller.js"
import type { Shop } from "../../../../services/shops/shop-permissions.service.js"
import type { User } from "../../v1/api-models.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  clearMockData,
  setupMockTableDataGeneric,
  getMockTableDataGeneric,
} from "../../../../test-utils/mockDatabase.js"
import { createTestUser } from "../../../../test-utils/testFixturesMock.js"

// Mock the shop-permissions service since it uses getKnex internally
vi.mock("../../../../services/shops/shop-permissions.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../services/shops/shop-permissions.service.js")
    >()
  return {
    ...actual,
    getShopById: vi.fn(async (shopId: string): Promise<Shop | null> => {
      const shops = getMockTableDataGeneric("shops") as unknown as Shop[]
      return shops.find((s) => s.shop_id === shopId) || null
    }),
    canManageShop: vi.fn(
      async (
        shop: Pick<Shop, "shop_id" | "owner_user_id" | "owner_contractor_id">,
        userId: string,
      ): Promise<boolean> => {
        if (shop.owner_user_id === userId) return true
        return false
      },
    ),
  }
})

// Mock shop-metrics service (imported by the controller)
vi.mock("../../../../services/shops/shop-metrics.service.js", () => ({
  getShopMetrics: vi.fn(async () => ({
    total_orders: 0,
    fulfilled_orders: 0,
    total_revenue: 0,
    avg_rating: null,
  })),
}))

// Mock webhooks (imported by the controller)
vi.mock("../../v1/util/webhooks.js", () => ({
  createNotificationWebhook: vi.fn(),
}))

// Mock notifications database
vi.mock("../../v1/notifications/database.js", () => ({
  createNotification: vi.fn(),
}))

/**
 * Controller under test with its protected `request` slot exposed, so tests can
 * inject an authenticated request without widening the controller to `any`.
 */
type ControllerWithRequest = ShopsV2Controller & {
  request?: ExpressRequest
}

/** Build the minimal ExpressRequest the controller reads `user` off of. */
function mockRequest(userId: string, role: User["role"]): ExpressRequest {
  return { user: { user_id: userId, role } as User } as ExpressRequest
}

/**
 * The test knex is a vi.fn() table-factory (see test-utils/mockDatabase.ts), so
 * expose it as such to allow per-table mockImplementation overrides.
 */
type MockedKnexFn = Mock<(table: string) => ChainableBuilder>

function mockedKnex(): MockedKnexFn {
  return getKnex() as unknown as MockedKnexFn
}

/**
 * Helper: create a comprehensive chainable mock query builder for tests
 * that exercise the full query chain (join, onConflict, groupBy, raw, etc.).
 *
 * The subset of the knex query-builder surface these tests stub. Every chain
 * method returns the same builder; `first`/`then` are the terminals.
 */
type ChainableBuilder = {
  [method: string]: unknown
} & {
  first: Mock
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>
}

function createChainableBuilder(
  resolveValue: Record<string, unknown>[] = [],
): ChainableBuilder {
  const builder = {} as ChainableBuilder
  const chainMethods = [
    "join", "leftJoin", "where", "andWhere", "select", "orderBy",
    "groupBy", "limit", "offset", "insert", "delete", "update",
    "whereNull", "whereIn", "onConflict", "ignore", "raw",
    "countDistinct", "returning",
  ]
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder)
  }
  // Terminal methods
  builder.first = vi.fn(async () => resolveValue?.[0] ?? null)
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(resolve)
  // Special: onConflict returns an object with ignore
  builder.onConflict = vi.fn(() => ({ ignore: vi.fn(() => Promise.resolve()) }))
  return builder
}

describe("ShopsV2Controller — Blocklist", () => {
  const shopId = "shop-001"
  let ownerUser: ReturnType<typeof createTestUser>
  let otherUser: ReturnType<typeof createTestUser>
  let targetUser: ReturnType<typeof createTestUser>

  beforeEach(() => {
    clearMockData()

    ownerUser = createTestUser({ username: "shop_owner" })
    otherUser = createTestUser({ username: "random_user" })
    targetUser = createTestUser({ username: "target_blocked" })

    setupMockTableDataGeneric("shops", [
      {
        shop_id: shopId,
        slug: "test-shop",
        name: "Test Shop",
        description: "",
        banner: null,
        logo: null,
        owner_user_id: ownerUser.user_id,
        owner_contractor_id: null,
        supported_languages: ["en"],
        tags: [],
        accepts_custom_orders: false,
        market_order_template: "",
        default_pickup_method: null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])

    setupMockTableDataGeneric("shop_blocklist", [])
  })

  function createController(userId: string, role: User["role"] = "user") {
    const controller = new ShopsV2Controller()
    ;(controller as ControllerWithRequest).request = mockRequest(userId, role)
    return controller
  }

  describe("getShopBlocklist", () => {
    it("should return the blocklist for a shop manager", async () => {
      const blocklistEntry = {
        id: "bl-1",
        blocked_user_id: targetUser.user_id,
        username: targetUser.username,
        display_name: targetUser.username,
        avatar: "",
        reason: "scam",
        created_at: new Date(),
      }

      // Override the mock knex to handle the join query
      const db = mockedKnex()
      const originalImpl =
        db.getMockImplementation() ?? ((table: string) => createChainableBuilder())
      db.mockImplementation((table: string) => {
        if (table === "shop_blocklist") {
          return createChainableBuilder([blocklistEntry])
        }
        return originalImpl(table)
      })

      const controller = createController(ownerUser.user_id)
      const mockReq = mockRequest(ownerUser.user_id, "user")

      const result = await controller.getShopBlocklist(mockReq, shopId)

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0].user_id).toBe(targetUser.user_id)
      expect(result[0].reason).toBe("scam")
    })

    it("should throw forbidden for non-managers", async () => {
      const controller = createController(otherUser.user_id)
      const mockReq = mockRequest(otherUser.user_id, "user")

      await expect(
        controller.getShopBlocklist(mockReq, shopId),
      ).rejects.toThrow()
    })

    it("should throw not found for non-existent shop", async () => {
      const controller = createController(ownerUser.user_id)
      const mockReq = mockRequest(ownerUser.user_id, "user")

      await expect(
        controller.getShopBlocklist(mockReq, "nonexistent-shop"),
      ).rejects.toThrow()
    })
  })

  describe("blockUserFromShop", () => {
    it("should block a user by username", async () => {
      // Override mock to handle the accounts lookup and insert.onConflict chain
      const db = mockedKnex()
      db.mockImplementation((table: string) => {
        if (table === "accounts") {
          const b = createChainableBuilder([{ user_id: targetUser.user_id }])
          b.first = vi.fn(async () => ({ user_id: targetUser.user_id }))
          return b
        }
        if (table === "shop_blocklist") {
          const b = createChainableBuilder()
          b.insert = vi.fn(() => ({
            onConflict: vi.fn(() => ({
              ignore: vi.fn(() => Promise.resolve()),
            })),
          }))
          return b
        }
        return createChainableBuilder()
      })

      const controller = createController(ownerUser.user_id)
      const mockReq = mockRequest(ownerUser.user_id, "user")

      const result = await controller.blockUserFromShop(
        mockReq,
        shopId,
        { username: targetUser.username, reason: "spam" },
      )

      expect(result).toEqual({ success: true })
    })

    it("should throw not found when target username does not exist", async () => {
      // Reset mock to default (accounts lookup returns null for unknown username)
      const db = mockedKnex()
      db.mockImplementation((table: string) => {
        if (table === "accounts") {
          const b = createChainableBuilder([])
          b.first = vi.fn(async () => null)
          return b
        }
        return createChainableBuilder()
      })

      const controller = createController(ownerUser.user_id)
      const mockReq = mockRequest(ownerUser.user_id, "user")

      await expect(
        controller.blockUserFromShop(mockReq, shopId, {
          username: "nonexistent_user_xyz",
          reason: "test",
        }),
      ).rejects.toThrow()
    })

    it("should throw forbidden for non-managers", async () => {
      const controller = createController(otherUser.user_id)
      const mockReq = mockRequest(otherUser.user_id, "user")

      await expect(
        controller.blockUserFromShop(mockReq, shopId, {
          username: targetUser.username,
        }),
      ).rejects.toThrow()
    })
  })

  describe("unblockUserFromShop", () => {
    it("should unblock a user", async () => {
      setupMockTableDataGeneric("shop_blocklist", [
        {
          id: "bl-1",
          shop_id: shopId,
          blocked_user_id: targetUser.user_id,
          reason: "spam",
          created_at: new Date(),
        },
      ])

      const controller = createController(ownerUser.user_id)
      const mockReq = mockRequest(ownerUser.user_id, "user")

      const result = await controller.unblockUserFromShop(
        mockReq,
        shopId,
        targetUser.user_id,
      )

      expect(result).toEqual({ success: true })
    })

    it("should throw forbidden for non-managers", async () => {
      const controller = createController(otherUser.user_id)
      const mockReq = mockRequest(otherUser.user_id, "user")

      await expect(
        controller.unblockUserFromShop(mockReq, shopId, targetUser.user_id),
      ).rejects.toThrow()
    })

    it("should throw not found for non-existent shop", async () => {
      const controller = createController(ownerUser.user_id)
      const mockReq = mockRequest(ownerUser.user_id, "user")

      await expect(
        controller.unblockUserFromShop(mockReq, "nonexistent-shop", targetUser.user_id),
      ).rejects.toThrow()
    })
  })
})

describe("ShopsV2Controller — Customers", () => {
  const shopId = "shop-001"
  let ownerUser: ReturnType<typeof createTestUser>
  let customerUser: ReturnType<typeof createTestUser>
  let otherUser: ReturnType<typeof createTestUser>

  beforeEach(() => {
    clearMockData()

    ownerUser = createTestUser({ username: "shop_owner" })
    customerUser = createTestUser({ username: "customer_one" })
    otherUser = createTestUser({ username: "random_user" })

    setupMockTableDataGeneric("shops", [
      {
        shop_id: shopId,
        slug: "test-shop",
        name: "Test Shop",
        description: "",
        banner: null,
        logo: null,
        owner_user_id: ownerUser.user_id,
        owner_contractor_id: null,
        supported_languages: ["en"],
        tags: [],
        accepts_custom_orders: false,
        market_order_template: "",
        default_pickup_method: null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])

    setupMockTableDataGeneric("orders", [
      {
        order_id: "order-1",
        customer_id: customerUser.user_id,
        shop_id: shopId,
        status: "fulfilled",
        cost: "500",
        timestamp: new Date(),
      },
      {
        order_id: "order-2",
        customer_id: customerUser.user_id,
        shop_id: shopId,
        status: "in-progress",
        cost: "300",
        timestamp: new Date(),
      },
    ])
  })

  function createController(userId: string, role: User["role"] = "user") {
    const controller = new ShopsV2Controller()
    ;(controller as ControllerWithRequest).request = mockRequest(userId, role)
    return controller
  }

  describe("getShopCustomers", () => {
    it("should throw forbidden for non-managers", async () => {
      const controller = createController(otherUser.user_id)
      const mockReq = mockRequest(otherUser.user_id, "user")

      await expect(
        controller.getShopCustomers(mockReq, shopId),
      ).rejects.toThrow()
    })

    it("should throw not found for non-existent shop", async () => {
      const controller = createController(ownerUser.user_id)
      const mockReq = mockRequest(ownerUser.user_id, "user")

      await expect(
        controller.getShopCustomers(mockReq, "nonexistent-shop"),
      ).rejects.toThrow()
    })

    it("should allow admins to view customers regardless of ownership", async () => {
      const adminUser = createTestUser({ username: "admin_user", role: "admin" })

      // The getShopCustomers method makes two queries to "orders":
      // 1. The main query: db("orders").join(...).where(...).groupBy(...).select(...).orderBy(...).limit(...).offset(...)
      // 2. The count query: db("orders").where("shop_id", ...).countDistinct("customer_id as count")
      //
      // We use a call counter to differentiate them.
      let ordersCallCount = 0
      const db = mockedKnex()
      db.mockImplementation((table: string) => {
        if (table === "orders") {
          ordersCallCount++
          if (ordersCallCount === 1) {
            // Main query returning customer rows
            return createChainableBuilder([
              {
                user_id: customerUser.user_id,
                username: customerUser.username,
                display_name: customerUser.username,
                avatar: "",
                order_count: "2",
                fulfilled_count: "1",
                total_spent: "800",
                last_order_at: new Date(),
              },
            ])
          } else {
            // Count query — countDistinct returns an awaitable array
            const b = createChainableBuilder([{ count: "1" }])
            b.countDistinct = vi.fn(() => {
              // This is the terminal: `await db("orders").where(...).countDistinct(...)`
              // which resolves to [{ count: "1" }]
              return {
                then: (resolve: (value: unknown) => unknown) =>
                  Promise.resolve([{ count: "1" }]).then(resolve),
                catch: vi.fn(),
              }
            })
            return b
          }
        }
        return createChainableBuilder()
      })

      const controller = createController(adminUser.user_id, "admin")
      const mockReq = mockRequest(adminUser.user_id, "admin")

      // Admin should not throw — the mock canManageShop returns false for non-owners
      // but isAdmin() returns true which bypasses the permission check
      const result = await controller.getShopCustomers(mockReq, shopId)
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
      expect(result.items.length).toBe(1)
      expect(result.items[0].user_id).toBe(customerUser.user_id)
      expect(result.total).toBe(1)
    })
  })
})
