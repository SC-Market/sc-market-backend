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

  // Create chat first before dispatching notifications
  await database.insertChat([], undefined, session.id)

  // Modifiable
  for (const { quantity, listing } of market_listings) {
    await database.insertOfferMarketListing({
      listing_id: listing.listing.listing_id,
      offer_id: offer.id,
      quantity,
    })
  }

  try {
    // TODO
    await dispatchOfferNotifications(session, "create")
  } catch (e) {
    logger.error(`Failed to dispatch offer notifications: ${e}`)
  }

  // Create Discord invite directly for immediate user redirection
  let discord_invite: string | null = null
  if (session.contractor_id || session.assigned_id) {
    try {
      const contractor = session.contractor_id
        ? await database.getContractor({ contractor_id: session.contractor_id })
        : null
      const assigned = session.assigned_id
        ? await database.getUser({ user_id: session.assigned_id })
        : null

      const channel_id = contractor
        ? contractor?.discord_thread_channel_id
        : assigned?.discord_thread_channel_id

      if (channel_id) {
        const { createDiscordInvite } = await import("../util/discord.js")
        discord_invite = await createDiscordInvite(channel_id)
        if (discord_invite) {
          logger.info(
            `Created Discord invite for session ${session.id}: ${discord_invite}`,
          )
        } else {
          logger.warn(
            `Failed to create Discord invite for session ${session.id}`,
          )
        }
      } else {
        logger.debug(`No Discord channel configured for session ${session.id}`)
      }
    } catch (e) {
      logger.error(
        `Failed to create Discord invite for session ${session.id}: ${e}`,
      )
    }

    // Still queue thread creation for Discord bot (but without invite creation)
    try {
      const bot_response = await createOfferThread(session)

      if (bot_response.result.failed) {
        logger.debug(
          `Discord thread creation failed for session ${session.id}: ${bot_response.result.message}`,
        )
      } else {
        logger.info(
          `Discord thread creation queued successfully for session ${session.id}. Thread will be created asynchronously.`,
        )
      }
    } catch (e) {
      logger.error(
        `Failed to create Discord thread for session ${session.id}: ${e}`,
      )
    }
  }

  // Return the offer with the Discord invite for immediate user redirection
  return { offer, session, discord_invite }
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
      
      // Track order response for responsive badge
      await database.trackOrderResponse(
        order.order_id,
        order.assigned_id || undefined,
        order.contractor_id || undefined
      )
      
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

  // Track order assignment for responsive badge
  await database.trackOrderAssignment(
    req.order.order_id,
    targetUserObj?.user_id,
    targetContractorObj?.contractor_id
  )

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

// Type for the optimized query result with all joined data
interface OptimizedOrderRow {
  // Order fields
  order_id: string
  customer_id: string
  assigned_id: string | null
  contractor_id: string | null
  status: string
  timestamp: Date
  title: string
  kind: string
  cost: number
  payment_type: string
  service_id: string | null
  
  // Item count
  item_count: number
  
  // Service fields
  service_title: string | null
  
  // Customer account fields
  customer_username: string
  customer_avatar: string
  customer_display_name: string
  
  // Assigned account fields
  assigned_username: string | null
  assigned_avatar: string | null
  assigned_display_name: string | null
  
  // Contractor fields
  contractor_spectrum_id: string | null
  contractor_name: string | null
  contractor_avatar: string | null
}

