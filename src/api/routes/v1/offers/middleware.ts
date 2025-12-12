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
    return
  }

  next()
}

/**
 * Middleware to check if the user has permission to merge all the specified offer sessions.
 * The user must have permission on behalf of the contractor/assigned user for ALL offers,
 * OR be the customer for all offers.
 */
export async function can_merge_offers(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user as User
  const { offer_session_ids } = req.body as { offer_session_ids?: string[] }

  if (!offer_session_ids || !Array.isArray(offer_session_ids)) {
    res
      .status(400)
      .json(
        createErrorResponse({ message: "offer_session_ids array is required" }),
      )
    return
  }

  if (offer_session_ids.length < 2) {
    res.status(400).json(
      createErrorResponse({
        message: "At least 2 offer sessions are required to merge",
      }),
    )
    return
  }

  try {
    // Get all offer sessions
    const sessions = await Promise.all(
      offer_session_ids.map((id) =>
        database.getOfferSessions({ id }).then((s) => s[0]),
      ),
    )

    // Check if all sessions exist
    if (sessions.some((s) => !s)) {
      res.status(404).json(
        createErrorResponse({
          message: "One or more offer sessions not found",
        }),
      )
      return
    }

    // Check permissions for each session
    // Only contractors/sellers can merge offers (not customers/buyers)
    // User must have permission on behalf of the contractor/assigned user for ALL sessions
    // Customers cannot merge offers - only the receiving party (contractor/assigned) can merge

    const permissionChecks = await Promise.all(
      sessions.map(async (session) => {
        if (!session) return false

        // If session has a contractor, check contractor permission
        if (session.contractor_id) {
          return await has_permission(
            session.contractor_id,
            user.user_id,
            "manage_orders",
          )
        }

        // If session has an assigned user, check if user is the assigned user
        if (session.assigned_id) {
          return session.assigned_id === user.user_id
        }

        // No contractor or assigned user - shouldn't happen but deny by default
        return false
      }),
    )

    const hasPermissionForAll = permissionChecks.every((has) => has)

    if (!hasPermissionForAll) {
      res.status(403).json(
        createErrorResponse({
          message:
            "You do not have permission to merge these offers. You must be the customer for all offers, or have permission on behalf of the contractor/assigned user for all offers.",
        }),
      )
      return
    }

    req.offer_sessions = sessions as DBOfferSession[]
    next()
  } catch (error) {
    res.status(500).json(
      createErrorResponse({
        message: "Failed to validate merge permissions",
      }),
    )
  }
}
