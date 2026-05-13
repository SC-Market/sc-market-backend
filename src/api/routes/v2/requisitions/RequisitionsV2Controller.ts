/**
 * Requisitions V2 Controller
 *
 * Manages supplier requisition orders — orders anchored to game items (not listings).
 * The buyer specifies what they need; the supplier decides which listing to fulfil from.
 *
 * Flow:
 *   1. Buyer POSTs /requisitions  → creates order (kind='requisition') + offer_session + requisition_items
 *   2. Supplier sees the order, creates/accepts via the existing offer negotiation flow
 *   3. Supplier optionally uses offer_requisition_items to propose specific listing-prices
 *   4. On accept: order proceeds through standard status lifecycle (pending → assigned → completed)
 *
 * Routes:
 *   POST   /requisitions              — create requisition order
 *   GET    /requisitions              — list my requisitions (buyer or supplier)
 *   GET    /requisitions/:id          — get requisition detail
 *   POST   /requisitions/offer-items  — set item-anchored items on an offer revision
 *   GET    /requisitions/offer-items/:offerId — get offer_requisition_items for an offer
 */

import { Post, Get, Route, Tags, Body, Request, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  CreateRequisitionRequest,
  CreateRequisitionResponse,
  RequisitionDetail,
  GetRequisitionsResponse,
  RequisitionLineItem,
  SetOfferRequisitionItemsRequest,
  OfferRequisitionItem,
} from "../types/requisitions.types.js"
import logger from "../../../../logger/logger.js"

