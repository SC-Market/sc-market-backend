import { RequestHandler } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../profiles/database.js"
import * as offerDb from "./database.js"
import * as marketDb from "../market/database.js"
import * as serviceDb from "../services/database.js"
import { DBOfferSession } from "../../../../clients/database/db-models.js"

import { User } from "../api-models.js"
import {
  createErrorResponse,
  createResponse,
  createConflictErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import {
  serializeOfferSession,
  serializeOfferSessionStubOptimized,
} from "./serializers.js"
import { initiateOrder } from "../orders/helpers.js"
import { CounterOfferBody } from "./types.js"
import { verify_listings } from "../market/helpers.js"
import logger from "../../../../logger/logger.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import { discordService } from "../../../../services/discord/discord.service.js"
import { sendSystemMessage } from "../chats/helpers.js"
import * as chatDb from "../chats/database.js"
import {
  convert_offer_search_query,
  search_offer_sessions_optimized,
  mergeOfferSessions,
} from "./helpers.js"
import { is_member, has_permission } from "../util/permissions.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"
import { OfferMergeError } from "./errors.js"

export const offer_get_session_id: RequestHandler = async (req, res) => {
  res.json(createResponse(await serializeOfferSession(req.offer_session!)))
}

export const offer_put_session_id: RequestHandler = async (req, res) => {
  const session = req.offer_session!
  let status = req.body.status as
    | "accepted"
    | "rejected"
    | "counteroffered"
    | "cancelled"

  if (status === "cancelled") {
    status = "rejected"
  }

  const nameMap = new Map([
    ["accepted" as const, "Accepted" as const],
    ["rejected" as const, "Rejected" as const],
    ["cancelled" as const, "Rejected" as const],
    ["counteroffered" as const, "Counter-Offered" as const],
  ])

  if (["accepted", "rejected"].includes(status)) {
    const user = req.user as User
    await offerDb.updateOfferSession(session.id, { status: "closed" })
    await offerDb.updateOrderOffer(req.most_recent_offer!.id, {
      status,
    })

    // Send Discord embed
    await discordService.sendOfferStatusUpdate(
      session,
      nameMap.get(status)!,
      user,
    )

    // Send chat message
    try {
      const chat = await chatDb.getChat({ session_id: session.id })
      const actionBy = user ? ` by ${user.username}` : ""
      const content = `Offer status updated to **${nameMap.get(status)!}**${actionBy}`
      await sendSystemMessage(chat.chat_id, content, false)
    } catch (error) {
      logger.debug(
        `Failed to send offer status update chat message for session ${session.id}: ${error}`,
      )
    }

    if (status === "accepted") {
      const order = await initiateOrder(session)

      res.json(createResponse({ order_id: order.order_id }))
      return
    } else {
      res.json(createResponse({ result: "Success" }))
      return
    }
  } else {
    const user = req.user as User
    const customer = await profileDb.getUser({ user_id: session.customer_id })
    const body = req.body as CounterOfferBody

    const listings = await verify_listings(res, body.market_listings, customer)
    if (listings === undefined || listings === null) {
      return
    }

    if (body.service_id) {
      const service = await serviceDb.getService({
        service_id: body.service_id,
      })

      if (!service) {
        res
          .status(400)
          .json(
            createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid service"),
          )
        return
      }

      if (service.user_id && service.user_id !== session.assigned_id) {
        res
          .status(400)
          .json(
            createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid service"),
          )
        return
      }

      if (
        service.contractor_id &&
        service.contractor_id !== session.contractor_id
      ) {
        res
          .status(400)
          .json(
            createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid service"),
          )
        return
      }
    }

    // Determine if this is a seller counter offer or buyer counter offer
    // Seller is the one who receives the offer (contractor_id or assigned_id in session)
    // Buyer is the one who creates the offer (customer_id in session)
    // If the current user is the seller (has contractor_id or assigned_id matching), it's a seller counter offer
    const isSellerCounterOffer =
      (session.contractor_id &&
        (await has_permission(
          session.contractor_id,
          user.user_id,
          "manage_orders",
        ))) ||
      (session.assigned_id && session.assigned_id === user.user_id)

    // Only validate if buyer is making counter offer (not seller)
    // Seller counter offers can exceed limits to allow negotiation flexibility
    if (!isSellerCounterOffer) {
      const offerSize =
        listings?.reduce((sum, item) => sum + item.quantity, 0) || 0
      try {
        const { validateOrderLimits } = await import("../orders/helpers.js")
        await validateOrderLimits(
          session.contractor_id,
          session.assigned_id,
          offerSize,
          body.cost,
        )
      } catch (error) {
        res.status(400).json(
          createErrorResponse({
            message:
              error instanceof Error
                ? error.message
                : "Order does not meet size or value requirements",
            code: "ORDER_LIMIT_VIOLATION",
          }),
        )
        return
      }
    }

    const [offer] = await offerDb.createOrderOffer({
      session_id: session.id,
      actor_id: user.user_id,
      kind: body.kind,
      cost: body.cost,
      title: body.title,
      description: body.description,
      service_id: body.service_id || undefined,
      payment_type: body.payment_type as "one-time" | "hourly" | "daily",
    })

    if (listings.length) {
      await marketDb.insertOfferMarketListing(
        listings.map((l) => ({
          listing_id: l.listing.listing.listing_id,
          quantity: l.quantity,
          offer_id: offer.id,
        })),
      )
    }

    await offerDb.updateOrderOffer(req.most_recent_offer!.id, {
      status: "counteroffered",
    })

    try {
      const user = req.user as User
      await notificationService.createOfferNotification(session, "counteroffer")
      // Send Discord and chat message for counteroffer
      await discordService.sendOfferStatusUpdate(
        session,
        "Counter-Offered",
        user,
      )
      try {
        const chat = await chatDb.getChat({ session_id: session.id })
        const content = `Offer status updated to **Counter-Offered** by ${user.username}`
        await sendSystemMessage(chat.chat_id, content, false)
      } catch (error) {
        logger.debug(
          `Failed to send offer status update chat message for session ${session.id}: ${error}`,
        )
      }
    } catch (e) {
      logger.error("Error in offers operation", { error: e })
    }

    res.json(createResponse({ status: "Success" }))
    return
  }
}

export const post_session_id_thread: RequestHandler = async (req, res) => {
  if (req.offer_session!.thread_id) {
    res
      .status(409)
      .json(createConflictErrorResponse("Offer already has a thread!"))
    return
  }

  try {
    const result = await discordService.queueThreadCreation(req.offer_session!)
    if (result.status === "failed") {
      res
        .status(500)
        .json(
          createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, result.message),
        )
      return
    }

    // Thread creation is now queued asynchronously
    // The Discord bot will process the queue and create the thread
    // We'll update the thread_id later when we receive the response from the bot
    logger.info(
      `Thread creation queued successfully for offer session ${req.offer_session!.id}. Thread will be created asynchronously.`,
    )
  } catch (e) {
    logger.error("Failed to create thread", e)
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "An unknown error occurred",
        ),
      )
    return
  }
  res.status(201).json(
    createResponse({
      result: "Success",
    }),
  )
}

