import { getKnex } from "../../../../clients/database/knex-db.js"
import { DBOrder } from "../../../../clients/database/db-models.js"
import { has_permission } from "../util/permissions.js"
import { canManageShop } from "../../../../services/shops/shop-permissions.service.js"
import { isSiteAdmin } from "../../../util/site-role.js"
import { User } from "../api-models.js"

/**
 * Who may see and change the stock allocated to an order: the seller side
 * only. That is the shop's managers, manage_orders holders in the selling
 * org, the assigned seller, or a site admin. The customer is not included:
 * allocations expose the seller's lots and storage locations.
 */
export async function canManageOrderStock(
  order: Pick<DBOrder, "contractor_id" | "assigned_id" | "shop_id">,
  user: User,
): Promise<boolean> {
  if (isSiteAdmin(user)) return true
  if (order.assigned_id && order.assigned_id === user.user_id) return true
  if (
    order.contractor_id &&
    (await has_permission(order.contractor_id, user.user_id, "manage_orders"))
  ) {
    return true
  }
  if (order.shop_id) {
    const shop = await getKnex()("shops")
      .where("shop_id", order.shop_id)
      .first("shop_id", "owner_user_id", "owner_contractor_id")
    if (shop && (await canManageShop(shop, user.user_id))) return true
  }
  return false
}

/** Listing ids in an order (V1 market_orders and V2 order_market_items_v2). */
export async function getOrderListingIds(
  order_id: string,
): Promise<Set<string>> {
  const knex = getKnex()
  const [v1, v2] = await Promise.all([
    knex("market_orders").where({ order_id }).select("listing_id"),
    knex("order_market_items_v2").where({ order_id }).select("listing_id"),
  ])
  return new Set(
    [...v1, ...v2].map((r: { listing_id: string }) => r.listing_id),
  )
}

/**
 * Lot ids (from the request) that may not be allocated to this order: lots
 * that don't exist or whose listing isn't part of the order. Without this
 * check a seller could allocate (and so consume) anyone's lots.
 */
export async function lotsOutsideOrder(
  order_id: string,
  lotIds: string[],
): Promise<string[]> {
  const listingIds = await getOrderListingIds(order_id)
  const ok = new Set<string>()
  for (const lot_id of new Set(lotIds)) {
    const lot = await getKnex()("stock_lots")
      .where({ lot_id })
      .first("lot_id", "listing_id")
    if (lot?.listing_id && listingIds.has(lot.listing_id)) ok.add(lot_id)
  }
  return lotIds.filter((id) => !ok.has(id))
}
