import { has_permission } from "../util/permissions.js"
import { createErrorResponse } from "../util/response.js"
import { NextFunction, Request, Response } from "express"
import { DBOrder } from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
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
    order = await database.getOrder({ order_id: order_id })
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

export function validate_optional_username(path: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const username = req.query[path] as string
    if (!username) {
      return next()
    }

    let user
    try {
      user = await database.getUser({ username })
    } catch {
      return res
        .status(404)
        .json(createErrorResponse({ error: "User not found", username }))
    }

    if (!req.users) {
      req.users = new Map<string, User>()
    }
    req.users.set(path, user)
    next()
  }
}

export function validate_optional_spectrum_id(path: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const spectrum_id = req.query[path] as string
    if (!spectrum_id) {
      return next()
    }

    let contractor
    try {
      contractor = await database.getContractor({ spectrum_id })
    } catch {
      return res
        .status(404)
        .json(
          createErrorResponse({ error: "Contractor not found", contractor }),
        )
    }

    if (!req.contractors) {
      req.contractors = new Map<string, User>()
    }
    req.contractors.set(path, contractor)
    next()
  }
}
