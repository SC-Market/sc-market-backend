/**
 * Unit tests for WishlistsController
 *
 * Tests all wishlist endpoints including CRUD operations, item management,
 * and shopping list generation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { WishlistsController } from "./WishlistsController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"

describe("WishlistsController", () => {
  let controller: WishlistsController
  let knex: ReturnType<typeof getKnex>

  // Mock user context
  const mockUser = {
    user_id: "test-user-id",
    discord_id: "123456789",
    username: "testuser",
  }

  beforeEach(() => {
    knex = getKnex()
    controller = new WishlistsController()
    // Mock the request object with user
    ;(controller as any).request = { user: mockUser }
  })

  afterEach(async () => {
    // Clean up test data
    await knex("wishlist_items").where("wishlist_id", "like", "test-%").delete()
    await knex("user_wishlists").where("user_id", mockUser.user_id).delete()
  })

  describe("getWishlists", () => {
    it("should return empty array when user has no wishlists", async () => {
      const result = await controller.getWishlists()

      expect(result).toEqual({ wishlists: [] })
    })

    it("should return user wishlists with statistics", async () => {
      // Create test wishlist
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          wishlist_description: "Test description",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const result = await controller.getWishlists()

      expect(result.wishlists).toHaveLength(1)
      expect(result.wishlists[0]).toMatchObject({
        wishlist_id: wishlist.wishlist_id,
        wishlist_name: "Test Wishlist",
        wishlist_description: "Test description",
        is_public: false,
        item_count: 0,
        completed_items: 0,
        progress_percentage: 0,
      })
    })

    it("should calculate progress percentage correctly", async () => {
      // Create wishlist with items
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Progress Test",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      // Get a game item for testing
      const gameItem = await knex("game_items").first()

      // Add 2 items, 1 acquired
      await knex("wishlist_items").insert([
        {
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
          is_acquired: true,
          acquired_quantity: 1,
        },
        {
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
          is_acquired: false,
          acquired_quantity: 0,
        },
      ])

      const result = await controller.getWishlists()

      expect(result.wishlists[0]).toMatchObject({
        item_count: 2,
        completed_items: 1,
        progress_percentage: 50,
      })
    })
  })

  describe("createWishlist", () => {
    it("should create a new wishlist", async () => {
      const request = {
        wishlist_name: "New Wishlist",
        wishlist_description: "My new wishlist",
        is_public: false,
        is_collaborative: false,
      }

      const result = await controller.createWishlist(request)

      expect(result).toMatchObject({
        wishlist_name: "New Wishlist",
        wishlist_description: "My new wishlist",
        is_public: false,
        is_collaborative: false,
        user_id: mockUser.user_id,
      })
      expect(result.wishlist_id).toBeDefined()
      expect(result.created_at).toBeDefined()
    })

    it("should generate share token for public wishlists", async () => {
      const request = {
        wishlist_name: "Public Wishlist",
        is_public: true,
        is_collaborative: false,
      }

      const result = await controller.createWishlist(request)

      expect(result.is_public).toBe(true)
      expect(result.share_token).toBeDefined()
      expect(result.share_token?.length).toBe(32)
    })

    it("should not generate share token for private wishlists", async () => {
      const request = {
        wishlist_name: "Private Wishlist",
        is_public: false,
        is_collaborative: false,
      }

      const result = await controller.createWishlist(request)

      expect(result.is_public).toBe(false)
      expect(result.share_token).toBeUndefined()
    })

    it("should throw validation error for empty name", async () => {
      const request = {
        wishlist_name: "",
        is_public: false,
        is_collaborative: false,
      }

      await expect(controller.createWishlist(request)).rejects.toThrow()
    })
  })

  describe("getWishlist", () => {
    it("should return wishlist detail with items", async () => {
      // Create wishlist
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Detail Test",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      // Get a game item
      const gameItem = await knex("game_items").first()

      // Add item
      await knex("wishlist_items").insert({
        wishlist_id: wishlist.wishlist_id,
        game_item_id: gameItem.id,
        desired_quantity: 5,
        desired_quality_tier: 3,
        priority: 4,
        notes: "Test notes",
        is_acquired: false,
        acquired_quantity: 0,
      })

      const result = await controller.getWishlist(wishlist.wishlist_id)

      expect(result.wishlist.wishlist_id).toBe(wishlist.wishlist_id)
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        game_item_id: gameItem.id,
        desired_quantity: 5,
        desired_quality_tier: 3,
        priority: 4,
        notes: "Test notes",
        is_acquired: false,
      })
      expect(result.statistics).toMatchObject({
        total_items: 1,
        completed_items: 0,
        progress_percentage: 0,
      })
    })

    it("should allow access to public wishlist with share token", async () => {
      // Create public wishlist for different user
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Public Wishlist",
          is_public: true,
          share_token: "test-share-token-123456789012",
          is_collaborative: false,
        })
        .returning("*")

      // Access without authentication (simulate guest)
      ;(controller as any).request = { user: undefined }

      const result = await controller.getWishlist(wishlist.wishlist_id, "test-share-token-123456789012")

      expect(result.wishlist.wishlist_id).toBe(wishlist.wishlist_id)
    })

    it("should deny access to private wishlist without ownership", async () => {
      // Create private wishlist for different user
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Private Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      await expect(controller.getWishlist(wishlist.wishlist_id)).rejects.toThrow()
    })

    it("should throw not found for non-existent wishlist", async () => {
      await expect(controller.getWishlist("non-existent-id")).rejects.toThrow()
    })
  })

  describe("updateWishlist", () => {
    it("should update wishlist name", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Original Name",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const result = await controller.updateWishlist(wishlist.wishlist_id, {
        wishlist_name: "Updated Name",
      })

      expect(result.wishlist_name).toBe("Updated Name")
    })

    it("should update public status and generate share token", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const result = await controller.updateWishlist(wishlist.wishlist_id, {
        is_public: true,
      })

      expect(result.is_public).toBe(true)
      expect(result.share_token).toBeDefined()
    })

    it("should deny update for non-owner", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Other User Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      await expect(
        controller.updateWishlist(wishlist.wishlist_id, { wishlist_name: "Hacked" }),
      ).rejects.toThrow()
    })

    it("should throw validation error for empty name", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      await expect(
        controller.updateWishlist(wishlist.wishlist_id, { wishlist_name: "" }),
      ).rejects.toThrow()
    })
  })

  describe("deleteWishlist", () => {
    it("should delete wishlist", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "To Delete",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const result = await controller.deleteWishlist(wishlist.wishlist_id)

      expect(result.success).toBe(true)

      const deleted = await knex("user_wishlists").where("wishlist_id", wishlist.wishlist_id).first()
      expect(deleted).toBeUndefined()
    })

    it("should deny delete for non-owner", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Other User Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      await expect(controller.deleteWishlist(wishlist.wishlist_id)).rejects.toThrow()
    })
  })

  describe("addWishlistItem", () => {
    it("should add item to wishlist", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const request = {
        game_item_id: gameItem.id,
        desired_quantity: 10,
        desired_quality_tier: 4,
        priority: 5,
        notes: "Important item",
      }

      const result = await controller.addWishlistItem(wishlist.wishlist_id, request)

      expect(result).toMatchObject({
        wishlist_id: wishlist.wishlist_id,
        game_item_id: gameItem.id,
        desired_quantity: 10,
        desired_quality_tier: 4,
        priority: 5,
        notes: "Important item",
        is_acquired: false,
        acquired_quantity: 0,
      })
      expect(result.game_item_name).toBe(gameItem.name)
    })

    it("should add item with blueprint reference", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()
      const blueprint = await knex("blueprints").first()

      const request = {
        game_item_id: gameItem.id,
        desired_quantity: 1,
        blueprint_id: blueprint.blueprint_id,
        priority: 3,
      }

      const result = await controller.addWishlistItem(wishlist.wishlist_id, request)

      expect(result.blueprint_id).toBe(blueprint.blueprint_id)
      expect(result.crafting_available).toBe(true)
    })

    it("should throw validation error for invalid quantity", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const request = {
        game_item_id: gameItem.id,
        desired_quantity: 0,
        priority: 3,
      }

      await expect(controller.addWishlistItem(wishlist.wishlist_id, request)).rejects.toThrow()
    })

    it("should throw validation error for invalid quality tier", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const request = {
        game_item_id: gameItem.id,
        desired_quantity: 1,
        desired_quality_tier: 6,
        priority: 3,
      }

      await expect(controller.addWishlistItem(wishlist.wishlist_id, request)).rejects.toThrow()
    })

    it("should throw validation error for invalid priority", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const request = {
        game_item_id: gameItem.id,
        desired_quantity: 1,
        priority: 10,
      }

      await expect(controller.addWishlistItem(wishlist.wishlist_id, request)).rejects.toThrow()
    })

    it("should deny add for non-collaborative wishlist", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Other User Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const request = {
        game_item_id: gameItem.id,
        desired_quantity: 1,
        priority: 3,
      }

      await expect(controller.addWishlistItem(wishlist.wishlist_id, request)).rejects.toThrow()
    })
  })

  describe("removeWishlistItem", () => {
    it("should remove item from wishlist", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
        })
        .returning("*")

      const result = await controller.removeWishlistItem(wishlist.wishlist_id, item.item_id)

      expect(result.success).toBe(true)

      const deleted = await knex("wishlist_items").where("item_id", item.item_id).first()
      expect(deleted).toBeUndefined()
    })

    it("should deny remove for non-owner", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Other User Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
        })
        .returning("*")

      await expect(controller.removeWishlistItem(wishlist.wishlist_id, item.item_id)).rejects.toThrow()
    })
  })

  describe("updateWishlistItem", () => {
    it("should update item quantity", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 5,
          priority: 3,
        })
        .returning("*")

      const result = await controller.updateWishlistItem(wishlist.wishlist_id, item.item_id, {
        desired_quantity: 10,
      })

      expect(result.desired_quantity).toBe(10)
    })

    it("should update item priority", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
        })
        .returning("*")

      const result = await controller.updateWishlistItem(wishlist.wishlist_id, item.item_id, {
        priority: 5,
      })

      expect(result.priority).toBe(5)
    })

    it("should update acquisition status", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
          is_acquired: false,
          acquired_quantity: 0,
        })
        .returning("*")

      const result = await controller.updateWishlistItem(wishlist.wishlist_id, item.item_id, {
        is_acquired: true,
        acquired_quantity: 1,
      })

      expect(result.is_acquired).toBe(true)
      expect(result.acquired_quantity).toBe(1)
    })

    it("should throw validation error for invalid quantity", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
        })
        .returning("*")

      await expect(
        controller.updateWishlistItem(wishlist.wishlist_id, item.item_id, {
          desired_quantity: 0,
        }),
      ).rejects.toThrow()
    })

    it("should deny update for non-owner", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Other User Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          priority: 3,
        })
        .returning("*")

      await expect(
        controller.updateWishlistItem(wishlist.wishlist_id, item.item_id, {
          priority: 5,
        }),
      ).rejects.toThrow()
    })
  })

  describe("generateShoppingList", () => {
    it("should generate shopping list for craftable items", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      // Get a blueprint with ingredients
      const blueprint = await knex("blueprints").first()
      const gameItem = await knex("game_items").where("id", blueprint.output_game_item_id).first()

      // Add wishlist item with blueprint
      await knex("wishlist_items").insert({
        wishlist_id: wishlist.wishlist_id,
        game_item_id: gameItem.id,
        desired_quantity: 2,
        blueprint_id: blueprint.blueprint_id,
        priority: 3,
        is_acquired: false,
      })

      const result = await controller.generateShoppingList(wishlist.wishlist_id)

      expect(result.wishlist_id).toBe(wishlist.wishlist_id)
      expect(result.wishlist_name).toBe("Test Wishlist")
      expect(result.materials_needed).toBeDefined()
      expect(Array.isArray(result.materials_needed)).toBe(true)
    })

    it("should return empty materials for non-craftable items", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      const gameItem = await knex("game_items").first()

      // Add wishlist item without blueprint
      await knex("wishlist_items").insert({
        wishlist_id: wishlist.wishlist_id,
        game_item_id: gameItem.id,
        desired_quantity: 1,
        priority: 3,
        is_acquired: false,
      })

      const result = await controller.generateShoppingList(wishlist.wishlist_id)

      expect(result.materials_needed).toHaveLength(0)
    })

    it("should aggregate materials from multiple items", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: mockUser.user_id,
          wishlist_name: "Test Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      // Get a blueprint
      const blueprint = await knex("blueprints").first()
      const gameItem = await knex("game_items").where("id", blueprint.output_game_item_id).first()

      // Add multiple items with same blueprint
      await knex("wishlist_items").insert([
        {
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 1,
          blueprint_id: blueprint.blueprint_id,
          priority: 3,
          is_acquired: false,
        },
        {
          wishlist_id: wishlist.wishlist_id,
          game_item_id: gameItem.id,
          desired_quantity: 2,
          blueprint_id: blueprint.blueprint_id,
          priority: 3,
          is_acquired: false,
        },
      ])

      const result = await controller.generateShoppingList(wishlist.wishlist_id)

      // Materials should be aggregated
      expect(result.materials_needed.length).toBeGreaterThan(0)
    })

    it("should deny access for non-owner", async () => {
      const [wishlist] = await knex("user_wishlists")
        .insert({
          user_id: "other-user-id",
          wishlist_name: "Other User Wishlist",
          is_public: false,
          is_collaborative: false,
        })
        .returning("*")

      await expect(controller.generateShoppingList(wishlist.wishlist_id)).rejects.toThrow()
    })
  })
})
