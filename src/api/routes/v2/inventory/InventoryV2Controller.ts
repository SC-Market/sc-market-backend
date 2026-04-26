/**
 * Inventory V2 Controller
 *
 * Personal inventory management — lots that may or may not be linked to listings.
 * Uses the decoupled listing_item_lots table with owner_id, game_item_id, listing_id.
 */

import { Post, Get, Put, Delete, Route, Tags, Body, Request, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"
import { auditService } from "../../../../services/audit/audit.service.js"

interface CreateInventoryLotRequest {
  game_item_id?: string | null
  variant_id?: string | null
  quantity: number
  location_id?: string | null
  notes?: string | null
}

interface InventoryLotDetail {
  lot_id: string
  owner_id: string
  game_item_id: string | null
  game_item_name: string | null
  variant_id: string | null
  variant_display_name: string | null
  listing_id: string | null
  listing_title: string | null
  quantity_total: number
  location_id: string | null
  location_name: string | null
  listed: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

interface InventoryResponse {
  lots: InventoryLotDetail[]
  total: number
  page: number
  page_size: number
}

interface LinkToListingRequest {
  listing_id: string
}

@Route("inventory")
@Tags("Inventory V2")
@Security("loggedin")
export class InventoryV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * List all inventory lots for the current user
   */
  @Get()
  public async getInventory(
    @Request() request: ExpressRequest,
    @Query() game_item_id?: string,
    @Query() listing_id?: string,
    @Query() listed?: boolean,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<InventoryResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()
    const p = Math.max(1, page || 1)
    const ps = Math.min(100, Math.max(1, page_size || 50))

    let query = knex("listing_item_lots as lil")
      .where("lil.owner_id", userId)

    if (game_item_id) query = query.where("lil.game_item_id", game_item_id)
    if (listing_id) query = query.where("lil.listing_id", listing_id)
    if (listed !== undefined) query = query.where("lil.listed", listed)

    const [{ count }] = await query.clone().clearSelect().clearOrder().count("* as count")
    const total = parseInt(String(count), 10)

    const lots = await query
      .leftJoin("game_items as gi", "lil.game_item_id", "gi.id")
      .leftJoin("item_variants as iv", "lil.variant_id", "iv.variant_id")
      .leftJoin("listings as l", "lil.listing_id", "l.listing_id")
      .leftJoin("locations as loc", "lil.location_id", "loc.location_id")
      .select(
        "lil.*",
        "gi.name as game_item_name",
        "iv.display_name as variant_display_name",
        "l.title as listing_title",
        "loc.name as location_name",
      )
      .orderBy("lil.created_at", "desc")
      .limit(ps)
      .offset((p - 1) * ps)

    return {
      lots: lots.map((lot: any) => ({
        lot_id: lot.lot_id,
        owner_id: lot.owner_id,
        game_item_id: lot.game_item_id,
        game_item_name: lot.game_item_name,
        variant_id: lot.variant_id,
        variant_display_name: lot.variant_display_name,
        listing_id: lot.listing_id,
        listing_title: lot.listing_title,
        quantity_total: lot.quantity_total,
        location_id: lot.location_id,
        location_name: lot.location_name,
        listed: lot.listed,
        notes: lot.notes,
        created_at: lot.created_at?.toISOString?.() || lot.created_at,
        updated_at: lot.updated_at?.toISOString?.() || lot.updated_at,
      })),
      total,
      page: p,
      page_size: ps,
    }
  }

  /**
   * Create an unlisted inventory lot (personal inventory)
   */
  @Post()
  public async createInventoryLot(
    @Body() requestBody: CreateInventoryLotRequest,
    @Request() request: ExpressRequest,
  ): Promise<{ lot: InventoryLotDetail }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    if (!requestBody.quantity || requestBody.quantity < 0) {
      throw this.throwValidationError("Invalid quantity", [
        { field: "quantity", message: "Quantity must be >= 0" },
      ])
    }

    const [lot] = await knex("listing_item_lots").insert({
      owner_id: userId,
      game_item_id: requestBody.game_item_id || null,
      variant_id: requestBody.variant_id || null,
      listing_id: null,
      item_id: null,
      quantity_total: requestBody.quantity,
      location_id: requestBody.location_id || null,
      listed: false,
      notes: requestBody.notes || null,
    }).returning("*")

    auditService.log({ entity_type: "inventory_lot", entity_id: lot.lot_id, action: "created", actor_id: userId })

    // Fetch enriched detail
    const detail = await this.fetchLotDetail(knex, lot.lot_id)
    return { lot: detail }
  }

  /**
   * Link a lot to a listing (makes it available for sale)
   */
  @Post("{lotId}/list")
  public async linkToListing(
    @Path() lotId: string,
    @Body() requestBody: LinkToListingRequest,
    @Request() request: ExpressRequest,
  ): Promise<{ lot: InventoryLotDetail }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const lot = await knex("listing_item_lots").where({ lot_id: lotId, owner_id: userId }).first()
    if (!lot) throw this.throwNotFound("Inventory lot", lotId)

    const listing = await knex("listings").where({ listing_id: requestBody.listing_id }).first()
    if (!listing) throw this.throwNotFound("Listing", requestBody.listing_id)
    if (listing.seller_id !== userId) throw this.throwForbidden("You don't own this listing")

    // Get the listing_item to set item_id
    const listingItem = await knex("listing_items").where({ listing_id: requestBody.listing_id }).first()

    await knex("listing_item_lots").where({ lot_id: lotId }).update({
      listing_id: requestBody.listing_id,
      item_id: listingItem?.item_id || null,
      game_item_id: listingItem?.game_item_id || lot.game_item_id,
      listed: true,
      updated_at: new Date(),
    })

    auditService.log({ entity_type: "inventory_lot", entity_id: lotId, action: "linked", actor_id: userId, details: { listing_id: requestBody.listing_id } })

    const detail = await this.fetchLotDetail(knex, lotId)
    return { lot: detail }
  }

  /**
   * Unlink a lot from its listing (returns to personal inventory)
   */
  @Post("{lotId}/unlist")
  public async unlinkFromListing(
    @Path() lotId: string,
    @Request() request: ExpressRequest,
  ): Promise<{ lot: InventoryLotDetail }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const lot = await knex("listing_item_lots").where({ lot_id: lotId, owner_id: userId }).first()
    if (!lot) throw this.throwNotFound("Inventory lot", lotId)

    await knex("listing_item_lots").where({ lot_id: lotId }).update({
      listing_id: null,
      item_id: null,
      listed: false,
      updated_at: new Date(),
    })

    auditService.log({ entity_type: "inventory_lot", entity_id: lotId, action: "unlinked", actor_id: userId })

    const detail = await this.fetchLotDetail(knex, lotId)
    return { lot: detail }
  }

  /**
   * Delete an inventory lot
   */
  @Delete("{lotId}")
  public async deleteInventoryLot(
    @Path() lotId: string,
    @Request() request: ExpressRequest,
  ): Promise<void> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const lot = await knex("listing_item_lots").where({ lot_id: lotId, owner_id: userId }).first()
    if (!lot) throw this.throwNotFound("Inventory lot", lotId)

    await knex("listing_item_lots").where({ lot_id: lotId }).delete()
    auditService.log({ entity_type: "inventory_lot", entity_id: lotId, action: "deleted", actor_id: userId })
  }

  private async fetchLotDetail(knex: any, lotId: string): Promise<InventoryLotDetail> {
    const lot = await knex("listing_item_lots as lil")
      .leftJoin("game_items as gi", "lil.game_item_id", "gi.id")
      .leftJoin("item_variants as iv", "lil.variant_id", "iv.variant_id")
      .leftJoin("listings as l", "lil.listing_id", "l.listing_id")
      .leftJoin("locations as loc", "lil.location_id", "loc.location_id")
      .where("lil.lot_id", lotId)
      .select("lil.*", "gi.name as game_item_name", "iv.display_name as variant_display_name", "l.title as listing_title", "loc.name as location_name")
      .first()

    return {
      lot_id: lot.lot_id,
      owner_id: lot.owner_id,
      game_item_id: lot.game_item_id,
      game_item_name: lot.game_item_name,
      variant_id: lot.variant_id,
      variant_display_name: lot.variant_display_name,
      listing_id: lot.listing_id,
      listing_title: lot.listing_title,
      quantity_total: lot.quantity_total,
      location_id: lot.location_id,
      location_name: lot.location_name,
      listed: lot.listed,
      notes: lot.notes,
      created_at: lot.created_at?.toISOString?.() || lot.created_at,
      updated_at: lot.updated_at?.toISOString?.() || lot.updated_at,
    }
  }
}
