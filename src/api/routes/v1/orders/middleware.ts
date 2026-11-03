import { tokenMayUseOrg } from "../../../middleware/auth.js"
import { createErrorResponse } from "../util/response.js"
import { NextFunction, Request, Response } from "express"
import { DBOrder } from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as orderDb from "./database.js"
import { User } from "../api-models.js"
import { has_permission } from "../util/permissions.js"
import { isSiteAdmin } from "../../../util/site-role.js"
import { canActOnOrder } from "../../../../services/orders/order-access.js"

/**
 * Whether the user may act on an order at all (view it, or try a change):
 * its customer, its assignee, a site admin, or, for an org's order, a member
 * with manage_orders or claim_orders. What exactly they may change is
 * checked by the action (applyOrderStatusChange, handleAssignedUpdate).
 * Callers check the API token's org grant first (related_to_order,
 * public API OrdersController).
 */
export async function userRelatedToOrder(order: DBOrder, user: User): Promise<boolean> {
  const actor = { userId: user.user_id, isSiteAdmin: isSiteAdmin(user) }
  if (canActOnOrder(order, actor)) return true
  if (!order.contractor_id) return false
  // Only look the org permissions up when the parties alone don't decide.
  const orgManager = await has_permission(order.contractor_id, user.user_id, "manage_orders")
  const orgClaimer = !orgManager && (await has_permission(order.contractor_id, user.user_id, "claim_orders"))
  return canActOnOrder(order, { ...actor, orgManager, orgClaimer })
}

export async function related_to_order(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user as User
  const order_id = req.params["order_id"]
  let order: DBOrder
  try {
    order = await orderDb.getOrder({ order_id: order_id })
  } catch (e) {
    res.status(404).json(createErrorResponse({ error: "Invalid order" }))
    return
  }

  req.order = order

  // An org's order: an API token must be granted the org (unless the user is
  // only its customer, not a member of the org).
  if (!(await tokenMayUseOrg(req, res, order.contractor_id))) return

  const unrelated = !(await userRelatedToOrder(order, user))
  if (unrelated) {
    res.status(403).json(
      createErrorResponse({
        error: "You are not authorized to view this order",
      }),
    )
    return
  }

  next()
}
