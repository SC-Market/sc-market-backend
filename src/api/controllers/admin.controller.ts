/**
 * Admin Controller
 * TSOA controller for admin-only endpoints
 * 
 * Provides:
 * - Platform activity statistics
 * - Order analytics
 * - User management
 * - Membership analytics
 * - Audit logs
 * - Account management
 * - Notification testing
 */

import { Controller, Get, Post, Route, Query, Path, Body, Request, Security, Middlewares, Response, SuccessResponse } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController, NotFoundError, ValidationErrorClass } from "./base.controller.js"
import { 
  ActivityResponse,
  OrderAnalyticsResponse,
  UsersResponse,
  MembershipAnalyticsResponse,
  AuditLogsResponse,
  UnlinkAccountResponse,
  TestNotificationRequest,
  TestNotificationResponse
} from "../models/admin.models.js"
import { ErrorResponse } from "../models/common.models.js"
import * as adminDb from "../routes/v1/admin/database.js"
import * as orderDb from "../routes/v1/orders/database.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import * as notificationDb from "../routes/v1/notifications/database.js"
import * as marketDb from "../routes/v1/market/database.js"
import * as offerDb from "../routes/v1/offers/database.js"
import * as messageDb from "../routes/v1/chats/database.js"
import * as chatDb from "../routes/v1/chats/database.js"
import { database } from "../../clients/database/knex-db.js"
import { MinimalUser } from "../models/common.models.js"
import { notificationService } from "../../services/notifications/notification.service.js"
import { pushNotificationService } from "../../services/push-notifications/push-notification.service.js"
import { emailService } from "../../services/email/email.service.js"
import { webhookService } from "../../services/webhooks/webhook.service.js"
import * as payloadFormatters from "../../services/notifications/notification-payload-formatters.js"
import { 
  convertActivityToGrafana,
  convertOrderAnalyticsToGrafana,
  convertMembershipAnalyticsToGrafana
} from "../routes/v1/admin/grafana-formatter.js"

@Route("api/v1/admin")
export class AdminController extends BaseController {

  /**
   * Get platform activity statistics
   * Returns daily, weekly, and monthly activity counts
   * 
   * @summary Get platform activity statistics
   * @param format Optional format parameter (grafana for Grafana JSON datasource format)
   */
  @Get("activity")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Response<ErrorResponse>(401, "Unauthorized")
  @Response<ErrorResponse>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getActivity(
    @Query() format?: string,
    @Request() request?: ExpressRequest
  ): Promise<{ data: ActivityResponse } | any> {
    try {
      const daily = await adminDb.getDailyActivity()
      const weekly = await adminDb.getWeeklyActivity()
      const monthly = await adminDb.getMonthlyActivity()

      // Check if Grafana format is requested
      if (format === "grafana") {
        return [
          ...convertActivityToGrafana(daily, "daily_activity"),
          ...convertActivityToGrafana(weekly, "weekly_activity"),
          ...convertActivityToGrafana(monthly, "monthly_activity"),
        ]
      }

      return this.success({ daily, weekly, monthly })
    } catch (error) {
      this.handleError(error, "getActivity")
    }
  }

  /**
   * Get comprehensive order analytics
   * Returns detailed order statistics including time-series data, top performers, and summary metrics
   * 
   * @summary Get order analytics
   * @param format Optional format parameter (grafana for Grafana JSON datasource format)
   */
  @Get("orders/analytics")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Response<ErrorResponse>(401, "Unauthorized")
  @Response<ErrorResponse>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getOrderAnalytics(
    @Query() format?: string,
    @Request() request?: ExpressRequest
  ): Promise<{ data: OrderAnalyticsResponse } | any> {
    try {
      const analytics = await orderDb.getOrderAnalytics()

      // Check if Grafana format is requested
      if (format === "grafana") {
        return [
          ...convertOrderAnalyticsToGrafana(analytics.daily_totals, "daily"),
          ...convertOrderAnalyticsToGrafana(analytics.weekly_totals, "weekly"),
          ...convertOrderAnalyticsToGrafana(analytics.monthly_totals, "monthly"),
        ]
      }

      return this.success(analytics)
    } catch (error) {
      this.handleError(error, "getOrderAnalytics")
    }
  }

