import { receiveMessage, deleteMessage } from "../clients/aws/sqs.js"
import { env } from "../config/env.js"
import logger from "../logger/logger.js"
import { Routes } from "discord-api-types/v10"
import { database } from "../clients/database/knex-db.js"
import { rest } from "../api/routes/v1/util/discord.js"

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

export async function processDiscordQueue() {
  try {
    logger.debug("Processing Discord queue...")
    
    const response = await receiveMessage(env.BACKEND_QUEUE_URL!, 10)

    if (!response.Messages || response.Messages.length === 0) {
      return
    }

    logger.info(`Processing ${response.Messages.length} messages from Discord queue`)

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
        logger.debug(`Successfully processed and deleted message: ${message.MessageId}`)

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
    logger.info(`Status update - Order: ${order_id}, Status: ${status}, Discord ID: ${discord_id}`)
    
  } catch (error) {
    logger.error("Failed to handle status update:", error)
  }
}

async function handleMessageReceived(payload: any) {
  // Handle messages from Discord bot
  // This replaces the old /threads/message endpoint
  const { author_id, thread_id, name, content } = payload

  try {
    logger.info(`Processing message from Discord - Thread: ${thread_id}, Author: ${name}`)
    
    // TODO: Implement message handling logic
    // This will need to integrate with existing chat system
    // For now, just log the message
    logger.info(`Message received - Thread: ${thread_id}, Author: ${name}, Content: ${content}`)
    
  } catch (error) {
    logger.error("Failed to handle message received:", error)
  }
}

async function handleThreadCreated(payload: any, metadata: any) {
  // Update database with thread_id when Discord bot creates thread
  const { thread_id } = payload
  const { original_order_id, entity_type } = metadata

  try {
    logger.info(`Processing thread creation - ${entity_type}: ${thread_id}`)
    
    // TODO: Implement database update logic
    // This will need to integrate with existing order/offer session handling
    // For now, just log the creation
    logger.info(`Thread created for ${entity_type}: ${thread_id}`)
    
    // Post initialization messages to the new thread
    if (original_order_id && entity_type) {
      const entityInfo = {
        type: entity_type,
        id: original_order_id
      }
      await postThreadInitializationMessages(entityInfo, thread_id)
    }
    
  } catch (error) {
    logger.error("Failed to update thread_id in database:", error)
  }
}

async function postThreadInitializationMessages(entityInfo: any, threadId: string) {
  try {
    logger.info(`Posting initialization messages to thread ${threadId}`)
    
    // Import the message generation functions
    const { generateNewOrderMessage, generateNewOfferMessage } = await import("../api/routes/v1/util/webhooks.js")
    
    let message
    if (entityInfo.type === "order") {
      // Get order and user data
      const order = await database.getOrder({ order_id: entityInfo.id })
      const customer = await database.getUser({ user_id: order.customer_id })
      const assigned = order.assigned_id ? await database.getUser({ user_id: order.assigned_id }) : null
      
      message = await generateNewOrderMessage(order, customer, assigned)
    } else if (entityInfo.type === "offer_session") {
      // Get offer session and user data
      const sessions = await database.getOfferSessions({ id: entityInfo.id })
      if (sessions.length === 0) {
        logger.warn(`No offer session found for id ${entityInfo.id}`)
        return
      }
      const session = sessions[0]
      const customer = await database.getUser({ user_id: session.customer_id })
      const assigned = session.assigned_id ? await database.getUser({ user_id: session.assigned_id }) : null
      
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
