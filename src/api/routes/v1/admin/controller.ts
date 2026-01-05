import { RequestHandler } from "express"
import { database as database } from "../../../../clients/database/knex-db.js"
import * as orderDb from "../orders/database.js"
import * as adminDb from "./database.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"
import {
  createResponse,
  createErrorResponse,
  createNotFoundErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { User } from "../api-models.js"
import logger from "../../../../logger/logger.js"
import {
  convertActivityToGrafana,
  convertOrderAnalyticsToGrafana,
  convertMembershipAnalyticsToGrafana,
  convertActivityToPrometheus,
  convertOrderAnalyticsToPrometheus,
  convertMembershipAnalyticsToPrometheus,
} from "./grafana-formatter.js"
import { MinimalUser } from "../../../../clients/database/db-models.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import * as notificationDb from "../notifications/database.js"
import { pushNotificationService } from "../../../../services/push-notifications/push-notification.service.js"
import { emailService } from "../../../../services/email/email.service.js"
import * as payloadFormatters from "../../../../services/notifications/notification-payload-formatters.js"
import { webhookService } from "../../../../services/webhooks/webhook.service.js"
import * as marketDb from "../market/database.js"
import * as offerDb from "../offers/database.js"
import * as commentDb from "../orders/database.js"
import * as messageDb from "../chats/database.js"
import * as chatDb from "../chats/database.js"

export const admin_get_activity: RequestHandler = async (req, res) => {
  const daily = await adminDb.getDailyActivity()
  const weekly = await adminDb.getWeeklyActivity()
  const monthly = await adminDb.getMonthlyActivity()

  // Check if Grafana format is requested
  if (req.query.format === "grafana") {
    const grafanaData = [
      ...convertActivityToGrafana(daily, "daily_activity"),
      ...convertActivityToGrafana(weekly, "weekly_activity"),
      ...convertActivityToGrafana(monthly, "monthly_activity"),
    ]
    res.json(grafanaData)
    return
  }

  // Check if Prometheus format is requested
  if (req.query.format === "prometheus") {
    const prometheusData = {
      status: "success",
      data: {
        resultType: "matrix",
        result: [
          ...convertActivityToPrometheus(daily, "daily_activity").data.result,
          ...convertActivityToPrometheus(weekly, "weekly_activity").data.result,
          ...convertActivityToPrometheus(monthly, "monthly_activity").data
            .result,
        ],
      },
    }
    res.json(prometheusData)
    return
  }

  res.json(createResponse({ daily, weekly, monthly }))
  return
}

export const admin_get_orders_analytics: RequestHandler = async (req, res) => {
  try {
    const analytics = await orderDb.getOrderAnalytics()

    // Check if Grafana format is requested
    if (req.query.format === "grafana") {
      const grafanaData = [
        ...convertOrderAnalyticsToGrafana(analytics.daily_totals, "daily"),
        ...convertOrderAnalyticsToGrafana(analytics.weekly_totals, "weekly"),
        ...convertOrderAnalyticsToGrafana(analytics.monthly_totals, "monthly"),
      ]
      res.json(grafanaData)
      return
    }

    // Check if Prometheus format is requested
    if (req.query.format === "prometheus") {
      const prometheusData = {
        status: "success",
        data: {
          resultType: "matrix",
          result: [
            ...convertOrderAnalyticsToPrometheus(
              analytics.daily_totals,
              "daily",
            ).data.result,
            ...convertOrderAnalyticsToPrometheus(
              analytics.weekly_totals,
              "weekly",
            ).data.result,
            ...convertOrderAnalyticsToPrometheus(
              analytics.monthly_totals,
              "monthly",
            ).data.result,
          ],
        },
      }
      res.json(prometheusData)
      return
    }

    res.json(createResponse(analytics))
  } catch (error) {
    logger.error("Error fetching order analytics", { error })
    res
      .status(500)
      .json(createResponse({ error: "Failed to fetch order analytics" }))
  }
  return
}

export const admin_get_users: RequestHandler = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.page_size as string) || 20),
    )
    const role = req.query.role as string
    const banned =
      req.query.banned !== undefined ? req.query.banned === "true" : undefined
    const rsiConfirmed =
      req.query.rsi_confirmed !== undefined
        ? req.query.rsi_confirmed === "true"
        : undefined

    // Get sorting parameters
    const validSortFields = [
      "created_at",
      "username",
      "display_name",
      "role",
      "banned",
      "rsi_confirmed",
      "balance",
      "locale",
    ]
    const sortBy = validSortFields.includes(req.query.sort_by as string)
      ? (req.query.sort_by as string)
      : "created_at"
    const sortOrder = (req.query.sort_order as "asc" | "desc") || "desc"

    // Build where clause for filtering
    const whereClause: any = {}
    if (role) {
      whereClause.role = role
    }
    if (banned !== undefined) {
      whereClause.banned = banned
    }
    if (rsiConfirmed !== undefined) {
      whereClause.rsi_confirmed = rsiConfirmed
    }

    const result = await profileDb.getUsersPaginated(
      page,
      pageSize,
      whereClause,
      sortBy,
      sortOrder,
    )

    res.json(createResponse(result))
  } catch (error) {
    logger.error("Error fetching users", { error })
    res.status(500).json(createResponse({ error: "Failed to fetch users" }))
  }
  return
}