  /**
   * Get all users with pagination and filtering
   * 
   * @summary Get all users
   * @param page Page number (1-based)
   * @param page_size Number of users per page (1-100)
   * @param role Filter by user role
   * @param banned Filter by banned status
   * @param rsi_confirmed Filter by RSI confirmation status
   * @param sort_by Field to sort by
   * @param sort_order Sort order (asc or desc)
   */
  @Get("users")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Response<ErrorResponse>(401, "Unauthorized")
  @Response<ErrorResponse>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getUsers(
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() role?: "user" | "admin",
    @Query() banned?: boolean,
    @Query() rsi_confirmed?: boolean,
    @Query() sort_by?: "created_at" | "username" | "display_name" | "role" | "banned" | "rsi_confirmed" | "balance" | "locale",
    @Query() sort_order?: "asc" | "desc",
    @Request() request?: ExpressRequest
  ): Promise<{ data: UsersResponse }> {
    try {
      const pageNum = Math.max(1, page || 1)
      const pageSize = Math.min(100, Math.max(1, page_size || 20))
      
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
      const sortByField = sort_by && validSortFields.includes(sort_by) ? sort_by : "created_at"
      const sortOrderValue = sort_order || "desc"

      // Build where clause for filtering
      const whereClause: any = {}
      if (role) {
        whereClause.role = role
      }
      if (banned !== undefined) {
        whereClause.banned = banned
      }
      if (rsi_confirmed !== undefined) {
        whereClause.rsi_confirmed = rsi_confirmed
      }

      const result = await profileDb.getUsersPaginated(
        pageNum,
        pageSize,
        whereClause,
        sortByField,
        sortOrderValue,
      )

      return this.success(result)
    } catch (error) {
      this.handleError(error, "getUsers")
    }
  }

  /**
   * Get membership analytics over time
   * Returns detailed membership growth statistics including time-series data and summary metrics
   * 
   * @summary Get membership analytics
   * @param format Optional format parameter (grafana for Grafana JSON datasource format)
   */
  @Get("membership/analytics")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Response<ErrorResponse>(401, "Unauthorized")
  @Response<ErrorResponse>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getMembershipAnalytics(
    @Query() format?: string,
    @Request() request?: ExpressRequest
  ): Promise<{ data: MembershipAnalyticsResponse } | any> {
    try {
      const analytics = await adminDb.getMembershipAnalytics()

      // Check if Grafana format is requested
      if (format === "grafana") {
        return [
          ...convertMembershipAnalyticsToGrafana(analytics.daily_totals, "daily"),
          ...convertMembershipAnalyticsToGrafana(analytics.weekly_totals, "weekly"),
          ...convertMembershipAnalyticsToGrafana(analytics.monthly_totals, "monthly"),
        ]
      }

      return this.success(analytics)
    } catch (error) {
      this.handleError(error, "getMembershipAnalytics")
    }
  }

  /**
   * Get audit logs with filtering and pagination
   * 
   * @summary Get audit logs
   * @param page Page number (1-based)
   * @param page_size Number of audit log entries per page (1-100)
   * @param action Filter by action type
   * @param subject_type Filter by subject type
   * @param subject_id Filter by specific subject ID
   * @param actor_id Filter by actor user ID
   * @param start_date Filter logs after this date (ISO 8601 format)
   * @param end_date Filter logs before this date (ISO 8601 format)
   */
  @Get("audit-logs")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Response<ErrorResponse>(401, "Unauthorized")
  @Response<ErrorResponse>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getAuditLogs(
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() action?: string,
    @Query() subject_type?: string,
    @Query() subject_id?: string,
    @Query() actor_id?: string,
    @Query() start_date?: string,
    @Query() end_date?: string,
    @Request() request?: ExpressRequest
  ): Promise<{ data: AuditLogsResponse }> {
    try {
      const pageNum = Math.max(1, page || 1)
      const pageSize = Math.min(100, Math.max(1, page_size || 20))

      // Build query
      let query = database.knex("audit_logs").select("audit_logs.*")

      // Apply filters
      if (action) {
        query = query.where("audit_logs.action", action)
      }
      if (subject_type) {
        query = query.where("audit_logs.subject_type", subject_type)
      }
      if (subject_id) {
        query = query.where("audit_logs.subject_id", subject_id)
      }
      if (actor_id) {
        query = query.where("audit_logs.actor_id", actor_id)
      }
      if (start_date) {
        query = query.where("audit_logs.created_at", ">=", start_date)
      }
      if (end_date) {
        query = query.where("audit_logs.created_at", "<=", end_date)
      }

      // Get total count
      const countQuery = query.clone().clearSelect().count("* as count").first()
      const totalResult = await countQuery
      const total = totalResult ? parseInt(totalResult.count as string) : 0

      // Apply pagination and ordering
      const offset = (pageNum - 1) * pageSize
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

      return this.success({
        items,
        total,
        page: pageNum,
        page_size: pageSize,
      })
    } catch (error) {
      this.handleError(error, "getAuditLogs")
    }
  }

