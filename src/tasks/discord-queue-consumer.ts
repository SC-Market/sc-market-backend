import { receiveMessage, deleteMessage } from "../clients/aws/sqs.js"
import { env } from "../config/env.js"
import logger from "../logger/logger.js"
import { Routes } from "discord-api-types/v10"
import { database } from "../clients/database/knex-db.js"
import * as profileDb from "../api/routes/v1/profiles/database.js"
import * as orderDb from "../api/routes/v1/orders/database.js"
import * as offerDb from "../api/routes/v1/offers/database.js"
import * as webhookUtil from "../api/routes/v1/util/webhooks.js"
import { rest } from "../services/discord/discord.service.js"
import { checkDiscordSQSConfiguration } from "../clients/aws/sqs-config.js"
import { chatServer } from "../clients/messaging/websocket.js"
import { serializeMessage } from "../api/routes/v1/chats/serializers.js"

// Types for messages from Discord bot
interface BackendQueueMessage {
  type: "status_update" | "message_received" | "thread_created"
  payload: any
  metadata: {
    discord_message_id?: string
    created_at: string
    original_order_id?: string
    entity_type?: string
  }
}

// Track last warning time to avoid spam
let lastConfigWarning = 0

export async function processDiscordQueue() {
  const config = checkDiscordSQSConfiguration()

  if (!config.isDiscordConfigured) {
    // Only log this once per minute to avoid spam
    const now = Date.now()
    if (!lastConfigWarning || now - lastConfigWarning > 60000) {
      logger.debug("SQS not configured - Discord queue processing disabled", {
        missingConfig: config.missingConfig,
      })
      lastConfigWarning = now
    }
    return
  }

  try {
    logger.debug("Processing Discord queue...")

    const response = await receiveMessage(env.BACKEND_QUEUE_URL!, 10)

    if (!response.Messages || response.Messages.length === 0) {
      return
    }

    logger.debug(
      `Processing ${response.Messages.length} messages from Discord queue`,
    )

    for (const message of response.Messages) {
      try {
        const body = JSON.parse(message.Body!) as BackendQueueMessage
        logger.debug(`Processing message type: ${body.type}`)

        switch (body.type) {
          case "status_update":
            await handleStatusUpdate(body.payload)
            break
          case "message_received":
            await handleMessageReceived(body.payload)
            break
          case "thread_created":
            await handleThreadCreated(body.payload, body.metadata)
            break
          default:
            logger.warn("Unknown message type:", body.type)
        }

        // Delete the message after successful processing
        await deleteMessage(env.BACKEND_QUEUE_URL!, message.ReceiptHandle!)
        logger.debug(
          `Successfully processed and deleted message: ${message.MessageId}`,
        )
      } catch (error) {
        logger.error("Error processing Discord queue message:", error)
        // Message will be retried automatically by SQS
        // We don't delete failed messages so they can be retried
      }
    }
  } catch (error) {
    logger.error("Error receiving Discord queue messages:", error)
  }
}

async function handleStatusUpdate(payload: any) {
  // Handle status updates from Discord bot
  // This replaces the old /threads/order/status endpoint
  const { order_id, status, discord_id } = payload

  try {
    logger.info(`Processing status update for order ${order_id}: ${status}`)

    // TODO: Implement status update logic
    // This will need to integrate with existing order status handling
    // For now, just log the update
    logger.info(
      `Status update - Order: ${order_id}, Status: ${status}, Discord ID: ${discord_id}`,
    )
  } catch (error) {
    logger.error("Failed to handle status update:", error)
  }
}

async function handleMessageReceived(payload: any) {
  // Handle messages from Discord bot
  // This replaces the old /threads/message endpoint
  const { author_id, thread_id, name, content } = payload

  try {
    logger.debug(
      `Processing message from Discord - Thread: ${thread_id}, Author: ${name}`,
    )

    logger.debug(
      `Message received - Thread: ${thread_id}, Author: ${name}, Content: ${content}`,
    )
  } catch (error) {
    logger.error("Failed to handle message received:", error)
  }
}

async function handleThreadCreated(payload: any, metadata: any) {
  // Update database with thread_id when Discord bot creates thread
  const { thread_id } = payload
  const { original_order_id, entity_type } = metadata

  try {
    logger.info(
      `Processing thread creation - ${entity_type}: ${original_order_id}, Thread: ${thread_id}`,
    )

    // Update the database with the thread_id
    try {
      if (entity_type === "order") {
        await orderDb.updateOrder(original_order_id, { thread_id: thread_id })
        logger.info(
          `Updated order ${original_order_id} with thread_id: ${thread_id}`,
        )
      } else if (entity_type === "offer_session") {
        await offerDb.updateOfferSession(original_order_id, {
          thread_id: thread_id,
        })
        logger.info(
          `Updated offer session ${original_order_id} with thread_id: ${thread_id}`,
        )
      } else {
        logger.warn(`Unknown entity type: ${entity_type}`)
        return
      }
    } catch (error) {
      logger.error(
        `Failed to update database with thread_id ${thread_id} for ${entity_type} ${original_order_id}:`,
        error,
      )
      // Don't proceed with initialization messages if database update failed
      return
    }

    logger.info(
      `Successfully updated database for ${entity_type}: ${original_order_id} with thread_id: ${thread_id}`,
    )

    // Post initialization messages to the new thread
    if (original_order_id && entity_type) {
      const entityInfo = {
        type: entity_type,
        id: original_order_id,
      }
      await postThreadInitializationMessages(entityInfo, thread_id)
    }
  } catch (error) {
    logger.error("Failed to update thread_id in database:", error)
  }
}

async function postThreadInitializationMessages(
  entityInfo: any,
  threadId: string,
) {
  try {
    logger.info(`Posting initialization messages to thread ${threadId}`)

    // Use the message generation functions
    const { generateNewOrderMessage, generateNewOfferMessage } = webhookUtil

    let message
    if (entityInfo.type === "order") {
      // Get order and user data
      const order = await orderDb.getOrder({ order_id: entityInfo.id })
      const customer = await profileDb.getUser({ user_id: order.customer_id })
      const assigned = order.assigned_id
        ? await profileDb.getUser({ user_id: order.assigned_id })
        : null

      message = await generateNewOrderMessage(order, customer, assigned)
    } else if (entityInfo.type === "offer_session") {
      // Get offer session and user data
      const sessions = await offerDb.getOfferSessions({ id: entityInfo.id })
      if (sessions.length === 0) {
        logger.warn(`No offer session found for id ${entityInfo.id}`)
        return
      }
      const session = sessions[0]
      const customer = await profileDb.getUser({ user_id: session.customer_id })
      const assigned = session.assigned_id
        ? await profileDb.getUser({ user_id: session.assigned_id })
        : null

      message = await generateNewOfferMessage(session, customer, assigned)
    }

    if (message) {
      // Post the message to the Discord thread
      await rest.post(Routes.channelMessages(threadId), { body: message })
      logger.info(`Initialization message posted to thread ${threadId}`)
    }
  } catch (error) {
    logger.error("Failed to post initialization messages:", error)
  }
}
