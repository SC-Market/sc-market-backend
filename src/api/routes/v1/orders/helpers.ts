import {
  DBAggregateListingComplete,
  DBContractor,
  DBMultipleListingCompositeComplete,
  DBOffer,
  DBOfferSession,
  DBOrder,
  DBUniqueListingComplete,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  createOrderAssignedNotification,
  createOrderNotifications,
  createOrderStatusNotification,
  dispatchOfferNotifications,
} from "../util/notifications.js"
import {
  assignToThread,
  createOfferThread,
  manageOrderAssignedDiscord,
  manageOrderStatusUpdateDiscord,
  rename_offer_thread,
} from "../util/discord.js"
import { User } from "../api-models.js"
import { sendSystemMessage } from "../chats/helpers.js"
import { has_permission } from "../util/permissions.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import logger from "../../../../logger/logger.js"
import { Request } from "express"
import {
  OrderSearchQuery,
  OrderSearchQueryArguments,
  OrderSearchSortMethod,
  OrderSearchStatus,
} from "./types.js"

export const orderTypes = [
  "Escort",
  "Transport",
  "Construction",
  "Support",
  "Resource Acquisition",
  "Rental",
  "Custom",
  "Delivery",
  "Medical",
  "Intelligence Services",
]

export const paymentTypes = [
  "one-time",
  "hourly",
  "daily",
  "unit",
  "box",
  "scu",
  "cscu",
  "mscu",
]

export async function initiateOrder(session: DBOfferSession) {
  const most_recent = await database.getMostRecentOrderOffer(session.id)

  const [order] = await database.createOrder({
    kind: most_recent.kind,
    cost: most_recent.cost,
    title: most_recent.title,
    description: most_recent.description,
    assigned_id: session.assigned_id,
    customer_id: session.customer_id,
    contractor_id: session.contractor_id,
    collateral: most_recent.collateral,
    service_id: most_recent.service_id,
    rush: false,
    payment_type: most_recent.payment_type,
    thread_id: session.thread_id,
    offer_session_id: session.id,
  })

  try {
    const chat = await database.getChat({ session_id: session.id })

    await database.updateChat(
      { chat_id: chat.chat_id },
      { order_id: order.order_id },
    )
  } catch {
    await database.insertChat([], order.order_id, session.id)
  }

  try {
    await createOrderNotifications(order)
  } catch (e) {}

  const market_listings = await database.getOfferMarketListings(most_recent.id)
  for (const { quantity, listing_id } of market_listings) {
    await database.insertMarketListingOrder({
      listing_id,
      order_id: order.order_id,
      quantity,
    })

    const listing = await database.getMarketListing({ listing_id })

    await database.updateMarketListing(listing_id, {
      quantity_available: listing.quantity_available - quantity,
    })
  }

  try {
    await rename_offer_thread(session, order)
  } catch (e) {
    logger.error(`Failed to rename thread: ${e}`)
  }

  return { ...order }
}

export async function createOffer(
  session_details: Partial<DBOfferSession>,
  offer_details: Partial<DBOffer> & { actor_id: string },
  market_listings: {
    quantity: number
    listing:
      | DBAggregateListingComplete
      | DBUniqueListingComplete
      | DBMultipleListingCompositeComplete
  }[] = [],
) {
  const [session] = await database.createOrderOfferSession(session_details)

  const [offer] = await database.createOrderOffer({
    ...offer_details,
    session_id: session.id,
  })

  try {
    // TODO
    await dispatchOfferNotifications(session, "create")
  } catch (e) {
    logger.error(`Failed to dispatch offer notifications: ${e}`)
  }

  let invite_code = null
  if (session.contractor_id || session.assigned_id) {
    try {
      const bot_response = await createOfferThread(session)
      invite_code = bot_response.result.invite_code
      await database.updateOfferSession(session.id, {
        thread_id: bot_response.result.thread?.thread_id || null,
      })
      session.thread_id = bot_response.result.thread?.thread_id || null
    } catch (e) {
      logger.error(`Failed to create thread ${e}`)
    }
  }

  // Modifiable
  for (const { quantity, listing } of market_listings) {
    await database.insertOfferMarketListing({
      listing_id: listing.listing.listing_id,
      offer_id: offer.id,
      quantity,
    })
  }

  await database.insertChat([], undefined, session.id)

  // Offer counteroffer model
  return { offer, session, discord_invite: invite_code }
}

export async function cancelOrderMarketItems(order: DBOrder) {
  const marketOrders = await database.getMarketListingOrders({
    order_id: order.order_id,
  })
  for (const marketOrder of marketOrders) {
    const listing = await database.getMarketListing({
      listing_id: marketOrder.listing_id,
    })
    await database.updateMarketListing(marketOrder.listing_id, {
      quantity_available: listing.quantity_available + marketOrder.quantity,
    })
  }
}