  /**
   * Unlink user's Star Citizen account
   * Admin endpoint to unlink a user's Star Citizen account, returning them to unverified status
   * 
   * @summary Unlink user's Star Citizen account
   * @param username Username of the user to unlink
   */
  @Post("users/{username}/unlink")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @SuccessResponse(200, "User account successfully unlinked")
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<ErrorResponse>(401, "Unauthorized")
  @Response<ErrorResponse>(403, "Forbidden")
  @Response<ErrorResponse>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async unlinkUserAccount(
    @Path() username: string,
    @Request() request: ExpressRequest
  ): Promise<{ data: UnlinkAccountResponse }> {
    try {
      const adminUser = this.getUser(request)

      // Get the target user
      const user = await profileDb.getUser({ username })
      if (!user) {
        throw new NotFoundError("User not found")
      }

      // Check if user is currently verified
      if (!user.rsi_confirmed) {
        throw new ValidationErrorClass(
          "User is not currently verified with a Star Citizen account"
        )
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

      this.logInfo(
        "unlinkUserAccount",
        `Admin ${adminUser.user_id} unlinked Star Citizen account for user ${user.user_id} (${username}). Reset to default usernames.`
      )

      return this.success({
        message: "User account successfully unlinked",
        username: defaultUsername,
      })
    } catch (error) {
      this.handleError(error, "unlinkUserAccount")
    }
  }

  /**
   * Test notification with real data
   * Admin endpoint to test any notification type using real data from the database
   * 
   * @summary Test notification
   * @param payload Notification test request
   */
  @Post("notifications/test")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @SuccessResponse(200, "Notification test completed")
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<ErrorResponse>(401, "Unauthorized")
  @Response<ErrorResponse>(403, "Forbidden")
  @Response<ErrorResponse>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async testNotification(
    @Body() payload: TestNotificationRequest,
    @Request() request: ExpressRequest
  ): Promise<{ data: TestNotificationResponse }> {
    try {
      const user = this.getUser(request)
      const { notification_type, target_username, contractor_id } = payload

      // Verify target user exists and get user_id
      const targetUser = await profileDb.getUser({ username: target_username })
      if (!targetUser) {
        throw new NotFoundError("Target user not found")
      }

      const target_user_id = targetUser.user_id

      let result: TestNotificationResponse = {
        message: "Notification test completed",
      }

      // Find real data and trigger notification based on type
      switch (notification_type) {
        case "order_create":
        case "order_assigned": {
          const orders = await orderDb.getOrders({})
          if (orders.length === 0) {
            throw new NotFoundError("No orders found in database")
          }
          const order = orders[0]
          const payload = payloadFormatters.formatOrderNotificationPayload(
            order,
            notification_type,
          )
          const contractorIdToUse = contractor_id ?? order.contractor_id ?? null
          await this.createTestNotification(
            notification_type,
            order.order_id,
            target_user_id,
            user.user_id,
            { order },
            payload,
            contractorIdToUse,
          )
          result.data = { order_id: order.order_id, contractor_id: contractorIdToUse }
          break
        }

        case "order_message": {
          const orders = await orderDb.getOrders({})
          if (orders.length === 0) {
            throw new NotFoundError("No orders found in database")
          }
          let chat
          try {
            chat = await chatDb.getChat({ order_id: orders[0].order_id })
          } catch {
            throw new NotFoundError("No chat found for order")
          }
          const messages = await messageDb.getMessages({
            chat_id: chat.chat_id,
          })
          if (messages.length === 0) {
            throw new NotFoundError("No messages found for order chat")
          }
          const order = orders[0]
          const message = messages[0]
          const notifPayload =
            await payloadFormatters.formatOrderMessageNotificationPayload(
              order,
              message,
              chat.chat_id,
            )
          const contractorIdToUse = contractor_id ?? order.contractor_id ?? null
          await this.createTestNotification(
            "order_message",
            order.order_id,
            target_user_id,
            user.user_id,
            { order, message },
            notifPayload,
            contractorIdToUse,
          )
          result.data = {
            order_id: order.order_id,
            message_id: message.message_id,
          }
          break
        }

        case "order_comment": {
          const comments = await orderDb.getOrderComments({})
          if (comments.length === 0) {
            throw new NotFoundError("No order comments found in database")
          }
          const comment = comments[0]
          const order = await orderDb.getOrder({ order_id: comment.order_id })
          const notifPayload = payloadFormatters.formatOrderCommentNotificationPayload(
            order,
            comment,
          )
          const contractorIdToUse = contractor_id ?? order.contractor_id ?? null
          await this.createTestNotification(
            "order_comment",
            comment.comment_id,
            target_user_id,
            user.user_id,
            { order, comment },
            notifPayload,
            contractorIdToUse,
          )
          result.data = { comment_id: comment.comment_id }
          break
        }

        case "order_review": {
          const reviews = await orderDb.getOrderReviews({})
          if (reviews.length === 0) {
            throw new NotFoundError("No reviews found in database")
          }
          const review = reviews[0]
          const notifPayload =
            payloadFormatters.formatOrderReviewNotificationPayload(review)
          await this.createTestNotification(
            "order_review",
            review.review_id,
            target_user_id,
            user.user_id,
            { review },
            notifPayload,
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
            throw new NotFoundError("No orders found in database")
          }
          const order = orders[0]
          const status = notification_type.replace("order_status_", "")
          const actionName = `order_status_${status.replace("-", "_")}`
          const notifPayload = payloadFormatters.formatOrderNotificationPayload(
            order,
            actionName,
          )
          const contractorIdToUse = contractor_id ?? order.contractor_id ?? null
          await this.createTestNotification(
            actionName,
            order.order_id,
            target_user_id,
            user.user_id,
            { order },
            notifPayload,
            contractorIdToUse,
          )
          result.data = { order_id: order.order_id, status }
          break
        }

        case "offer_create":
        case "counter_offer_create": {
          const offers = await offerDb.getOfferSessions({})
          if (offers.length === 0) {
            throw new NotFoundError("No offers found in database")
          }
          const offer = offers[0]
          const offerType =
            notification_type === "offer_create" ? "create" : "counteroffer"
          const notifPayload = payloadFormatters.formatOfferNotificationPayload(
            offer,
            offerType,
          )
          const contractorIdToUse = contractor_id ?? offer.contractor_id ?? null
          await this.createTestNotification(
            notification_type,
            offer.id,
            target_user_id,
            user.user_id,
            { offer },
            notifPayload,
            contractorIdToUse,
          )
          result.data = { offer_id: offer.id }
          break
        }

        case "offer_message": {
          const offers = await offerDb.getOfferSessions({})
          if (offers.length === 0) {
            throw new NotFoundError("No offers found in database")
          }
          let chat
          try {
            chat = await chatDb.getChat({ session_id: offers[0].id })
          } catch {
            throw new NotFoundError("No chat found for offer session")
          }
          const messages = await messageDb.getMessages({
            chat_id: chat.chat_id,
          })
          if (messages.length === 0) {
            throw new NotFoundError("No messages found for offer chat")
          }
          const offer = offers[0]
          const message = messages[0]
          const notifPayload =
            await payloadFormatters.formatOfferMessageNotificationPayload(
              offer,
              message,
              chat.chat_id,
            )
          const contractorIdToUse = contractor_id ?? offer.contractor_id ?? null
          await this.createTestNotification(
            "offer_message",
            offer.id,
            target_user_id,
            user.user_id,
            { offer, message },
            notifPayload,
            contractorIdToUse,
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
            throw new NotFoundError("No market listings found in database")
          }
          const listing = await marketDb.getMarketListingComplete(
            listings[0].listing_id,
          )
          const bids = await marketDb.getMarketBids({
            listing_id: listing.listing.listing_id,
          })
          if (bids.length === 0) {
            throw new NotFoundError("No bids found for listing")
          }
          const bid = bids[0]
          const notifPayload = payloadFormatters.formatMarketBidNotificationPayload(
            listing,
            bid,
          )
          await this.createTestNotification(
            "market_item_bid",
            bid.bid_id,
            target_user_id,
            user.user_id,
            { listing, bid },
            notifPayload,
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
            throw new NotFoundError("No market listings found in database")
          }
          const offers = await marketDb.getMarketOffers({
            listing_id: listings[0].listing_id,
          })
          if (offers.length === 0) {
            throw new NotFoundError("No offers found for listing")
          }
          const listing = listings[0]
          const offer = offers[0]
          const notifPayload = payloadFormatters.formatMarketOfferNotificationPayload(
            listing,
            offer,
          )
          await this.createTestNotification(
            "market_item_offer",
            offer.offer_id,
            target_user_id,
            user.user_id,
            { listing, offer },
            notifPayload,
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
            throw new NotFoundError("No contractor invites found in database")
          }
          const invite = invites[0]
          const notifPayload =
            payloadFormatters.formatContractorInviteNotificationPayload(invite)
          await this.createTestNotification(
            "contractor_invite",
            invite.invite_id,
            target_user_id,
            user.user_id,
            { invite },
            notifPayload,
          )
          result.data = { invite_id: invite.invite_id }
          break
        }

        case "admin_alert": {
          const alerts = await adminDb.getAdminAlerts({})
          if (alerts.length === 0) {
            throw new NotFoundError("No admin alerts found in database")
          }
          const alert = alerts[0]
          const notifPayload =
            payloadFormatters.formatAdminAlertNotificationPayload(alert)
          await this.createTestNotification(
            "admin_alert",
            alert.alert_id,
            target_user_id,
            user.user_id,
            { alert },
            notifPayload,
          )
          result.data = { alert_id: alert.alert_id }
          break
        }

        case "order_review_revision_requested": {
          const reviews = await orderDb.getOrderReviews({})
          if (reviews.length === 0) {
            throw new NotFoundError("No reviews found in database")
          }
          const review = reviews[0]
          const notifPayload =
            payloadFormatters.formatOrderReviewRevisionNotificationPayload(review)
          await this.createTestNotification(
            "order_review_revision_requested",
            review.review_id,
            target_user_id,
            user.user_id,
            { review },
            notifPayload,
          )
          result.data = { review_id: review.review_id }
          break
        }

        default:
          throw new ValidationErrorClass(
            `Unknown notification type: ${notification_type}`
          )
      }

      this.logInfo(
        "testNotification",
        `Admin ${user.user_id} tested notification type: ${notification_type}`,
        { target_username, target_user_id, result }
      )

      return this.success(result)
    } catch (error) {
      this.handleError(error, "testNotification")
    }
  }

  /**
   * Helper function to create a test notification directly to a target user
   */
  private async createTestNotification(
    actionName: string,
    entityId: string,
    targetUserId: string,
    actorId: string,
    payloadData: any,
    pushPayload?: any,
    contractorId?: string | null,
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
          contractorId ?? null,
        )
      } catch (error) {
        this.logInfo("createTestNotification", "Failed to send push notification for test", { error })
      }
    }

    // Send email notification
    try {
      await emailService.sendNotificationEmail(
        targetUserId,
        actionName,
        payloadData,
        false,
        contractorId ?? null,
      )
    } catch (error) {
      this.logInfo("createTestNotification", "Failed to send email notification for test", { error })
    }

    // Send webhooks based on notification type
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
      this.logInfo("createTestNotification", "Failed to send webhooks for test", { error })
    }
  }
}
