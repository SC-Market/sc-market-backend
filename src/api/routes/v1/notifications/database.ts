/**
 * Notification-related database operations.
 * This module contains all database queries specific to notifications, notification objects, and notification webhooks.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  DBNotificationWebhook,
  DBWebhookActions,
  DBNotificationActions,
  DBNotification,
  DBNotificationObject,
  DBNotificationChange,
  MinimalUser,
} from "../../../../clients/database/db-models.js"
import { getMinimalUser } from "../profiles/database.js"
import { serializeOrderDetails } from "../orders/serializers.js"
import { serializeOfferSession } from "../offers/serializers.js"
import {
  formatBid,
  formatInvite,
  formatListing,
  formatReview,
} from "../util/formatting.js"
import * as orderDb from "../orders/database.js"
import * as contractorDb from "../contractors/database.js"
import * as marketDb from "../market/database.js"
import * as offerDb from "../offers/database.js"
import * as adminDb from "../admin/database.js"
import logger from "../../../../logger/logger.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Insert a webhook action.
 */
export async function insertWebhookAction(
  data: Partial<DBWebhookActions>,
): Promise<DBWebhookActions[]> {
  return knex()<DBWebhookActions>("webhook_actions").insert(data).returning("*")
}

/**
 * Create a notification webhook.
 */
export async function createNotificationWebhook(
  data: Partial<DBNotificationWebhook>,
): Promise<DBNotificationWebhook[]> {
  return knex()<DBNotificationWebhook>("notification_webhooks")
    .insert(data)
    .returning("*")
}

/**
 * Delete a notification webhook by where clause.
 */
export async function deleteNotificationWebhook(
  where: Partial<DBNotificationWebhook>,
): Promise<DBNotificationWebhook[]> {
  return knex()<DBNotificationWebhook>("notification_webhooks")
    .delete()
    .where(where)
    .returning("*")
}

/**
 * Get notification webhooks by where clause.
 */
export async function getNotificationWebhooks(
  where: Partial<DBNotificationWebhook>,
): Promise<DBNotificationWebhook[]> {
  return knex()<DBNotificationWebhook>("notification_webhooks")
    .select("*")
    .where(where)
}

/**
 * Get notification webhooks by action type name.
 */
/**
 * Get notification action by name.
 */
export async function getNotificationActionByName(
  name: string,
): Promise<DBNotificationActions> {
  const result = await knex()<DBNotificationActions>("notification_actions")
    .where({ action: name })
    .first()

  return result!
}

/**
 * Get all notification actions.
 */
export async function getAllNotificationActions(): Promise<
  DBNotificationActions[]
> {
  return knex()<DBNotificationActions>("notification_actions").select("*")
}

/**
 * Get notification webhooks by action type name.
 */
export async function getNotificationWebhooksByAction(
  where: any,
  action_type_name: string,
): Promise<DBNotificationWebhook[]> {
  const action = await getNotificationActionByName(action_type_name)

  return knex()<DBNotificationWebhook>("notification_webhooks")
    .join(
      "webhook_actions",
      "notification_webhooks.webhook_id",
      "=",
      "webhook_actions.webhook_id",
    )
    .where(where)
    .andWhere({ action_type_id: action.action_type_id })
    .select("notification_webhooks.*")
}

/**
 * Get a notification webhook by where clause.
 */
export async function getNotificationWebhook(
  where: any,
): Promise<DBNotificationWebhook | null> {
  return knex()<DBNotificationWebhook>("notification_webhooks")
    .where(where)
    .first("*")
}

/**
 * Insert notification objects.
 */
export async function insertNotificationObjects(
  items: Partial<DBNotificationObject>[],
): Promise<DBNotificationObject[]> {
  return knex()<DBNotificationObject>("notification_object")
    .insert(items)
    .returning("*")
}

/**
 * Remove notification objects.
 */
