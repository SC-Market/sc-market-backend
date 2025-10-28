import { RequestHandler } from "express"
import { User as User } from "../api-models.js"
import { database as database } from "../../../../clients/database/knex-db.js"
import logger from "../../../../logger/logger.js"

export const notification_patch_notification_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const notification_id = req.params.notification_id
  const { read } = req.body as { read: boolean }

  if (typeof read !== "boolean") {
    res
      .status(400)
      .json({ error: "Invalid request body. 'read' field must be a boolean" })
    return
  }

  try {
    const notifications = await database.getNotifications({
      notifier_id: user.user_id,
      notification_id,
    })

    if (!notifications.length) {
      res.status(404).json({ error: "Notification not found" })
      return
    }

    await database.updateNotifications(
      { notifier_id: user.user_id, notification_id },
      { read },
    )

    res.json({ success: true, message: "Notification updated successfully" })
  } catch (error) {
    logger.error("Failed to update notification:", error)
    res.status(500).json({ error: "Failed to update notification" })
  }
}

export const notification_patch_root: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const { read } = req.body as { read: boolean }

  if (typeof read !== "boolean") {
    res.status(400).json({
      error: "Invalid request body. 'read' field must be a boolean",
    })
    return
  }

  try {
    // Get all notifications that would be affected by this update
    const targetNotifications = await database.getNotifications({
      notifier_id: user.user_id,
      read: !read, // If marking as read, get unread ones; if marking as unread, get read ones
    })

    // Update all notifications with the opposite read status
    await database.updateNotifications(
      { notifier_id: user.user_id, read: !read },
      { read },
    )

    const affectedCount = targetNotifications.length
    const action = read ? "marked as read" : "marked as unread"

    logger.debug(`Bulk updated notifications: ${action}`, {
      userId: user.user_id,
      affectedCount,
      read,
    })

    res.json({
      success: true,
      message: `Successfully ${action} ${affectedCount} notification(s)`,
      affected_count: affectedCount,
    })
  } catch (error) {
    logger.error("Failed to bulk update notifications:", error)
    res.status(500).json({ error: "Failed to update notifications" })
  }
}

export const notification_delete_notification_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const notification_id = req.params.notification_id

  try {
    const notifications = await database.getNotifications({
      notifier_id: user.user_id,
      notification_id,
    })

    if (!notifications.length) {
      res.status(404).json({ error: "Notification not found" })
      return
    }

    await database.deleteNotifications({
      notifier_id: user.user_id,
      notification_id,
    })

    res.json({ success: true, message: "Notification deleted successfully" })
  } catch (error) {
    logger.error("Failed to delete notification:", error)
    res.status(500).json({ error: "Failed to delete notification" })
  }
}

export const notification_delete_root: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const { notification_ids } = req.body as { notification_ids?: string[] }

  try {
    let deletedCount = 0

    // If no notification_ids provided or empty array, delete all notifications
    if (!notification_ids || notification_ids.length === 0) {
      // Get all notifications for the user to count them
      const allNotifications = await database.getNotifications({
        notifier_id: user.user_id,
      })

      // Delete all notifications for the user
      await database.deleteNotifications({
        notifier_id: user.user_id,
      })

      deletedCount = allNotifications.length

      logger.debug("Bulk deleted all notifications", {
        userId: user.user_id,
        deletedCount,
      })

      res.json({
        success: true,
        message: `Successfully deleted all ${deletedCount} notification(s)`,
        affected_count: deletedCount,
      })
      return
    }

    // Validate notification_ids array
    if (!Array.isArray(notification_ids)) {
      res.status(400).json({
        error:
          "Invalid request body. 'notification_ids' must be an array or omitted for delete all",
      })
      return
    }

    // Delete specific notifications
    for (const notification_id of notification_ids) {
      const notifications = await database.getNotifications({
        notifier_id: user.user_id,
        notification_id,
      })

      if (notifications.length > 0) {
        await database.deleteNotifications({
          notifier_id: user.user_id,
          notification_id,
        })
        deletedCount++
      }
    }

    logger.debug("Bulk deleted specific notifications", {
      userId: user.user_id,
      requestedIds: notification_ids.length,
      deletedCount,
    })

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} of ${notification_ids.length} requested notification(s)`,
      affected_count: deletedCount,
    })
  } catch (error) {
    logger.error("Failed to bulk delete notifications:", error)
    res.status(500).json({ error: "Failed to delete notifications" })
  }
}

export const notification_get_page: RequestHandler = async (req, res, next) => {
  const user = req.user as User
  const page = +req.params.page
  const pageSize = req.query.pageSize ? +req.query.pageSize : 20
  const actionFilter = req.query.action as string | undefined
  const entityIdFilter = req.query.entityId as string | undefined

  // Validate page parameter
  if (page < 0 || isNaN(page)) {
    res.status(400).json({ error: "Invalid page number" })
    return
  }

  // Validate page size parameter
  if (pageSize < 1 || pageSize > 100 || isNaN(pageSize)) {
    res
      .status(400)
      .json({ error: "Invalid page size. Must be between 1 and 100" })
    return
  }

  try {
    const result = await database.getCompleteNotificationsByUserPaginated(
      user.user_id,
      page,
      pageSize,
      actionFilter,
      entityIdFilter,
    )

    // Get unread count with the same filters
    const unreadCount = await database.getUnreadNotificationCount(
      user.user_id,
      actionFilter,
      entityIdFilter,
    )

    // Add unread count to the response
    const responseWithUnreadCount = {
      ...result,
      unread_count: unreadCount,
    }

    // Log pagination details for debugging
    logger.debug("Notification pagination result", {
      userId: user.user_id,
      page,
      pageSize,
      actionFilter,
      entityIdFilter,
      totalNotifications: result.pagination.total,
      currentPageCount: result.notifications.length,
      unreadCount,
    })

    res.json(responseWithUnreadCount)
  } catch (error) {
    logger.error("Failed to fetch paginated notifications:", error)
    res.status(500).json({ error: "Failed to fetch notifications" })
    return
  }
}
