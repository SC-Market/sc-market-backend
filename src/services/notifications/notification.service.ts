import {
  DBAdminAlert,
  DBContractorInvite,
  DBMarketBid,
  DBMarketListing,
  DBMarketListingComplete,
  DBMarketOffer,
  DBMessage,
  DBOfferSession,
  DBOrder,
  DBOrderComment,
  DBReview,
} from "../../clients/database/db-models.js"
import { User } from "../../api/routes/v1/api-models.js"
import * as notificationDb from "../../api/routes/v1/notifications/database.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import * as chatDb from "../../api/routes/v1/chats/database.js"
import * as adminDb from "../../api/routes/v1/admin/database.js"
import logger from "../../logger/logger.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"
import { pushNotificationService } from "../push-notifications/push-notification.service.js"
import { webhookService } from "../webhooks/webhook.service.js"
import { emailService } from "../email/email.service.js"
import * as payloadFormatters from "./notification-payload-formatters.js"

/**
 * Service interface for notification creation and management.
 * This service handles creating in-app notifications and coordinates
 * with delivery services (Discord, webhooks, push notifications).
 */
export interface NotificationService {
  // Order notifications
  createOrderNotification(order: DBOrder): Promise<void>
  createOrderAssignedNotification(order: DBOrder): Promise<void>
  createOrderMessageNotification(
    order: DBOrder,
    message: DBMessage,
  ): Promise<void>
  createOrderCommentNotification(
    comment: DBOrderComment,
    actorId: string,
  ): Promise<void>
  createOrderReviewNotification(review: DBReview): Promise<void>
  createOrderStatusNotification(
    order: DBOrder,
    newStatus: string,
    actorId: string,
  ): Promise<void>

  // Offer notifications
  createOfferNotification(
    offer: DBOfferSession,
    type: "create" | "counteroffer",
  ): Promise<void>
  createOfferMessageNotification(
    session: DBOfferSession,
    message: DBMessage,
  ): Promise<void>

  // Market notifications
  createMarketBidNotification(
    listing: DBMarketListingComplete,
    bid: DBMarketBid,
  ): Promise<void>
  createMarketOfferNotification(
    listing: DBMarketListing,
    offer: DBMarketOffer,
  ): Promise<void>

  // Other notifications
  createContractorInviteNotification(invite: DBContractorInvite): Promise<void>
  createAdminAlertNotification(alert: DBAdminAlert): Promise<void>
  createOrderReviewRevisionNotification(
    review: DBReview,
    requester: User,
  ): Promise<void>
}

/**
 * Database-backed implementation of NotificationService.
 * This implementation creates notifications in the database and coordinates
 * with delivery services. Delivery services (Discord, webhooks, push) will
 * be integrated in later phases.
 */
class DatabaseNotificationService implements NotificationService {
  async createOrderNotification(order: DBOrder): Promise<void> {
    // Handle contractor notifications
    if (order.contractor_id) {
      await this.createOrderContractorNotification(order)
    }

    // Handle assigned user notifications
    if (order.assigned_id) {
      await this.createOrderAssignedNotification(order)
    } else {
      // Send webhooks for unassigned orders
      await webhookService.sendOrderWebhooks(order)
    }
  }