export const admin_get_membership_analytics: RequestHandler = async (
  req,
  res,
) => {
  try {
    const analytics = await adminDb.getMembershipAnalytics()

    // Check if Grafana format is requested
    if (req.query.format === "grafana") {
      const grafanaData = [
        ...convertMembershipAnalyticsToGrafana(analytics.daily_totals, "daily"),
        ...convertMembershipAnalyticsToGrafana(
          analytics.weekly_totals,
          "weekly",
        ),
        ...convertMembershipAnalyticsToGrafana(
          analytics.monthly_totals,
          "monthly",
        ),
      ]
      res.json(grafanaData)
      return
    }

    // Check if Prometheus format is requested
    if (req.query.format === "prometheus") {
      const prometheusData = {
        status: "success",
        data: {
          resultType: "matrix",
          result: [
            ...convertMembershipAnalyticsToPrometheus(
              analytics.daily_totals,
              "daily",
            ).data.result,
            ...convertMembershipAnalyticsToPrometheus(
              analytics.weekly_totals,
              "weekly",
            ).data.result,
            ...convertMembershipAnalyticsToPrometheus(
              analytics.monthly_totals,
              "monthly",
            ).data.result,
          ],
        },
      }
      res.json(prometheusData)
      return
    }

    res.json(createResponse(analytics))
  } catch (error) {
    logger.error("Error fetching membership analytics", { error })
    res
      .status(500)
      .json(createResponse({ error: "Failed to fetch membership analytics" }))
  }
  return
}