export async function is_related_to_order(order: DBOrder, user: User) {
  const contractors = await database.getUserContractors({
    "contractor_members.user_id": user.user_id,
  })

  return (
    order.customer_id === user.user_id || // not the customer
    contractors.filter((c) => c.contractor_id === order.contractor_id).length >=
      1 || // not the contractor
    order.assigned_id === user.user_id || // not assigned
    ["admin"].includes(user.role)
  ) // Not a site admin
}

export async function sendStatusUpdateMessage(order: DBOrder, status: string) {
  try {
    const chat = await database.getChat({ order_id: order.order_id })
    const content = `Order status has been updated to ${status} from ${order.status}`
    await sendSystemMessage(chat.chat_id, content, false)
  } catch (e) {
    logger.error(`Failed to send status update message: ${e}`)
  }
}

export async function handleStatusUpdate(req: any, res: any, status: string) {
  const order = req.order as DBOrder
  const user = req.user as User
  try {
    if (
      !["fulfilled", "in-progress", "not-started", "cancelled"].includes(status)
    ) {
      return res
        .status(400)
        .json(createErrorResponse({ message: "Invalid status!" }))
    }

    if (
      user.role !== "admin" &&
      (order.status.includes("cancelled") || order.status.includes("fulfilled"))
    ) {
      res.status(400).json(
        createErrorResponse({
          message: "Cannot change status for closed order",
        }),
      )
      return
    }

    if (!order.contractor_id) {
      if (
        ["fulfilled", "in-progress", "not-started"].includes(status) &&
        order.assigned_id !== user.user_id &&
        user.role !== "admin"
      ) {
        res.status(403).json(
          createErrorResponse({
            message: `Only the assigned user may set the status of this order to ${status}`,
          }),
        )
        return
      }
    } else {
      const orgAdmin = await has_permission(
        order.contractor_id,
        req.user.user_id,
        "manage_orders",
      )
      if (
        ["fulfilled", "in-progress", "not-started"].includes(status) &&
        !order.assigned_id &&
        !orgAdmin
      ) {
        return res
          .status(400)
          .json(createErrorResponse({ message: "Invalid status!" }))
      }
    }

    if (status === "cancelled") {
      await cancelOrderMarketItems(order)
    }

    if (status === "in-progress") {
      await database.updateOrder(order.order_id, {
        status,
        assigned_id: req.user.user_id,
      })
      await assignToThread(order, req.user)
    } else {
      await database.updateOrder(order.order_id, { status: status })
    }
    await createOrderStatusNotification(order, status, req.user.user_id)
    await manageOrderStatusUpdateDiscord(order, status)
    await sendStatusUpdateMessage(order, status)

    res.status(200).json(createResponse({ result: "Success" }))
  } catch (e) {
    logger.error(`Failed to update order status: ${e}`)
  }
}

