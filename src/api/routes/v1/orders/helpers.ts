import {
  DBAggregateListingComplete,
  DBContractor,
  DBMultipleListingCompositeComplete,
  DBOffer,
  DBOfferSession,
  DBOrder,
  DBOrderSetting,
  DBUniqueListingComplete,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as chatDb from "../chats/database.js"
import * as contractorDb from "../contractors/database.js"
import * as profileDb from "../profiles/database.js"
import * as orderDb from "./database.js"
import * as offerDb from "../offers/database.js"
import * as marketDb from "../market/database.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import { discordService } from "../../../../services/discord/discord.service.js"
import { chatParticipantService } from "../../../../services/chats/chat-participant.service.js"
import { OrderLifecycleService } from "../../../../services/allocation/order-lifecycle.service.js"
import { User } from "../api-models.js"
import { sendSystemMessage } from "../chats/helpers.js"
import { has_permission } from "../util/permissions.js"
import {
  createErrorResponse,
  createResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import logger from "../../../../logger/logger.js"
import { Request } from "express"
import { withTransaction } from "../../../../clients/database/transaction.js"
import {
  OrderSearchQuery,
  OrderSearchQueryArguments,
  OrderSearchSortMethod,
  OrderSearchStatus,
} from "./types.js"

// =============================================================================
// AVAILABILITY REQUIREMENT HELPER FUNCTIONS
// =============================================================================

/**
 * Check if availability is required for the given seller(s)
 * @param contractor_id - Seller contractor ID (if applicable)
 * @param user_id - Seller user ID (if applicable)
 * @returns true if availability is required, false otherwise
 */
export async function isAvailabilityRequired(
  contractor_id: string | null,
  user_id: string | null,
): Promise<boolean> {
  return await orderDb.getAvailabilityRequirement(contractor_id, user_id)
}

/**
 * Check if user has availability set for the given context
 * @param user_id - Buyer user ID
 * @param seller_contractor_id - Seller's contractor ID (for contractor-specific check)
 * @returns true if availability is set, false otherwise
 */
export async function hasAvailabilitySet(
  user_id: string,
  seller_contractor_id: string | null,
): Promise<boolean> {
  return await orderDb.hasAvailabilitySet(user_id, seller_contractor_id)
}

/**
 * Validate availability requirement before offer creation
 * @param customer_id - Buyer user ID
 * @param seller_contractor_id - Seller contractor ID
 * @param seller_user_id - Seller user ID
 * @throws Error with message if requirement not met
 */
export async function validateAvailabilityRequirement(
  customer_id: string,
  seller_contractor_id: string | null,
  seller_user_id: string | null,
): Promise<void> {
  const required = await isAvailabilityRequired(
    seller_contractor_id,
    seller_user_id,
  )

  if (!required) {
    return // No requirement, validation passes
  }

  // Check if user has availability set
  // For contractor sellers, check contractor-specific availability
  // For user sellers, check global availability (contractor_id = null)
  const hasAvailability = await hasAvailabilitySet(
    customer_id,
    seller_contractor_id,
  )

  if (!hasAvailability) {
    throw new Error(
      "Availability is required to submit this offer. Please set your availability first.",
    )
  }
}

// =============================================================================
// ORDER LIMITS VALIDATION HELPER FUNCTIONS
// =============================================================================

/**
 * Get relevant order settings for a seller (contractor or user)
 * @param contractor_id - Seller contractor ID (null if user seller)
 * @param user_id - Seller user ID (null if contractor seller)
 * @param setting_types - Array of setting types to fetch
 * @returns Array of enabled order settings
 */
async function getRelevantOrderSettings(
  contractor_id: string | null,
  user_id: string | null,
  setting_types: string[],
): Promise<DBOrderSetting[]> {
  const settings: DBOrderSetting[] = []

  // If there's a contractor, use contractor settings only
  if (contractor_id) {
    const contractorSettings = await orderDb.getOrderSettings(
      "contractor",
      contractor_id,
    )
    settings.push(
      ...contractorSettings.filter(
        (s) => setting_types.includes(s.setting_type) && s.enabled,
      ),
    )
    return settings
  }

  // If no contractor, use user settings
  if (user_id) {
    const userSettings = await orderDb.getOrderSettings("user", user_id)
    settings.push(
      ...userSettings.filter(
        (s) => setting_types.includes(s.setting_type) && s.enabled,
      ),
    )
  }

  return settings
}

/**
 * Validate order size and value against seller's limits
 * @param seller_contractor_id - Seller contractor ID (null if user seller)
 * @param seller_user_id - Seller user ID (null if contractor seller)
 * @param offer_size - Total quantity of items (sum of market_listings quantities)
 * @param offer_value - Offer cost in smallest currency unit
 * @throws Error with message if validation fails
 */
export async function validateOrderLimits(
  seller_contractor_id: string | null,
  seller_user_id: string | null,
  offer_size: number,
  offer_value: bigint | string | number,
): Promise<void> {
  // Get relevant order settings
  const settings = await getRelevantOrderSettings(
    seller_contractor_id,
    seller_user_id,
    ["min_order_size", "max_order_size", "min_order_value", "max_order_value"],
  )

  // Convert offer_value to number for comparison
  const value =
    typeof offer_value === "bigint"
      ? Number(offer_value)
      : typeof offer_value === "string"
        ? parseInt(offer_value, 10)
        : offer_value

  // Check size limits
  const minSize = settings.find(
    (s) => s.setting_type === "min_order_size" && s.enabled,
  )
  if (minSize) {
    const minSizeValue = parseInt(minSize.message_content, 10)
    if (isNaN(minSizeValue)) {
      logger.warn("Invalid min_order_size value", {
        settingId: minSize.id,
        messageContent: minSize.message_content,
      })
    } else if (offer_size < minSizeValue) {
      throw new Error(
        `Order size (${offer_size}) is below the minimum required (${minSizeValue} items)`,
      )
    }
  }

  const maxSize = settings.find(
    (s) => s.setting_type === "max_order_size" && s.enabled,
  )
  if (maxSize) {
    const maxSizeValue = parseInt(maxSize.message_content, 10)
    if (isNaN(maxSizeValue)) {
      logger.warn("Invalid max_order_size value", {
        settingId: maxSize.id,
        messageContent: maxSize.message_content,
      })
    } else if (offer_size > maxSizeValue) {
      throw new Error(
        `Order size (${offer_size}) exceeds the maximum allowed (${maxSizeValue} items)`,
      )
    }
  }

  // Check value limits
  const minValue = settings.find(
    (s) => s.setting_type === "min_order_value" && s.enabled,
  )
  if (minValue) {
    const minValueValue = parseInt(minValue.message_content, 10)
    if (isNaN(minValueValue)) {
      logger.warn("Invalid min_order_value value", {
        settingId: minValue.id,
        messageContent: minValue.message_content,
      })
    } else if (value < minValueValue) {
      throw new Error(
        `Order value (${value}) is below the minimum required (${minValueValue})`,
      )
    }
  }

  const maxValue = settings.find(
    (s) => s.setting_type === "max_order_value" && s.enabled,
  )
  if (maxValue) {
    const maxValueValue = parseInt(maxValue.message_content, 10)
    if (isNaN(maxValueValue)) {
      logger.warn("Invalid max_order_value value", {
        settingId: maxValue.id,
        messageContent: maxValue.message_content,
      })
    } else if (value > maxValueValue) {
      throw new Error(
        `Order value (${value}) exceeds the maximum allowed (${maxValueValue})`,
      )
    }
  }
}

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
  const most_recent = await offerDb.getMostRecentOrderOffer(session.id)

  const market_listings = await marketDb.getOfferMarketListings(most_recent.id)

  // Check stock subtraction timing setting
  // Default is "on_accepted" (when no setting exists) - subtract stock when offer is accepted
  const stockSetting = await getRelevantOrderSetting(
    session,
    "stock_subtraction_timing",
  )
  const settingValue = stockSetting?.message_content

  // Wrap critical database operations in a transaction
  const order = await withTransaction(async (trx) => {
    // Create order
    const [createdOrder] = await orderDb.createOrder(
      {
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
      },
      trx,
    )

    // Create market listing orders
    for (const { quantity, listing_id } of market_listings) {
      await marketDb.insertMarketListingOrder(
        {
          listing_id,
          order_id: createdOrder.order_id,
          quantity,
        },
        trx,
      )
    }

    // Allocate stock based on allocation_mode setting (auto/manual/none)
    // The stock_subtraction_timing setting controls PUBLIC visibility, not physical allocation
    // Requirements: 5.7, 6.1, 6.2, 6.3, 12.2, 12.3
    const lifecycleService = new OrderLifecycleService(trx)
    const allocationResult = await lifecycleService.allocateStockForOrder(
      createdOrder.order_id,
      market_listings,
      session.contractor_id,
      session.customer_id,
    )

    // Log allocation result
    logger.info("Stock allocated for order", {
      order_id: createdOrder.order_id,
      total_requested: allocationResult.total_requested,
      total_allocated: allocationResult.total_allocated,
      has_partial: allocationResult.has_partial_allocations,
      stock_subtraction_timing: settingValue || "on_accepted",
    })

    // Store allocation result on the order object for later use
    // This allows the caller to check if there were partial allocations
    ;(createdOrder as any).allocation_result = allocationResult

    return createdOrder
  })

  // Non-critical operations outside transaction (can fail without breaking order creation)
  try {
    const chat = await chatDb.getChat({ session_id: session.id })

    await chatDb.updateChat(
      { chat_id: chat.chat_id },
      { order_id: order.order_id },
    )
  } catch {
    await chatDb.insertChat([], order.order_id, session.id)
  }

  // Ensure chat participants are added (customer and assigned user)
  try {
    await chatParticipantService.ensureOrderChatParticipants(order)
  } catch (e) {
    logger.error(`Failed to ensure order chat participants: ${e}`)
  }

  try {
    await notificationService.createOrderNotification(order)
  } catch (e) {}

  try {
    await discordService.renameThread(
      session.thread_id!,
      `order-${order.order_id.substring(0, 8)}`,
    )
  } catch (e) {
    logger.error(`Failed to rename thread: ${e}`)
  }

  // Send custom order message if setting exists
  await sendCustomOrderMessage(order, session)

  return { ...order }
}

export async function createOffer(
  session_details: Partial<
    Omit<DBOfferSession, "timestamp"> & { timestamp: string | Date }
  >,
  offer_details: Partial<
    Omit<DBOffer, "timestamp"> & { timestamp: string | Date }
  > & {
    actor_id: string
  },
  market_listings: {
    quantity: number
    listing:
      | DBAggregateListingComplete
      | DBUniqueListingComplete
      | DBMultipleListingCompositeComplete
  }[] = [],
) {
  // Wrap critical database operations in a transaction
  const { session, offer } = await withTransaction(async (trx) => {
    // Create session
    const [createdSession] = await offerDb.createOrderOfferSession(
      session_details,
      trx,
    )

    // Create offer
    const [createdOffer] = await offerDb.createOrderOffer(
      {
        ...offer_details,
        session_id: createdSession.id,
      },
      trx,
    )

    // Insert offer market listings
    for (const { quantity, listing } of market_listings) {
      await marketDb.insertOfferMarketListing(
        {
          listing_id: listing.listing.listing_id,
          offer_id: createdOffer.id,
          quantity,
        },
        trx,
      )
    }

    // Check stock subtraction timing setting
    // Note: This setting controls PUBLIC visibility of stock, not physical allocation
    // Physical allocation happens when the order is created (in initiateOrder)
    // We keep this check here for backward compatibility and logging
    const stockSetting = await getRelevantOrderSetting(
      createdSession,
      "stock_subtraction_timing",
    )
    const settingValue = stockSetting?.message_content

    if (settingValue === "on_received") {
      logger.info("Stock will be allocated when order is created", {
        session_id: createdSession.id,
        stock_subtraction_timing: settingValue,
        note: "Public visibility controlled by stock_subtraction_timing, physical allocation happens on order creation",
      })
    }

    return { session: createdSession, offer: createdOffer }
  })

  // Non-critical operations outside transaction (can fail without breaking offer creation)
  // Create chat first before dispatching notifications
  await chatDb.insertChat([], undefined, session.id)

  // Ensure chat participants are added (customer and assigned user)
  try {
    await chatParticipantService.ensureOfferChatParticipants(session)
  } catch (e) {
    logger.error(`Failed to ensure offer chat participants: ${e}`)
  }

  try {
    await notificationService.createOfferNotification(session, "create")
  } catch (e) {
    logger.error(`Failed to dispatch offer notifications: ${e}`)
  }

  // Create Discord invite directly for immediate user redirection
  let discord_invite: string | null = null
  if (session.contractor_id || session.assigned_id) {
    try {
      const contractor = session.contractor_id
        ? await contractorDb.getContractor({
            contractor_id: session.contractor_id,
          })
        : null
      const assigned = session.assigned_id
        ? await profileDb.getUser({ user_id: session.assigned_id })
        : null

      const channel_id = contractor
        ? contractor?.discord_thread_channel_id
        : assigned?.discord_thread_channel_id

      if (channel_id) {
        discord_invite = await discordService.createInvite(channel_id)
        if (discord_invite) {
          logger.info(
            `Created Discord invite for session ${session.id}: ${discord_invite}`,
          )
          // Store the invite in the database for later retrieval
          await offerDb.updateOfferSession(session.id, {
            discord_invite: discord_invite,
          })
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
      const result = await discordService.queueThreadCreation(session)

      if (result.status === "failed") {
        logger.debug(
          `Discord thread creation failed for session ${session.id}: ${result.message}`,
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

  // Send custom offer message if setting exists
  await sendCustomOfferMessage(session, offer)

  // Return the offer with the Discord invite for immediate user redirection
  return { offer, session, discord_invite }
}

export async function cancelOrderMarketItems(order: DBOrder) {
  // Check if stock was actually subtracted
  // If setting is "dont_subtract", stock was never subtracted, so don't restore it
  let shouldRestoreStock = true

  if (order.offer_session_id) {
    try {
      const sessions = await offerDb.getOfferSessions({
        id: order.offer_session_id,
      })
      if (sessions.length > 0) {
        const session = sessions[0]
        const stockSetting = await getRelevantOrderSetting(
          session,
          "stock_subtraction_timing",
        )
        const settingValue = stockSetting?.message_content

        if (settingValue === "dont_subtract") {
          shouldRestoreStock = false
          logger.info(
            "Not restoring stock on order cancellation - setting is dont_subtract",
            {
              order_id: order.order_id,
            },
          )
        }
      }
    } catch (e) {
      logger.error(
        `Failed to check stock setting on order cancellation: ${e}`,
        { order_id: order.order_id },
      )
      // On error, default to restoring stock (safer)
    }
  }

  if (!shouldRestoreStock) {
    return
  }

  const marketOrders = await marketDb.getMarketListingOrders({
    order_id: order.order_id,
  })

  logger.info("Restoring stock on order cancellation", {
    order_id: order.order_id,
    listingCount: marketOrders.length,
  })

  for (const marketOrder of marketOrders) {
    const listing = await marketDb.getMarketListing({
      listing_id: marketOrder.listing_id,
    })
    const oldQuantity = listing.quantity_available
    const newQuantity = listing.quantity_available + marketOrder.quantity

    await marketDb.updateMarketListing(marketOrder.listing_id, {
      quantity_available: newQuantity,
    })

    logger.info("Stock restored on order cancellation", {
      order_id: order.order_id,
      listing_id: marketOrder.listing_id,
      quantity_restored: marketOrder.quantity,
      old_quantity: oldQuantity,
      new_quantity: newQuantity,
    })
  }
}

export async function is_related_to_order(order: DBOrder, user: User) {
  const contractors = await contractorDb.getUserContractors({
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
    const chat = await chatDb.getChat({ order_id: order.order_id })
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
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid status!"),
        )
    }

    if (
      user.role !== "admin" &&
      (order.status.includes("cancelled") || order.status.includes("fulfilled"))
    ) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Cannot change status for closed order",
          ),
        )
      return
    }

    if (!order.contractor_id) {
      if (
        ["fulfilled", "in-progress", "not-started"].includes(status) &&
        order.assigned_id !== user.user_id &&
        user.role !== "admin"
      ) {
        res
          .status(403)
          .json(
            createForbiddenErrorResponse(
              `Only the assigned user may set the status of this order to ${status}`,
            ),
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
          .json(
            createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid status!"),
          )
      }
    }

    if (status === "cancelled") {
      await cancelOrderMarketItems(order)

      // Release stock allocations when order is cancelled
      // Requirements: 6.4
      try {
        const orderLifecycleService = new OrderLifecycleService()
        await orderLifecycleService.releaseAllocationsForOrder(order.order_id)

        logger.info("Stock allocations released for cancelled order", {
          order_id: order.order_id,
        })
      } catch (error) {
        // Log error but don't fail the cancellation
        logger.error(
          "Failed to release stock allocations for cancelled order",
          {
            order_id: order.order_id,
            error: error instanceof Error ? error.message : String(error),
          },
        )
      }
    }

    if (status === "in-progress") {
      await orderDb.updateOrder(order.order_id, {
        status,
        assigned_id: req.user.user_id,
      })

      // Track order response for responsive badge
      await orderDb.trackOrderResponse(
        order.order_id,
        order.assigned_id || undefined,
        order.contractor_id || undefined,
      )

      await discordService.assignUserToThread(
        order.thread_id!,
        req.user.user_id,
      )
    } else if (status === "fulfilled") {
      // Consume stock allocations when order is fulfilled
      // Requirements: 6.5, 10.5
      try {
        const orderLifecycleService = new OrderLifecycleService()
        await orderLifecycleService.consumeAllocationsForOrder(order.order_id)

        logger.info("Stock allocations consumed for fulfilled order", {
          order_id: order.order_id,
        })
      } catch (error) {
        // Log error but don't fail the fulfillment
        logger.error(
          "Failed to consume stock allocations for fulfilled order",
          {
            order_id: order.order_id,
            error: error instanceof Error ? error.message : String(error),
          },
        )
      }

      await orderDb.updateOrder(order.order_id, { status: status })
    } else {
      await orderDb.updateOrder(order.order_id, { status: status })
    }
    await notificationService.createOrderStatusNotification(
      order,
      status,
      req.user.user_id,
    )
    await discordService.sendOrderStatusUpdate(order, status)
    await sendStatusUpdateMessage(order, status)

    // Don't send response here - let the controller handle it
    // This allows multiple operations to be performed in one request
  } catch (e) {
    logger.error(`Failed to update order status: ${e}`)
    // Only send error response if headers haven't been sent yet
    // (in case this is the only operation)
    if (!res.headersSent) {
      res
        .status(500)
        .json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            "Failed to update order status",
          ),
        )
    }
    throw e // Re-throw so controller knows it failed
  }
}

export async function handleAssignedUpdate(req: any, res: any) {
  if (!req.order.contractor_id) {
    return res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "This order cannot be assigned",
        ),
      )
  }

  const {
    assigned_to: targetUser,
  }: {
    assigned_to?: string
  } = req.body

  // Contractor order
  const contractorObj = await contractorDb.getContractor({
    contractor_id: req.order.contractor_id,
  })

  if (
    !(await has_permission(
      contractorObj.contractor_id,
      req.user.user_id,
      "manage_orders",
    ))
  ) {
    res
      .status(403)
      .json(createForbiddenErrorResponse("No permission to assign this order"))
    return
  }

  if (targetUser) {
    let targetUserObj
    try {
      targetUserObj = await profileDb.getUser({ username: targetUser })
    } catch {
      res
        .status(400)
        .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid user"))
      return
    }

    const targetUserRole = await contractorDb.getContractorRoleLegacy(
      req.user.user_id,
      contractorObj.contractor_id,
    )
    if (!targetUserRole) {
      return res
        .status(400)
        .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid user"))
    }

    const newOrders = await orderDb.updateOrder(req.order.order_id, {
      assigned_id: targetUserObj?.user_id || undefined,
    })

    // Ensure assigned user is added to chat
    try {
      await chatParticipantService.ensureOrderChatParticipants(newOrders[0])
    } catch (e) {
      logger.error(
        `Failed to ensure order chat participants after assignment: ${e}`,
      )
    }

    await notificationService.createOrderAssignedNotification(newOrders[0])
    await discordService.sendOrderAssignedMessage(newOrders[0], targetUserObj)
  } else {
    await orderDb.updateOrder(req.order.order_id, {
      assigned_id: null,
    })
  }
  // Don't send response here - let the controller handle it
  // This allows multiple operations to be performed in one request
}

