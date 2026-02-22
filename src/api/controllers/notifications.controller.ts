import {
  Controller,
  Route,
  Get,
  Patch,
  Delete,
  Path,
  Query,
  Body,
  Security,
  Middlewares,
  Response,
  Request,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "./base.controller.js"
import {
  Notification,
  UpdateNotificationPayload,
  BulkDeleteNotificationsPayload,
  NotificationResponse,
  BulkOperationResponse,
  PaginatedNotificationsResponse,
} from "../models/notifications.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
} from "../models/common.models.js"
import * as notificationDb from "../routes/v1/notifications/database.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"

/**
 * Notifications controller for managing user notifications
 */
@Route("api/v1/notification")
export class NotificationsController extends BaseController {
  /**
   * Get paginated notifications for the authenticated user
   * @summary Get paginated notifications
   * @param page Page number (0-indexed)
   * @param pageSize Number of notifications per page (1-100)
   * @param action Filter by notification action
   * @param entityId Filter by entity ID
   * @param scope Filter by scope (individual, organization, or all)
   * @param contractorId Filter by contractor ID
   */
  @Get("{page}")
  @Security("sessionAuth")
  @Security("bearerAuth", ["notifications:read"])
  @Middlewares(tsoaReadRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getNotifications(
    @Path() page: number,
    @Query() pageSize?: number,
    @Query() action?: string,
    @Query() entityId?: string,
    @Query() scope?: "individual" | "organization" | "all",
    @Query() contractorId?: string,
    @Request() request?: ExpressRequest
  ): Promise<PaginatedNotificationsResponse> {
    const userId = this.getUserId(request!)
    const actualPageSize = pageSize || 20

    // Validate page parameter
    if (page < 0 || isNaN(page)) {
      throw {
        status: 400,
        message: "Invalid page number",
      }
    }

    // Validate page size parameter
    if (actualPageSize < 1 || actualPageSize > 100 || isNaN(actualPageSize)) {
      throw {
        status: 400,
        message: "Invalid page size. Must be between 1 and 100",
      }
    }

    // Validate scope filter
    if (scope && !["individual", "organization", "all"].includes(scope)) {
      throw {
        status: 400,
        message: "Invalid scope filter. Must be 'individual', 'organization', or 'all'",
      }
    }

    try {
      const result = await notificationDb.getCompleteNotificationsByUserPaginated(
        userId,
        page,
        actualPageSize,
        action,
        entityId,
        scope || "all",
        contractorId
      )

      // Get unread count with the same filters
      const unreadCount = await notificationDb.getUnreadNotificationCount(
        userId,
        action,
        entityId,
        scope || "all",
        contractorId
      )

      return this.success({
        notifications: result.notifications,
        page: result.pagination.currentPage,
        page_size: result.pagination.pageSize,
        total_count: result.pagination.total,
        total_pages: result.pagination.totalPages,
        unread_count: unreadCount,
      })
    } catch (error) {
      this.logError("getNotifications", error)
      throw {
        status: 500,
        message: "Failed to fetch notifications",
      }
    }
  }

  /**
   * Update notification read status
   * @summary Update notification read status
   * @param notification_id Notification ID
   * @param payload Update payload
   */
  @Patch("{notification_id}")
  @Security("sessionAuth")
  @Security("bearerAuth", ["notifications:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateNotification(
    @Path() notification_id: string,
    @Body() payload: UpdateNotificationPayload,
    @Request() request?: ExpressRequest
  ): Promise<NotificationResponse> {
    const userId = this.getUserId(request!)

    if (typeof payload.read !== "boolean") {
      throw {
        status: 400,
        message: "Invalid request body. 'read' field must be a boolean",
      }
    }

    try {
      const notifications = await notificationDb.getNotifications({
        notifier_id: userId,
        notification_id,
      })

      if (!notifications.length) {
        throw {
          status: 404,
          message: "Notification not found",
        }
      }

      await notificationDb.updateNotifications(
        { notifier_id: userId, notification_id },
        { read: payload.read }
      )

      return this.success({
        success: true,
        message: "Notification updated successfully",
      })
    } catch (error: any) {
      if (error.status) throw error
      this.logError("updateNotification", error)
      throw {
        status: 500,
        message: "Failed to update notification",
      }
    }
  }

  /**
   * Mark all notifications as read
   * @summary Mark all notifications as read
   * @param payload Update payload
   */
  @Patch()
  @Security("sessionAuth")
  @Security("bearerAuth", ["notifications:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async bulkUpdateNotifications(
    @Body() payload: UpdateNotificationPayload,
    @Request() request?: ExpressRequest
  ): Promise<BulkOperationResponse> {
    const userId = this.getUserId(request!)

    if (typeof payload.read !== "boolean") {
      throw {
        status: 400,
        message: "Invalid request body. 'read' field must be a boolean",
      }
    }

    try {
      // Get all notifications that would be affected by this update
      const targetNotifications = await notificationDb.getNotifications({
        notifier_id: userId,
        read: !payload.read, // If marking as read, get unread ones; if marking as unread, get read ones
      })

      // Update all notifications with the opposite read status
      await notificationDb.updateNotifications(
        { notifier_id: userId, read: !payload.read },
        { read: payload.read }
      )

      const affectedCount = targetNotifications.length
      const action = payload.read ? "marked as read" : "marked as unread"

      this.logInfo("bulkUpdateNotifications", `${action} ${affectedCount} notifications`, {
        userId,
        affectedCount,
        read: payload.read,
      })

      return this.success({
        success: true,
        message: `Successfully ${action} ${affectedCount} notification(s)`,
        affected_count: affectedCount,
      })
    } catch (error) {
      this.logError("bulkUpdateNotifications", error)
      throw {
        status: 500,
        message: "Failed to update notifications",
      }
    }
  }

  /**
   * Delete a specific notification
   * @summary Delete a notification
   * @param notification_id Notification ID
   */
  @Delete("{notification_id}")
  @Security("sessionAuth")
  @Security("bearerAuth", ["notifications:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async deleteNotification(
    @Path() notification_id: string,
    @Request() request?: ExpressRequest
  ): Promise<NotificationResponse> {
    const userId = this.getUserId(request!)

    try {
      const notifications = await notificationDb.getNotifications({
        notifier_id: userId,
        notification_id,
      })

      if (!notifications.length) {
        throw {
          status: 404,
          message: "Notification not found",
        }
      }

      await notificationDb.deleteNotifications({
        notifier_id: userId,
        notification_id,
      })

      return this.success({
        success: true,
        message: "Notification deleted successfully",
      })
    } catch (error: any) {
      if (error.status) throw error
      this.logError("deleteNotification", error)
      throw {
        status: 500,
        message: "Failed to delete notification",
      }
    }
  }

  /**
   * Delete multiple notifications or all notifications
   * @summary Bulk delete notifications
   * @param payload Delete payload (empty for delete all, or array of notification IDs)
   */
  @Delete()
  @Security("sessionAuth")
  @Security("bearerAuth", ["notifications:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async bulkDeleteNotifications(
    @Body() payload: BulkDeleteNotificationsPayload,
    @Request() request?: ExpressRequest
  ): Promise<BulkOperationResponse> {
    const userId = this.getUserId(request!)

    try {
      let deletedCount = 0

      // If no notification_ids provided or empty array, delete all notifications
      if (!payload.notification_ids || payload.notification_ids.length === 0) {
        // Get all notifications for the user to count them
        const allNotifications = await notificationDb.getNotifications({
          notifier_id: userId,
        })

        // Delete all notifications for the user
        await notificationDb.deleteNotifications({
          notifier_id: userId,
        })

        deletedCount = allNotifications.length

        this.logInfo("bulkDeleteNotifications", `Deleted all ${deletedCount} notifications`, {
          userId,
          deletedCount,
        })

        return this.success({
          success: true,
          message: `Successfully deleted all ${deletedCount} notification(s)`,
          affected_count: deletedCount,
        })
      }

      // Validate notification_ids array
      if (!Array.isArray(payload.notification_ids)) {
        throw {
          status: 400,
          message: "Invalid request body. 'notification_ids' must be an array or omitted for delete all",
        }
      }

      // Delete specific notifications
      for (const notification_id of payload.notification_ids) {
        const notifications = await notificationDb.getNotifications({
          notifier_id: userId,
          notification_id,
        })

        if (notifications.length > 0) {
          await notificationDb.deleteNotifications({
            notifier_id: userId,
            notification_id,
          })
          deletedCount++
        }
      }

      this.logInfo("bulkDeleteNotifications", `Deleted ${deletedCount} notifications`, {
        userId,
        requestedIds: payload.notification_ids.length,
        deletedCount,
      })

      return this.success({
        success: true,
        message: `Successfully deleted ${deletedCount} of ${payload.notification_ids.length} requested notification(s)`,
        affected_count: deletedCount,
      })
    } catch (error: any) {
      if (error.status) throw error
      this.logError("bulkDeleteNotifications", error)
      throw {
        status: 500,
        message: "Failed to delete notifications",
      }
    }
  }
}
