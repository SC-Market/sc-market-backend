/**
 * Notification utility functions.
 *
 * Most notification creation functions have been moved to NotificationService.
 * This file now only contains helper functions for chat messages.
 *
 * @see ../../../../services/notifications/notification.service.ts for notification creation
 */

import {
  DBOfferSession,
  DBOrder,
} from "../../../../clients/database/db-models.js"
import * as profileDb from "../profiles/database.js"
import * as chatDb from "../chats/database.js"
import { sendSystemMessage } from "../chats/helpers.js"
import logger from "../../../../logger/logger.js"

/**
 * Send a chat message when an order is assigned.
 */
export async function sendAssignedMessage(order: DBOrder) {
  try {
    const assigned = await profileDb.getUser({ user_id: order.assigned_id })
    const chat = await chatDb.getChat({ order_id: order.order_id })
    const content = `Order has been assigned to ${assigned.username}`
    await sendSystemMessage(chat.chat_id, content, false)
  } catch (error) {
    logger.debug(`Failed to send assigned message: ${error}`)
  }
}

/**
 * Send a chat message when an offer is submitted.
 */
export async function sendOfferChatMessage(order: DBOfferSession) {
  try {
    const chat = await chatDb.getChat({ session_id: order.id })
    const content = `An offer has been submitted`
    await sendSystemMessage(chat.chat_id, content, false)
  } catch (error) {
    // Log as debug since this is expected when chat creation fails
    logger.debug(
      `Failed to send offer chat message for session ${order.id}: ${error}`,
    )
  }
}

/**
 * Send a chat message when an order is unassigned.
 */
export async function sendUnassignedMessage(order: DBOrder) {
  try {
    const chat = await chatDb.getChat({ order_id: order.order_id })
    const content = `Order has been unassigned`
    await sendSystemMessage(chat.chat_id, content, false)
  } catch (error) {
    logger.debug(`Failed to send unassigned message: ${error}`)
  }
}
