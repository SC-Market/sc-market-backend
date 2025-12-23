import { has_permission } from "../util/permissions.js"
import { createErrorResponse } from "../util/response.js"
import { NextFunction, Request, Response } from "express"
import { DBOrder } from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as orderDb from "./database.js"
import { User } from "../api-models.js"

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

  const assigned = order.assigned_id === user.user_id
  const customer = order.customer_id === user.user_id
  let unrelated = !customer && !assigned && user.role !== "admin"
  if (order.contractor_id) {
    unrelated =
      unrelated &&
      !(await has_permission(
        order.contractor_id,
        user.user_id,
        "manage_orders",
      ))
  }

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
