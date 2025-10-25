import { RequestHandler } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { User } from "../api-models.js"
import {
  acceptApplicant,
  convert_order_search_query,
  createOffer,
  getContractorOrderData,
  getContractorOrderMetrics,
  handleAssignedUpdate,
  handleStatusUpdate,
  is_related_to_order,
  search_orders_optimized,
} from "./helpers.js"
import { formatOrderStubOptimized } from "../util/formatting.js"
import { has_permission, is_member } from "../util/permissions.js"
import { DBOrder } from "../../../../clients/database/db-models.js"
import logger from "../../../../logger/logger.js"
import { serializeOrderDetails } from "./serializers.js"
import { createThread } from "../util/discord.js"

export const search_orders: RequestHandler = async (req, res) => {
  const user = req.user as User
  const args = await convert_order_search_query(req)
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

  if (args.assigned_id && args.assigned_id !== user.user_id) {
    if (!args.contractor_id) {
      res.status(400).json(createErrorResponse("Missing permissions."))
      return
    }
  }

  const result = await search_orders_optimized(args)
  res.json(
    createResponse({
      item_counts: result.item_counts,
      items: await Promise.all(result.items.map(formatOrderStubOptimized)),
    }),
  )
}

export const get_order_metrics: RequestHandler = async (req, res) => {
  const spectrum_id = req.params["spectrum_id"]
  const contractor = await database.getContractor({
    spectrum_id: spectrum_id,
  })
  if (!contractor) {
    res.status(404).json(createErrorResponse({ message: "Invalid contractor" }))
    return
  }

  const user = req.user as User
  const contractors = await database.getUserContractors({
    "contractor_members.user_id": user.user_id,
  })

  if (
    contractors.filter((c) => c.contractor_id === contractor.contractor_id)
      .length === 0
  ) {
    res.status(403).json(
      createErrorResponse({
        message: "You are not authorized to view these metrics",
      }),
    )
    return
  }

  // Get contractor order metrics using optimized query
  const metrics = await getContractorOrderMetrics(contractor.contractor_id)

  res.json(createResponse(metrics))
}

export const get_contractor_order_data: RequestHandler = async (req, res) => {
  const { include_trends, assigned_only } = req.query
  const contractor = req.contractor!

  // Parse query parameters
  const includeTrends =
    include_trends === "true" || include_trends === undefined
  const assignedOnly = assigned_only === "true"

  // Get comprehensive contractor order data
  const data = await getContractorOrderData(contractor.contractor_id, {
    include_trends: includeTrends,
    assigned_only: assignedOnly,
  })

  res.json(createResponse(data))
}

export const update_order: RequestHandler = async (req, res) => {
  const {
    status,
    assigned_to,
    contractor,
  }: {
    status?: string
    assigned_to?: string
    contractor?: string
    applied?: boolean
  } = req.body

  if (status) {
    await handleStatusUpdate(req, res, status)
  }

  if (assigned_to !== undefined || contractor !== undefined) {
    await handleAssignedUpdate(req, res)
  }
}

export const apply_to_order: RequestHandler = async (req, res, next) => {
  const order_id = req.params["order_id"]
  let order: DBOrder
  try {
    order = await database.getOrder({ order_id: order_id })
  } catch (e) {
    res.status(400).json(createErrorResponse({ message: "Invalid order" }))
    return
  }
  const user = req.user as User

  if (order.assigned_id || order.contractor_id) {
    res
      .status(409)
      .json(createErrorResponse({ message: "Order is already assigned" }))
    return
  }

  const {
    contractor,
    message,
  }: {
    contractor?: string
    message?: string
  } = req.body

  if (!contractor) {
    const apps = await database.getOrderApplicants({
      user_applicant_id: user.user_id,
      order_id: order.order_id,
    })
    if (apps.length > 0) {
      res.status(409).json(
        createErrorResponse({
          message: "You have already applied to this order",
        }),
      )
      return
    }

    await database.createOrderApplication({
      order_id: order.order_id,
      user_applicant_id: user.user_id,
      message: message || "",
    })
  } else {
    let contractor_obj
    try {
      contractor_obj = await database.getContractor({
        spectrum_id: contractor,
      })
    } catch {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid contractor" }))
      return
    }

    if (
      !(await has_permission(
        contractor_obj.contractor_id,
        user.user_id,
        "manage_orders",
      ))
    ) {
      res.status(403).json(
        createErrorResponse({
          message: "You are not authorized to apply to this order",
        }),
      )
      return
    }

    const apps = await database.getOrderApplicants({
      org_applicant_id: contractor_obj.contractor_id,
      order_id: order.order_id,
    })
    if (apps.length > 0) {
      res.status(409).json(
        createErrorResponse({
          message: "You have already applied to this order",
        }),
      )
      return
    }

    await database.createOrderApplication({
      order_id: order.order_id,
      org_applicant_id: contractor_obj.contractor_id,
      message: message || "",
    })
  }

  // TODO: Submit the application
  res.status(201).json(createResponse({ result: "Success" }))
}

