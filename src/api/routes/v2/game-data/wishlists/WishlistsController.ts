/**
 * Wishlists V2 Controller
 *
 * TSOA controller for wishlist endpoints in the Game Data system.
 * Handles wishlist creation, item management, and shopping list generation.
 *
 * Requirements: 32.1-32.6, 46.1-46.10, 53.1-53.10
 */

import { Controller, Get, Post, Put, Delete, Route, Tags, Query, Path, Body, Security, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  CreateWishlistRequest,
  UpdateWishlistRequest,
  AddWishlistItemRequest,
  UpdateWishlistItemRequest,
  ListWishlistsResponse,
  GetWishlistResponse,
  ShoppingListResponse,
  Wishlist,
  WishlistItemWithDetails,
} from "./wishlists.types.js"
import logger from "../../../../../logger/logger.js"

@Route("game-data/wishlists")
@Tags("Game Data - Wishlists")
export class WishlistsController extends BaseController {
  /**
   * Get user's wishlists
   *
   * Returns all wishlists owned by the authenticated user with item counts
   * and progress statistics.
   *
   * Requirements:
   * - 32.1: List user wishlists
   * - 32.2: Display item counts
   * - 32.3: Display progress statistics
   * - 46.3: Display acquisition progress
   *
   * @summary Get user wishlists
   * @returns List of user wishlists with statistics
   */
  @Get()
  @Security("loggedin")
  public async getWishlists(
    @Request() request: ExpressRequest,
  ): Promise<ListWishlistsResponse> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    logger.info("Fetching user wishlists", { user_id })

