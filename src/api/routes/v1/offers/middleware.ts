import { NextFunction, Request, Response } from "express"
import { User } from "../api-models.js"
import { DBOfferSession } from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { createErrorResponse } from "../util/response.js"
import { has_permission } from "../util/permissions.js"
import { can_respond_to_offer_helper } from "./helpers.js"

export async function related_to_offer(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user as User
  const id = req.params["session_id"]
  let offer: DBOfferSession
  try {
    ;[offer] = await database.getOfferSessions({ id: id })
  } catch (e) {
    res.status(404).json(createErrorResponse({ error: "Invalid offer" }))
    return
  }

  req.offer_session = offer

  const assigned = offer.assigned_id === user.user_id
  const customer = offer.customer_id === user.user_id
  let unrelated = !customer && !assigned && user.role !== "admin"
  if (offer.contractor_id) {
    unrelated =
      unrelated &&
      !(await has_permission(
        offer.contractor_id,
        user.user_id,
        "manage_orders",
      ))
  }

  if (unrelated) {
    res.status(403).json(
      createErrorResponse({
        error: "You are not authorized to view this offer",
      }),
    )
    return
  }

  next()
}

export async function can_respond_to_offer(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const mostRecent = await database.getMostRecentOrderOffer(
    req.offer_session!.id,
  )
  req.most_recent_offer = mostRecent
  const related = await can_respond_to_offer_helper(
    req.offer_session!,
    mostRecent,
    req.user as User,
  )

  if (req.body.status === "cancelled") {
    return next() // anyone can cancel if they are related
  }

  if (!related) {
    res.status(403).json(
      createErrorResponse({
        error: "You are not authorized to respond to this offer",
      }),
    )
  }

  next()
}
