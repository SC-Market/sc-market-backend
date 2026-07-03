/**
 * Unit tests for shop-permissions.service.ts
 *
 * Tests the isBlockedFromShop function which checks whether a user
 * is on a shop's blocklist.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { isBlockedFromShop } from "./shop-permissions.service.js"
import {
  clearMockData,
  setupMockTableDataGeneric,
} from "../../test-utils/mockDatabase.js"

describe("shop-permissions.service", () => {
  beforeEach(() => {
    clearMockData()
  })

  describe("isBlockedFromShop", () => {
    const shopId = "shop-123"
    const blockedUserId = "user-blocked-456"
    const unblockedUserId = "user-unblocked-789"

    it("should return true when the user is on the blocklist", async () => {
      setupMockTableDataGeneric("shop_blocklist", [
        {
          id: "entry-1",
          shop_id: shopId,
          blocked_user_id: blockedUserId,
          reason: "spam",
          created_at: new Date(),
        },
      ])

      const result = await isBlockedFromShop(shopId, blockedUserId)
      expect(result).toBe(true)
    })

    it("should return false when the user is not on the blocklist", async () => {
      setupMockTableDataGeneric("shop_blocklist", [
        {
          id: "entry-1",
          shop_id: shopId,
          blocked_user_id: blockedUserId,
          reason: "spam",
          created_at: new Date(),
        },
      ])

      const result = await isBlockedFromShop(shopId, unblockedUserId)
      expect(result).toBe(false)
    })

    it("should return false when the blocklist is empty", async () => {
      setupMockTableDataGeneric("shop_blocklist", [])

      const result = await isBlockedFromShop(shopId, blockedUserId)
      expect(result).toBe(false)
    })

    it("should return false when user is blocked in a different shop", async () => {
      setupMockTableDataGeneric("shop_blocklist", [
        {
          id: "entry-1",
          shop_id: "other-shop-999",
          blocked_user_id: blockedUserId,
          reason: "other",
          created_at: new Date(),
        },
      ])

      const result = await isBlockedFromShop(shopId, blockedUserId)
      expect(result).toBe(false)
    })
  })
})