export const admin_get_audit_logs: RequestHandler = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.page_size as string) || 20),
    )
    const action = req.query.action as string | undefined
    const subjectType = req.query.subject_type as string | undefined
    const subjectId = req.query.subject_id as string | undefined
    const actorId = req.query.actor_id as string | undefined
    const startDate = req.query.start_date as string | undefined
    const endDate = req.query.end_date as string | undefined

    // Build query
    let query = database.knex("audit_logs").select("audit_logs.*")

    // Apply filters
    if (action) {
      query = query.where("audit_logs.action", action)
    }
    if (subjectType) {
      query = query.where("audit_logs.subject_type", subjectType)
    }
    if (subjectId) {
      query = query.where("audit_logs.subject_id", subjectId)
    }
    if (actorId) {
      query = query.where("audit_logs.actor_id", actorId)
    }
    if (startDate) {
      query = query.where("audit_logs.created_at", ">=", startDate)
    }
    if (endDate) {
      query = query.where("audit_logs.created_at", "<=", endDate)
    }

    // Get total count
    const countQuery = query.clone().clearSelect().count("* as count").first()
    const totalResult = await countQuery
    const total = totalResult ? parseInt(totalResult.count as string) : 0

    // Apply pagination and ordering
    const offset = (page - 1) * pageSize
    const logs = await query
      .orderBy("audit_logs.created_at", "desc")
      .limit(pageSize)
      .offset(offset)

    // Fetch actor information for logs that have actor_id
    const actorIds = logs
      .map((log) => log.actor_id)
      .filter((id): id is string => id !== null)
    const actorsMap = new Map<string, MinimalUser>()

    if (actorIds.length > 0) {
      const actors = await Promise.all(
        actorIds.map(async (id) => {
          try {
            const user = await profileDb.getMinimalUser({ user_id: id })
            return { id, user }
          } catch {
            return null
          }
        }),
      )

      actors.forEach((result) => {
        if (result) {
          actorsMap.set(result.id, result.user)
        }
      })
    }

    // Extract unique contractor IDs from metadata
    const contractorIds = new Set<string>()
    logs.forEach((log) => {
      const metadata = log.metadata as Record<string, unknown> | null
      if (
        metadata &&
        typeof metadata === "object" &&
        "contractor_id" in metadata
      ) {
        const contractorId = metadata.contractor_id
        if (typeof contractorId === "string") {
          contractorIds.add(contractorId)
        }
      }
      // Also check if subject_type is contractor and subject_id is a contractor_id
      if (log.subject_type === "contractor" && log.subject_id) {
        contractorIds.add(log.subject_id)
      }
    })

    // Fetch contractor information
    const contractorsMap = new Map<
      string,
      { contractor_id: string; name: string; spectrum_id: string }
    >()
    if (contractorIds.size > 0) {
      const contractors = await Promise.all(
        Array.from(contractorIds).map(async (contractorId) => {
          try {
            const contractor = await contractorDb.getMinimalContractor({
              contractor_id: contractorId,
            })
            return { contractor_id: contractorId, contractor }
          } catch {
            return null
          }
        }),
      )

      contractors.forEach((result) => {
        if (result && result.contractor) {
          // MinimalContractor doesn't have contractor_id, so we use the one we passed in
          contractorsMap.set(result.contractor_id, {
            contractor_id: result.contractor_id,
            name: result.contractor.name,
            spectrum_id: result.contractor.spectrum_id,
          })
        }
      })
    }

    // Format response
    const items = logs.map((log) => {
      const metadata = log.metadata as Record<string, unknown> | null
      let contractor = null

      // Try to get contractor from metadata first
      if (
        metadata &&
        typeof metadata === "object" &&
        "contractor_id" in metadata
      ) {
        const contractorId = metadata.contractor_id
        if (typeof contractorId === "string") {
          contractor = contractorsMap.get(contractorId) || null
        }
      }

      // If not in metadata, check if subject is a contractor
      if (!contractor && log.subject_type === "contractor" && log.subject_id) {
        contractor = contractorsMap.get(log.subject_id) || null
      }

      return {
        audit_log_id: log.audit_log_id,
        action: log.action,
        actor_id: log.actor_id,
        actor: log.actor_id ? actorsMap.get(log.actor_id) || null : null,
        subject_type: log.subject_type,
        subject_id: log.subject_id,
        metadata: log.metadata,
        created_at: log.created_at,
        contractor,
      }
    })

    res.json(
      createResponse({
        items,
        total,
        page,
        page_size: pageSize,
      }),
    )
  } catch (error) {
    logger.error("Error fetching audit logs", { error })
    res
      .status(500)
      .json(createResponse({ error: "Failed to fetch audit logs" }))
  }
  return
}

export const admin_post_users_username_unlink: RequestHandler = async (
  req,
  res,
) => {
  try {
    const { username } = req.params
    const adminUser = req.user as User

    // Get the target user
    const user = await profileDb.getUser({ username })
    if (!user) {
      res.status(404).json(createNotFoundErrorResponse("User not found"))
      return
    }

    // Check if user is currently verified
    if (!user.rsi_confirmed) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "User is not currently verified with a Star Citizen account",
          ),
        )
      return
    }

    // Generate default username from Discord ID or user ID
    const discordProvider = await profileDb.getUserProvider(
      user.user_id,
      "discord",
    )
    const discordId =
      discordProvider?.provider_id || user.user_id.substring(0, 8)
    const defaultUsername = `new_user${discordId}`
    const defaultDisplayName = `new_user${discordId}`

    // Update user to unverified state with default usernames
    await profileDb.updateUser(
      { user_id: user.user_id },
      {
        rsi_confirmed: false,
        spectrum_user_id: null,
        username: defaultUsername,
        display_name: defaultDisplayName,
      },
    )

    logger.info(
      `Admin ${adminUser.user_id} unlinked Star Citizen account for user ${user.user_id} (${username}). Reset to default usernames.`,
    )

    res.json(
      createResponse({
        message: "User account successfully unlinked",
        username: defaultUsername,
      }),
    )
  } catch (e) {
    logger.error("Error during admin Star Citizen account unlink:", e)
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error during account unlink",
        ),
      )
  }
}