export const get_search: RequestHandler = async (req, res) => {
  const user = req.user as User
  const args = await convert_offer_search_query(req)
  if (!(args.contractor_id || args.assigned_id || args.customer_id)) {
    if (user.role !== "admin") {
      res
        .status(403)
        .json(createErrorResponse(ErrorCode.FORBIDDEN, "Missing permissions."))
      return
    }
  }

  if (args.contractor_id) {
    if (!(await is_member(args.contractor_id, user.user_id))) {
      res
        .status(403)
        .json(createErrorResponse(ErrorCode.FORBIDDEN, "Missing permissions."))
      return
    }
  }

  if (
    args.assigned_id &&
    args.assigned_id !== user.user_id &&
    !args.contractor_id
  ) {
    res.status(400).json(createErrorResponse("Missing permissions."))
    return
  }

  const result = await search_offer_sessions_optimized(args)

  res.json(
    createResponse({
      item_counts: result.item_counts,
      items: await Promise.all(
        result.items.map(serializeOfferSessionStubOptimized),
      ),
    }),
  )
  return
}

export const post_merge: RequestHandler = async (req, res) => {
  const user = req.user as User
  const { offer_session_ids } = req.body as { offer_session_ids: string[] }

  // Note: Basic validation is done in middleware, but we keep these checks
  // as a safety net in case middleware is not used
  if (!offer_session_ids || !Array.isArray(offer_session_ids)) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "offer_session_ids array is required",
        ),
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
    // Get the customer from the first offer session (all should have same customer)
    // The middleware has already validated the sessions and stored them in req
    const sessions = req.offer_sessions as DBOfferSession[]
    if (!sessions || sessions.length === 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Offer sessions not found in request",
        }),
      )
      return
    }

    const customer_id = sessions[0].customer_id
    const customer = await profileDb.getUser({ user_id: customer_id })

    const result = await mergeOfferSessions(
      offer_session_ids,
      customer_id,
      customer.username,
    )

    // Log the merge (actor is the contractor/seller performing the merge)
    await auditLogService.record({
      action: "offers.merged",
      actorId: user.user_id, // Contractor/seller performing the merge
      subjectType: "offer_session",
      subjectId: result.merged_session.id,
      metadata: {
        source_offer_session_ids: offer_session_ids,
        merged_offer_session_id: result.merged_session.id,
        merged_offer_id: result.merged_offer.id,
        customer_id: customer_id, // Customer who owns the offers
        customer_username: customer.username,
        merged_by_contractor: true,
        combined_cost: Number(result.merged_offer.cost),
        session_count: offer_session_ids.length,
      },
    })

    res.json(
      createResponse({
        result: "Success",
        merged_offer_session: await serializeOfferSession(
          result.merged_session,
        ),
        source_offer_session_ids: result.source_session_ids,
        message: `Successfully merged ${offer_session_ids.length} offer sessions into new merged offer`,
      }),
    )
  } catch (error) {
    logger.error("Error merging offer sessions", {
      error: error instanceof Error ? error.message : String(error),
      offer_session_ids,
      customer_id: user.user_id,
    })

    // Handle typed errors
    if (error instanceof OfferMergeError) {
      res.status(error.statusCode).json(
        createErrorResponse({
          message: error.message,
          code: error.code,
        }),
      )
      return
    }

    // Fallback for unexpected errors
    const errorMessage =
      error instanceof Error ? error.message : "Failed to merge offer sessions"
    res.status(500).json(createErrorResponse({ message: errorMessage }))
  }
}