  /**
   * Creates notification for contractor members when an order is created.
   * Notifies all contractor members with manage_orders permission.
   */
  private async createOrderContractorNotification(
    order: DBOrder,
  ): Promise<void> {
    const action =
      await notificationDb.getNotificationActionByName("order_create")
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: order.order_id,
      },
    ])

    await notificationDb.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: order.customer_id,
      },
    ])

    const admins = await contractorDb.getMembersWithMatchingRole(
      order.contractor_id!,
      { manage_orders: true },
    )

    logger.debug(
      `Found ${admins.length} contractor members with manage_orders role for contractor ${order.contractor_id}`,
      {
        contractor_id: order.contractor_id,
        admin_count: admins.length,
        admin_user_ids: admins.map((a) => a.user_id),
      },
    )

    if (admins.length > 0) {
      await notificationDb.insertNotifications(
        admins.map((u) => ({
          notification_object_id: notif_objects[0].notification_object_id,
          notifier_id: u.user_id,
        })),
      )

      // Send push notifications to contractor members
      const payload = payloadFormatters.formatOrderNotificationPayload(
        order,
        "order_create",
      )
      for (const admin of admins) {
        try {
          logger.debug(
            `Sending order_create push notification to contractor member ${admin.user_id}`,
            {
              user_id: admin.user_id,
              contractor_id: order.contractor_id,
              notification_type: "order_create",
            },
          )
          await pushNotificationService.sendPushNotification(
            admin.user_id,
            payload,
            "order_create",
            order.contractor_id, // contractorId for org-scoped preferences
          )
          logger.debug(
            `Successfully sent push notification to contractor member ${admin.user_id}`,
            {
              user_id: admin.user_id,
              contractor_id: order.contractor_id,
            },
          )
        } catch (error) {
          logger.error(
            `Failed to send push notification to contractor member ${admin.user_id}:`,
            {
              error,
              user_id: admin.user_id,
              contractor_id: order.contractor_id,
              notification_type: "order_create",
            },
          )
        }
      }

      // Send email notifications to contractor members
      for (const admin of admins) {
        try {
          logger.debug(
            `Sending order_create email notification to contractor member ${admin.user_id}`,
            {
              user_id: admin.user_id,
              contractor_id: order.contractor_id,
              notification_type: "order_create",
            },
          )
          const emailSent = await emailService.sendNotificationEmail(
            admin.user_id,
            "order_create",
            {
              order,
            },
            false, // skipQueue
            order.contractor_id, // contractorId for org-scoped preferences
          )
          if (emailSent) {
            logger.debug(
              `Successfully sent email notification to contractor member ${admin.user_id}`,
              {
                user_id: admin.user_id,
                contractor_id: order.contractor_id,
              },
            )
          } else {
            logger.debug(
              `Email notification not sent to contractor member ${admin.user_id} (preference disabled or no email)`,
              {
                user_id: admin.user_id,
                contractor_id: order.contractor_id,
              },
            )
          }
        } catch (error) {
          logger.error(
            `Failed to send email notification to contractor member ${admin.user_id}:`,
            {
              error,
              user_id: admin.user_id,
              contractor_id: order.contractor_id,
              notification_type: "order_create",
            },
          )
        }
      }
    }
  }

  async createOrderAssignedNotification(order: DBOrder): Promise<void> {
    if (!order.assigned_id) {
      return
    }

    const action =
      await notificationDb.getNotificationActionByName("order_assigned")
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: order.order_id,
      },
    ])

    await notificationDb.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: order.customer_id,
      },
    ])

    await notificationDb.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: order.assigned_id,
      },
    ])

    // Send push notification to assigned user
    try {
      logger.debug(`Sending push notification for order assignment`, {
        order_id: order.order_id,
        assigned_id: order.assigned_id,
        action_type: "order_assigned",
      })
      const payload = payloadFormatters.formatOrderNotificationPayload(
        order,
        "order_assigned",
      )
      await pushNotificationService.sendPushNotification(
        order.assigned_id,
        payload,
        "order_assigned",
        order.contractor_id ?? null, // contractorId for org-scoped preferences
      )
    } catch (error) {
      // Log but don't fail notification creation if push fails
      logger.error(`Failed to send push notification for order assignment:`, {
        order_id: order.order_id,
        assigned_id: order.assigned_id,
        contractor_id: order.contractor_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // Send email notification to assigned user
    try {
      await emailService.sendNotificationEmail(
        order.assigned_id,
        "order_assigned",
        {
          order,
        },
        false, // skipQueue
        order.contractor_id ?? null, // contractorId for org-scoped preferences
      )
    } catch (error) {
      // Log but don't fail notification creation if email fails
      logger.error(`Failed to send email notification for order assignment:`, {
        order_id: order.order_id,
        assigned_id: order.assigned_id,
        contractor_id: order.contractor_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async createOrderMessageNotification(
    order: DBOrder,
    message: DBMessage,
  ): Promise<void> {
    logger.debug(
      `Creating order message notification for order ${order.order_id}, message ${message.message_id}`,
    )

    try {
      const action =
        await notificationDb.getNotificationActionByName("order_message")
      logger.debug(`Found notification action: ${action.action_type_id}`)

      // Check if there's already a notification object for this order and action type
      const existingNotificationObject =
        await notificationDb.getNotificationObjectByEntityAndAction(
          order.order_id,
          action.action_type_id,
        )

      let notificationObjectId: string

      if (existingNotificationObject) {
        // Reuse existing notification object and update timestamp
        notificationObjectId = existingNotificationObject.notification_object_id
        await notificationDb.updateNotificationObjectTimestamp(
          notificationObjectId,
        )
        logger.debug(
          `Reusing existing notification object: ${notificationObjectId}`,
        )
      } else {
        // Create new notification object
        const notif_objects = await notificationDb.insertNotificationObjects([
          {
            action_type_id: action.action_type_id,
            entity_id: order.order_id,
          },
        ])
        notificationObjectId = notif_objects[0].notification_object_id
        logger.debug(`Created new notification object: ${notificationObjectId}`)
      }

      // Add notification change for this message
      await notificationDb.insertNotificationChange([
        {
          notification_object_id: notificationObjectId,
          actor_id: message.author!,
        },
      ])
      logger.debug(`Created notification change for actor: ${message.author}`)

      let notificationCount = 0
      for (const notified of [order.assigned_id, order.customer_id]) {
        if (!notified || notified === message.author) {
          logger.debug(`Skipping notification for ${notified} (author or null)`)
          continue
        }

        // Check if user already has an unread notification for this order
        const existingNotification =
          await notificationDb.getUnreadNotificationByUserAndObject(
            notified,
            notificationObjectId,
          )

        if (existingNotification) {
          logger.debug(
            `User ${notified} already has unread notification, skipping`,
          )
          continue
        }

        await notificationDb.insertNotifications([
          {
            notification_object_id: notificationObjectId,
            notifier_id: notified,
          },
        ])
        notificationCount++

        // Send push notification with enhanced payload
        try {
          // Get chat_id for the order
          let chatId: string | undefined
          try {
            const chat = await chatDb.getChat({ order_id: order.order_id })
            chatId = chat.chat_id
          } catch {
            // Chat not found, continue without chatId
          }

          const payload =
            await payloadFormatters.formatOrderMessageNotificationPayload(
              order,
              message,
              chatId,
            )
          await pushNotificationService.sendPushNotification(
            notified,
            payload,
            "order_message",
            order.contractor_id ?? null, // contractorId for org-scoped preferences
          )
        } catch (error) {
          // Log but don't fail notification creation if push fails
          logger.error(
            `Failed to send push notification for order message to user ${notified}:`,
            {
              error,
              user_id: notified,
              order_id: order.order_id,
              contractor_id: order.contractor_id,
            },
          )
        }

        // Send email notification
        try {
          await emailService.sendNotificationEmail(
            notified,
            "order_message",
            {
              order,
              message,
            },
            false, // skipQueue
            order.contractor_id ?? null, // contractorId for org-scoped preferences
          )
        } catch (error) {
          logger.error(
            `Failed to send email notification for order message to user ${notified}:`,
            {
              error,
              user_id: notified,
              order_id: order.order_id,
              contractor_id: order.contractor_id,
            },
          )
        }
      }

      logger.debug(
        `Successfully created ${notificationCount} order message notifications`,
      )
    } catch (error) {
      logger.error(`Error creating order message notification:`, error)
      throw error
    }
  }

  async createOrderCommentNotification(
    comment: DBOrderComment,
    actorId: string,
  ): Promise<void> {
    const order = await orderDb.getOrder({ order_id: comment.order_id })

    const action =
      await notificationDb.getNotificationActionByName("order_comment")
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: comment.comment_id,
      },
    ])

    await notificationDb.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: actorId,
      },
    ])

    if (order.assigned_id && actorId !== order.assigned_id) {
      await notificationDb.insertNotifications([
        {
          notification_object_id: notif_objects[0].notification_object_id,
          notifier_id: order.assigned_id,
        },
      ])

      // Send push notification
      try {
        const payload = payloadFormatters.formatOrderCommentNotificationPayload(
          order,
          comment,
        )
        await pushNotificationService.sendPushNotification(
          order.assigned_id,
          payload,
          "order_comment",
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.debug(
          `Failed to send push notification for order comment:`,
          error,
        )
      }

      // Send email notification
      try {
        await emailService.sendNotificationEmail(
          order.assigned_id,
          "order_comment",
          {
            order,
            comment,
          },
          false, // skipQueue
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.debug(
          `Failed to send email notification for order comment:`,
          error,
        )
      }
    }

    if (actorId !== order.customer_id) {
      await notificationDb.insertNotifications([
        {
          notification_object_id: notif_objects[0].notification_object_id,
          notifier_id: order.customer_id,
        },
      ])

      // Send push notification
      try {
        const payload = payloadFormatters.formatOrderCommentNotificationPayload(
          order,
          comment,
        )
        await pushNotificationService.sendPushNotification(
          order.customer_id,
          payload,
          "order_comment",
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.debug(
          `Failed to send push notification for order comment:`,
          error,
        )
      }

      // Send email notification
      try {
        await emailService.sendNotificationEmail(
          order.customer_id,
          "order_comment",
          {
            order,
            comment,
          },
          false, // skipQueue
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.debug(
          `Failed to send email notification for order comment:`,
          error,
        )
      }
    }

    // Send webhooks for order comments
    await webhookService.sendOrderCommentWebhooks(order, comment)
  }

  async createOrderReviewNotification(review: DBReview): Promise<void> {
    const order = await orderDb.getOrder({ order_id: review.order_id })

    if (!order.assigned_id) {
      return
    }

    const action =
      await notificationDb.getNotificationActionByName("order_review")
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: review.review_id,
      },
    ])

    await notificationDb.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: order.customer_id,
      },
    ])

    await notificationDb.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: order.assigned_id,
      },
    ])

    // Send push notification
    try {
      const payload =
        payloadFormatters.formatOrderReviewNotificationPayload(review)
      await pushNotificationService.sendPushNotification(
        order.assigned_id,
        payload,
        "order_review",
        order.contractor_id ?? null, // contractorId for org-scoped preferences
      )
    } catch (error) {
      logger.error(`Failed to send push notification for order review:`, {
        error,
        user_id: order.assigned_id,
        order_id: order.order_id,
        contractor_id: order.contractor_id,
      })
    }

    // Send email notification
    try {
      await emailService.sendNotificationEmail(
        order.assigned_id,
        "order_review",
        {
          review,
        },
        false, // skipQueue
        order.contractor_id ?? null, // contractorId for org-scoped preferences
      )
    } catch (error) {
      logger.error(`Failed to send email notification for order review:`, {
        error,
        user_id: order.assigned_id,
        order_id: order.order_id,
        contractor_id: order.contractor_id,
      })
    }
  }

  async createOrderStatusNotification(
    order: DBOrder,
    newStatus: string,
    actorId: string,
  ): Promise<void> {
    const action_name = `order_status_${newStatus.replace("-", "_")}`
    const action = await notificationDb.getNotificationActionByName(action_name)
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: order.order_id,
      },
    ])

    await notificationDb.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: actorId,
      },
    ])

    if (order.assigned_id && order.assigned_id !== actorId) {
      await notificationDb.insertNotifications([
        {
          notification_object_id: notif_objects[0].notification_object_id,
          notifier_id: order.assigned_id,
        },
      ])

      // Send push notification
      try {
        const payload = payloadFormatters.formatOrderNotificationPayload(
          order,
          action_name,
        )
        await pushNotificationService.sendPushNotification(
          order.assigned_id,
          payload,
          action_name,
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.error(`Failed to send push notification for order status:`, {
          error,
          user_id: order.assigned_id,
          order_id: order.order_id,
          contractor_id: order.contractor_id,
          action_name,
        })
      }

      // Send email notification
      try {
        await emailService.sendNotificationEmail(
          order.assigned_id,
          action_name,
          {
            order,
          },
          false, // skipQueue
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.error(`Failed to send email notification for order status:`, {
          error,
          user_id: order.assigned_id,
          order_id: order.order_id,
          contractor_id: order.contractor_id,
          action_name,
        })
      }
    }

    if (order.customer_id !== actorId) {
      await notificationDb.insertNotifications([
        {
          notification_object_id: notif_objects[0].notification_object_id,
          notifier_id: order.customer_id,
        },
      ])

      // Send push notification
      try {
        const payload = payloadFormatters.formatOrderNotificationPayload(
          order,
          action_name,
        )
        await pushNotificationService.sendPushNotification(
          order.customer_id,
          payload,
          action_name,
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.error(`Failed to send push notification for order status:`, {
          error,
          user_id: order.customer_id,
          order_id: order.order_id,
          contractor_id: order.contractor_id,
          action_name,
        })
      }

      // Send email notification
      try {
        await emailService.sendNotificationEmail(
          order.customer_id,
          action_name,
          {
            order,
          },
          false, // skipQueue
          order.contractor_id ?? null, // contractorId for org-scoped preferences
        )
      } catch (error) {
        logger.error(`Failed to send email notification for order status:`, {
          error,
          user_id: order.customer_id,
          order_id: order.order_id,
          contractor_id: order.contractor_id,
          action_name,
        })
      }
    }

    // Send webhooks for order status changes
    await webhookService.sendOrderStatusWebhooks(order, newStatus, actorId)
  }

  async createOfferNotification(
    offer: DBOfferSession,
    type: "create" | "counteroffer",
  ): Promise<void> {
    // Handle contractor notifications
    if (offer.contractor_id) {
      await this.createOfferContractorNotification(
        offer,
        type === "create" ? "offer_create" : "counter_offer_create",
      )
    }

    // Handle assigned user notifications
    if (offer.assigned_id) {
      await this.createOfferAssignedNotification(
        offer,
        type === "create" ? "offer_created" : "counter_offer_created",
      )
    }

    // Coordinate with delivery services
    // await discordService.sendOfferDM(offer) // TODO: Re-enable when ready
    await webhookService.sendOfferWebhooks(
      offer,
      type === "create" ? "offer_create" : "counter_offer_create",
    )
  }

  /**
   * Creates notification for contractor members when an offer is created.
   * Notifies all contractor members with manage_orders permission.
   */
  private async createOfferContractorNotification(
    offer: DBOfferSession,
    actionType: "offer_create" | "counter_offer_create",
  ): Promise<void> {
    const action = await notificationDb.getNotificationActionByName(actionType)
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: offer.id,
      },
    ])

    await notificationDb.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: offer.customer_id,
      },
    ])

    const admins = await contractorDb.getMembersWithMatchingRole(
      offer.contractor_id!,
      { manage_orders: true },
    )

    logger.debug(
      `Found ${admins.length} contractor members with manage_orders role for contractor ${offer.contractor_id}`,
      {
        contractor_id: offer.contractor_id,
        admin_count: admins.length,
        admin_user_ids: admins.map((a) => a.user_id),
      },
    )

    if (admins.length > 0) {
      await notificationDb.insertNotifications(
        admins.map((u) => ({
          notification_object_id: notif_objects[0].notification_object_id,
          notifier_id: u.user_id,
        })),
      )

      // Send email notifications to contractor members
      for (const admin of admins) {
        try {
          logger.debug(
            `Sending ${actionType} email notification to contractor member ${admin.user_id}`,
            {
              user_id: admin.user_id,
              contractor_id: offer.contractor_id,
              notification_type: actionType,
            },
          )
          const emailSent = await emailService.sendNotificationEmail(
            admin.user_id,
            actionType,
            {
              offer,
            },
            false, // skipQueue
            offer.contractor_id, // contractorId for org-scoped preferences
          )
          if (emailSent) {
            logger.debug(
              `Successfully sent email notification to contractor member ${admin.user_id}`,
              {
                user_id: admin.user_id,
                contractor_id: offer.contractor_id,
              },
            )
          } else {
            logger.debug(
              `Email notification not sent to contractor member ${admin.user_id} (preference disabled or no email)`,
              {
                user_id: admin.user_id,
                contractor_id: offer.contractor_id,
              },
            )
          }
        } catch (error) {
          logger.error(
            `Failed to send email notification to contractor member ${admin.user_id}:`,
            {
              error,
              user_id: admin.user_id,
              contractor_id: offer.contractor_id,
              notification_type: actionType,
            },
          )
        }
      }
    }
  }

  /**
   * Creates notification for assigned user when an offer is created.
   */
  private async createOfferAssignedNotification(
    session: DBOfferSession,
    type: "offer_created" | "counter_offer_created",
  ): Promise<void> {
    if (!session.assigned_id) {
      return
    }

    const action = await notificationDb.getNotificationActionByName(
      type === "offer_created" ? "offer_create" : "counter_offer_create",
    )
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: session.id,
      },
    ])

    await notificationDb.insertNotificationChange([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        actor_id: session.customer_id,
      },
    ])

    await notificationDb.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: session.assigned_id,
      },
    ])

    // Send push notification
    try {
      const payload = payloadFormatters.formatOfferNotificationPayload(
        session,
        type === "offer_created" ? "create" : "counteroffer",
      )
      await pushNotificationService.sendPushNotification(
        session.assigned_id,
        payload,
        type === "offer_created" ? "offer_create" : "counter_offer_create",
        session.contractor_id ?? null, // contractorId for org-scoped preferences
      )
    } catch (error) {
      logger.error(`Failed to send push notification for offer assignment:`, {
        error,
        user_id: session.assigned_id,
        offer_id: session.id,
        contractor_id: session.contractor_id,
      })
    }

    // Send email notification
    try {
      await emailService.sendNotificationEmail(
        session.assigned_id,
        type === "offer_created" ? "offer_create" : "counter_offer_create",
        {
          offer: session,
        },
        false, // skipQueue
        session.contractor_id ?? null, // contractorId for org-scoped preferences
      )
    } catch (error) {
      logger.error(`Failed to send email notification for offer assignment:`, {
        error,
        user_id: session.assigned_id,
        offer_id: session.id,
        contractor_id: session.contractor_id,
      })
    }
  }

  async createOfferMessageNotification(
    session: DBOfferSession,
    message: DBMessage,
  ): Promise<void> {
    logger.debug(
      `Creating offer message notification for session ${session.id}, message ${message.message_id}`,
    )

    try {
      const action =
        await notificationDb.getNotificationActionByName("offer_message")
      logger.debug(`Found notification action: ${action.action_type_id}`)

      // Check if there's already a notification object for this session and action type
      const existingNotificationObject =
        await notificationDb.getNotificationObjectByEntityAndAction(
          session.id,
          action.action_type_id,
        )

      let notificationObjectId: string

      if (existingNotificationObject) {
        // Reuse existing notification object and update timestamp
        notificationObjectId = existingNotificationObject.notification_object_id
        await notificationDb.updateNotificationObjectTimestamp(
          notificationObjectId,
        )
        logger.debug(
          `Reusing existing notification object: ${notificationObjectId}`,
        )
      } else {
        // Create new notification object
        const notif_objects = await notificationDb.insertNotificationObjects([
          {
            action_type_id: action.action_type_id,
            entity_id: session.id,
          },
        ])
        notificationObjectId = notif_objects[0].notification_object_id
        logger.debug(`Created new notification object: ${notificationObjectId}`)
      }

      // Add notification change for this message
      await notificationDb.insertNotificationChange([
        {
          notification_object_id: notificationObjectId,
          actor_id: message.author!,
        },
      ])
      logger.debug(`Created notification change for actor: ${message.author}`)

      let notificationCount = 0
      for (const notified of [session.assigned_id, session.customer_id]) {
        if (!notified || notified === message.author) {
          logger.debug(`Skipping notification for ${notified} (author or null)`)
          continue
        }

        // Check if user already has an unread notification for this session
        const existingNotification =
          await notificationDb.getUnreadNotificationByUserAndObject(
            notified,
            notificationObjectId,
          )

        if (existingNotification) {
          logger.debug(
            `User ${notified} already has unread notification, skipping`,
          )
          continue
        }

        await notificationDb.insertNotifications([
          {
            notification_object_id: notificationObjectId,
            notifier_id: notified,
          },
        ])
        notificationCount++

        // Send push notification with enhanced payload
        try {
          // Get chat_id for the offer session
          let chatId: string | undefined
          try {
            const chat = await chatDb.getChat({ session_id: session.id })
            chatId = chat.chat_id
          } catch {
            // Chat not found, continue without chatId
          }

          const payload =
            await payloadFormatters.formatOfferMessageNotificationPayload(
              session,
              message,
              chatId,
            )
          await pushNotificationService.sendPushNotification(
            notified,
            payload,
            "offer_message",
            session.contractor_id ?? null, // contractorId for org-scoped preferences
          )
        } catch (error) {
          logger.error(
            `Failed to send push notification to user ${notified}:`,
            {
              error,
              user_id: notified,
              offer_id: session.id,
              contractor_id: session.contractor_id,
            },
          )
        }

        // Send email notification
        try {
          await emailService.sendNotificationEmail(
            notified,
            "offer_message",
            {
              offer: session,
              message,
            },
            false, // skipQueue
            session.contractor_id ?? null, // contractorId for org-scoped preferences
          )
        } catch (error) {
          logger.error(
            `Failed to send email notification for offer message to user ${notified}:`,
            {
              error,
              user_id: notified,
              offer_id: session.id,
              contractor_id: session.contractor_id,
            },
          )
        }
      }

      logger.debug(
        `Successfully created ${notificationCount} offer message notifications`,
      )
    } catch (error) {
      logger.error(`Error creating offer message notification:`, error)
      throw error
    }
  }

  async createMarketBidNotification(
    listing: DBMarketListingComplete,
    bid: DBMarketBid,
  ): Promise<void> {
    const recipients: string[] = []

    if (listing.listing.contractor_seller_id) {
      const admins = await contractorDb.getMembersWithMatchingRole(
        listing.listing.contractor_seller_id,
        { manage_market: true },
      )

      if (bid.user_bidder_id) {
        recipients.push(...admins.map((u) => u.user_id))
        await this.createMarketUpdateNotification(
          bid.user_bidder_id,
          bid.bid_id,
          "market_item_bid",
          admins.map((u) => u.user_id),
        )
      }
    }

    if (listing.listing.user_seller_id) {
      if (bid.user_bidder_id) {
        recipients.push(listing.listing.user_seller_id)
        await this.createMarketUpdateNotification(
          bid.user_bidder_id,
          bid.bid_id,
          "market_item_bid",
          [listing.listing.user_seller_id],
        )
      }
    }

    // Send push notifications to all recipients
    if (recipients.length > 0) {
      try {
        const payload = payloadFormatters.formatMarketBidNotificationPayload(
          listing,
          bid,
        )
        await pushNotificationService.sendPushNotifications(
          recipients,
          payload,
          "market_item_bid",
        )
      } catch (error) {
        logger.error(`Failed to send push notifications for market bid:`, {
          error,
          listing_id: listing.listing.listing_id,
          bid_id: bid.bid_id,
        })
      }
    }

    // Send webhooks for market bids
    await webhookService.sendBidWebhooks(listing, bid)
  }

  async createMarketOfferNotification(
    listing: DBMarketListing,
    offer: DBMarketOffer,
  ): Promise<void> {
    const recipients: string[] = []

    if (listing.contractor_seller_id) {
      const admins = await contractorDb.getMembersWithMatchingRole(
        listing.contractor_seller_id,
        { manage_market: true },
      )

      if (offer.buyer_user_id) {
        recipients.push(...admins.map((u) => u.user_id))
        await this.createMarketUpdateNotification(
          offer.buyer_user_id,
          offer.offer_id,
          "market_item_offer",
          admins.map((u) => u.user_id),
        )
      }
    }

    if (listing.user_seller_id) {
      if (offer.buyer_user_id) {
        recipients.push(listing.user_seller_id)
        await this.createMarketUpdateNotification(
          offer.buyer_user_id,
          offer.offer_id,
          "market_item_offer",
          [listing.user_seller_id],
        )
      }
    }

    // Send push notifications to all recipients
    if (recipients.length > 0) {
      try {
        const payload = payloadFormatters.formatMarketOfferNotificationPayload(
          listing,
          offer,
        )
        await pushNotificationService.sendPushNotifications(
          recipients,
          payload,
          "market_item_offer",
        )
      } catch (error) {
        logger.debug(
          `Failed to send push notifications for market offer:`,
          error,
        )
      }
    }
  }

  /**
   * Helper method to create market update notifications (bids/offers).
   */
  private async createMarketUpdateNotification(
    actorId: string,
    entityId: string,
    actionName: string,
    recipients: string[],
  ): Promise<void> {
    if (recipients.length === 0) {
      return
    }

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

    await notificationDb.insertNotifications(
      recipients.map((u) => ({
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: u,
      })),
    )

    // TODO: Phase 5 - Send push notifications
    // for (const recipient of recipients) {
    //   await pushNotificationService.sendPushNotification(recipient, ...)
    // }
  }

  async createContractorInviteNotification(
    invite: DBContractorInvite,
  ): Promise<void> {
    const action =
      await notificationDb.getNotificationActionByName("contractor_invite")
    const notif_objects = await notificationDb.insertNotificationObjects([
      {
        action_type_id: action.action_type_id,
        entity_id: invite.invite_id,
      },
    ])

    await notificationDb.insertNotifications([
      {
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: invite.user_id,
      },
    ])

    // Send push notification
    try {
      const payload =
        payloadFormatters.formatContractorInviteNotificationPayload(invite)
      await pushNotificationService.sendPushNotification(
        invite.user_id,
        payload,
        "contractor_invite",
      )
    } catch (error) {
      logger.debug(
        `Failed to send push notification for contractor invite:`,
        error,
      )
    }
  }

  async createAdminAlertNotification(alert: DBAdminAlert): Promise<void> {
    try {
      // Get the admin_alert notification action
      const action =
        await notificationDb.getNotificationActionByName("admin_alert")

      // Create notification object
      const notif_objects = await notificationDb.insertNotificationObjects([
        {
          action_type_id: action.action_type_id,
          entity_id: alert.alert_id,
        },
      ])

      // Add the admin who created the alert as the actor
      await notificationDb.insertNotificationChange([
        {
          notification_object_id: notif_objects[0].notification_object_id,
          actor_id: alert.created_by,
        },
      ])

      // Get target users based on alert target type
      const targetUserIds = await adminDb.getUsersForAlertTarget(
        alert.target_type,
        alert.target_contractor_id || undefined,
      )

      if (targetUserIds.length === 0) {
        logger.warn(
          `No users found for admin alert target: ${alert.target_type}`,
        )
        return
      }

      // Create notifications for all target users
      const notifications = targetUserIds.map((userId: string) => ({
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: userId,
      }))

      await notificationDb.insertNotifications(notifications)

      logger.info(
        `Created admin alert notifications for ${targetUserIds.length} users`,
        {
          alertId: alert.alert_id,
          targetType: alert.target_type,
          targetContractorId: alert.target_contractor_id,
        },
      )

      // Send push notifications to all target users
      try {
        const payload =
          payloadFormatters.formatAdminAlertNotificationPayload(alert)
        await pushNotificationService.sendPushNotifications(
          targetUserIds,
          payload,
          "admin_alert",
        )
      } catch (error) {
        logger.debug(
          `Failed to send push notifications for admin alert:`,
          error,
        )
      }
    } catch (error) {
      logger.error("Failed to create admin alert notifications:", error)
      throw error
    }
  }

  async createOrderReviewRevisionNotification(
    review: DBReview,
    requester: User,
  ): Promise<void> {
    try {
      // Determine notification recipients
      const recipients: string[] = []

      if (review.user_author) {
        // Individual review author
        recipients.push(review.user_author)
      } else if (review.contractor_author) {
        // Organization review - notify all members with manage_orders permission
        const members = await contractorDb.getContractorMembers({
          contractor_id: review.contractor_author,
        })

        for (const member of members) {
          const hasPermission = await has_permission(
            review.contractor_author,
            member.user_id,
            "manage_orders",
          )
          if (hasPermission) {
            recipients.push(member.user_id)
          }
        }
      }

      if (recipients.length === 0) {
        logger.warn("No recipients found for review revision notification", {
          review_id: review.review_id,
          user_author: review.user_author,
          contractor_author: review.contractor_author,
        })
        return
      }

      // Get notification action
      const action = await notificationDb.getNotificationActionByName(
        "order_review_revision_requested",
      )

      // Create notification object
      const notif_objects = await notificationDb.insertNotificationObjects([
        {
          action_type_id: action.action_type_id,
          entity_id: review.review_id,
        },
      ])

      await notificationDb.insertNotificationChange([
        {
          notification_object_id: notif_objects[0].notification_object_id,
          actor_id: requester.user_id,
        },
      ])

      // Create notifications for all recipients
      const notifications = recipients.map((recipient_id) => ({
        notification_object_id: notif_objects[0].notification_object_id,
        notifier_id: recipient_id,
      }))

      await notificationDb.insertNotifications(notifications)

      logger.info("Created review revision notifications", {
        review_id: review.review_id,
        recipient_count: recipients.length,
        requester_id: requester.user_id,
      })

      // Send push notifications to all recipients
      try {
        const payload =
          payloadFormatters.formatOrderReviewRevisionNotificationPayload(review)
        await pushNotificationService.sendPushNotifications(
          recipients,
          payload,
          "order_review_revision_requested",
        )
      } catch (error) {
        logger.debug(
          `Failed to send push notifications for review revision:`,
          error,
        )
      }
    } catch (error) {
      logger.error("Failed to create review revision notification:", error)
      throw error
    }
  }
}

/**
 * Singleton instance of NotificationService.
 * This is the service that should be imported and used throughout the application.
 */
export const notificationService: NotificationService =
  new DatabaseNotificationService()