// Optimized version that includes all related data in a single query
export async function search_orders_optimized(
  args: OrderSearchQueryArguments,
): Promise<{
  items: OptimizedOrderRow[]
  item_counts: { [k: string]: number }
}> {
  let base = database.knex("orders").where((qd) => {
    if (args.customer_id) qd = qd.where("customer_id", args.customer_id)
    if (args.assigned_id) qd = qd.where("assigned_id", args.assigned_id)
    if (args.contractor_id) qd = qd.where("contractor_id", args.contractor_id)
    return qd
  })

  // Get totals (same as before)
  const totals = await base
    .clone()
    .groupByRaw("status")
    .select("status", database.knex.raw("COUNT(*) as count"))

  const item_counts = Object.fromEntries(
    totals.map(({ status, count }) => [status, +count]),
  )

  // Build optimized query with JOINs to get all related data
  let optimizedQuery = database.knex("orders")
    .leftJoin("market_orders", "orders.order_id", "=", "market_orders.order_id")
    .leftJoin("services", "orders.service_id", "=", "services.service_id")
    .leftJoin("accounts as customer_account", "orders.customer_id", "=", "customer_account.user_id")
    .leftJoin("accounts as assigned_account", "orders.assigned_id", "=", "assigned_account.user_id")
    .leftJoin("contractors", "orders.contractor_id", "=", "contractors.contractor_id")
    .where((qd) => {
      if (args.customer_id) qd = qd.where("orders.customer_id", args.customer_id)
      if (args.assigned_id) qd = qd.where("orders.assigned_id", args.assigned_id)
      if (args.contractor_id) qd = qd.where("orders.contractor_id", args.contractor_id)
      return qd
    })

  // Apply status filter
  if (args.status) {
    optimizedQuery = optimizedQuery.andWhere((qb) => {
      if (args.status === "past") {
        return qb.whereRaw("orders.status = ANY(?)", [["fulfilled", "cancelled"]])
      }

      if (args.status === "active") {
        return qb.whereRaw("orders.status = ANY(?)", [["in-progress", "not-started"]])
      }

      return qb.where("orders.status", args.status)
    })
  }

  // Apply sorting
  switch (args.sort_method) {
    case "timestamp":
    case "status":
    case "title":
      optimizedQuery = optimizedQuery.orderBy(`orders.${args.sort_method}`, args.reverse_sort ? "desc" : "asc")
      break
    case "customer_name":
      optimizedQuery = optimizedQuery.orderBy("customer_account.username", args.reverse_sort ? "desc" : "asc")
      break
    case "contractor_name":
      optimizedQuery = optimizedQuery.orderByRaw(
        `COALESCE(customer_account.username, contractors.name) ${args.reverse_sort ? "desc" : "asc"}`,
      )
      break
  }

  // Execute query with all related data
  const items = await optimizedQuery
    .limit(args.page_size)
    .offset(args.page_size * args.index)
    .select(
      "orders.*",
      database.knex.raw("COUNT(market_orders.order_id) as item_count"),
      "services.title as service_title",
      "customer_account.username as customer_username",
      "customer_account.avatar as customer_avatar",
      "customer_account.display_name as customer_display_name",
      "assigned_account.username as assigned_username",
      "assigned_account.avatar as assigned_avatar",
      "assigned_account.display_name as assigned_display_name",
      "contractors.spectrum_id as contractor_spectrum_id",
      "contractors.name as contractor_name",
      "contractors.avatar as contractor_avatar"
    )
    .groupBy(
      "orders.order_id",
      "services.service_id",
      "customer_account.user_id",
      "assigned_account.user_id",
      "contractors.contractor_id"
    )

  return { item_counts, items }
}

// Interface for contractor order metrics
interface ContractorOrderMetrics {
  total_orders: number
  total_value: number
  active_value: number  // Sum of costs for active orders (not-started + in-progress)
  completed_value: number  // Sum of costs for fulfilled orders
  status_counts: {
    "not-started": number
    "in-progress": number
    "fulfilled": number
    "cancelled": number
  }
  recent_activity: {
    orders_last_7_days: number
    orders_last_30_days: number
    value_last_7_days: number
    value_last_30_days: number
  }
  top_customers: Array<{
    username: string
    order_count: number
    total_value: number
  }>
}

// Get contractor order metrics using optimized queries
export async function getContractorOrderMetrics(contractor_id: string): Promise<ContractorOrderMetrics> {
  // Get basic counts and totals
  const basicStats = await database.knex("orders")
    .where({ contractor_id })
    .select(
      database.knex.raw("COUNT(*) as total_orders"),
      database.knex.raw("COALESCE(SUM(cost), 0) as total_value"),
      database.knex.raw("COALESCE(SUM(CASE WHEN status IN ('not-started', 'in-progress') THEN cost ELSE 0 END), 0) as active_value"),
      database.knex.raw("COALESCE(SUM(CASE WHEN status = 'fulfilled' THEN cost ELSE 0 END), 0) as completed_value")
    )
    .first()

  // Get status counts
  const statusCounts = await database.knex("orders")
    .where({ contractor_id })
    .groupBy("status")
    .select("status", database.knex.raw("COUNT(*) as count"))

  const status_counts = {
    "not-started": 0,
    "in-progress": 0,
    "fulfilled": 0,
    "cancelled": 0,
  }

  statusCounts.forEach(({ status, count }) => {
    if (status in status_counts) {
      status_counts[status as keyof typeof status_counts] = +count
    }
  })

  // Get recent activity (last 7 and 30 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const recentActivity = await database.knex("orders")
    .where({ contractor_id })
    .select(
      database.knex.raw("COUNT(CASE WHEN timestamp >= ? THEN 1 END) as orders_last_7_days", [sevenDaysAgo]),
      database.knex.raw("COUNT(CASE WHEN timestamp >= ? THEN 1 END) as orders_last_30_days", [thirtyDaysAgo]),
      database.knex.raw("COALESCE(SUM(CASE WHEN timestamp >= ? THEN cost ELSE 0 END), 0) as value_last_7_days", [sevenDaysAgo]),
      database.knex.raw("COALESCE(SUM(CASE WHEN timestamp >= ? THEN cost ELSE 0 END), 0) as value_last_30_days", [thirtyDaysAgo])
    )
    .first()

  // Get top customers
  const topCustomers = await database.knex("orders")
    .join("accounts", "orders.customer_id", "=", "accounts.user_id")
    .where({ contractor_id })
    .groupBy("orders.customer_id", "accounts.username")
    .select(
      "accounts.username",
      database.knex.raw("COUNT(*) as order_count"),
      database.knex.raw("COALESCE(SUM(orders.cost), 0) as total_value")
    )
    .orderBy("order_count", "desc")
    .limit(10)

  return {
    total_orders: +basicStats.total_orders,
    total_value: +basicStats.total_value,
    active_value: +basicStats.active_value,
    completed_value: +basicStats.completed_value,
    status_counts,
    recent_activity: {
      orders_last_7_days: +recentActivity.orders_last_7_days,
      orders_last_30_days: +recentActivity.orders_last_30_days,
      value_last_7_days: +recentActivity.value_last_7_days,
      value_last_30_days: +recentActivity.value_last_30_days,
    },
    top_customers: topCustomers.map(customer => ({
      username: customer.username,
      order_count: +customer.order_count,
      total_value: +customer.total_value,
    })),
  }
}

