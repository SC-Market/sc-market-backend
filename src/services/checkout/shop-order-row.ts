/**
 * The `orders` row for a purchase from a shop, as the V2 direct paths write it
 * (Buy now: POST /buy-orders; buy-order fulfilment: POST /buy-orders/{id}/fulfill).
 * An accepted cart checkout gets the same columns from its offer session.
 *
 * The orders table has no created_at/updated_at: "timestamp" defaults to now()
 * and status to 'not-started', so neither is set here.
 */

/** The shop columns that decide who an order belongs to. */
export interface OrderShop {
  shop_id: string
  owner_user_id: string | null
  owner_contractor_id: string | null
}

/**
 * Linked to the selling shop like any other shop order (shop_id;
 * contractor_id for an org shop; the owner as assignee for a personal shop,
 * unassigned for an org shop so a member can claim it), with the buyer as
 * customer and the purchase total as cost.
 */
export function shopOrderRow(
  shop: OrderShop,
  buyer: { user_id: string; username: string },
  cost: number,
) {
  return {
    kind: "Delivery",
    cost,
    // orders.title is varchar(100); same title cart checkout uses.
    title: `Items Sold to ${buyer.username}`.slice(0, 100),
    description: "",
    customer_id: buyer.user_id,
    shop_id: shop.shop_id,
    contractor_id: shop.owner_contractor_id,
    assigned_id: shop.owner_contractor_id ? null : shop.owner_user_id,
  }
}
