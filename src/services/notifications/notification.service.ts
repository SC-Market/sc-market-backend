import {
  DBAdminAlert,
  DBContractorInvite,
  DBMarketBid,
  DBMarketListingComplete,
  DBMessage,
  DBOfferSession,
  DBOrder,
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
import { pushNotificationService } from "../push-notifications/push-notification.service.js"
import { webhookService } from "../webhooks/webhook.service.js"
import { emailService } from "../email/email.service.js"
import * as payloadFormatters from "./notification-payload-formatters.js"
import * as payloadFormattersV2 from "./notification-payload-formatters-v2.js"
import { getKnex } from "../../clients/database/knex-db.js"
import { notify } from "../notify/dispatcher.js"
import { withShadow, type ShadowPlan } from "../notify/shadow.js"
import * as plans from "../notify/plans.js"
import { orgMembersWithPermission } from "../notify/recipients.js"

/** Shadow plans never break the legacy send: a planning error means no shadow. */
async function shadowPlans(build: () => Promise<ShadowPlan[]>): Promise<ShadowPlan[]> {
  try {
    return await build()
  } catch (err) {
    logger.warn("notify.shadow plan failed", { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}
import type {
  GetListingDetailResponse,
} from "../../api/routes/v2/types/listings.types.js"
import type {
  CreateOrderResponse,
  GetOrderDetailResponse,
} from "../../api/routes/v2/types/orders.types.js"

/**
 * Service interface for notification creation and management.
 * This service handles creating in-app notifications and coordinates
 * with delivery services (Discord, webhooks, push notifications).
 */
export interface NotificationService {
  // Order notifications
  createOrderNotification(order: DBOrder): Promise<void>
  /** actorId: who assigned it (defaults to the customer, as before). */
  createOrderAssignedNotification(order: DBOrder, actorId?: string | null): Promise<void>
  createOrderMessageNotification(
    order: DBOrder,
    message: DBMessage,
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

  // V2 Market notifications
  // Requirement 43.1-43.10: V2 notification system integration
  createMarketBidNotificationV2(
    listing: GetListingDetailResponse,
    bidAmount: number,
    bidderId: string,
    bidId: string,
    variantId?: string,
  ): Promise<void>
  createNewOrderNotificationV2(
    order: CreateOrderResponse | GetOrderDetailResponse,
    sellerId: string,
  ): Promise<void>

  // Other notifications
  createContractorInviteNotification(invite: DBContractorInvite): Promise<void>
  /** A user joined an org: its members with manage_invites (in-app by default). */
  createOrgMemberJoinedNotification(contractor: { contractor_id: string; spectrum_id: string; name: string }, userId: string): Promise<void>
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
  // Orders, offers and chat messages still deliver through the legacy code
  // below; notify() runs alongside in shadow mode (services/notify/shadow.ts)
  // until real traffic shows parity.

  async createOrderNotification(order: DBOrder): Promise<void> {
    return withShadow(await shadowPlans(() => plans.orderCreatedPlans(order)), () =>
      this.legacyOrderNotification(order),
    )
  }

  async createOrderAssignedNotification(order: DBOrder, actorId?: string | null): Promise<void> {
    return withShadow(await shadowPlans(async () => plans.orderAssignedPlans(order, actorId)), () =>
      this.legacyOrderAssignedNotification(order),
    )
  }

  async createOrderStatusNotification(
    order: DBOrder,
    newStatus: string,
    actorId: string,
  ): Promise<void> {
    return withShadow(
      await shadowPlans(async () => plans.orderStatusPlans(order, newStatus, actorId)),
      () => this.legacyOrderStatusNotification(order, newStatus, actorId),
    )
  }

  async createOrderMessageNotification(order: DBOrder, message: DBMessage): Promise<void> {
    return withShadow(
      await shadowPlans(async () => plans.chatMessagePlans({ kind: "order", order }, message)),
      () => this.legacyOrderMessageNotification(order, message),
    )
  }

  async createOfferNotification(
    offer: DBOfferSession,
    type: "create" | "counteroffer",
  ): Promise<void> {
    return withShadow(await shadowPlans(() => plans.offerPlans(offer, type)), () =>
      this.legacyOfferNotification(offer, type),
    )
  }

  async createOfferMessageNotification(
    session: DBOfferSession,
    message: DBMessage,
  ): Promise<void> {
    return withShadow(
      await shadowPlans(async () => plans.chatMessagePlans({ kind: "offer", session }, message)),
      () => this.legacyOfferMessageNotification(session, message),
    )
  }
  private async legacyOrderNotification(order: DBOrder): Promise<void> {
    // Handle contractor notifications
    if (order.contractor_id) {
      await this.createOrderContractorNotification(order)
    }

    // Handle assigned user notifications
    if (order.assigned_id) {
      await this.createOrderAssignedNotification(order)
    }

    // "Order Created" webhooks fire for every new order, assigned or not
    await webhookService.sendOrderWebhooks(order)
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

  private async legacyOrderAssignedNotification(order: DBOrder): Promise<void> {
    if (!order.assigned_id) {
      return
    }

    // "Order Assigned" webhooks: the shop's and the assignee's own
    await webhookService.sendOrderAssignedWebhooks(order)

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

  private async legacyOrderMessageNotification(
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

  async createOrderReviewNotification(review: DBReview): Promise<void> {
    const order = await orderDb.getOrder({ order_id: review.order_id })

    await webhookService.sendOrderReviewWebhooks(order, review)

    // The review goes to the other side of the order: a customer's review to
    // the assigned seller (org-scoped), a seller's review to the customer.
    // A customer's review of an unassigned org order goes to the org's
    // order managers (owner decision, §8).
    const recipients =
      review.role === "contractor"
        ? [{ userId: order.customer_id, contractorId: null }]
        : order.assigned_id
          ? [{ userId: order.assigned_id, contractorId: order.contractor_id ?? null }]
          : order.contractor_id
            ? await orgMembersWithPermission(order.contractor_id, "manage_orders")
            : []
    if (!recipients.length) {
      return
    }

    await notify(
      "order.review",
      recipients,
      {
        entityId: review.review_id,
        actorId: review.user_author ?? order.customer_id,
        messages: {
          push: payloadFormatters.formatOrderReviewNotificationPayload(review),
          email: { data: { review } },
        },
      },
    )
  }

  private async legacyOrderStatusNotification(
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

  private async legacyOfferNotification(
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

  private async legacyOfferMessageNotification(
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
    // Org members are checked against their preferences for the selling org,
    // a personal seller against their personal preferences. Only user bids
    // notify.
    const recipients: { userId: string; contractorId: string | null }[] = []
    if (bid.user_bidder_id) {
      if (listing.listing.contractor_seller_id) {
        recipients.push(
          ...(await orgMembersWithPermission(listing.listing.contractor_seller_id, "manage_market")),
        )
      }
      if (listing.listing.user_seller_id) {
        recipients.push({ userId: listing.listing.user_seller_id, contractorId: null })
      }
    }

    if (recipients.length > 0) {
      await notify("market.bid", recipients, {
        entityId: bid.bid_id,
        actorId: bid.user_bidder_id,
        // The bidder is never notified of their own bid (owner decision).
        messages: {
          push: payloadFormatters.formatMarketBidNotificationPayload(listing, bid),
        },
      })
    }

    // Send webhooks for market bids
    await webhookService.sendBidWebhooks(listing, bid)
  }

  async createContractorInviteNotification(
    invite: DBContractorInvite,
  ): Promise<void> {
    await notify("org.invite", [{ userId: invite.user_id }], {
      entityId: invite.invite_id,
      // Invites record no actor on the in-app row.
      actorId: null,
      messages: {
        push: await payloadFormatters.formatContractorInviteNotificationPayload(invite),
        email: { data: { invite } },
      },
    })
  }

  async createOrgMemberJoinedNotification(
    contractor: { contractor_id: string; spectrum_id: string; name: string },
    userId: string,
  ): Promise<void> {
    const recipients = await orgMembersWithPermission(contractor.contractor_id, "manage_invites")
    if (!recipients.length) return
    const member = await profileDb.getUser({ user_id: userId }).catch(() => null)
    const who = member?.display_name || member?.username || "Someone"
    const base = (await import("../../config/env.js")).env.FRONTEND_URL || "https://sc-market.space"
    const url = `${base}/contractor/${encodeURIComponent(contractor.spectrum_id)}/members`
    await notify("org.member_joined", recipients, {
      // The org is the entity; the new member is the actor on the in-app row.
      entityId: contractor.contractor_id,
      actorId: userId,
      dedupeKey: `${contractor.contractor_id}:${userId}:${Date.now()}`,
      messages: {
        push: {
          title: "New member",
          body: `${who} joined ${contractor.name}`,
          icon: `${base}/favicon.ico`,
          badge: `${base}/favicon.ico`,
          data: { url, type: "org_member_joined", entityId: contractor.contractor_id, action: "org_member_joined" },
          tag: `org-member-joined-${contractor.contractor_id}-${userId}`,
          requireInteraction: false,
        },
      },
    })
  }

  async createAdminAlertNotification(alert: DBAdminAlert): Promise<void> {
    // Get target users based on alert target type
    const targetUserIds = await adminDb.getUsersForAlertTarget(
      alert.target_type,
      alert.target_contractor_id || undefined,
    )

    if (targetUserIds.length === 0) {
      logger.warn(`No users found for admin alert target: ${alert.target_type}`)
      return
    }

    // Admin alerts are site-wide: personal preferences. The admin who posted
    // it is not notified (owner decision: never notify the actor).
    await notify(
      "admin.alert",
      targetUserIds.map((userId: string) => ({ userId })),
      {
        entityId: alert.alert_id,
        actorId: alert.created_by,
        // Exactly the channels the admin chose; unchosen ones never send.
        channels: alert.channels?.length ? alert.channels : ["in_app", "push", "email"],
        messages: {
          push: payloadFormatters.formatAdminAlertNotificationPayload(alert),
          email: { data: { alert } },
        },
      },
    )

    logger.info(
      `Created admin alert notifications for ${targetUserIds.length} users`,
      {
        alertId: alert.alert_id,
        targetType: alert.target_type,
        targetContractorId: alert.target_contractor_id,
      },
    )
  }

  async createOrderReviewRevisionNotification(
    review: DBReview,
    requester: User,
  ): Promise<void> {
    // The review's author: the user, or for an org review every member with
    // manage_orders (checked against their preferences for that org).
    const recipients: { userId: string; contractorId: string | null }[] = []
    if (review.user_author) {
      recipients.push({ userId: review.user_author, contractorId: null })
    } else if (review.contractor_author) {
      recipients.push(...(await orgMembersWithPermission(review.contractor_author, "manage_orders")))
    }

    if (recipients.length === 0) {
      logger.warn("No recipients found for review revision notification", {
        review_id: review.review_id,
        user_author: review.user_author,
        contractor_author: review.contractor_author,
      })
      return
    }

    await notify("order.review_revision_requested", recipients, {
      entityId: review.review_id,
      actorId: requester.user_id,
      messages: {
        push: payloadFormatters.formatOrderReviewRevisionNotificationPayload(review),
      },
    })

    logger.info("Created review revision notifications", {
      review_id: review.review_id,
      recipient_count: recipients.length,
      requester_id: requester.user_id,
    })
  }

  /**
   * Create market bid notification for V2 listing
   * Requirement 43.5: Provide formatMarketBidNotificationPayloadV2 function
   * Requirement 43.2: Include variant information in notifications
   * Requirement 43.3: Show quality tier in notification text
   */
  async createMarketBidNotificationV2(
    listing: GetListingDetailResponse,
    bidAmount: number,
    bidderId: string,
    bidId: string,
    variantId?: string,
  ): Promise<void> {
    try {
      // Resolve notification recipients from shop
      const recipients: { userId: string; contractorId: string | null }[] = []
      const shopId = listing.listing.shop_id
      if (shopId) {
        const shop = await getKnex()("shops").where("shop_id", shopId).first()
        if (shop?.owner_contractor_id) {
          recipients.push(...(await orgMembersWithPermission(shop.owner_contractor_id, "manage_market")))
        } else if (shop?.owner_user_id) {
          recipients.push({ userId: shop.owner_user_id, contractorId: null })
        }
      }

      if (recipients.length > 0) {
        await notify("market.bid", recipients, {
          entityId: bidId,
          actorId: bidderId,
          messages: {
            push: payloadFormattersV2.formatMarketBidNotificationPayloadV2(
              listing,
              bidAmount,
              variantId,
            ),
          },
        })
      }

      logger.info("Created V2 market bid notification", {
        listing_id: listing.listing.listing_id,
        shop_id: shopId,
        bid_amount: bidAmount,
        variant_id: variantId,
        recipient_count: recipients.length,
      })

      // Send webhooks
      await webhookService.sendBidWebhooksV2(
        { listing_id: listing.listing.listing_id, title: listing.listing.title, shop_id: shopId! },
        bidAmount,
        bidderId,
      )
    } catch (error) {
      logger.error("Failed to create V2 market bid notification:", error)
      throw error
    }
  }

  /**
   * Create new order notification for V2 order
   * Requirement 43.8: Notify sellers of new orders with variant information
   */
  async createNewOrderNotificationV2(
    order: CreateOrderResponse | GetOrderDetailResponse,
    shopId: string,
  ): Promise<void> {
    // Buy now: shadow-plans the normal order notification (owner decision).
    return withShadow(
      await shadowPlans(async () =>
        plans.buyNowOrderPlans(await orderDb.getOrder({ order_id: order.order_id })),
      ),
      () => this.legacyNewOrderNotificationV2(order, shopId),
    )
  }

  private async legacyNewOrderNotificationV2(
    order: CreateOrderResponse | GetOrderDetailResponse,
    shopId: string,
  ): Promise<void> {
    try {
      // Resolve recipients from shop owner
      const shop = await getKnex()("shops").where("shop_id", shopId).first()
      if (!shop) return

      const recipients: string[] = []
      if (shop.owner_contractor_id) {
        const admins = await contractorDb.getMembersWithMatchingRole(
          shop.owner_contractor_id,
          { manage_orders: true },
        )
        recipients.push(...admins.map((u: { user_id: string }) => u.user_id))
      } else if (shop.owner_user_id) {
        recipients.push(shop.owner_user_id)
      }

      if (recipients.length === 0) return

      // Format and send push notification to seller(s)
      const payload = payloadFormattersV2.formatNewOrderNotificationPayloadV2(
        order,
      )

      await pushNotificationService.sendPushNotifications(
        recipients,
        payload,
        "order_create_v2",
      )

      logger.info("Created V2 new order notification", {
        order_id: order.order_id,
        shop_id: shopId,
        total_price: order.total_price,
        item_count: order.items.length,
        recipient_count: recipients.length,
      })
    } catch (error) {
      logger.error("Failed to create V2 new order notification:", error)
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