export const accept_contractor_applicant: RequestHandler = async (
  req,
  res,
  next,
) => {
  const { spectrum_id } = req.params

  await acceptApplicant(req, res, { target_contractor: spectrum_id })
  // TODO: Make apps into their own objects
}

export const accept_user_applicant: RequestHandler = async (req, res, next) => {
  const { username } = req.params

  await acceptApplicant(req, res, { target_username: username })
}

export const post_root: RequestHandler = async (req, res, next) => {
  const user = req.user as User // TODO: Handle order service

  const {
    kind,
    description,
    cost,
    title,
    contractor,
    assigned_to,
    collateral,
    payment_type,
    service_id,
  }: {
    kind: string
    cost: string
    title: string
    description: string
    contractor: string | null
    assigned_to: string | null
    rush: boolean
    departure: string | null
    destination: string | null
    collateral: number
    service_id?: string
    payment_type: string
  } = req.body

  let contractor_id
  if (contractor) {
    const contractor_obj = await database.getContractor({
      spectrum_id: contractor,
    })
    if (!contractor_obj) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid contractor" }))
      return
    }
    contractor_id = contractor_obj.contractor_id
  } else {
    contractor_id = null
  }

  let assigned_user
  if (assigned_to) {
    assigned_user = await database.getUser({ username: assigned_to })
    if (!assigned_user) {
      res.status(400).json(createErrorResponse({ message: "Invalid assignee" }))
      return
    }

    if (contractor_id) {
      const role = await database.getContractorRoleLegacy(
        assigned_user.user_id,
        contractor_id,
      )
      if (!role) {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid assignee" }))
        return
      }
    }
  } else {
    assigned_user = null
  }

  // Check if customer is blocked by contractor or assigned user
  const isBlocked = await database.checkIfBlockedForOrder(
    user.user_id,
    contractor_id,
    assigned_user?.user_id || null,
  )
  if (isBlocked) {
    res.status(403).json(
      createErrorResponse({
        message:
          "You are blocked from creating orders with this contractor or user",
      }),
    )
    return
  }

  // TODO: Allow for public contracts again
  const { session, discord_invite } = await createOffer(
    {
      assigned_id: assigned_user?.user_id,
      contractor_id: contractor_id,
      customer_id: user.user_id,
    },
    {
      actor_id: user.user_id,
      kind: kind,
      description: description,
      cost: cost,
      title: title,
      // rush: rush || false,
      // TODO: Departure / destination
      // departure: departure,
      // destination: destination,
      collateral: collateral || 0,
      service_id,
      payment_type: payment_type as "one-time" | "hourly" | "daily",
    },
  )

  res.status(201).json(
    createResponse({
      discord_invite: discord_invite,
      session_id: session.id,
    }),
  )
}

export const get_order_id: RequestHandler = async (req, res) => {
  try {
    const order_id = req.params["order_id"]
    let order: DBOrder
    try {
      order = await database.getOrder({ order_id: order_id })
    } catch (e) {
      res.status(404).json(createErrorResponse({ message: "Invalid order" }))
      return
    }
    const user = req.user as User | null | undefined

    if (user) {
      const unrelated = !(await is_related_to_order(order, user))

      if (unrelated) {
        res.status(403).json(
          createErrorResponse({
            message: "You are not authorized to view this order",
          }),
        )
        return
      }
    }

    if (!user) {
      res.status(403).json(
        createErrorResponse({
          message: "You are not authorized to view this order",
        }),
      )
      return
    }

    // TODO: Factor order details into another function
    res.json(
      createResponse(
        await serializeOrderDetails(order, null, true, true, true),
      ),
    )
  } catch (e) {
    logger.error(e)
  }
}

export const post_order_id_thread: RequestHandler = async (req, res) => {
  if (req.order!.thread_id) {
    res
      .status(409)
      .json(createErrorResponse({ message: "Order already has a thread!" }))
    return
  }

  try {
    const bot_response = await createThread(req.order!)
    if (bot_response.result.failed) {
      logger.error("Failed to create thread", bot_response)
      res.status(500).json({ message: bot_response.result.message })
      return
    }

    // Thread creation is now queued asynchronously
    // The Discord bot will process the queue and create the thread
    // We'll update the thread_id later when we receive the response from the bot
    logger.info(
      `Thread creation queued successfully for order ${req.order!.order_id}. Thread will be created asynchronously.`,
    )
  } catch (e) {
    logger.error("Failed to create thread", e)
    res.status(500).json({ message: "An unknown error occurred" })
    return
  }
  res.status(201).json(
    createResponse({
      result: "Success",
    }),
  )
}
