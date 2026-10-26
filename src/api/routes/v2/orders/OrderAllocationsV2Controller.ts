/**
 * V2 order stock allocation: which of the seller's lots an order's V2 lines
 * take their units from (the order page's Stock Allocation tab).
 *
 * Seller side only, as the V1 routes (security fix 143b16529): the assigned
 * seller, manage_orders in the selling org, a manager of the order's shop, or
 * a site admin. The customer is refused: allocations expose the seller's lots,
 * storage locations and members.
 *
 * Allocation semantics live in services/allocation/v2-order-allocation.service.ts.
 */

import { Route, Tags, Request, Get, Post, Path, Body, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import type { Knex } from "knex"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { canManageOrderStock } from "../../v1/market/order-stock-access.js"
import { getShopAllocationMode } from "../../../../services/allocation/allocation-mode.service.js"
import {
  CLOSED_ORDER_STATUSES,
  V2_ALLOCATIONS_TABLE,
  V2AllocationRequestError,
  autoAllocateOrder,
  getOrderLines,
  releaseOrderAllocations,
  setManualAllocations,
} from "../../../../services/allocation/v2-order-allocation.service.js"
import { isUuid } from "../util/short-slug.js"
import {
  ManualOrderAllocationRequest,
  OrderAllocation,
  OrderAllocationLine,
  OrderAllocationLot,
  OrderAllocationsResponse,
  ReleaseOrderAllocationsRequest,
} from "../types/order-allocations.types.js"
import type { VariantAttributes } from "../types/listings.types.js"

interface LotDetailRow {
  lot_id: string
  item_id: string | null
  variant_id: string
  quantity_total: number
  listed: boolean
  created_at: Date
  location_id: string | null
  location_name: string | null
  location_is_preset: boolean | null
  owner_user_id: string | null
  owner_username: string | null
  owner_display_name: string | null
  owner_avatar: string | null
}

interface LineDetailRow {
  order_item_id: string
  listing_id: string
  item_id: string
  variant_id: string
  quantity: number
  listing_title: string | null
  listing_photo: string | null
  variant_attributes: VariantAttributes
  variant_display_name: string | null
  variant_short_name: string | null
}

interface OrderRow {
  order_id: string
  status: string
  shop_id: string | null
  contractor_id: string | null
  assigned_id: string | null
}

function lotQuery(db: Knex) {
  return db("listing_item_lots as sl")
    .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
    .leftJoin("accounts as owner", "sl.owner_id", "owner.user_id")
    .select<LotDetailRow[]>(
      "sl.lot_id",
      "sl.item_id",
      "sl.variant_id",
      "sl.quantity_total",
      "sl.listed",
      "sl.created_at",
      "loc.location_id",
      "loc.name as location_name",
      "loc.is_preset as location_is_preset",
      "owner.user_id as owner_user_id",
      "owner.username as owner_username",
      "owner.display_name as owner_display_name",
      "owner.avatar as owner_avatar",
    )
}

async function formatLot(row: LotDetailRow): Promise<OrderAllocationLot> {
  return {
    lot_id: row.lot_id,
    quantity_available: row.quantity_total,
    listed: row.listed,
    location: row.location_id
      ? { location_id: row.location_id, name: row.location_name ?? "", is_preset: !!row.location_is_preset }
      : null,
    owner: row.owner_user_id
      ? {
          user_id: row.owner_user_id,
          username: row.owner_username ?? "",
          display_name: row.owner_display_name ?? undefined,
          avatar_url: (row.owner_avatar && (await cdn.getFileLinkResource(row.owner_avatar))) || undefined,
        }
      : null,
  }
}

@Route("orders")
// Both tags: allocating changes the order and the lots' quantities, so the
// generated client refreshes order and stock-lot queries together.
@Tags("Orders V2", "Stock Lots V2")
@Security("loggedin")
export class OrderAllocationsV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /** Loads the order and checks the caller is on its seller side. */
  private async authorizedOrder(orderId: string): Promise<OrderRow> {
    this.requireAuth()
    if (!isUuid(orderId)) this.throwNotFound("Order", orderId)
    const order: OrderRow | undefined = await getKnex()("orders")
      .where({ order_id: orderId })
      .first("order_id", "status", "shop_id", "contractor_id", "assigned_id")
    if (!order) this.throwNotFound("Order", orderId)
    if (!(await canManageOrderStock(order, this.getUser()))) {
      this.throwForbidden("You cannot manage this order's stock allocations")
    }
    return order
  }

  private assertEditable(order: OrderRow): void {
    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
      this.throwConflict(`Order is ${order.status}; its allocations can't change`)
    }
  }

  private async respond(order: OrderRow): Promise<OrderAllocationsResponse> {
    const db = getKnex()
    const fresh: OrderRow = (await db("orders").where({ order_id: order.order_id }).first("order_id", "status", "shop_id", "contractor_id", "assigned_id")) ?? order

    const lineRows: LineDetailRow[] = await db("order_market_items_v2 as omi")
      .join("item_variants as iv", "omi.variant_id", "iv.variant_id")
      .leftJoin("listings as lst", "omi.listing_id", "lst.listing_id")
      .where("omi.order_id", order.order_id)
      .orderBy([{ column: "omi.created_at" }, { column: "omi.order_item_id" }])
      .select(
        "omi.order_item_id",
        "omi.listing_id",
        "omi.item_id",
        "omi.variant_id",
        "omi.quantity",
        "lst.title as listing_title",
        db.raw(
          `(SELECT COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename)
              FROM listing_photos_v2 lp JOIN image_resources ir ON ir.resource_id = lp.resource_id
             WHERE lp.listing_id = omi.listing_id ORDER BY lp.display_order LIMIT 1) AS listing_photo`,
        ),
        "iv.attributes as variant_attributes",
        "iv.display_name as variant_display_name",
        "iv.short_name as variant_short_name",
      )

    const allocations: Array<{
      allocation_id: string
      order_item_id: string
      lot_id: string | null
      quantity: number
      allocated_by: string | null
      created_at: Date
      updated_at: Date
    }> = await db(V2_ALLOCATIONS_TABLE)
      .where({ order_id: order.order_id, status: "active" })
      .orderBy([{ column: "created_at" }, { column: "allocation_id" }])
      .select("allocation_id", "order_item_id", "lot_id", "quantity", "allocated_by", "created_at", "updated_at")

    const allocatedLotIds = allocations.map((a) => a.lot_id).filter((id): id is string => !!id)
    const allocatedLots = allocatedLotIds.length
      ? await lotQuery(db).whereIn("sl.lot_id", allocatedLotIds)
      : []
    const candidateLots = lineRows.length
      ? await lotQuery(db)
          .where("sl.quantity_total", ">", 0)
          .where((q) => {
            for (const l of lineRows) q.orWhere({ "sl.item_id": l.item_id, "sl.variant_id": l.variant_id })
          })
          .orderBy([{ column: "sl.created_at" }, { column: "sl.lot_id" }])
      : []
    const lotById = new Map<string, OrderAllocationLot>()
    for (const row of [...allocatedLots, ...candidateLots]) {
      if (!lotById.has(row.lot_id)) lotById.set(row.lot_id, await formatLot(row))
    }

    const lines: OrderAllocationLine[] = lineRows.map((l) => {
      const lineAllocs: OrderAllocation[] = allocations
        .filter((a) => a.order_item_id === l.order_item_id)
        .map((a) => ({
          allocation_id: a.allocation_id,
          order_item_id: a.order_item_id,
          lot_id: a.lot_id,
          quantity: a.quantity,
          allocated_by: a.allocated_by,
          created_at: a.created_at.toISOString(),
          updated_at: a.updated_at.toISOString(),
          lot: a.lot_id ? (lotById.get(a.lot_id) ?? null) : null,
        }))
      return {
        order_item_id: l.order_item_id,
        listing_id: l.listing_id,
        listing_title: l.listing_title ?? "Item",
        listing_photo: l.listing_photo,
        variant: {
          variant_id: l.variant_id,
          attributes: l.variant_attributes,
          display_name: l.variant_display_name || "Standard",
          short_name: l.variant_short_name || "STD",
        },
        quantity: l.quantity,
        quantity_allocated: lineAllocs.reduce((s, a) => s + a.quantity, 0),
        allocations: lineAllocs,
        available_lots: candidateLots
          .filter((c) => c.item_id === l.item_id && c.variant_id === l.variant_id)
          .map((c) => lotById.get(c.lot_id)!),
      }
    })

    return {
      order_id: fresh.order_id,
      order_status: fresh.status,
      allocation_mode: await getShopAllocationMode(fresh.shop_id),
      editable: !CLOSED_ORDER_STATUSES.includes(fresh.status),
      lines,
      total_requested: lines.reduce((s, l) => s + l.quantity, 0),
      total_allocated: lines.reduce((s, l) => s + l.quantity_allocated, 0),
    }
  }

  private async run(order: OrderRow, fn: (trx: Knex.Transaction) => Promise<unknown>): Promise<OrderAllocationsResponse> {
    try {
      await withTransaction(fn)
    } catch (error) {
      if (error instanceof V2AllocationRequestError) {
        this.throwValidationError(error.message, [{ field: error.field, message: error.message }])
      }
      throw error
    }
    return this.respond(order)
  }

  /**
   * The order's V2 lines, the lots their units are allocated from, and the
   * lots that could be allocated.
   * @summary Get an order's stock allocations
   */
  @Get("{orderId}/allocations")
  public async getOrderAllocations(
    @Path() orderId: string,
    @Request() request: ExpressRequest,
  ): Promise<OrderAllocationsResponse> {
    this.request = request
    return this.respond(await this.authorizedOrder(orderId))
  }

  /**
   * Allocates every line's unallocated units from its listed lots, oldest lot
   * first. Lines get what is available; the rest stays unallocated.
   * @summary Auto-allocate an order's stock
   */
  @Post("{orderId}/allocations/auto")
  public async autoAllocateOrderStock(
    @Path() orderId: string,
    @Request() request: ExpressRequest,
  ): Promise<OrderAllocationsResponse> {
    this.request = request
    const order = await this.authorizedOrder(orderId)
    this.assertEditable(order)
    const userId = this.getUserId()
    return this.run(order, (trx) => autoAllocateOrder(trx, order.order_id, { strict: false, allocatedBy: userId }))
  }

  /**
   * Sets how many units each given lot holds for the order. `quantity` is
   * the lot's new total for the order, not a delta: higher takes units from
   * the lot, lower puts them back, 0 releases it. A lot must hold the item
   * and variant of one of the order's lines.
   * @summary Allocate stock to an order from specific lots
   */
  @Post("{orderId}/allocations/manual")
  public async manualAllocateOrderStock(
    @Path() orderId: string,
    @Body() body: ManualOrderAllocationRequest,
    @Request() request: ExpressRequest,
  ): Promise<OrderAllocationsResponse> {
    this.request = request
    const order = await this.authorizedOrder(orderId)
    this.assertEditable(order)
    const targets = body?.allocations
    if (!Array.isArray(targets) || targets.length === 0) {
      this.throwValidationError("allocations must be a non-empty array", [
        { field: "allocations", message: "Required" },
      ])
    }
    for (const t of targets) {
      if (typeof t?.lot_id !== "string" || !isUuid(t.lot_id)) {
        this.throwValidationError("Each allocation needs a valid lot_id", [{ field: "lot_id", message: "Must be a UUID" }])
      }
      if (t.order_item_id !== undefined && !isUuid(t.order_item_id)) {
        this.throwValidationError("order_item_id must be a UUID", [{ field: "order_item_id", message: "Must be a UUID" }])
      }
      if (!Number.isInteger(t.quantity) || t.quantity < 0) {
        this.throwValidationError("quantity must be a non-negative integer", [
          { field: "quantity", message: "Must be a non-negative integer" },
        ])
      }
    }
    const userId = this.getUserId()
    return this.run(order, (trx) => setManualAllocations(trx, order.order_id, targets, userId))
  }

  /**
   * Puts allocated units back into their lots: the given allocations, or all
   * of the order's allocations when allocation_ids is omitted.
   * @summary Release an order's stock allocations
   */
  @Post("{orderId}/allocations/release")
  public async releaseOrderStock(
    @Path() orderId: string,
    @Body() body: ReleaseOrderAllocationsRequest,
    @Request() request: ExpressRequest,
  ): Promise<OrderAllocationsResponse> {
    this.request = request
    const order = await this.authorizedOrder(orderId)
    this.assertEditable(order)
    const ids = body?.allocation_ids
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !isUuid(id)))) {
      this.throwValidationError("allocation_ids must be UUIDs", [{ field: "allocation_ids", message: "Must be UUIDs" }])
    }
    return this.run(order, async (trx) => {
      // Re-check under the order lock: it may have closed since.
      const lines = await getOrderLines(trx, order.order_id)
      if (lines.length === 0) throw new V2AllocationRequestError("Order has no V2 items", "order_id")
      const current = await trx("orders").where({ order_id: order.order_id }).forUpdate().first("status")
      if (CLOSED_ORDER_STATUSES.includes(current?.status)) {
        throw new V2AllocationRequestError(`Order is ${current.status}; its allocations can't change`, "order_id")
      }
      return releaseOrderAllocations(trx, order.order_id, ids)
    })
  }
}