export async function removeNotificationObjects(
  where: any,
): Promise<DBNotificationObject[]> {
  return knex()<DBNotificationObject>("notification_object")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Insert notifications.
 */
export async function insertNotifications(
  items: Partial<DBNotification>[],
): Promise<DBNotification[]> {
  return knex()<DBNotification>("notification").insert(items).returning("*")
}

/**
 * Insert notification change records.
 */
export async function insertNotificationChange(
  items: Partial<DBNotificationChange>[],
): Promise<DBNotificationChange[]> {
  return knex()<DBNotificationChange>("notification_change")
    .insert(items)
    .returning("*")
}

/**
 * Get notifications by where clause.
 */
export async function getNotifications(
  where: Partial<DBNotification>,
): Promise<DBNotification[]> {
  return knex()<DBNotification>("notification").select("*").where(where)
}

/**
 * Update notifications.
 */
export async function updateNotifications(
  where: Partial<DBNotification>,
  values: Partial<DBNotification>,
): Promise<void> {
  await knex()<DBNotification>("notification").update(values).where(where)
}

/**
 * Delete notifications.
 */
export async function deleteNotifications(
  where: Partial<DBNotification>,
): Promise<DBNotification[]> {
  return knex()<DBNotification>("notification")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Get notification object by where clause.
 */
export async function getNotificationObject(
  where: Partial<DBNotificationObject>,
): Promise<DBNotificationObject[]> {
  return knex()<DBNotificationObject>("notification_object")
    .select("*")
    .where(where)
}

/**
 * Get notification action by where clause.
 */
export async function getNotificationAction(
  where: Partial<DBNotificationActions>,
): Promise<DBNotificationActions[]> {
  return knex()<DBNotificationActions>("notification_actions")
    .select("*")
    .where(where)
}

/**
 * Get notification change by where clause.
 */
export async function getNotificationChange(
  where: Partial<DBNotificationChange>,
): Promise<DBNotificationChange[]> {
  return knex()<DBNotificationChange>("notification_change")
    .select("*")
    .where(where)
}

/**
 * Get notification object by entity and action.
 */
export async function getNotificationObjectByEntityAndAction(
  entity_id: string,
  action_type_id: string,
): Promise<DBNotificationObject | undefined> {
  const result = await knex()<DBNotificationObject>("notification_object")
    .select("*")
    .where("entity_id", entity_id)
    .where("action_type_id", action_type_id)
    .first()

  return result
}

/**
 * Update notification object timestamp.
 */
export async function updateNotificationObjectTimestamp(
  notification_object_id: string,
): Promise<DBNotificationObject[]> {
  return knex()<DBNotificationObject>("notification_object")
    .where("notification_object_id", notification_object_id)
    .update({ timestamp: knex().fn.now() })
    .returning("*")
}

/**
 * Get unread notification by user and object.
 */
export async function getUnreadNotificationByUserAndObject(
  user_id: string,
  notification_object_id: string,
): Promise<DBNotification | undefined> {
  const result = await knex()<DBNotification>("notification")
    .select("*")
    .where("notifier_id", user_id)
    .where("notification_object_id", notification_object_id)
    .where("read", false)
    .first()

  return result
}

/**
 * Get unread notification count.
 */
export async function getUnreadNotificationCount(
  user_id: string,
  actionFilter?: string,
  entityIdFilter?: string,
): Promise<number> {
  // Build base query for filtering unread notifications
  let baseQuery = knex()<DBNotification>("notification").where({
    notifier_id: user_id,
    read: false,
  })

  // Apply filters if provided
  if (actionFilter || entityIdFilter) {
    baseQuery = baseQuery.join(
      "notification_object",
      "notification.notification_object_id",
      "=",
      "notification_object.notification_object_id",
    )

    if (actionFilter) {
      baseQuery = baseQuery
        .join(
          "notification_actions",
          "notification_object.action_type_id",
          "=",
          "notification_actions.action_type_id",
        )
        .where("notification_actions.action", actionFilter)
    }

    if (entityIdFilter) {
      baseQuery = baseQuery.where(
        "notification_object.entity_id",
        entityIdFilter,
      )
    }
  }

  // Get count of unread notifications
  const result = await baseQuery
    .count("notification.notification_id as count")
    .first()

  return result ? parseInt((result as any).count) : 0
}

/**
 * Get entity by type and ID (for notification serialization).
 */
export async function getEntityByType(
  entity_type: string,
  entity_id: string,
): Promise<any> {
  switch (entity_type) {
    case "orders": {
      const order = await orderDb.getOrder({ order_id: entity_id })
      return serializeOrderDetails(order, null)
    }
    case "order_reviews": {
      const review = await orderDb.getOrderReview({ review_id: entity_id })
      const order = await orderDb.getOrder({ order_id: review!.order_id })
      return await formatReview(order, review!.role)
    }
    case "order_comments": {
      const comments = await orderDb.getOrderComments({ comment_id: entity_id })
      if (!comments || comments.length === 0) {
        throw new Error(`Order comment not found: ${entity_id}`)
      }
      const comment = comments[0]
      const order = await orderDb.getOrder({ order_id: comment.order_id })
      return serializeOrderDetails(order, null)
    }
    case "contractors": {
      return await contractorDb.getMinimalContractor({
        contractor_id: entity_id,
      })
    }
    case "market_listing": {
      const listing = await marketDb.getMarketListing({ listing_id: entity_id })
      return await formatListing(listing)
    }
    case "contractor_invites": {
      const invite = await contractorDb.getContractorInvite({
        invite_id: entity_id,
      })
      return await formatInvite(invite!)
    }
    case "market_bids": {
      const bids = await marketDb.getMarketBids({ bid_id: entity_id })
      return await formatBid(bids[0])
    }
    case "market_offers": {
      const offers = await marketDb.getMarketOffers({ offer_id: entity_id })
      if (!offers || offers.length === 0) {
        throw new Error(`Market offer not found: ${entity_id}`)
      }
      const offer = offers[0]
      const listing = await marketDb.getMarketListing({ listing_id: offer.listing_id })
      return await formatListing(listing)
    }
    case "order_applicants": {
      // For order_contractor_applied, entity_id is the order_id
      const order = await orderDb.getOrder({ order_id: entity_id })
      return serializeOrderDetails(order, null)
    }
    case "order": {
      // Same as orders (for public_order_create)
      const order = await orderDb.getOrder({ order_id: entity_id })
      return serializeOrderDetails(order, null)
    }
    case "offer_sessions": {
      const offers = await offerDb.getOfferSessions({ id: entity_id })
      if (!offers || offers.length === 0) {
        throw new Error(`Offer session not found: ${entity_id}`)
      }
      return await serializeOfferSession(offers[0])
    }
    case "admin_alerts": {
      const alerts = await adminDb.getAdminAlerts({ alert_id: entity_id })
      return alerts[0] || null
    }
    default:
      throw Error(`Invalid entity type ${entity_type}`)
  }
}

/**
 * Get complete notifications by user (paginated).
 */
export async function getCompleteNotificationsByUserPaginated(
  user_id: string,
  page: number,
  pageSize: number = 20,
  actionFilter?: string,
  entityIdFilter?: string,
): Promise<{
  notifications: any[]
  pagination: {
    currentPage: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}> {
  // Build base query for filtering - will be reused for both counting and data fetching
  let baseQuery = knex()<DBNotification>("notification").where({
    notifier_id: user_id,
  })

  // Always join notification_object for consistent filtering
  baseQuery = baseQuery.join(
    "notification_object",
    "notification.notification_object_id",
    "=",
    "notification_object.notification_object_id",
  )

  // Apply filters if provided
  if (actionFilter) {
    baseQuery = baseQuery
      .join(
        "notification_actions",
        "notification_object.action_type_id",
        "=",
        "notification_actions.action_type_id",
      )
      .where("notification_actions.action", actionFilter)
  }

  if (entityIdFilter) {
    baseQuery = baseQuery.where("notification_object.entity_id", entityIdFilter)
  }

  // Get total count for pagination metadata
  const totalCount = await baseQuery
    .clone()
    .count("notification.notification_id as count")
    .first()

  // Get paginated notifications using the same base query
  const notifs = await baseQuery
    .clone()
    .select("*")
    .orderBy("notification_object.timestamp", "desc")
    .offset(page * pageSize)
    .limit(pageSize)

  const complete_notifs = []
  for (const notif of notifs) {
    // Since we already joined notification_object in baseQuery,
    // we can access the timestamp directly from the joined result
    const notif_object = await getNotificationObject({
      notification_object_id: notif.notification_object_id,
    })
    const notif_action = await getNotificationAction({
      action_type_id: notif_object[0].action_type_id,
    })
    const notif_change = await getNotificationChange({
      notification_object_id: notif.notification_object_id,
    })
    const actors = await Promise.all(
      notif_change.map((c) => getMinimalUser({ user_id: c.actor_id })),
    )

    let entity
    try {
      entity = await getEntityByType(
        notif_action[0].entity,
        notif_object[0].entity_id,
      )
    } catch (e) {
      logger.error(
        `Failed to serialize notification ${notif.notification_id}: ${e}`,
      )
      continue
    }
    complete_notifs.push({
      read: notif.read,
      notification_id: notif.notification_id,
      action: notif_action[0].action,
      actors: actors,
      entity_type: notif_action[0].entity,
      entity: entity,
      timestamp: notif_object[0].timestamp,
    })
  }

  // Note: Sorting is now handled in the database query for consistency
  const total = totalCount ? parseInt((totalCount as any).count) : 0
  const totalPages = Math.ceil(total / pageSize)

  return {
    notifications: complete_notifs,
    pagination: {
      currentPage: page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages - 1,
      hasPreviousPage: page > 0,
    },
  }
}