export async function handleAssignedUpdate(req: any, res: any) {
  if (!req.order.contractor_id) {
    return res
      .status(400)
      .json(createErrorResponse({ message: "This order cannot be assigned" }))
  }

  const {
    assigned_to: targetUser,
  }: {
    assigned_to?: string
  } = req.body

  // Contractor order
  const contractorObj = await database.getContractor({
    contractor_id: req.order.contractor_id,
  })

  if (
    !(await has_permission(
      contractorObj.contractor_id,
      req.user.user_id,
      "manage_orders",
    ))
  ) {
    res.status(403).json(
      createErrorResponse({
        message: "No permission to assign this order",
      }),
    )
    return
  }

  if (targetUser) {
    let targetUserObj
    try {
      targetUserObj = await database.getUser({ username: targetUser })
    } catch {
      res.status(400).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const targetUserRole = await database.getContractorRoleLegacy(
      req.user.user_id,
      contractorObj.contractor_id,
    )
    if (!targetUserRole) {
      return res
        .status(400)
        .json(createErrorResponse({ message: "Invalid user!" }))
    }

    const newOrders = await database.updateOrder(req.order.order_id, {
      assigned_id: targetUserObj?.user_id || undefined,
    })

    await createOrderAssignedNotification(newOrders[0])
    await manageOrderAssignedDiscord(newOrders[0], targetUserObj)
  } else {
    await database.updateOrder(req.order.order_id, {
      assigned_id: null,
    })
  }
  res.status(200).json(createResponse({ result: "Success" }))
}

export async function acceptApplicant(
  req: any,
  res: any,
  arg: { target_contractor?: string; target_username?: string },
) {
  const { target_contractor, target_username } = arg

  if (req.user.user_id !== req.order.customer_id) {
    res.status(403).json(
      createErrorResponse({
        message: "You are not authorized to assign this order",
      }),
    )
    return
  }

  if (req.order.contractor_id || req.order.assigned_id) {
    res.status(400).json(
      createErrorResponse({
        message: "This order is already assigned",
      }),
    )
    return
  }

  let targetContractorObj: undefined | null | DBContractor
  let targetUserObj: undefined | null | User
  if (target_contractor) {
    try {
      targetContractorObj = await database.getContractor({
        spectrum_id: target_contractor,
      })
    } catch {
      return res
        .status(400)
        .json(createErrorResponse({ message: "Invalid contractor" }))
    }
  } else if (target_username) {
    try {
      targetUserObj = await database.getUser({ username: target_username })
    } catch {
      return res
        .status(400)
        .json(createErrorResponse({ message: "Invalid user" }))
    }
  } else {
    return res
      .status(400)
      .json(createErrorResponse({ message: "Invalid target" }))
  }

  const applicants = await database.getOrderApplicants({
    order_id: req.order.order_id,
  })
  if (
    !applicants.find(
      (app) =>
        app.org_applicant_id === targetContractorObj?.contractor_id ||
        app.user_applicant_id === targetUserObj?.user_id,
    )
  ) {
    res.status(400).json(
      createErrorResponse({
        message: "The target has not applied to this order",
      }),
    )
    return
  }

  const newOrders = await database.updateOrder(req.order.order_id, {
    assigned_id: targetUserObj?.user_id || undefined,
    contractor_id: targetContractorObj?.contractor_id || undefined,
  })

  await database.clearOrderApplications(req.order.order_id)
  await createOrderNotifications(newOrders[0])

  res.status(201).json(createResponse({ result: "Success" }))
}

export async function convert_order_search_query(
  req: Request,
): Promise<OrderSearchQueryArguments> {
  const query = req.query as OrderSearchQuery

  const customer = query.customer ? req.users!.get("customer") : null
  const assigned = query.assigned ? req.users!.get("assigned") : null
  const contractor = query.contractor
    ? req.contractors!.get("contractor")
    : null

  return {
    assigned_id: assigned?.user_id || undefined,
    contractor_id: contractor?.contractor_id || undefined,
    customer_id: customer?.user_id || undefined,
    index: +(query.index || 0),
    page_size: +((query.page_size as string) || 5),
    sort_method: (query.sort_method as OrderSearchSortMethod) || "timestamp",
    status: (query.status as OrderSearchStatus) || undefined,
    reverse_sort: query.reverse_sort == "true",
  }
}

export async function search_orders(
  args: OrderSearchQueryArguments,
): Promise<{ item_counts: { [k: string]: number }; items: DBOrder[] }> {
  let base = database.knex("orders").where((qd) => {
    if (args.customer_id) qd = qd.where("customer_id", args.customer_id)
    if (args.assigned_id) qd = qd.where("assigned_id", args.assigned_id)
    if (args.contractor_id) qd = qd.where("contractor_id", args.contractor_id)
    return qd
  })

  const totals = await base
    .clone()
    .groupByRaw("status")
    .select("status", database.knex.raw("COUNT(*) as count"))

  const item_counts = Object.fromEntries(
    totals.map(({ status, count }) => [status, +count]),
  )

  if (args.status) {
    base = base.andWhere((qb) => {
      if (args.status === "past") {
        return qb.whereRaw("status = ANY(?)", [["fulfilled", "cancelled"]])
      }

      if (args.status === "active") {
        return qb.whereRaw("status = ANY(?)", [["in-progress", "not-started"]])
      }

      return qb.where("status", args.status)
    })
  }

  switch (args.sort_method) {
    case "timestamp":
    case "status":
    case "title":
      base = base.orderBy(args.sort_method, args.reverse_sort ? "desc" : "asc")
      break
    case "customer_name":
      base = base
        .leftJoin("accounts", "orders.customer_id", "=", "accounts.user_id")
        .orderBy("accounts.username", args.reverse_sort ? "desc" : "asc")
      break
    case "contractor_name":
      base = base
        .leftJoin("accounts", "orders.customer_id", "=", "accounts.user_id")
        .leftJoin(
          "contractors",
          "orders.contractor_id",
          "=",
          "accounts.user_id",
        )
        .orderByRaw(
          `COALESCE(accounts.username, contractors.name) ${args.reverse_sort ? "desc" : "asc"}`,
        )
      break
  }

  const items = await base
    .limit(args.page_size)
    .offset(args.page_size * args.index)
    .select("*", database.knex.raw("count(*) OVER() AS full_count"))

  return { item_counts, items }
}