export async function acceptApplicant(
  req: any,
  res: any,
  arg: { target_contractor?: string; target_username?: string },
) {
  const { target_contractor, target_username } = arg

  if (req.user.user_id !== req.order.customer_id) {
    res
      .status(403)
      .json(
        createForbiddenErrorResponse(
          "You are not authorized to assign this order",
        ),
      )
    return
  }

  if (req.order.contractor_id || req.order.assigned_id) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.CONFLICT,
          "This order is already assigned",
        ),
      )
    return
  }

  let targetContractorObj: undefined | null | DBContractor
  let targetUserObj: undefined | null | User
  if (target_contractor) {
    try {
      targetContractorObj = await contractorDb.getContractor({
        spectrum_id: target_contractor,
      })
    } catch {
      return res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid contractor"),
        )
    }
  } else if (target_username) {
    try {
      targetUserObj = await profileDb.getUser({ username: target_username })
    } catch {
      return res
        .status(400)
        .json(createErrorResponse({ message: "Invalid user" }))
    }
  } else {
    return res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid target"))
  }

  const applicants = await orderDb.getOrderApplicants({
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

  const newOrders = await orderDb.updateOrder(req.order.order_id, {
    assigned_id: targetUserObj?.user_id || undefined,
    contractor_id: targetContractorObj?.contractor_id || undefined,
  })

  // Track order assignment for responsive badge
  await orderDb.trackOrderAssignment(
    req.order.order_id,
    targetUserObj?.user_id,
    targetContractorObj?.contractor_id,
  )

  await orderDb.clearOrderApplications(req.order.order_id)

  // Ensure chat participants are added (customer and assigned user)
  try {
    await chatParticipantService.ensureOrderChatParticipants(newOrders[0])
  } catch (e) {
    logger.error(
      `Failed to ensure order chat participants after applicant acceptance: ${e}`,
    )
  }

  await notificationService.createOrderNotification(newOrders[0])

  res.status(201).json(createResponse({ result: "Success" }))
}

export async function convert_order_search_query(
  req: Request,
): Promise<OrderSearchQueryArguments> {
  const query = req.query as OrderSearchQuery

  const customer = query.customer ? req.users!.get("customer") || null : null
  const assigned = query.assigned ? req.users!.get("assigned") || null : null
  const contractor = query.contractor
    ? req.contractors!.get("contractor")
    : null

  // Note: buyer_username and seller_username are now filtered directly in SQL
  // using ILIKE for partial matching, so we don't need to resolve them here

  // Parse boolean filters
  const has_market_listings =
    query.has_market_listings !== undefined
      ? query.has_market_listings === "true"
      : undefined
  const has_service =
    query.has_service !== undefined ? query.has_service === "true" : undefined

  // Parse cost range
  const cost_min = query.cost_min ? +query.cost_min : undefined
  const cost_max = query.cost_max ? +query.cost_max : undefined

  return {
    assigned_id: assigned?.user_id || undefined,
    contractor_id: contractor?.contractor_id || undefined,
    customer_id: customer?.user_id || undefined,
    index: +(query.index || 0),
    page_size: +((query.page_size as string) || 5),
    sort_method: (query.sort_method as OrderSearchSortMethod) || "timestamp",
    status: (query.status as OrderSearchStatus) || undefined,
    reverse_sort: query.reverse_sort == "true",
    buyer_username: query.buyer_username,
    seller_username: query.seller_username,
    has_market_listings,
    has_service,
    cost_min: cost_min && !isNaN(cost_min) ? cost_min : undefined,
    cost_max: cost_max && !isNaN(cost_max) ? cost_max : undefined,
    date_from: query.date_from,
    date_to: query.date_to,
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
  // Build filtered orders query to get matching order IDs
  let filteredOrdersQuery = database
    .knex("orders")
    .leftJoin("market_orders", "orders.order_id", "=", "market_orders.order_id")
    // Join accounts for buyer username filtering
    .leftJoin(
      "accounts as buyer_account",
      "orders.customer_id",
      "=",
      "buyer_account.user_id",
    )
    // Join accounts for assigned username filtering (seller)
    .leftJoin(
      "accounts as assigned_account_filter",
      "orders.assigned_id",
      "=",
      "assigned_account_filter.user_id",
    )
    // Join contractors for spectrum_id filtering (seller)
    .leftJoin(
      "contractors as seller_contractor",
      "orders.contractor_id",
      "=",
      "seller_contractor.contractor_id",
    )
    .where((qd) => {
      if (args.customer_id)
        qd = qd.where("orders.customer_id", args.customer_id)
      if (args.assigned_id)
        qd = qd.where("orders.assigned_id", args.assigned_id)
      if (args.contractor_id)
        qd = qd.where("orders.contractor_id", args.contractor_id)

      // Buyer username filter (partial match)
      if (args.buyer_username) {
        qd = qd.where(
          "buyer_account.username",
          "ILIKE",
          `%${args.buyer_username}%`,
        )
      }

      // Seller username filter (partial match on spectrum_id or assigned username)
      if (args.seller_username) {
        qd = qd.where((subQd) => {
          subQd = subQd
            .where(
              "seller_contractor.spectrum_id",
              "ILIKE",
              `%${args.seller_username}%`,
            )
            .orWhere(
              "assigned_account_filter.username",
              "ILIKE",
              `%${args.seller_username}%`,
            )
          return subQd
        })
      }

      // Date range filters
      if (args.date_from) {
        qd = qd.where("orders.timestamp", ">=", args.date_from)
      }
      if (args.date_to) {
        qd = qd.where("orders.timestamp", "<=", args.date_to)
      }

      // Service filter
      if (args.has_service !== undefined) {
        if (args.has_service) {
          qd = qd.whereNotNull("orders.service_id")
        } else {
          qd = qd.whereNull("orders.service_id")
        }
      }

      // Cost range filters
      if (args.cost_min !== undefined) {
        qd = qd.where("orders.cost", ">=", args.cost_min.toString())
      }
      if (args.cost_max !== undefined) {
        qd = qd.where("orders.cost", "<=", args.cost_max.toString())
      }

      return qd
    })
    .groupBy("orders.order_id", "orders.status")

  // Apply market listings filter (must be after GROUP BY for HAVING)
  if (args.has_market_listings !== undefined) {
    if (args.has_market_listings) {
      filteredOrdersQuery = filteredOrdersQuery.havingRaw(
        "COUNT(market_orders.order_id) > 0",
      )
    } else {
      filteredOrdersQuery = filteredOrdersQuery.havingRaw(
        "COUNT(market_orders.order_id) = 0",
      )
    }
  }

  // Get filtered order IDs
  const filteredOrders = await filteredOrdersQuery.select(
    "orders.order_id",
    "orders.status",
  )

  // If no filtered orders, return empty counts
  if (filteredOrders.length === 0) {
    return {
      items: [],
      item_counts: {
        fulfilled: 0,
        "in-progress": 0,
        "not-started": 0,
        cancelled: 0,
      },
    }
  }

  // Calculate totals from filtered orders and get filtered order IDs
  const filteredOrderIds = filteredOrders.map((o: any) => o.order_id)
  const totals = await database
    .knex("orders")
    .whereIn("order_id", filteredOrderIds)
    .groupByRaw("status")
    .select("status", database.knex.raw("COUNT(*) as count"))

  const item_counts = Object.fromEntries(
    totals.map(({ status, count }) => [status, +count]),
  )

  // Build optimized query with JOINs to get all related data
  // Only query orders that passed the filters

  let optimizedQuery = database
    .knex("orders")
    .leftJoin("market_orders", "orders.order_id", "=", "market_orders.order_id")
    .leftJoin("services", "orders.service_id", "=", "services.service_id")
    .leftJoin(
      "accounts as customer_account",
      "orders.customer_id",
      "=",
      "customer_account.user_id",
    )
    .leftJoin(
      "accounts as assigned_account",
      "orders.assigned_id",
      "=",
      "assigned_account.user_id",
    )
    .leftJoin(
      "contractors",
      "orders.contractor_id",
      "=",
      "contractors.contractor_id",
    )
    .where((qd) => {
      // Only include filtered order IDs
      if (filteredOrderIds.length > 0) {
        qd = qd.whereIn("orders.order_id", filteredOrderIds)
      } else {
        // If no filtered orders, return empty result
        qd = qd.whereRaw("1 = 0")
      }
      return qd
    })

  // Apply status filter
  if (args.status) {
    optimizedQuery = optimizedQuery.andWhere((qb) => {
      if (args.status === "past") {
        return qb.whereRaw("orders.status = ANY(?)", [
          ["fulfilled", "cancelled"],
        ])
      }

      if (args.status === "active") {
        return qb.whereRaw("orders.status = ANY(?)", [
          ["in-progress", "not-started"],
        ])
      }

      return qb.where("orders.status", args.status)
    })
  }

  // Apply sorting
  switch (args.sort_method) {
    case "timestamp":
    case "status":
    case "title":
      optimizedQuery = optimizedQuery.orderBy(
        `orders.${args.sort_method}`,
        args.reverse_sort ? "desc" : "asc",
      )
      break
    case "customer_name":
      optimizedQuery = optimizedQuery.orderBy(
        "customer_account.username",
        args.reverse_sort ? "desc" : "asc",
      )
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
      "contractors.avatar as contractor_avatar",
    )
    .groupBy(
      "orders.order_id",
      "services.service_id",
      "customer_account.user_id",
      "assigned_account.user_id",
      "contractors.contractor_id",
    )

  // Apply market listings filter (must be after GROUP BY for HAVING)
  if (args.has_market_listings !== undefined) {
    if (args.has_market_listings) {
      // Has market listings - must have at least one
      optimizedQuery = optimizedQuery.havingRaw(
        "COUNT(market_orders.order_id) > 0",
      )
    } else {
      // No market listings - must have zero
      optimizedQuery = optimizedQuery.havingRaw(
        "COUNT(market_orders.order_id) = 0",
      )
    }
  }

  return { item_counts, items }
}

// Interface for contractor order metrics
interface ContractorOrderMetrics {
  total_orders: number
  total_value: number
  active_value: number // Sum of costs for active orders (not-started + in-progress)
  completed_value: number // Sum of costs for fulfilled orders
  status_counts: {
    "not-started": number
    "in-progress": number
    fulfilled: number
    cancelled: number
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
export async function getContractorOrderMetrics(
  contractor_id: string,
): Promise<ContractorOrderMetrics> {
  // Get basic counts and totals
  const basicStats = await database
    .knex("orders")
    .where({ contractor_id })
    .select(
      database.knex.raw("COUNT(*) as total_orders"),
      database.knex.raw("COALESCE(SUM(cost), 0) as total_value"),
      database.knex.raw(
        "COALESCE(SUM(CASE WHEN status IN ('not-started', 'in-progress') THEN cost ELSE 0 END), 0) as active_value",
      ),
      database.knex.raw(
        "COALESCE(SUM(CASE WHEN status = 'fulfilled' THEN cost ELSE 0 END), 0) as completed_value",
      ),
    )
    .first()

  // Get status counts
  const statusCounts = await database
    .knex("orders")
    .where({ contractor_id })
    .groupBy("status")
    .select("status", database.knex.raw("COUNT(*) as count"))

  const status_counts = {
    "not-started": 0,
    "in-progress": 0,
    fulfilled: 0,
    cancelled: 0,
  }

  statusCounts.forEach(({ status, count }) => {
    if (status in status_counts) {
      status_counts[status as keyof typeof status_counts] = +count
    }
  })

  // Get recent activity (last 7 and 30 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const recentActivity = await database
    .knex("orders")
    .where({ contractor_id })
    .select(
      database.knex.raw(
        "COUNT(CASE WHEN timestamp >= ? THEN 1 END) as orders_last_7_days",
        [sevenDaysAgo],
      ),
      database.knex.raw(
        "COUNT(CASE WHEN timestamp >= ? THEN 1 END) as orders_last_30_days",
        [thirtyDaysAgo],
      ),
      database.knex.raw(
        "COALESCE(SUM(CASE WHEN timestamp >= ? THEN cost ELSE 0 END), 0) as value_last_7_days",
        [sevenDaysAgo],
      ),
      database.knex.raw(
        "COALESCE(SUM(CASE WHEN timestamp >= ? THEN cost ELSE 0 END), 0) as value_last_30_days",
        [thirtyDaysAgo],
      ),
    )
    .first()

  // Get top customers
  const topCustomers = await database
    .knex("orders")
    .join("accounts", "orders.customer_id", "=", "accounts.user_id")
    .where({ contractor_id })
    .groupBy("orders.customer_id", "accounts.username")
    .select(
      "accounts.username",
      database.knex.raw("COUNT(*) as order_count"),
      database.knex.raw("COALESCE(SUM(orders.cost), 0) as total_value"),
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
    top_customers: topCustomers.map((customer) => ({
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
        fulfilled: Array<{ date: string; count: number }>
        cancelled: Array<{ date: string; count: number }>
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
  options: { include_trends?: boolean; assigned_only?: boolean } = {},
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
    const dailyOrders = await database
      .knex("orders")
      .where({ contractor_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COUNT(*) as count"),
      )
      .groupBy(database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Get daily order values
    const dailyValue = await database
      .knex("orders")
      .where({ contractor_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COALESCE(SUM(cost), 0) as value"),
      )
      .groupBy(database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Get status trends
    const statusTrends = await database
      .knex("orders")
      .where({ contractor_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        "status",
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COUNT(*) as count"),
      )
      .groupBy("status", database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Organize status trends by status
    const status_trends = {
      "not-started": [] as Array<{ date: string; count: number }>,
      "in-progress": [] as Array<{ date: string; count: number }>,
      fulfilled: [] as Array<{ date: string; count: number }>,
      cancelled: [] as Array<{ date: string; count: number }>,
    }

    statusTrends.forEach(({ status, date, count }) => {
      if (status in status_trends) {
        status_trends[status as keyof typeof status_trends].push({
          date: date.toISOString().split("T")[0],
          count: +count,
        })
      }
    })

    trend_data = {
      daily_orders: dailyOrders.map(
        ({ date, count }: { date: Date; count: number }) => ({
          date: date.toISOString().split("T")[0],
          count: +count,
        }),
      ),
      daily_value: dailyValue.map(
        ({ date, value }: { date: Date; value: number }) => ({
          date: date.toISOString().split("T")[0],
          value: +value,
        }),
      ),
      status_trends,
    }
  }

  // Get recent orders for fallback
  const recentOrdersQuery = database
    .knex("orders")
    .where({ contractor_id })
    .select("order_id", "timestamp", "status", "cost", "title")
    .orderBy("timestamp", "desc")
    .limit(50)

  if (assigned_only) {
    recentOrdersQuery.whereNotNull("assigned_id")
  }

  const recentOrdersData = await recentOrdersQuery

  recent_orders = recentOrdersData.map((order) => ({
    order_id: order.order_id,
    timestamp: order.timestamp.toISOString(),
    status: order.status,
    cost: +order.cost,
    title: order.title,
  }))

  return {
    metrics: {
      ...metrics,
      trend_data,
    },
    recent_orders,
  }
}

// Get user order metrics for assigned orders
export async function getUserOrderMetrics(
  user_id: string,
): Promise<ContractorOrderMetrics> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Get all assigned orders for the user
  const orders = await orderDb.getOrders({ assigned_id: user_id })

  // Calculate basic metrics
  const total_orders = orders.length
  const total_value = orders.reduce(
    (sum, order) => sum + parseFloat(String(order.cost)),
    0,
  )

  const active_value = orders
    .filter((order) => ["not-started", "in-progress"].includes(order.status))
    .reduce((sum, order) => sum + parseFloat(String(order.cost)), 0)

  const completed_value = orders
    .filter((order) => order.status === "fulfilled")
    .reduce((sum, order) => sum + parseFloat(String(order.cost)), 0)

  // Status counts
  const status_counts = {
    "not-started": orders.filter((order) => order.status === "not-started")
      .length,
    "in-progress": orders.filter((order) => order.status === "in-progress")
      .length,
    fulfilled: orders.filter((order) => order.status === "fulfilled").length,
    cancelled: orders.filter((order) => order.status === "cancelled").length,
  }

  // Recent activity
  const orders_last_7_days = orders.filter(
    (order) => new Date(order.timestamp) >= sevenDaysAgo,
  ).length
  const orders_last_30_days = orders.filter(
    (order) => new Date(order.timestamp) >= thirtyDaysAgo,
  ).length

  const value_last_7_days = orders
    .filter((order) => new Date(order.timestamp) >= sevenDaysAgo)
    .reduce((sum, order) => sum + parseFloat(String(order.cost)), 0)

  const value_last_30_days = orders
    .filter((order) => new Date(order.timestamp) >= thirtyDaysAgo)
    .reduce((sum, order) => sum + parseFloat(String(order.cost)), 0)

  // Top customers (by order count and value)
  const customerStats = new Map<
    string,
    { order_count: number; total_value: number }
  >()

  for (const order of orders) {
    const customer_id = order.customer_id
    if (!customerStats.has(customer_id)) {
      customerStats.set(customer_id, { order_count: 0, total_value: 0 })
    }
    const stats = customerStats.get(customer_id)!
    stats.order_count++
    stats.total_value += parseFloat(String(order.cost))
  }

  // Get customer usernames and sort by total value
  const top_customers = await Promise.all(
    Array.from(customerStats.entries())
      .sort(([, a], [, b]) => b.total_value - a.total_value)
      .slice(0, 10)
      .map(async ([customer_id, stats]) => {
        const customer = await profileDb.getUser({ user_id: customer_id })
        return {
          username: customer?.username || "Unknown",
          order_count: stats.order_count,
          total_value: stats.total_value,
        }
      }),
  )

  return {
    total_orders,
    total_value,
    active_value,
    completed_value,
    status_counts,
    recent_activity: {
      orders_last_7_days,
      orders_last_30_days,
      value_last_7_days,
      value_last_30_days,
    },
    top_customers,
  }
}

// Get comprehensive user order data including metrics and trend data
export async function getUserOrderData(
  user_id: string,
  options: { include_trends?: boolean } = {},
): Promise<ContractorOrderData> {
  const { include_trends = true } = options

  // Get basic metrics for user's assigned orders
  const metrics = await getUserOrderMetrics(user_id)

  let trend_data = undefined
  let recent_orders = undefined

  // Get trend data if requested
  if (include_trends) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Get daily order counts for assigned orders
    const dailyOrders = await database
      .knex("orders")
      .where({ assigned_id: user_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COUNT(*) as count"),
      )
      .groupBy(database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Get daily order values for assigned orders
    const dailyValue = await database
      .knex("orders")
      .where({ assigned_id: user_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COALESCE(SUM(cost), 0) as value"),
      )
      .groupBy(database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Get status trends for assigned orders
    const statusTrends = await database
      .knex("orders")
      .where({ assigned_id: user_id })
      .where("timestamp", ">=", thirtyDaysAgo)
      .select(
        "status",
        database.knex.raw("DATE(timestamp) as date"),
        database.knex.raw("COUNT(*) as count"),
      )
      .groupBy("status", database.knex.raw("DATE(timestamp)"))
      .orderBy("date")

    // Organize status trends by status
    const status_trends = {
      "not-started": [] as Array<{ date: string; count: number }>,
      "in-progress": [] as Array<{ date: string; count: number }>,
      fulfilled: [] as Array<{ date: string; count: number }>,
      cancelled: [] as Array<{ date: string; count: number }>,
    }

    statusTrends.forEach(({ status, date, count }) => {
      if (status in status_trends) {
        status_trends[status as keyof typeof status_trends].push({
          date: date.toISOString().split("T")[0],
          count: +count,
        })
      }
    })

    trend_data = {
      daily_orders: dailyOrders.map(
        ({ date, count }: { date: Date; count: number }) => ({
          date: date.toISOString().split("T")[0],
          count: +count,
        }),
      ),
      daily_value: dailyValue.map(
        ({ date, value }: { date: Date; value: number }) => ({
          date: date.toISOString().split("T")[0],
          value: +value,
        }),
      ),
      status_trends,
    }
  }

  // Get recent orders for fallback
  const recentOrdersData = await database
    .knex("orders")
    .where({ assigned_id: user_id })
    .select("order_id", "timestamp", "status", "cost", "title")
    .orderBy("timestamp", "desc")
    .limit(50)

  recent_orders = recentOrdersData.map((order) => ({
    order_id: order.order_id,
    timestamp: order.timestamp.toISOString(),
    status: order.status,
    cost: +order.cost,
    title: order.title,
  }))

  return {
    metrics: {
      ...metrics,
      trend_data,
    },
    recent_orders,
  }
}

// =============================================================================
// ORDER SETTINGS HELPER FUNCTIONS
// =============================================================================

/**
 * Get the relevant order setting for a session
 * - Offers to contractors use contractor settings
 * - Offers to users (no contractor) use assignee settings
 */
export async function getRelevantOrderSetting(
  session: DBOfferSession,
  settingType:
    | "offer_message"
    | "order_message"
    | "require_availability"
    | "stock_subtraction_timing"
    | "min_order_size"
    | "max_order_size"
    | "min_order_value"
    | "max_order_value",
): Promise<DBOrderSetting | null> {
  logger.debug("Looking for relevant order setting", {
    sessionId: session.id,
    settingType,
    contractorId: session.contractor_id,
    assignedId: session.assigned_id,
  })

  // If there's a contractor, use contractor settings only
  if (session.contractor_id) {
    logger.debug("Checking contractor order setting", {
      contractorId: session.contractor_id,
      settingType,
    })

    const contractorSetting = await orderDb.getOrderSetting(
      "contractor",
      session.contractor_id,
      settingType,
    )
    if (contractorSetting && contractorSetting.enabled) {
      logger.debug("Found enabled contractor setting", {
        settingId: contractorSetting.id,
        entityType: contractorSetting.entity_type,
        enabled: contractorSetting.enabled,
      })
      return contractorSetting
    } else {
      logger.debug("No enabled contractor setting found", {
        contractorId: session.contractor_id,
        hasSetting: !!contractorSetting,
        enabled: contractorSetting?.enabled,
      })
    }
    // Don't check assigned user if there's a contractor
    return null
  }

  // If no contractor, use assignee (assigned user) settings
  if (session.assigned_id) {
    logger.debug("Checking assigned user order setting", {
      assignedId: session.assigned_id,
      settingType,
    })

    const userSetting = await orderDb.getOrderSetting(
      "user",
      session.assigned_id,
      settingType,
    )
    if (userSetting && userSetting.enabled) {
      logger.debug("Found enabled user setting", {
        settingId: userSetting.id,
        entityType: userSetting.entity_type,
        enabled: userSetting.enabled,
      })
      return userSetting
    } else {
      logger.debug("No enabled user setting found", {
        assignedId: session.assigned_id,
        hasSetting: !!userSetting,
        enabled: userSetting?.enabled,
      })
    }
  }

  logger.debug("No relevant order setting found", {
    sessionId: session.id,
    settingType,
  })

  return null
}

/**
 * Subtract stock for market listings associated with an order
 * @deprecated This function is replaced by OrderLifecycleService.allocateStockForOrder()
 * Kept for potential rollback purposes only.
 */
async function _subtractStockForMarketListings(
  market_listings: { quantity: number; listing_id: string }[],
  order_id: string,
  trx?: any,
): Promise<void> {
  logger.debug("Subtracting stock for market listings", {
    order_id,
    listingCount: market_listings.length,
  })

  for (const { quantity, listing_id } of market_listings) {
    await marketDb.insertMarketListingOrder(
      {
        listing_id,
        order_id,
        quantity,
      },
      trx,
    )

    const listing = await marketDb.getMarketListing({ listing_id })
    const oldQuantity = listing.quantity_available

    // Calculate new quantity, but ensure it doesn't go below 0
    // This handles race conditions where quantities changed between offer creation and acceptance
    const newQuantity = Math.max(0, listing.quantity_available - quantity)

    await marketDb.updateMarketListing(
      listing_id,
      {
        quantity_available: newQuantity,
      },
      trx,
    )

    logger.debug("Stock subtracted for listing", {
      order_id,
      listing_id,
      quantity_subtracted: quantity,
      old_quantity: oldQuantity,
      new_quantity: newQuantity,
    })
  }
}

/**
 * Send custom offer message if setting exists
 */
export async function sendCustomOfferMessage(
  session: DBOfferSession,
  offer: DBOffer,
): Promise<void> {
  try {
    logger.debug("Attempting to send custom offer message", {
      sessionId: session.id,
      contractorId: session.contractor_id,
      assignedId: session.assigned_id,
    })

    const setting = await getRelevantOrderSetting(session, "offer_message")

    if (setting && setting.message_content.trim()) {
      logger.debug("Found offer message setting", {
        settingId: setting.id,
        entityType: setting.entity_type,
        messageLength: setting.message_content.length,
      })

      // Get the chat for this session
      const chat = await chatDb.getChat({ session_id: session.id })

      if (chat) {
        logger.debug("Found chat for session", { chatId: chat.chat_id })

        logger.debug("Sending offer message to chat", {
          chatId: chat.chat_id,
          author: "system",
          messageLength: setting.message_content.length,
        })

        // Send message to chat on behalf of the system
        await chatDb.insertMessage({
          chat_id: chat.chat_id,
          content: setting.message_content,
          author: null, // System message
        })

        // Also send to Discord if thread exists
        if (session.thread_id) {
          try {
            // Send as system message to Discord
            await discordService.sendUserChatMessage(
              session,
              { username: "System" } as any,
              setting.message_content,
            )
            logger.debug("Successfully sent custom offer message to Discord", {
              sessionId: session.id,
              threadId: session.thread_id,
            })
          } catch (discordError) {
            logger.warn("Failed to send custom offer message to Discord", {
              sessionId: session.id,
              threadId: session.thread_id,
              error:
                discordError instanceof Error
                  ? discordError.message
                  : String(discordError),
            })
          }
        }

        logger.info("Successfully sent custom offer message", {
          sessionId: session.id,
          chatId: chat.chat_id,
          author: "system",
        })
      } else {
        logger.warn("No chat found for session", { sessionId: session.id })
      }
    } else {
      logger.debug("No offer message setting found or empty content", {
        sessionId: session.id,
        hasSetting: !!setting,
        hasContent: setting ? !!setting.message_content.trim() : false,
      })
    }
  } catch (error) {
    logger.error("Failed to send custom offer message:", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    // Don't throw - this is optional functionality
  }
}

/**
 * Send custom order message if setting exists
 */
export async function sendCustomOrderMessage(
  order: DBOrder,
  session: DBOfferSession,
): Promise<void> {
  try {
    logger.debug("Attempting to send custom order message", {
      orderId: order.order_id,
      sessionId: session.id,
      contractorId: order.contractor_id,
      assignedId: order.assigned_id,
    })

    const setting = await getRelevantOrderSetting(session, "order_message")

    if (setting && setting.message_content.trim()) {
      logger.debug("Found order message setting", {
        settingId: setting.id,
        entityType: setting.entity_type,
        messageLength: setting.message_content.length,
      })

      // Get the chat for this order
      const chat = await chatDb.getChat({ order_id: order.order_id })

      if (chat) {
        logger.debug("Found chat for order", { chatId: chat.chat_id })

        logger.debug("Sending order message to chat", {
          chatId: chat.chat_id,
          author: "system",
          messageLength: setting.message_content.length,
        })

        // Send message to chat on behalf of the system
        await chatDb.insertMessage({
          chat_id: chat.chat_id,
          content: setting.message_content,
          author: null, // System message
        })

        // Also send to Discord if thread exists
        if (order.thread_id) {
          try {
            // Send as system message to Discord
            await discordService.sendUserChatMessage(
              order,
              { username: "System" } as any,
              setting.message_content,
            )
            logger.debug("Successfully sent custom order message to Discord", {
              orderId: order.order_id,
              threadId: order.thread_id,
            })
          } catch (discordError) {
            logger.warn("Failed to send custom order message to Discord", {
              orderId: order.order_id,
              threadId: order.thread_id,
              error:
                discordError instanceof Error
                  ? discordError.message
                  : String(discordError),
            })
          }
        }

        logger.info("Successfully sent custom order message", {
          orderId: order.order_id,
          chatId: chat.chat_id,
          author: "system",
        })
      } else {
        logger.warn("No chat found for order", { orderId: order.order_id })
      }
    } else {
      logger.debug("No order message setting found or empty content", {
        orderId: order.order_id,
        hasSetting: !!setting,
        hasContent: setting ? !!setting.message_content.trim() : false,
      })
    }
  } catch (error) {
    logger.error("Failed to send custom order message:", {
      orderId: order.order_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    // Don't throw - this is optional functionality
  }
}
