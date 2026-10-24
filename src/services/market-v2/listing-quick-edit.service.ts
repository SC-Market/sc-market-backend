/**
 * Listing quick edits (stock quantity, unified price) on the V2 market tables.
 *
 * Used by the Discord bot's /stock and /price commands, which pick from the
 * seller's V2 listings (listing_search) and so send V2 listing ids. Mirrors
 * the rules of the web endpoints (PUT /api/v2/listings/:id and
 * PUT /api/v2/stock-lots/:id):
 *   - the caller must be able to modify the listing (canModifyListing: shop
 *     owner, or manage_market in the shop's org)
 *   - sold / cancelled listings can't be edited
 *   - quantities are non-negative integers, prices are positive
 *
 * A quick edit only applies when it's unambiguous. A listing with more than one
 * listing_item (bundle), more than one listed stock lot (several variants or
 * locations), or per-variant pricing is rejected with a message pointing to the
 * website instead of guessing which lot or variant to change.
 */

import type { Knex } from "knex"
import { canModifyListing } from "../../api/routes/v2/util/listing-permissions.js"
import { getOrCreateVariant } from "./variant.service.js"
import { auditService } from "../audit/audit.service.js"

export type StockOperation = "set" | "add" | "sub"

export const STOCK_OPERATIONS: readonly StockOperation[] = ["set", "add", "sub"]

/** A rejected quick edit. `status` is the HTTP status the route should answer with. */
export class ListingQuickEditError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404,
  ) {
    super(message)
    this.name = "ListingQuickEditError"
  }
}

const MANAGE_ON_WEB = "manage it on sc-market.space"

interface ListingRow {
  listing_id: string
  shop_id: string
  title: string
  status: string
}

interface ListingItemRow {
  item_id: string
  game_item_id: string | null
  pricing_mode: string
}

interface LotRow {
  lot_id: string
  quantity_total: number
}

async function loadEditableListing(
  trx: Knex,
  listingId: string,
  userId: string,
): Promise<{ listing: ListingRow; item: ListingItemRow }> {
  const listing: ListingRow | undefined = await trx("listings")
    .where({ listing_id: listingId })
    .first()
  if (!listing) {
    throw new ListingQuickEditError("Listing not found", 404)
  }

  if (!(await canModifyListing(listing, userId))) {
    throw new ListingQuickEditError(
      "You do not have permission to update this listing",
      403,
    )
  }

  if (listing.status === "sold" || listing.status === "cancelled") {
    throw new ListingQuickEditError(
      `Cannot update a ${listing.status} listing`,
      400,
    )
  }

  const items: ListingItemRow[] = await trx("listing_items")
    .where({ listing_id: listingId })
    .select("item_id", "game_item_id", "pricing_mode")
  if (items.length === 0) {
    throw new ListingQuickEditError(
      `This listing has no items; ${MANAGE_ON_WEB}`,
      400,
    )
  }
  if (items.length > 1) {
    throw new ListingQuickEditError(
      `This is a bundle listing with ${items.length} items; ${MANAGE_ON_WEB}`,
      400,
    )
  }

  return { listing, item: items[0] }
}

export interface StockUpdateResult {
  previous_quantity: number
  quantity: number
}

/**
 * Set / add to / subtract from a single-item listing's listed stock.
 *
 * In V2, order allocation decrements `listing_item_lots.quantity_total`
 * directly, so the listed lot's quantity_total is the available quantity the
 * buyer sees (listing_items.quantity_available is kept in sync by trigger).
 */
export async function updateListingStock(
  trx: Knex,
  params: {
    listingId: string
    userId: string
    operation: StockOperation
    quantity: number
  },
): Promise<StockUpdateResult> {
  const { listingId, userId, operation, quantity } = params

  if (!STOCK_OPERATIONS.includes(operation)) {
    throw new ListingQuickEditError(
      `Invalid stock operation "${operation}"; expected one of ${STOCK_OPERATIONS.join(", ")}`,
      400,
    )
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new ListingQuickEditError(
      "Quantity must be a non-negative whole number",
      400,
    )
  }

  const { listing, item } = await loadEditableListing(trx, listingId, userId)

  const lots: LotRow[] = await trx("listing_item_lots")
    .where({ item_id: item.item_id, listed: true })
    .select("lot_id", "quantity_total")
    .forUpdate()
  if (lots.length > 1) {
    throw new ListingQuickEditError(
      `This listing has ${lots.length} stock lots (variants or locations); ${MANAGE_ON_WEB}`,
      400,
    )
  }

  const lot = lots[0]
  const previous = lot ? Number(lot.quantity_total) : 0

  let next: number
  if (operation === "set") {
    next = quantity
  } else if (operation === "add") {
    next = previous + quantity
  } else {
    next = previous - quantity
    if (next < 0) {
      throw new ListingQuickEditError(
        `Cannot subtract ${quantity}; only ${previous} in stock`,
        400,
      )
    }
  }

  if (lot) {
    await trx("listing_item_lots")
      .where({ lot_id: lot.lot_id })
      .update({ quantity_total: next, updated_at: new Date() })
  } else if (next > 0) {
    // No listed lot yet: create one with the item's default (attribute-less)
    // variant, the same shape as POST /api/v2/stock-lots.
    const variantId = await getOrCreateVariant(item.game_item_id, {}, trx)
    await trx("listing_item_lots").insert({
      item_id: item.item_id,
      variant_id: variantId,
      quantity_total: next,
      location_id: null,
      listed: true,
      owner_id: userId,
      game_item_id: item.game_item_id,
      listing_id: listing.listing_id,
    })
  }

  auditService.log({
    entity_type: "listing",
    entity_id: listing.listing_id,
    action: "stock_updated",
    actor_id: userId,
    details: { source: "discord", operation, previous, quantity: next },
  })

  return { previous_quantity: previous, quantity: next }
}

/**
 * Set the price of a single-item, unified-pricing listing (listing_items.base_price).
 */
export async function updateListingPrice(
  trx: Knex,
  params: { listingId: string; userId: string; price: number },
): Promise<{ title: string }> {
  const { listingId, userId, price } = params

  if (!Number.isInteger(price) || price <= 0) {
    throw new ListingQuickEditError(
      "Price must be a whole number greater than 0",
      400,
    )
  }

  const { listing, item } = await loadEditableListing(trx, listingId, userId)

  if (item.pricing_mode !== "unified") {
    throw new ListingQuickEditError(
      `This listing is priced per variant; ${MANAGE_ON_WEB}`,
      400,
    )
  }

  await trx("listing_items")
    .where({ item_id: item.item_id })
    .update({ base_price: price })
  await trx("listings")
    .where({ listing_id: listing.listing_id })
    .update({ updated_at: new Date() })

  auditService.log({
    entity_type: "listing",
    entity_id: listing.listing_id,
    action: "price_updated",
    actor_id: userId,
    details: { source: "discord", price },
  })

  return { title: listing.title }
}
