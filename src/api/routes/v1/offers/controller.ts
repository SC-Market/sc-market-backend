import { RequestHandler } from "express"
import { database } from "../../../../clients/database/knex-db.js"

import { User } from "../api-models.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import {
  serializeOfferSession,
  serializeOfferSessionStubOptimized,
} from "./serializers.js"
import {
  dispatchOfferNotifications,
  sendOfferStatusNotification,
} from "../util/notifications.js"
import { initiateOrder } from "../orders/helpers.js"
import { CounterOfferBody } from "./types.js"
import { verify_listings } from "../market/helpers.js"
import logger from "../../../../logger/logger.js"
import { createThread } from "../util/discord.js"
import {
  convert_offer_search_query,
  search_offer_sessions_optimized,
} from "./helpers.js"
import { is_member } from "../util/permissions.js"

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
    await database.updateOfferSession(session.id, { status: "closed" })
    await database.updateOrderOffer(req.most_recent_offer!.id, {
      status,
    })

    await sendOfferStatusNotification(session, nameMap.get(status)!, user)

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
    const customer = await database.getUser({ user_id: session.customer_id })
    const body = req.body as CounterOfferBody

    const listings = await verify_listings(res, body.market_listings, customer)
    if (listings === undefined) {
      return
    }

    if (body.service_id) {
      const service = await database.getService({
        service_id: body.service_id,
      })

      if (!service) {
        res.status(400).json(createErrorResponse({ error: "Invalid service" }))
        return
      }

      if (service.user_id && service.user_id !== session.assigned_id) {
        res.status(400).json(createErrorResponse({ error: "Invalid service" }))
        return
      }

      if (
        service.contractor_id &&
        service.contractor_id !== session.contractor_id
      ) {
        res.status(400).json(createErrorResponse({ error: "Invalid service" }))
        return
      }
    }

    const [offer] = await database.createOrderOffer({
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
      await database.insertOfferMarketListing(
        listings.map((l) => ({
          listing_id: l.listing.listing.listing_id,
          quantity: l.quantity,
          offer_id: offer.id,
        })),
      )
    }

    await database.updateOrderOffer(req.most_recent_offer!.id, {
      status: "counteroffered",
    })

    try {
      const user = req.user as User
      await dispatchOfferNotifications(session, "counteroffer", user)
    } catch (e) {
      console.error(e)
    }

    res.json(createResponse({ status: "Success" }))
    return
  }
}

export const post_session_id_thread: RequestHandler = async (req, res) => {
  if (req.offer_session!.thread_id) {
    res
      .status(409)
      .json(createErrorResponse({ message: "Offer already has a thread!" }))
    return
  }

  try {
    const bot_response = await createThread(req.offer_session!)
    if (bot_response.result.failed) {
      res
        .status(500)
        .json(createErrorResponse({ message: bot_response.result.message }))
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
      .json(createErrorResponse({ message: "An unknown error occurred" }))
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
      res.status(400).json(createErrorResponse("Missing permissions."))
      return
    }
  }

  if (args.contractor_id) {
    if (!(await is_member(args.contractor_id, user.user_id))) {
      res.status(400).json(createErrorResponse("Missing permissions."))
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