    try {
      const wishlists = await knex("wishlists as w")
        .leftJoin("wishlist_items as wi", "w.wishlist_id", "wi.wishlist_id")
        .where(function () {
          this.where("w.user_id", user_id)
            .orWhere(function () {
              // Include org lists where user is a member
              this.whereNotNull("w.organization_id")
                .where("w.is_collaborative", true)
                .whereIn("w.organization_id",
                  knex("contractor_members").where("user_id", user_id).select("contractor_id")
                )
            })
        })
        .groupBy("w.wishlist_id")
        .select(
          "w.wishlist_id",
          "w.user_id",
          "w.wishlist_name",
          "w.wishlist_description",
          "w.is_public",
          "w.share_token",
          "w.organization_id",
          "w.is_collaborative",
          "w.created_at",
          "w.updated_at",
          knex.raw("COUNT(wi.item_id)::integer as item_count"),
          knex.raw("SUM(CASE WHEN wi.is_acquired THEN 1 ELSE 0 END)::integer as completed_items"),
        )
        .orderBy("w.updated_at", "desc")

      const wishlistsWithProgress = wishlists.map((w: any) => ({
        wishlist_id: w.wishlist_id,
        user_id: w.user_id,
        wishlist_name: w.wishlist_name,
        wishlist_description: w.wishlist_description || undefined,
        is_public: w.is_public,
        share_token: w.share_token || undefined,
        organization_id: w.organization_id || undefined,
        is_collaborative: w.is_collaborative,
        created_at: w.created_at.toISOString(),
        updated_at: w.updated_at.toISOString(),
        item_count: w.item_count || 0,
        completed_items: w.completed_items || 0,
        progress_percentage:
          w.item_count > 0 ? Math.round(((w.completed_items || 0) / w.item_count) * 100) : 0,
      }))

      logger.info("Wishlists fetched successfully", {
        user_id,
        count: wishlistsWithProgress.length,
      })

      return { wishlists: wishlistsWithProgress }
    } catch (error) {
      logger.error("Failed to fetch wishlists", {
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Create a new wishlist
   *
   * Creates a new wishlist for the authenticated user with specified settings.
   * Supports public/private visibility and organization collaboration.
   *
   * Requirements:
   * - 32.1: Create wishlist
   * - 32.2: Support custom names and descriptions
   * - 32.4: Support public/private visibility
   * - 32.5: Support organization wishlists
   *
   * @summary Create wishlist
   * @param request Wishlist creation data
   * @returns Created wishlist
   */
  @Post()
  @Security("loggedin")
  public async createWishlist(
    @Body() body: CreateWishlistRequest,
    @Request() request: ExpressRequest,
  ): Promise<Wishlist> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    if (!body.wishlist_name || body.wishlist_name.trim().length === 0) {
      this.throwValidationError("wishlist_name is required", [
        { field: "wishlist_name", message: "Wishlist name is required" },
      ])
    }

    logger.info("Creating wishlist", { user_id, wishlist_name: body.wishlist_name })

    try {
      // Generate share token if public
      const share_token = body.is_public ? this.generateShareToken() : null

      const [wishlist] = await knex("wishlists")
        .insert({
          user_id,
          wishlist_name: body.wishlist_name.trim(),
          wishlist_description: body.wishlist_description?.trim() || null,
          is_public: body.is_public,
          share_token,
          organization_id: body.organization_id || null,
          is_collaborative: body.is_collaborative,
        })
        .returning("*")

      logger.info("Wishlist created successfully", {
        wishlist_id: wishlist.wishlist_id,
        user_id,
      })

      return {
        wishlist_id: wishlist.wishlist_id,
        user_id: wishlist.user_id,
        wishlist_name: wishlist.wishlist_name,
        wishlist_description: wishlist.wishlist_description || undefined,
        is_public: wishlist.is_public,
        share_token: wishlist.share_token || undefined,
        organization_id: wishlist.organization_id || undefined,
        is_collaborative: wishlist.is_collaborative,
        created_at: wishlist.created_at.toISOString(),
        updated_at: wishlist.updated_at.toISOString(),
      }
    } catch (error) {
      logger.error("Failed to create wishlist", {
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Get wishlist detail with items
   *
   * Returns complete wishlist information including all items with enriched
   * game data, crafting availability, and progress statistics.
   *
   * Requirements:
   * - 32.3: Get wishlist detail
   * - 53.1: Display all wishlist items
   * - 53.2: Display item details (name, icon, type)
   * - 53.3: Display crafting availability
   * - 53.4: Display progress statistics
   *
   * @summary Get wishlist detail
   * @param wishlist_id Wishlist UUID
   * @param share_token Optional share token for public wishlists
   * @returns Wishlist with items and statistics
   */
  @Get("{wishlist_id}")
  public async getWishlist(
    @Path() wishlist_id: string,
    @Query() share_token?: string,
    @Request() request?: ExpressRequest,
  ): Promise<GetWishlistResponse> {
    if (request) this.request = request
    const knex = getKnex()

    if (!wishlist_id) {
      this.throwValidationError("wishlist_id is required", [
        { field: "wishlist_id", message: "Wishlist ID is required" },
      ])
    }

    logger.info("Fetching wishlist detail", { wishlist_id, share_token })

    try {
      // Get wishlist
      const wishlist = await knex("wishlists").where("wishlist_id", wishlist_id).first()

      if (!wishlist) {
        this.throwNotFound("Wishlist", wishlist_id)
      }

      // Check access permissions
      const user_id = this.tryGetUserId()
      const isOwner = user_id && wishlist.user_id === user_id
      const hasShareToken = wishlist.is_public && share_token === wishlist.share_token

      if (!isOwner && !hasShareToken && !wishlist.is_public) {
        this.throwForbidden("You do not have permission to view this wishlist")
      }

      // Get wishlist items with game data
      const items = await knex("wishlist_items as wi")
        .join("game_items as gi", "wi.game_item_id", "gi.id")
        .leftJoin("blueprints as b", "wi.blueprint_id", "b.blueprint_id")
        .where("wi.wishlist_id", wishlist_id)
        .select(
          "wi.item_id",
          "wi.wishlist_id",
          "wi.game_item_id",
          "wi.desired_quantity",
          "wi.desired_quality_tier",
          "wi.blueprint_id",
          "wi.priority",
          "wi.notes",
          "wi.is_acquired",
          "wi.acquired_quantity",
          "wi.created_at",
          "wi.updated_at",
          "gi.name as game_item_name",
          "gi.image_url as game_item_icon",
          "gi.type as game_item_type",
          "b.blueprint_name",
        )
        .orderBy("wi.priority", "desc")
        .orderBy("wi.created_at", "asc")

      const itemsWithDetails: WishlistItemWithDetails[] = items.map((item: any) => ({
        item_id: item.item_id,
        wishlist_id: item.wishlist_id,
        game_item_id: item.game_item_id,
        desired_quantity: item.desired_quantity,
        desired_quality_tier: item.desired_quality_tier || undefined,
        blueprint_id: item.blueprint_id || undefined,
        acquisition_mode: item.acquisition_mode || "buy",
        priority: item.priority,
        notes: item.notes || undefined,
        is_acquired: item.is_acquired,
        acquired_quantity: item.acquired_quantity,
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
        game_item_name: item.game_item_name,
        game_item_icon: item.game_item_icon || undefined,
        game_item_type: item.game_item_type || "unknown",
        blueprint_name: item.blueprint_name || undefined,
        estimated_cost: undefined, // TODO: Implement market price lookup
        crafting_available: !!item.blueprint_id,
      }))

      // Calculate statistics
      const total_items = items.length
      const completed_items = items.filter((i: any) => i.is_acquired).length
      const progress_percentage =
        total_items > 0 ? Math.round((completed_items / total_items) * 100) : 0

      logger.info("Wishlist detail fetched successfully", {
        wishlist_id,
        item_count: total_items,
      })

      return {
        wishlist: {
          wishlist_id: wishlist.wishlist_id,
          user_id: wishlist.user_id,
          wishlist_name: wishlist.wishlist_name,
          wishlist_description: wishlist.wishlist_description || undefined,
          is_public: wishlist.is_public,
          share_token: wishlist.share_token || undefined,
          organization_id: wishlist.organization_id || undefined,
          is_collaborative: wishlist.is_collaborative,
          created_at: wishlist.created_at.toISOString(),
          updated_at: wishlist.updated_at.toISOString(),
        },
        items: itemsWithDetails,
        statistics: {
          total_items,
          completed_items,
          progress_percentage,
          total_estimated_cost: 0, // TODO: Implement cost calculation
        },
      }
    } catch (error) {
      logger.error("Failed to fetch wishlist detail", {
        wishlist_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Update wishlist
   *
   * Updates wishlist metadata including name, description, and visibility settings.
   * Only the wishlist owner can update it.
   *
   * Requirements:
   * - 32.4: Update wishlist
   * - 32.5: Update visibility settings
   *
   * @summary Update wishlist
   * @param wishlist_id Wishlist UUID
   * @param request Update data
   * @returns Updated wishlist
   */
  @Put("{wishlist_id}")
  @Security("loggedin")
  public async updateWishlist(
    @Path() wishlist_id: string,
    @Body() body: UpdateWishlistRequest,
    @Request() request: ExpressRequest,
  ): Promise<Wishlist> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    if (!wishlist_id) {
      this.throwValidationError("wishlist_id is required", [
        { field: "wishlist_id", message: "Wishlist ID is required" },
      ])
    }

    logger.info("Updating wishlist", { wishlist_id, user_id })

    try {
      // Verify wishlist exists and user owns it
      const wishlist = await knex("wishlists").where("wishlist_id", wishlist_id).first()

      if (!wishlist) {
        this.throwNotFound("Wishlist", wishlist_id)
      }

      if (wishlist.user_id !== user_id) {
        this.throwForbidden("You do not have permission to update this wishlist")
      }

      // Build update object
      const updates: any = {
        updated_at: knex.fn.now(),
      }

      if (body.wishlist_name !== undefined) {
        if (body.wishlist_name.trim().length === 0) {
          this.throwValidationError("wishlist_name cannot be empty", [
            { field: "wishlist_name", message: "Wishlist name cannot be empty" },
          ])
        }
        updates.wishlist_name = body.wishlist_name.trim()
      }

      if (body.wishlist_description !== undefined) {
        updates.wishlist_description = body.wishlist_description?.trim() || null
      }

      if (body.is_public !== undefined) {
        updates.is_public = body.is_public
        // Generate share token if making public and doesn't have one
        if (body.is_public && !wishlist.share_token) {
          updates.share_token = this.generateShareToken()
        }
      }

      if (body.is_collaborative !== undefined) {
        updates.is_collaborative = body.is_collaborative
      }

      // Update wishlist
      const [updated] = await knex("wishlists")
        .where("wishlist_id", wishlist_id)
        .update(updates)
        .returning("*")

      logger.info("Wishlist updated successfully", { wishlist_id, user_id })

      return {
        wishlist_id: updated.wishlist_id,
        user_id: updated.user_id,
        wishlist_name: updated.wishlist_name,
        wishlist_description: updated.wishlist_description || undefined,
        is_public: updated.is_public,
        share_token: updated.share_token || undefined,
        organization_id: updated.organization_id || undefined,
        is_collaborative: updated.is_collaborative,
        created_at: updated.created_at.toISOString(),
        updated_at: updated.updated_at.toISOString(),
      }
    } catch (error) {
      logger.error("Failed to update wishlist", {
        wishlist_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Delete wishlist
   *
   * Permanently deletes a wishlist and all its items.
   * Only the wishlist owner can delete it.
   *
   * Requirements:
   * - 32.6: Delete wishlist
   *
   * @summary Delete wishlist
   * @param wishlist_id Wishlist UUID
   * @returns Success response
   */
  @Delete("{wishlist_id}")
  @Security("loggedin")
  public async deleteWishlist(
    @Path() wishlist_id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ success: boolean }> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    if (!wishlist_id) {
      this.throwValidationError("wishlist_id is required", [
        { field: "wishlist_id", message: "Wishlist ID is required" },
      ])
    }

    logger.info("Deleting wishlist", { wishlist_id, user_id })

    try {
      // Verify wishlist exists and user owns it
      const wishlist = await knex("wishlists").where("wishlist_id", wishlist_id).first()

      if (!wishlist) {
        this.throwNotFound("Wishlist", wishlist_id)
      }

      if (wishlist.user_id !== user_id) {
        this.throwForbidden("You do not have permission to delete this wishlist")
      }

      // Delete wishlist (cascade will delete items)
      await knex("wishlists").where("wishlist_id", wishlist_id).delete()

      logger.info("Wishlist deleted successfully", { wishlist_id, user_id })

      return { success: true }
    } catch (error) {
      logger.error("Failed to delete wishlist", {
        wishlist_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Add item to wishlist
   *
   * Adds a new item to the wishlist with specified quantity, quality, and priority.
   * Supports both craftable and non-craftable items.
   *
   * Requirements:
   * - 46.7: Add item to wishlist
   * - 53.5: Support priority levels
   * - 53.6: Support quality tier specification
   * - 53.7: Support notes
   *
   * @summary Add item to wishlist
   * @param wishlist_id Wishlist UUID
   * @param request Item data
   * @returns Created wishlist item
   */
  @Post("{wishlist_id}/items")
  @Security("loggedin")
  public async addWishlistItem(
    @Path() wishlist_id: string,
    @Body() body: AddWishlistItemRequest,
    @Request() request: ExpressRequest,
  ): Promise<WishlistItemWithDetails> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    if (!wishlist_id) {
      this.throwValidationError("wishlist_id is required", [
        { field: "wishlist_id", message: "Wishlist ID is required" },
      ])
    }

    if (!body.game_item_id) {
      this.throwValidationError("game_item_id is required", [
        { field: "game_item_id", message: "Game item ID is required" },
      ])
    }

    if (body.desired_quantity < 1) {
      this.throwValidationError("desired_quantity must be at least 1", [
        { field: "desired_quantity", message: "Desired quantity must be at least 1" },
      ])
    }

    if (body.desired_quality_tier && (body.desired_quality_tier < 1 || body.desired_quality_tier > 5)) {
      this.throwValidationError("desired_quality_tier must be between 1 and 5", [
        { field: "desired_quality_tier", message: "Quality tier must be between 1 and 5" },
      ])
    }

    if (body.priority < 1 || body.priority > 5) {
      this.throwValidationError("priority must be between 1 and 5", [
        { field: "priority", message: "Priority must be between 1 and 5" },
      ])
    }

    logger.info("Adding item to wishlist", { wishlist_id, user_id, game_item_id: body.game_item_id })

    try {
      // Verify wishlist exists and user has access
      const wishlist = await knex("wishlists").where("wishlist_id", wishlist_id).first()

      if (!wishlist) {
        this.throwNotFound("Wishlist", wishlist_id)
      }

      if (wishlist.user_id !== user_id && !wishlist.is_collaborative) {
        this.throwForbidden("You do not have permission to add items to this wishlist")
      }

      // For org collaborative lists, verify membership
      if (wishlist.user_id !== user_id && wishlist.is_collaborative && wishlist.organization_id) {
        const isMember = await knex("contractor_members")
          .where({ user_id, contractor_id: wishlist.organization_id })
          .first()
        if (!isMember) {
          this.throwForbidden("You must be an org member to modify this list")
        }
      }

      // Verify game item exists
      const gameItem = await knex("game_items").where("id", body.game_item_id).first()

      if (!gameItem) {
        this.throwNotFound("Game item", body.game_item_id)
      }

      // Verify blueprint exists if provided
      let blueprintName: string | undefined
      if (body.blueprint_id) {
        const blueprint = await knex("blueprints").where("blueprint_id", body.blueprint_id).first()

        if (!blueprint) {
          this.throwNotFound("Blueprint", body.blueprint_id)
        }

        blueprintName = blueprint.blueprint_name
      }

      // Insert wishlist item
      const [item] = await knex("wishlist_items")
        .insert({
          wishlist_id,
          game_item_id: body.game_item_id,
          desired_quantity: body.desired_quantity,
          desired_quality_tier: body.desired_quality_tier || null,
          blueprint_id: body.blueprint_id || null,
          acquisition_mode: body.acquisition_mode || "buy",
          priority: body.priority,
          notes: body.notes?.trim() || null,
          is_acquired: false,
          acquired_quantity: 0,
        })
        .returning("*")

      // Update wishlist timestamp
      await knex("wishlists").where("wishlist_id", wishlist_id).update({ updated_at: knex.fn.now() })

      logger.info("Item added to wishlist successfully", {
        item_id: item.item_id,
        wishlist_id,
        user_id,
      })

      return {
        item_id: item.item_id,
        wishlist_id: item.wishlist_id,
        game_item_id: item.game_item_id,
        desired_quantity: item.desired_quantity,
        desired_quality_tier: item.desired_quality_tier || undefined,
        blueprint_id: item.blueprint_id || undefined,
        acquisition_mode: item.acquisition_mode || "buy",
        priority: item.priority,
        notes: item.notes || undefined,
        is_acquired: item.is_acquired,
        acquired_quantity: item.acquired_quantity,
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
        game_item_name: gameItem.name,
        game_item_icon: gameItem.image_url || undefined,
        game_item_type: gameItem.type || "unknown",
        blueprint_name: blueprintName,
        estimated_cost: undefined, // TODO: Implement market price lookup
        crafting_available: !!body.blueprint_id,
      }
    } catch (error) {
      logger.error("Failed to add item to wishlist", {
        wishlist_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Remove item from wishlist
   *
   * Permanently removes an item from the wishlist.
   *
   * Requirements:
   * - 46.8: Remove item from wishlist
   *
   * @summary Remove item from wishlist
   * @param wishlist_id Wishlist UUID
   * @param item_id Item UUID
   * @returns Success response
   */
  @Delete("{wishlist_id}/items/{item_id}")
  @Security("loggedin")
  public async removeWishlistItem(
    @Path() wishlist_id: string,
    @Path() item_id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ success: boolean }> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    if (!wishlist_id) {
      this.throwValidationError("wishlist_id is required", [
        { field: "wishlist_id", message: "Wishlist ID is required" },
      ])
    }

    if (!item_id) {
      this.throwValidationError("item_id is required", [
        { field: "item_id", message: "Item ID is required" },
      ])
    }

    logger.info("Removing item from wishlist", { wishlist_id, item_id, user_id })

    try {
      // Verify wishlist exists and user has access
      const wishlist = await knex("wishlists").where("wishlist_id", wishlist_id).first()

      if (!wishlist) {
        this.throwNotFound("Wishlist", wishlist_id)
      }

      if (wishlist.user_id !== user_id && !wishlist.is_collaborative) {
        this.throwForbidden("You do not have permission to remove items from this wishlist")
      }

      // Verify item exists and belongs to this wishlist
      const item = await knex("wishlist_items").where("item_id", item_id).first()

      if (!item) {
        this.throwNotFound("Wishlist item", item_id)
      }

      if (item.wishlist_id !== wishlist_id) {
        this.throwValidationError("Item does not belong to this wishlist", [
          { field: "item_id", message: "Item does not belong to this wishlist" },
        ])
      }

      // Delete item
      await knex("wishlist_items").where("item_id", item_id).delete()

      // Update wishlist timestamp
      await knex("wishlists").where("wishlist_id", wishlist_id).update({ updated_at: knex.fn.now() })

      logger.info("Item removed from wishlist successfully", { wishlist_id, item_id, user_id })

      return { success: true }
    } catch (error) {
      logger.error("Failed to remove item from wishlist", {
        wishlist_id,
        item_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Update wishlist item
   *
   * Updates item properties including quantity, quality tier, priority, notes, and acquisition status.
   *
   * Requirements:
   * - 46.9: Update item priority/notes
   * - 53.8: Update acquisition status
   * - 53.9: Support reordering by priority
   *
   * @summary Update wishlist item
   * @param wishlist_id Wishlist UUID
   * @param item_id Item UUID
   * @param request Update data
   * @returns Updated wishlist item
   */
  @Put("{wishlist_id}/items/{item_id}")
  @Security("loggedin")
  public async updateWishlistItem(
    @Path() wishlist_id: string,
    @Path() item_id: string,
    @Body() body: UpdateWishlistItemRequest,
    @Request() request: ExpressRequest,
  ): Promise<WishlistItemWithDetails> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    if (!wishlist_id) {
      this.throwValidationError("wishlist_id is required", [
        { field: "wishlist_id", message: "Wishlist ID is required" },
      ])
    }

    if (!item_id) {
      this.throwValidationError("item_id is required", [
        { field: "item_id", message: "Item ID is required" },
      ])
    }

    logger.info("Updating wishlist item", { wishlist_id, item_id, user_id })

    try {
      // Verify wishlist exists and user has access
      const wishlist = await knex("wishlists").where("wishlist_id", wishlist_id).first()

      if (!wishlist) {
        this.throwNotFound("Wishlist", wishlist_id)
      }

      if (wishlist.user_id !== user_id && !wishlist.is_collaborative) {
        this.throwForbidden("You do not have permission to update items in this wishlist")
      }

      // Verify item exists and belongs to this wishlist
      const item = await knex("wishlist_items").where("item_id", item_id).first()

      if (!item) {
        this.throwNotFound("Wishlist item", item_id)
      }

      if (item.wishlist_id !== wishlist_id) {
        this.throwValidationError("Item does not belong to this wishlist", [
          { field: "item_id", message: "Item does not belong to this wishlist" },
        ])
      }

      // Build update object
      const updates: any = {
        updated_at: knex.fn.now(),
      }

      if (body.desired_quantity !== undefined) {
        if (body.desired_quantity < 1) {
          this.throwValidationError("desired_quantity must be at least 1", [
            { field: "desired_quantity", message: "Desired quantity must be at least 1" },
          ])
        }
        updates.desired_quantity = body.desired_quantity
      }

      if (body.desired_quality_tier !== undefined) {
        if (body.desired_quality_tier < 1 || body.desired_quality_tier > 5) {
          this.throwValidationError("desired_quality_tier must be between 1 and 5", [
            { field: "desired_quality_tier", message: "Quality tier must be between 1 and 5" },
          ])
        }
        updates.desired_quality_tier = body.desired_quality_tier
      }

      if (body.priority !== undefined) {
        if (body.priority < 1 || body.priority > 5) {
          this.throwValidationError("priority must be between 1 and 5", [
            { field: "priority", message: "Priority must be between 1 and 5" },
          ])
        }
        updates.priority = body.priority
      }

      if (body.notes !== undefined) {
        updates.notes = body.notes?.trim() || null
      }

      if (body.is_acquired !== undefined) {
        updates.is_acquired = body.is_acquired
      }

      if (body.acquired_quantity !== undefined) {
        if (body.acquired_quantity < 0) {
          this.throwValidationError("acquired_quantity cannot be negative", [
            { field: "acquired_quantity", message: "Acquired quantity cannot be negative" },
          ])
        }
        updates.acquired_quantity = body.acquired_quantity
      }

      if (body.acquisition_mode !== undefined) {
        updates.acquisition_mode = body.acquisition_mode
      }

      // Update item
      const [updated] = await knex("wishlist_items")
        .where("item_id", item_id)
        .update(updates)
        .returning("*")

      // Update wishlist timestamp
      await knex("wishlists").where("wishlist_id", wishlist_id).update({ updated_at: knex.fn.now() })

      // Get enriched data
      const enriched = await knex("wishlist_items as wi")
        .join("game_items as gi", "wi.game_item_id", "gi.id")
        .leftJoin("blueprints as b", "wi.blueprint_id", "b.blueprint_id")
        .where("wi.item_id", item_id)
        .select(
          "wi.*",
          "gi.name as game_item_name",
          "gi.image_url as game_item_icon",
          "gi.type as game_item_type",
          "b.blueprint_name",
        )
        .first()

      logger.info("Wishlist item updated successfully", { wishlist_id, item_id, user_id })

      return {
        item_id: enriched.item_id,
        wishlist_id: enriched.wishlist_id,
        game_item_id: enriched.game_item_id,
        desired_quantity: enriched.desired_quantity,
        desired_quality_tier: enriched.desired_quality_tier || undefined,
        blueprint_id: enriched.blueprint_id || undefined,
        priority: enriched.priority,
        notes: enriched.notes || undefined,
        is_acquired: enriched.is_acquired,
        acquired_quantity: enriched.acquired_quantity,
        created_at: enriched.created_at.toISOString(),
        updated_at: enriched.updated_at.toISOString(),
        game_item_name: enriched.game_item_name,
        game_item_icon: enriched.game_item_icon || undefined,
        game_item_type: enriched.game_item_type || "unknown",
        blueprint_name: enriched.blueprint_name || undefined,
        estimated_cost: undefined, // TODO: Implement market price lookup
        crafting_available: !!enriched.blueprint_id,
      }
    } catch (error) {
      logger.error("Failed to update wishlist item", {
        wishlist_id,
        item_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Generate shopping list from wishlist
   *
   * Analyzes all wishlist items and generates a comprehensive shopping list
   * showing required materials for crafting, quantities needed, and acquisition methods.
   *
   * Requirements:
   * - 46.10: Generate shopping list
   * - 53.10: Display material requirements
   *
   * @summary Generate shopping list
   * @param wishlist_id Wishlist UUID
   * @returns Shopping list with material requirements
   */
  @Get("{wishlist_id}/shopping-list")
  @Security("loggedin")
  public async generateShoppingList(
    @Path() wishlist_id: string,
    @Request() request: ExpressRequest,
  ): Promise<ShoppingListResponse> {
    this.request = request
    const knex = getKnex()
    const user_id = this.getUserId()

    if (!wishlist_id) {
      this.throwValidationError("wishlist_id is required", [
        { field: "wishlist_id", message: "Wishlist ID is required" },
      ])
    }

    logger.info("Generating shopping list", { wishlist_id, user_id })

    try {
      // Verify wishlist exists and user has access
      const wishlist = await knex("wishlists").where("wishlist_id", wishlist_id).first()

      if (!wishlist) {
        this.throwNotFound("Wishlist", wishlist_id)
      }

      if (wishlist.user_id !== user_id) {
        this.throwForbidden("You do not have permission to view this wishlist")
      }

      // Get all wishlist items with blueprints
      const items = await knex("wishlist_items as wi")
        .join("game_items as gi", "wi.game_item_id", "gi.id")
        .leftJoin("blueprints as b", "wi.blueprint_id", "b.blueprint_id")
        .where("wi.wishlist_id", wishlist_id)
        .where("wi.is_acquired", false)
        .select(
          "wi.item_id",
          "wi.game_item_id",
          "wi.desired_quantity",
          "wi.blueprint_id",
          "gi.name as game_item_name",
          "b.blueprint_name",
        )

      // Aggregate materials needed
      const materialsMap = new Map<string, any>()

      for (const item of items) {
        if (item.blueprint_id) {
          // Get ingredients for this blueprint
          const ingredients = await knex("blueprint_ingredients as bi")
            .join("game_items as gi", "bi.ingredient_game_item_id", "gi.id")
            .where("bi.blueprint_id", item.blueprint_id)
            .select(
              "bi.ingredient_game_item_id as game_item_id",
              "bi.quantity_required",
              "bi.min_quality_tier",
              "gi.name as game_item_name",
              "gi.image_url as game_item_icon",
            )

          for (const ingredient of ingredients) {
            const key = ingredient.game_item_id
            const totalNeeded = ingredient.quantity_required * item.desired_quantity

            if (materialsMap.has(key)) {
              const existing = materialsMap.get(key)
              existing.total_quantity_needed += totalNeeded
              existing.used_by_items.push({
                wishlist_item_id: item.item_id,
                item_name: item.game_item_name,
                quantity_for_this_item: totalNeeded,
              })
            } else {
              materialsMap.set(key, {
                game_item_id: ingredient.game_item_id,
                game_item_name: ingredient.game_item_name,
                game_item_icon: ingredient.game_item_icon || undefined,
                total_quantity_needed: totalNeeded,
                desired_quality_tier: ingredient.min_quality_tier || undefined,
                user_inventory_quantity: 0, // TODO: Implement inventory lookup
                quantity_to_acquire: totalNeeded,
                estimated_unit_price: undefined, // TODO: Implement market price lookup
                estimated_total_cost: undefined,
                acquisition_methods: ["purchase", "mining", "salvage"], // TODO: Get from resources table
                used_by_items: [
                  {
                    wishlist_item_id: item.item_id,
                    item_name: item.game_item_name,
                    quantity_for_this_item: totalNeeded,
                  },
                ],
              })
            }
          }
        }
      }

      const materials_needed = Array.from(materialsMap.values())

      // Calculate statistics
      const materials_fully_stocked = materials_needed.filter(
        (m) => m.user_inventory_quantity >= m.total_quantity_needed,
      ).length
      const materials_partially_stocked = materials_needed.filter(
        (m) => m.user_inventory_quantity > 0 && m.user_inventory_quantity < m.total_quantity_needed,
      ).length
      const materials_not_stocked = materials_needed.filter((m) => m.user_inventory_quantity === 0).length

      logger.info("Shopping list generated successfully", {
        wishlist_id,
        material_count: materials_needed.length,
      })

      return {
        wishlist_id: wishlist.wishlist_id,
        wishlist_name: wishlist.wishlist_name,
        materials_needed,
        total_estimated_cost: 0, // TODO: Sum up estimated costs
        materials_fully_stocked,
        materials_partially_stocked,
        materials_not_stocked,
      }
    } catch (error) {
      logger.error("Failed to generate shopping list", {
        wishlist_id,
        user_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Generate a random share token for public wishlists
   */
  private generateShareToken(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    let token = ""
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return token
  }
}
