/**
 * ChatParticipantService - Service for managing chat participants
 *
 * This service handles:
 * - Adding participants to chats
 * - Ensuring order/offer participants are in chats
 * - Managing chat participant lifecycle
 */

import { DBOrder, DBOfferSession } from "../../clients/database/db-models.js"
import * as chatDb from "../../api/routes/v1/chats/database.js"
import logger from "../../logger/logger.js"

/**
 * Interface for ChatParticipantService
 */
export interface ChatParticipantService {
  // Add participants to a chat
  addParticipantsToChat(chatId: string, userIds: string[]): Promise<void>

  // Ensure order participants are in chat
  ensureOrderChatParticipants(order: DBOrder): Promise<void>

  // Ensure offer participants are in chat
  ensureOfferChatParticipants(session: DBOfferSession): Promise<void>
}

/**
 * Implementation of ChatParticipantService
 */
class DatabaseChatParticipantService implements ChatParticipantService {
  /**
   * Add participants to a chat
   * Filters out null/undefined values and avoids duplicates
   */
  async addParticipantsToChat(
    chatId: string,
    userIds: string[],
  ): Promise<void> {
    try {
      await chatDb.addChatParticipants(chatId, userIds)
      logger.debug(`Added participants to chat ${chatId}`, {
        chat_id: chatId,
        user_ids: userIds,
      })
    } catch (error) {
      logger.error(`Failed to add participants to chat ${chatId}:`, error)
      throw error
    }
  }

  /**
   * Ensure order participants are in the chat
   * Gets or creates chat for order, then adds customer and assigned user
   */
  async ensureOrderChatParticipants(order: DBOrder): Promise<void> {
    try {
      // Get or create chat for order
      let chat
      try {
        chat = await chatDb.getChat({ order_id: order.order_id })
      } catch (error) {
        // Chat doesn't exist, create it
        logger.debug(
          `Chat not found for order ${order.order_id}, creating new chat`,
        )
        chat = await chatDb.insertChat([], order.order_id, undefined)
      }

      // Collect participants (filter out null/undefined)
      const participants: string[] = []
      if (order.customer_id) {
        participants.push(order.customer_id)
      }
      if (order.assigned_id) {
        participants.push(order.assigned_id)
      }

      if (participants.length > 0) {
        await this.addParticipantsToChat(chat.chat_id, participants)
        logger.debug(
          `Ensured order chat participants for order ${order.order_id}`,
          {
            order_id: order.order_id,
            chat_id: chat.chat_id,
            participants,
          },
        )
      } else {
        logger.warn(
          `No participants to add for order ${order.order_id} (no customer_id or assigned_id)`,
        )
      }
    } catch (error) {
      // Log error but don't fail order creation
      logger.error(
        `Failed to ensure order chat participants for order ${order.order_id}:`,
        error,
      )
    }
  }

  /**
   * Ensure offer participants are in the chat
   * Gets or creates chat for offer session, then adds customer and assigned user
   */
  async ensureOfferChatParticipants(session: DBOfferSession): Promise<void> {
    try {
      // Get or create chat for offer session
      let chat
      try {
        chat = await chatDb.getChat({ session_id: session.id })
      } catch (error) {
        // Chat doesn't exist, create it
        logger.debug(
          `Chat not found for offer session ${session.id}, creating new chat`,
        )
        chat = await chatDb.insertChat([], undefined, session.id)
      }

      // Collect participants (filter out null/undefined)
      const participants: string[] = []
      if (session.customer_id) {
        participants.push(session.customer_id)
      }
      if (session.assigned_id) {
        participants.push(session.assigned_id)
      }

      if (participants.length > 0) {
        await this.addParticipantsToChat(chat.chat_id, participants)
        logger.debug(
          `Ensured offer chat participants for session ${session.id}`,
          {
            session_id: session.id,
            chat_id: chat.chat_id,
            participants,
          },
        )
      } else {
        logger.warn(
          `No participants to add for offer session ${session.id} (no customer_id or assigned_id)`,
        )
      }
    } catch (error) {
      // Log error but don't fail offer creation
      logger.error(
        `Failed to ensure offer chat participants for session ${session.id}:`,
        error,
      )
    }
  }
}

// Export service instance
export const chatParticipantService: ChatParticipantService =
  new DatabaseChatParticipantService()