/**
 * Helper function to create a test notification directly to a target user
 */
async function createTestNotification(
  actionName: string,
  entityId: string,
  targetUserId: string,
  actorId: string,
  payloadData: any,
  pushPayload?: any,
): Promise<void> {
  const action = await notificationDb.getNotificationActionByName(actionName)
  const notif_objects = await notificationDb.insertNotificationObjects([
    {
      action_type_id: action.action_type_id,
      entity_id: entityId,
    },
  ])

  await notificationDb.insertNotificationChange([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      actor_id: actorId,
    },
  ])

  await notificationDb.insertNotifications([
    {
      notification_object_id: notif_objects[0].notification_object_id,
      notifier_id: targetUserId,
    },
  ])

  // Send push notification if payload provided
  if (pushPayload) {
    try {
      await pushNotificationService.sendPushNotification(
        targetUserId,
        pushPayload,
        actionName,
      )
    } catch (error) {
      logger.debug(`Failed to send push notification for test:`, error)
    }
  }

  // Send email notification
  try {
    await emailService.sendNotificationEmail(
      targetUserId,
      actionName,
      payloadData,
    )
  } catch (error) {
    logger.debug(`Failed to send email notification for test:`, error)
  }

  // Send webhooks based on notification type
  // Note: Webhooks are sent based on entity type, not notification type
  try {
    if (payloadData.order && actionName.startsWith("order_")) {
      if (actionName === "order_comment" && payloadData.comment) {
        await webhookService.sendOrderCommentWebhooks(
          payloadData.order,
          payloadData.comment,
        )
      } else if (actionName.startsWith("order_status_")) {
        const status = actionName.replace("order_status_", "").replace("_", "-")
        await webhookService.sendOrderStatusWebhooks(
          payloadData.order,
          status,
          actorId,
        )
      } else if (actionName === "order_create") {
        await webhookService.sendOrderWebhooks(payloadData.order)
      }
    } else if (payloadData.offer && actionName.startsWith("offer_")) {
      const offerType =
        actionName === "offer_create" ? "offer_create" : "counter_offer_create"
      await webhookService.sendOfferWebhooks(payloadData.offer, offerType)
    } else if (
      payloadData.listing &&
      payloadData.bid &&
      actionName === "market_item_bid"
    ) {
      await webhookService.sendBidWebhooks(payloadData.listing, payloadData.bid)
    }
  } catch (error) {
    logger.debug(`Failed to send webhooks for test:`, error)
  }
}

