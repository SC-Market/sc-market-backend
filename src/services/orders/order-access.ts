/**
 * Who may see or act on an order or an offer session. Pure: the caller
 * resolves the facts (site admin, org permissions, org membership, shop
 * order access) and answers the request.
 *
 * There are several rules today, one per surface, and they don't agree:
 *
 * - canActOnOrder / canActOnOffer (v1 order and offer routes, public API
 *   changes): customer, assignee, site admin, or an org member with
 *   manage_orders or claim_orders. A plain org member: no.
 * - canViewOrder (v1 GET /orders/:id, order chats): customer, assignee, site
 *   admin, or ANY member of the order's org, permission or not.
 * - canViewOrderDetailV2 (v2 GET /orders/:id, public API GET order): buyer,
 *   assignee, or whoever handles the shop's orders (owner, or org
 *   manage_market / manage_orders). No site admin bypass of its own (only via
 *   has_permission, so only on org shops); claim_orders and plain members: no.
 * - isRelatedToOffer (offer chats): customer, assignee, or org manage_orders.
 *   No admin bypass of its own; claim_orders: no.
 *
 * They are kept apart on purpose: merging them would change who may see what.
 */

export interface OrderParties {
  customer_id: string | null
  assigned_id: string | null
  contractor_id: string | null
}

export interface OrderActor {
  userId: string
  isSiteAdmin: boolean
  /** has_permission(contractor_id, user, "manage_orders"); only read for an org's order */
  orgManager?: boolean
  /** has_permission(contractor_id, user, "claim_orders"); only read for an org's order */
  orgClaimer?: boolean
}

/**
 * Whether the user may act on an order (or offer session) at all: view it,
 * or try a change. Its customer, its assignee, a site admin, or, for an
 * org's order, a member with manage_orders or claim_orders (claimers need
 * access to self-claim). What exactly they may change is checked by the
 * action.
 */
export function canActOnOrder(order: OrderParties, actor: OrderActor): boolean {
  if (order.customer_id === actor.userId) return true
  if (order.assigned_id === actor.userId) return true
  if (actor.isSiteAdmin) return true
  if (!order.contractor_id) return false
  return !!actor.orgManager || !!actor.orgClaimer
}

/** canActOnOrder for an offer session: the same rule. */
export const canActOnOffer = canActOnOrder

/**
 * Whether the user may view an order on v1 GET /orders/:id and in its chat:
 * its customer, its assignee, a site admin, or any member of the order's org
 * (no permission needed).
 */
export function canViewOrder(
  order: OrderParties,
  viewer: { userId: string; isSiteAdmin: boolean; isOrgMember: boolean },
): boolean {
  return (
    order.customer_id === viewer.userId ||
    (!!order.contractor_id && viewer.isOrgMember) ||
    order.assigned_id === viewer.userId ||
    viewer.isSiteAdmin
  )
}

/**
 * Whether the user may open the v2 order detail: the buyer, the assignee, or
 * someone who handles the order shop's orders (canManageShopOrders). No site
 * admin bypass of its own.
 */
export function canViewOrderDetailV2(
  order: { customer_id: string | null; assigned_id: string | null },
  viewer: { userId: string; handlesShopOrders: boolean },
): boolean {
  return (
    order.customer_id === viewer.userId ||
    viewer.handlesShopOrders ||
    order.assigned_id === viewer.userId
  )
}

/**
 * Whether the user is related to an offer session for its chat: the
 * customer, the assignee, or, for an org's offer, a member with
 * manage_orders. No site admin bypass of its own (has_permission grants an
 * acting admin manage_orders on org offers).
 */
export function isRelatedToOffer(
  session: OrderParties,
  viewer: { userId: string; orgManager?: boolean },
): boolean {
  if (viewer.userId === session.customer_id) return true
  if (viewer.userId === session.assigned_id) return true
  if (session.contractor_id) return !!viewer.orgManager
  return false
}

/**
 * Whether it's the user's turn to respond to an active offer session (accept,
 * reject, counter). After the customer's offer, the seller side responds:
 * for an org's offer a member with manage_orders (not the assignee as such),
 * otherwise the assignee. After the seller side's offer, only the customer.
 */
export function canRespondToOffer(
  session: OrderParties & { status: string },
  lastActorId: string | null,
  user: { userId: string; orgManager?: boolean },
): boolean {
  if (session.status !== "active") return false
  const lastByCustomer = lastActorId === session.customer_id
  const isCustomer = user.userId === session.customer_id
  if (!lastByCustomer) return isCustomer
  if (session.contractor_id) return !!user.orgManager
  return user.userId === session.assigned_id
}
