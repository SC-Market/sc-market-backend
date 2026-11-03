/**
 * Order status rules: who may move an order to which status, and what the
 * order row becomes. Pure: the caller resolves the facts (is the actor a site
 * admin, do they have manage_orders in the order's org) and runs the side
 * effects (stock, notifications, Discord, chat). Used by
 * applyOrderStatusChange (v1 PUT /orders/:id, the public API, Discord
 * buttons).
 */

/** The statuses an order can be set to. */
export const ORDER_STATUS_VALUES = [
  "fulfilled",
  "in-progress",
  "not-started",
  "cancelled",
] as const
export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number]

/** Statuses after which an order is closed. */
export const CLOSED_ORDER_STATUSES = ["cancelled", "fulfilled"] as const

export function isOrderStatusValue(status: string): status is OrderStatusValue {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(status)
}

/**
 * Whether an order is closed (fulfilled or cancelled). Substring match, as
 * the status check has always been.
 */
export function isOrderClosed(status: string): boolean {
  return CLOSED_ORDER_STATUSES.some((closed) => status.includes(closed))
}

export interface OrderStatusRuleOrder {
  status: string
  contractor_id: string | null
  assigned_id: string | null
  customer_id: string | null
}

export interface OrderStatusActor {
  userId: string
  /** isSiteAdmin(actor) */
  isSiteAdmin: boolean
  /**
   * has_permission(order.contractor_id, actor, "manage_orders"); ignored for
   * an order without an org. has_permission is also true for an acting site
   * admin.
   */
  isOrgManager: boolean
}

export type OrderStatusDecision =
  | { allowed: true }
  | {
      allowed: false
      /** The HTTP status the caller answers with. */
      httpStatus: 400 | 403
      reason: "invalid_status" | "closed" | "forbidden"
      message: string
    }

/**
 * Whether `actor` may set `order` to `status`. Checked in this order:
 * 1. the status must be one of ORDER_STATUS_VALUES (400 invalid_status);
 * 2. a closed order can only be changed by a site admin (400 closed);
 * 3. an order without an org: only the assignee or a site admin may set
 *    not-started / in-progress / fulfilled; cancelling is not limited here
 *    (the route's access check decides who reaches it);
 * 4. an org's order: an org manager (manage_orders) or the assignee may set
 *    any status, the customer may only cancel (403 forbidden).
 */
export function canChangeOrderStatus(
  order: OrderStatusRuleOrder,
  actor: OrderStatusActor,
  status: string,
): OrderStatusDecision {
  if (!isOrderStatusValue(status)) {
    return {
      allowed: false,
      httpStatus: 400,
      reason: "invalid_status",
      message: "Invalid status!",
    }
  }

  if (!actor.isSiteAdmin && isOrderClosed(order.status)) {
    return {
      allowed: false,
      httpStatus: 400,
      reason: "closed",
      message: "Cannot change status for closed order",
    }
  }

  const assigned = order.assigned_id === actor.userId
  if (!order.contractor_id) {
    if (status !== "cancelled" && !assigned && !actor.isSiteAdmin) {
      return {
        allowed: false,
        httpStatus: 403,
        reason: "forbidden",
        message: `Only the assigned user may set the status of this order to ${status}`,
      }
    }
    return { allowed: true }
  }

  const customer = order.customer_id === actor.userId
  if (actor.isOrgManager || assigned || (status === "cancelled" && customer)) {
    return { allowed: true }
  }
  return {
    allowed: false,
    httpStatus: 403,
    reason: "forbidden",
    message: `You may not set the status of this order to ${status}`,
  }
}

/**
 * Which statuses `actor` may move `order` to right now, per
 * canChangeOrderStatus. Setting the status the order already has counts.
 */
export function allowedOrderActions(
  order: OrderStatusRuleOrder,
  actor: OrderStatusActor,
): Record<OrderStatusValue, boolean> {
  const allowed = {} as Record<OrderStatusValue, boolean>
  for (const status of ORDER_STATUS_VALUES) {
    allowed[status] = canChangeOrderStatus(order, actor, status).allowed
  }
  return allowed
}

/**
 * The order row update for a status change: in-progress also assigns the
 * actor, fulfilled stamps fulfilled_at.
 */
export function nextOrderFields(
  status: OrderStatusValue,
  actorId: string,
  now: Date,
): { status: OrderStatusValue; assigned_id?: string; fulfilled_at?: Date } {
  if (status === "in-progress") return { status, assigned_id: actorId }
  if (status === "fulfilled") return { status, fulfilled_at: now }
  return { status }
}