export const admin_post_test_notification: RequestHandler = async (
  req,
  res,
) => {
  try {
    const { notification_type, target_username } = req.body
    const user = req.user as User

    if (!notification_type) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "notification_type is required",
          ),
        )
      return
    }

    if (!target_username) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "target_username is required",
          ),
        )
      return
    }

    // Verify target user exists and get user_id
    const targetUser = await profileDb.getUser({ username: target_username })
    if (!targetUser) {
      res.status(404).json(createNotFoundErrorResponse("Target user not found"))
      return
    }

    const target_user_id = targetUser.user_id

    let result: { message: string; data?: any } = {
      message: "Notification test completed",
    }

    // Find real data and trigger notification based on type
    switch (notification_type) {
      case "order_create": {
        const orders = await orderDb.getOrders({})
        if (orders.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No orders found in database",
              ),
            )
          return
        }
        const order = orders[0]
        const payload = payloadFormatters.formatOrderNotificationPayload(
          order,
          "order_create",
        )
        await createTestNotification(
          "order_create",
          order.order_id,
          target_user_id,
          user.user_id,
          { order },
          payload,
        )
        result.data = { order_id: order.order_id }
        break
      }

      case "order_assigned": {
        const orders = await orderDb.getOrders({})
        if (orders.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No orders found in database",
              ),
            )
          return
        }
        const order = orders[0]
        const payload = payloadFormatters.formatOrderNotificationPayload(
          order,
          "order_assigned",
        )
        await createTestNotification(
          "order_assigned",
          order.order_id,
          target_user_id,
          user.user_id,
          { order },
          payload,
        )
        result.data = { order_id: order.order_id }
        break
      }

      case "order_message": {
        const orders = await orderDb.getOrders({})
        if (orders.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No orders found in database",
              ),
            )
          return
        }
        // Get chat for the order, then get messages from that chat
        let chat
        try {
          chat = await chatDb.getChat({ order_id: orders[0].order_id })
        } catch {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No chat found for order",
              ),
            )
          return
        }
        const messages = await messageDb.getMessages({
          chat_id: chat.chat_id,
        })
        if (messages.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No messages found for order chat",
              ),
            )
          return
        }
        const order = orders[0]
        const message = messages[0]
        const payload =
          await payloadFormatters.formatOrderMessageNotificationPayload(
            order,
            message,
            chat.chat_id,
          )
        await createTestNotification(
          "order_message",
          order.order_id,
          target_user_id,
          user.user_id,
          { order, message },
          payload,
        )
        result.data = {
          order_id: order.order_id,
          message_id: message.message_id,
        }
        break
      }

      case "order_comment": {
        const comments = await commentDb.getOrderComments({})
        if (comments.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No order comments found in database",
              ),
            )
          return
        }
        const comment = comments[0]
        const order = await orderDb.getOrder({ order_id: comment.order_id })
        const payload = payloadFormatters.formatOrderCommentNotificationPayload(
          order,
          comment,
        )
        await createTestNotification(
          "order_comment",
          comment.comment_id,
          target_user_id,
          user.user_id,
          { order, comment },
          payload,
        )
        result.data = { comment_id: comment.comment_id }
        break
      }

      case "order_review": {
        const reviews = await orderDb.getOrderReviews({})
        if (reviews.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No reviews found in database",
              ),
            )
          return
        }
        const review = reviews[0]
        const payload =
          payloadFormatters.formatOrderReviewNotificationPayload(review)
        await createTestNotification(
          "order_review",
          review.review_id,
          target_user_id,
          user.user_id,
          { review },
          payload,
        )
        result.data = { review_id: review.review_id }
        break
      }

      case "order_status_fulfilled":
      case "order_status_in_progress":
      case "order_status_not_started":
      case "order_status_cancelled": {
        const orders = await orderDb.getOrders({})
        if (orders.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No orders found in database",
              ),
            )
          return
        }
        const order = orders[0]
        const status = notification_type.replace("order_status_", "")
        const actionName = `order_status_${status.replace("-", "_")}`
        const payload = payloadFormatters.formatOrderNotificationPayload(
          order,
          actionName,
        )
        await createTestNotification(
          actionName,
          order.order_id,
          target_user_id,
          user.user_id,
          { order },
          payload,
        )
        result.data = { order_id: order.order_id, status }
        break
      }

      case "offer_create":
      case "counter_offer_create": {
        const offers = await offerDb.getOfferSessions({})
        if (offers.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No offers found in database",
              ),
            )
          return
        }
        const offer = offers[0]
        const offerType =
          notification_type === "offer_create" ? "create" : "counteroffer"
        const payload = payloadFormatters.formatOfferNotificationPayload(
          offer,
          offerType,
        )
        await createTestNotification(
          notification_type,
          offer.id,
          target_user_id,
          user.user_id,
          { offer },
          payload,
        )
        result.data = { offer_id: offer.id }
        break
      }

      case "offer_message": {
        const offers = await offerDb.getOfferSessions({})
        if (offers.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No offers found in database",
              ),
            )
          return
        }
        // Get chat for the offer session, then get messages from that chat
        let chat
        try {
          chat = await chatDb.getChat({ session_id: offers[0].id })
        } catch {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No chat found for offer session",
              ),
            )
          return
        }
        const messages = await messageDb.getMessages({
          chat_id: chat.chat_id,
        })
        if (messages.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No messages found for offer chat",
              ),
            )
          return
        }
        const offer = offers[0]
        const message = messages[0]
        const payload =
          await payloadFormatters.formatOfferMessageNotificationPayload(
            offer,
            message,
            chat.chat_id,
          )
        await createTestNotification(
          "offer_message",
          offer.id,
          target_user_id,
          user.user_id,
          { offer, message },
          payload,
        )
        result.data = {
          offer_id: offer.id,
          message_id: message.message_id,
        }
        break
      }

      case "market_item_bid": {
        const listings = await marketDb.getMarketListings({})
        if (listings.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No market listings found in database",
              ),
            )
          return
        }
        const listing = await marketDb.getMarketListingComplete(
          listings[0].listing_id,
        )
        const bids = await marketDb.getMarketBids({
          listing_id: listing.listing.listing_id,
        })
        if (bids.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No bids found for listing",
              ),
            )
          return
        }
        const bid = bids[0]
        const payload = payloadFormatters.formatMarketBidNotificationPayload(
          listing,
          bid,
        )
        await createTestNotification(
          "market_item_bid",
          bid.bid_id,
          target_user_id,
          user.user_id,
          { listing, bid },
          payload,
        )
        result.data = {
          listing_id: listing.listing.listing_id,
          bid_id: bid.bid_id,
        }
        break
      }

      case "market_item_offer": {
        const listings = await marketDb.getMarketListings({})
        if (listings.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No market listings found in database",
              ),
            )
          return
        }
        const offers = await marketDb.getMarketOffers({
          listing_id: listings[0].listing_id,
        })
        if (offers.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No offers found for listing",
              ),
            )
          return
        }
        const listing = listings[0]
        const offer = offers[0]
        const payload = payloadFormatters.formatMarketOfferNotificationPayload(
          listing,
          offer,
        )
        await createTestNotification(
          "market_item_offer",
          offer.offer_id,
          target_user_id,
          user.user_id,
          { listing, offer },
          payload,
        )
        result.data = {
          listing_id: listing.listing_id,
          offer_id: offer.offer_id,
        }
        break
      }

      case "contractor_invite": {
        const invites = await contractorDb.getContractorInvites({})
        if (invites.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No contractor invites found in database",
              ),
            )
          return
        }
        const invite = invites[0]
        const payload =
          payloadFormatters.formatContractorInviteNotificationPayload(invite)
        await createTestNotification(
          "contractor_invite",
          invite.invite_id,
          target_user_id,
          user.user_id,
          { invite },
          payload,
        )
        result.data = { invite_id: invite.invite_id }
        break
      }

      case "admin_alert": {
        const alerts = await adminDb.getAdminAlerts({})
        if (alerts.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No admin alerts found in database",
              ),
            )
          return
        }
        const alert = alerts[0]
        const payload =
          payloadFormatters.formatAdminAlertNotificationPayload(alert)
        await createTestNotification(
          "admin_alert",
          alert.alert_id,
          target_user_id,
          user.user_id,
          { alert },
          payload,
        )
        result.data = { alert_id: alert.alert_id }
        break
      }

      case "order_review_revision_requested": {
        const reviews = await orderDb.getOrderReviews({})
        if (reviews.length === 0) {
          res
            .status(404)
            .json(
              createErrorResponse(
                ErrorCode.NOT_FOUND,
                "No reviews found in database",
              ),
            )
          return
        }
        const review = reviews[0]
        const payload =
          payloadFormatters.formatOrderReviewRevisionNotificationPayload(review)
        await createTestNotification(
          "order_review_revision_requested",
          review.review_id,
          target_user_id,
          user.user_id,
          { review },
          payload,
        )
        result.data = { review_id: review.review_id }
        break
      }

      default:
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              `Unknown notification type: ${notification_type}`,
            ),
          )
        return
    }

    logger.info(
      `Admin ${user.user_id} tested notification type: ${notification_type}`,
      { target_username, target_user_id, result },
    )

    res.json(createResponse(result))
  } catch (error) {
    logger.error("Error testing notification:", error)
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to test notification",
        ),
      )
  }
}