@Route("requisitions")
@Tags("Requisitions V2")
@Security("loggedin")
export class RequisitionsV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  // ---------------------------------------------------------------------------
  // Create a requisition order
  // ---------------------------------------------------------------------------

  @Post()
  public async createRequisition(
    @Body() body: CreateRequisitionRequest,
    @Request() request: ExpressRequest,
  ): Promise<CreateRequisitionResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    // Validate items
    if (!body.items || body.items.length === 0) {
      throw this.throwValidationError("Requisition must have at least one item", [
        { field: "items", message: "At least one item is required" },
      ])
    }

    // Validate target: exactly one supplier side if specified
    if (body.target_supplier_id && body.target_contractor_id) {
      throw this.throwValidationError("Specify only one of target_supplier_id or target_contractor_id", [
        { field: "target_supplier_id", message: "Cannot specify both" },
      ])
    }

    const knex = getKnex()

    // Resolve supplier info for thread participant
    let supplierId: string | null = null
    let supplierContractorId: string | null = null
    if (body.target_supplier_id) {
      const u = await knex("accounts").where({ user_id: body.target_supplier_id }).first()
      if (!u) throw this.throwNotFound("Supplier user", body.target_supplier_id)
      supplierId = body.target_supplier_id
    } else if (body.target_contractor_id) {
      const c = await knex("contractors").where({ contractor_id: body.target_contractor_id }).first()
      if (!c) throw this.throwNotFound("Supplier contractor", body.target_contractor_id)
      supplierContractorId = body.target_contractor_id
    }

    // Snapshot game item names
    const gameItemIds = body.items.map((i) => i.game_item_id)
    const gameItems = await knex("game_items").whereIn("id", gameItemIds).select("id", "name")
    const gameItemMap = new Map<string, string>(gameItems.map((g: any) => [g.id, g.name]))

    for (const item of body.items) {
      if (!gameItemMap.has(item.game_item_id)) {
        throw this.throwNotFound("Game item", item.game_item_id)
      }
    }

    try {
      const result = await withTransaction(async (trx) => {
        // 1. Create offer_session (establishes the communication thread)
        const [session] = await trx("offer_sessions").insert({
          customer_id: userId,
          assigned_id: supplierId,
          contractor_id: supplierContractorId,
          status: "active",
        }).returning("*")

        // 2. Create the order with kind = 'requisition'
        const totalPrice = body.items.reduce(
          (sum, i) => sum + i.price_per_unit * i.quantity,
          0,
        )
        const [order] = await trx("orders").insert({
          customer_id: userId,
          assigned_id: supplierId,
          contractor_id: supplierContractorId,
          kind: "requisition",
          cost: totalPrice,
          collateral: 0,
          title: body.title,
          description: body.description || "",
          status: "pending",
          offer_session_id: session.id,
        }).returning("*")

        // 3. Insert requisition_items
        const itemRows = body.items.map((item) => ({
          order_id: order.order_id,
          game_item_id: item.game_item_id,
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
          fulfilled_quantity: 0,
          quality_tier_min: item.quality_tier_min || null,
          quality_tier_max: item.quality_tier_max || null,
          game_item_name: gameItemMap.get(item.game_item_id) || null,
        }))

        const insertedItems = await trx("requisition_items").insert(itemRows).returning("*")

        logger.info("Created requisition order", {
          order_id: order.order_id,
          session_id: session.id,
          buyer_id: userId,
          supplierId,
          supplierContractorId,
          item_count: itemRows.length,
        })

        return { order, session, items: insertedItems }
      })

      return {
        order_id: result.order.order_id,
        offer_session_id: result.session.id,
        status: result.order.status,
        items: result.items.map(this.serializeRequisitionItem),
        created_at: result.order.timestamp?.toISOString?.() || new Date().toISOString(),
      }
    } catch (error) {
      logger.error("Failed to create requisition", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  // ---------------------------------------------------------------------------
  // List requisitions
  // ---------------------------------------------------------------------------

  @Get()
  public async getRequisitions(
    @Request() request: ExpressRequest,
    @Query() role?: "buyer" | "supplier",
    @Query() status?: "pending" | "assigned" | "completed" | "cancelled",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<GetRequisitionsResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()
    const p = Math.max(1, page || 1)
    const ps = Math.min(100, Math.max(1, page_size || 20))

    const contractorIds = await this.getUserContractorIds(userId)

    let query = knex("orders").where("orders.kind", "requisition")

    if (role === "buyer") {
      query = query.where("orders.customer_id", userId)
    } else if (role === "supplier") {
      query = query.where((qb) => {
        qb.where("orders.assigned_id", userId)
        if (contractorIds.length) qb.orWhereIn("orders.contractor_id", contractorIds)
      })
    } else {
      query = query.where((qb) => {
        qb.where("orders.customer_id", userId)
          .orWhere("orders.assigned_id", userId)
        if (contractorIds.length) qb.orWhereIn("orders.contractor_id", contractorIds)
      })
    }

    if (status) query = query.where("orders.status", status)

    const [{ count }] = await query.clone().clearSelect().clearOrder().count("* as count")
    const total = parseInt(String(count), 10)

    const orders = await query
      .select("orders.*")
      .orderBy("orders.timestamp", "desc")
      .limit(ps).offset((p - 1) * ps)

    const requisitions = await Promise.all(orders.map((o: any) => this.serializeRequisitionDetail(o)))

    return { requisitions, total, page: p, page_size: ps }
  }

  // ---------------------------------------------------------------------------
  // Get single requisition
  // ---------------------------------------------------------------------------

  @Get("{orderId}")
  public async getRequisition(
    @Path() orderId: string,
    @Request() request: ExpressRequest,
  ): Promise<RequisitionDetail> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const order = await knex("orders").where({ order_id: orderId, kind: "requisition" }).first()
    if (!order) throw this.throwNotFound("Requisition", orderId)

    // Auth: buyer, assigned supplier, or contractor member
    const contractorIds = await this.getUserContractorIds(userId)
    const isParty = order.customer_id === userId
      || order.assigned_id === userId
      || (order.contractor_id && contractorIds.includes(order.contractor_id))

    if (!isParty) throw this.throwForbidden("Not authorized to view this requisition")

    return this.serializeRequisitionDetail(order)
  }

  // ---------------------------------------------------------------------------
  // Set offer_requisition_items for a specific offer revision
  // ---------------------------------------------------------------------------

  @Post("offer-items")
  public async setOfferRequisitionItems(
    @Body() body: SetOfferRequisitionItemsRequest,
    @Request() request: ExpressRequest,
  ): Promise<{ items: OfferRequisitionItem[] }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    // Verify the offer exists and the user has access
    const offer = await knex("order_offers").where({ id: body.offer_id }).first()
    if (!offer) throw this.throwNotFound("Offer", body.offer_id)

    const session = await knex("offer_sessions").where({ id: offer.session_id }).first()
    if (!session) throw this.throwNotFound("Offer session", offer.session_id)

    if (session.customer_id !== userId && session.assigned_id !== userId) {
      const contractorIds = await this.getUserContractorIds(userId)
      if (!session.contractor_id || !contractorIds.includes(session.contractor_id)) {
        throw this.throwForbidden("Not authorized to modify this offer")
      }
    }

    // Validate game items exist
    const gameItemIds = body.items.map((i) => i.game_item_id)
    const gameItems = await knex("game_items").whereIn("id", gameItemIds).select("id", "name")
    const gameItemMap = new Map<string, string>(gameItems.map((g: any) => [g.id, g.name]))

    for (const item of body.items) {
      if (!gameItemMap.has(item.game_item_id)) {
        throw this.throwNotFound("Game item", item.game_item_id)
      }
    }

    // Replace all items for this offer (idempotent set operation)
    await knex("offer_requisition_items").where({ offer_id: body.offer_id }).delete()

    if (body.items.length > 0) {
      await knex("offer_requisition_items").insert(
        body.items.map((item) => ({
          offer_id: body.offer_id,
          game_item_id: item.game_item_id,
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
          listing_id: item.listing_id || null,
        })),
      )
    }

    const rows = await knex("offer_requisition_items as ori")
      .leftJoin("game_items as gi", "ori.game_item_id", "gi.id")
      .leftJoin("listings as l", "ori.listing_id", "l.listing_id")
      .where("ori.offer_id", body.offer_id)
      .select("ori.*", "gi.name as game_item_name", "l.title as listing_title")

    return {
      items: rows.map((r: any): OfferRequisitionItem => ({
        id: r.id,
        offer_id: r.offer_id,
        game_item_id: r.game_item_id,
        game_item_name: r.game_item_name || "Unknown",
        quantity: r.quantity,
        price_per_unit: parseInt(r.price_per_unit) || 0,
        listing_id: r.listing_id || null,
        listing_title: r.listing_title || null,
      })),
    }
  }

  // ---------------------------------------------------------------------------
  // Get offer_requisition_items for a specific offer
  // ---------------------------------------------------------------------------

  @Get("offer-items/{offerId}")
  public async getOfferRequisitionItems(
    @Path() offerId: string,
    @Request() request: ExpressRequest,
  ): Promise<{ items: OfferRequisitionItem[] }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()
    const knex = getKnex()

    const offer = await knex("order_offers").where({ id: offerId }).first()
    if (!offer) throw this.throwNotFound("Offer", offerId)

    const session = await knex("offer_sessions").where({ id: offer.session_id }).first()
    if (session) {
      if (session.customer_id !== userId && session.assigned_id !== userId) {
        const contractorIds = await this.getUserContractorIds(userId)
        if (!session.contractor_id || !contractorIds.includes(session.contractor_id)) {
          throw this.throwForbidden("Not authorized to view this offer")
        }
      }
    }

    const rows = await knex("offer_requisition_items as ori")
      .leftJoin("game_items as gi", "ori.game_item_id", "gi.id")
      .leftJoin("listings as l", "ori.listing_id", "l.listing_id")
      .where("ori.offer_id", offerId)
      .select("ori.*", "gi.name as game_item_name", "l.title as listing_title")

    return {
      items: rows.map((r: any): OfferRequisitionItem => ({
        id: r.id,
        offer_id: r.offer_id,
        game_item_id: r.game_item_id,
        game_item_name: r.game_item_name || "Unknown",
        quantity: r.quantity,
        price_per_unit: parseInt(r.price_per_unit) || 0,
        listing_id: r.listing_id || null,
        listing_title: r.listing_title || null,
      })),
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private serializeRequisitionItem(row: any): RequisitionLineItem {
    return {
      requisition_item_id: row.requisition_item_id,
      game_item_id: row.game_item_id,
      game_item_name: row.game_item_name || "Unknown",
      quantity: row.quantity,
      price_per_unit: parseInt(row.price_per_unit) || 0,
      fulfilled_quantity: row.fulfilled_quantity || 0,
      quality_tier_min: row.quality_tier_min || null,
      quality_tier_max: row.quality_tier_max || null,
    }
  }

  private async serializeRequisitionDetail(order: any): Promise<RequisitionDetail> {
    const knex = getKnex()

    const buyer = await knex("accounts").where({ user_id: order.customer_id }).first()
    let supplier = null
    let supplierContractor = null

    if (order.assigned_id) {
      const u = await knex("accounts").where({ user_id: order.assigned_id }).first()
      if (u) supplier = { user_id: u.user_id, username: u.username, display_name: u.display_name || u.username, avatar: u.avatar || null }
    }
    if (order.contractor_id) {
      const c = await knex("contractors").where({ contractor_id: order.contractor_id }).first()
      if (c) supplierContractor = { contractor_id: c.contractor_id, spectrum_id: c.spectrum_id, name: c.name, avatar: c.avatar || null }
    }

    const itemRows = await knex("requisition_items").where({ order_id: order.order_id })
    const items = itemRows.map((r: any) => this.serializeRequisitionItem(r))

    const totalPrice = items.reduce((s, i) => s + i.price_per_unit * i.quantity, 0)

    return {
      order_id: order.order_id,
      offer_session_id: order.offer_session_id || null,
      status: order.status,
      kind: "requisition",
      title: order.title || "",
      description: order.description || "",
      buyer: {
        user_id: buyer?.user_id || order.customer_id,
        username: buyer?.username || "unknown",
        display_name: buyer?.display_name || buyer?.username || "Unknown",
        avatar: buyer?.avatar || null,
      },
      supplier,
      supplier_contractor: supplierContractor,
      items,
      total_price: totalPrice,
      created_at: order.timestamp?.toISOString?.() || new Date().toISOString(),
      updated_at: order.updated_at?.toISOString?.() || order.timestamp?.toISOString?.() || new Date().toISOString(),
    }
  }

  private async getUserContractorIds(userId: string): Promise<string[]> {
    const rows = await getKnex()("contractor_members").where({ user_id: userId }).select("contractor_id")
    return rows.map((r: any) => r.contractor_id)
  }
}