// Interface for comprehensive contractor order data
interface ContractorOrderData {
  metrics: ContractorOrderMetrics & {
    trend_data?: {
      daily_orders: Array<{ date: string; count: number }>
      daily_value: Array<{ date: string; value: number }>
      status_trends: {
        "not-started": Array<{ date: string; count: number }>
        "in-progress": Array<{ date: string; count: number }>
        "fulfilled": Array<{ date: string; count: number }>
        "cancelled": Array<{ date: string; count: number }>
      }
    }
  }
  recent_orders?: Array<{
    order_id: string
    timestamp: string
    status: string
    cost: number
    title: string
  }>
}

// Get comprehensive contractor order data including metrics and trend data
export async function getContractorOrderData(
  contractor_id: string, 
  options: { include_trends?: boolean; assigned_only?: boolean } = {}
): Promise<ContractorOrderData> {
  const { include_trends = true, assigned_only = false } = options

  // Get basic metrics
  const metrics = await getContractorOrderMetrics(contractor_id)

  let trend_data = undefined
  let recent_orders = undefined

  // Get trend data if requested
  if (include_trends) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    
    // Get daily order counts
    const dailyOrders = await database.knex("orders")
      .where({ contractor_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COUNT(*) as count")
      )
      .groupBy(database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Get daily order values
    const dailyValue = await database.knex("orders")
      .where({ contractor_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COALESCE(SUM(cost), 0) as value")
      )
      .groupBy(database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Get status trends
    const statusTrends = await database.knex("orders")
      .where({ contractor_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        "status",
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COUNT(*) as count")
      )
      .groupBy("status", database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Organize status trends by status
    const status_trends = {
      "not-started": [] as Array<{ date: string; count: number }>,
      "in-progress": [] as Array<{ date: string; count: number }>,
      "fulfilled": [] as Array<{ date: string; count: number }>,
      "cancelled": [] as Array<{ date: string; count: number }>,
    }

    statusTrends.forEach(({ status, date, count }) => {
      if (status in status_trends) {
        status_trends[status as keyof typeof status_trends].push({
          date: date.toISOString().split('T')[0],
          count: +count
        })
      }
    })

    trend_data = {
      daily_orders: dailyOrders.map(({ date, count }: { date: Date; count: number }) => ({
        date: date.toISOString().split('T')[0],
        count: +count
      })),
      daily_value: dailyValue.map(({ date, value }: { date: Date; value: number }) => ({
        date: date.toISOString().split('T')[0],
        value: +value
      })),
      status_trends
    }
  }

  // Get recent orders for fallback
  const recentOrdersQuery = database.knex("orders")
    .where({ contractor_id })
    .select("order_id", "timestamp", "status", "cost", "title")
    .orderBy("timestamp", "desc")
    .limit(50)

  if (assigned_only) {
    recentOrdersQuery.whereNotNull("assigned_id")
  }

  const recentOrdersData = await recentOrdersQuery

  recent_orders = recentOrdersData.map(order => ({
    order_id: order.order_id,
    timestamp: order.timestamp.toISOString(),
    status: order.status,
    cost: +order.cost,
    title: order.title
  }))

  return {
    metrics: {
      ...metrics,
      trend_data
    },
    recent_orders
  }
}
