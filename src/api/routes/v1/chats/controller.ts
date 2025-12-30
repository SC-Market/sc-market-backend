import { Request, Response, NextFunction } from "express"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as chatDb from "./database.js"
import * as profileDb from "../profiles/database.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { discordService } from "../../../../services/discord/discord.service.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import { eqSet, handle_chat_response } from "./helpers.js"
import { serializeMessage } from "./serializers.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { chatServer } from "../../../../clients/messaging/websocket.js"
import logger from "../../../../logger/logger.js"

// Get a chat by order ID
export async function getChatByOrderId(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let chat
  try {
    chat = await chatDb.getChat({ order_id: req.params.order_id })
  } catch (error) {
    logger.debug(`Chat not found for order ID: ${req.params.order_id}`)
    res
      .status(404)
      .json(createErrorResponse({ error: "Chat not found for this order" }))
    return
  }

  req.chat = chat
  next()
}

// Get a chat by offer session ID
export async function getChatByOfferSessionId(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session_id = req.params.session_id

  let chat
  try {
    chat = await chatDb.getChat({ session_id: session_id })
  } catch (error) {
    logger.debug(`Chat not found for session ID: ${session_id}`)
    res.status(404).json(
      createErrorResponse({
        error: "Chat not found for this offer session",
      }),
    )
    return
  }

  req.chat = chat
  next()
}

// Send a message
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user as User
  const { content } = req.body as {
    content: string
  }

  if (!content) {
    res.status(400).json(createErrorResponse({ error: "Invalid content" }))
    return
  }

  const chat = req.chat!

  const message = await chatDb.insertMessage({
    chat_id: chat.chat_id,
    content,
    author: user.user_id,
  })

  chatServer.emitMessage(await serializeMessage(message))

  const order = req.order
  const session = req.offer_session

  logger.debug(
    `Chat message sent - Order: ${order?.order_id || "null"}, Session: ${session?.id || "null"}`,
  )

  if (order || session) {
    if ((order || session)!.thread_id) {
      logger.debug(
        `Sending user chat message for ${order ? "order" : "session"}: ${(order || session)!.thread_id}`,
      )
      await discordService.sendUserChatMessage(order || session!, user, content)
    }

    if (order) {
      logger.debug(
        `Creating order message notification for order: ${order.order_id}`,
      )
      await notificationService.createOrderMessageNotification(order, message)
    }

    if (session) {
      logger.debug(
        `Creating offer message notification for session: ${session.id}`,
      )
      await notificationService.createOfferMessageNotification(session, message)
    }
  } else {
    logger.debug("No order or session found for this chat message")
  }

  res.json(createResponse({ result: "Success" }))
}

// Create a chat
export async function createChat(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const body: {
    users: string[]
  } = req.body as {
    users: string[]
  }
  const user = req.user as User

  const users = await Promise.all(
    body.users.map((user) => profileDb.getUser({ username: user })),
  )

  // TODO: Process blocked users and user access settings
  if (!users.every(Boolean)) {
    res.status(400).json(createErrorResponse({ error: "Invalid user!" }))
    return
  }

  users.push(user)

  const chats = await chatDb.getChatByParticipant(user.user_id)

  for (const chat of chats) {
    const participants = await chatDb.getChatParticipants({
      chat_id: chat!.chat_id,
    })
    if (eqSet(new Set(participants), new Set(users.map((u) => u?.user_id)))) {
      res.json(createResponse({ result: "Success" }))
      return
    }
  }

  await chatDb.insertChat(Array.from(new Set(users.map((x) => x!.user_id))))

  res.json(createResponse({ result: "Success" }))
}

// Get a chat by ID
export async function getChatById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const chat = req.chat!

  const msg_entries = await chatDb.getMessages({ chat_id: chat!.chat_id })
  const participants = await chatDb.getChatParticipants({
    chat_id: chat!.chat_id,
  })

  const messages = await Promise.all(msg_entries.map(serializeMessage))

  res.json(
    createResponse({
      chat_id: chat.chat_id,
      participants: await Promise.all(
        participants.map(async (user_id) => {
          const u = await profileDb.getUser({ user_id: user_id })
          return {
            username: u!.username,
            avatar: await cdn.getFileLinkResource(u.avatar),
          }
        }),
      ),
      messages: messages,
      order_id: chat.order_id,
    }),
  )
}

// Get my chats
export async function getChats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user as User
  const chats = await chatDb.getChatByParticipant(user.user_id)
  const newchats = await Promise.all(
    chats.map(async (chat) => {
      const participants = await chatDb.getChatParticipants({
        chat_id: chat!.chat_id,
      })
      const mostRecent = await chatDb.getMostRecentMessage({
        chat_id: chat.chat_id,
      })
      return {
        chat_id: chat.chat_id,
        participants: await Promise.all(
          participants.map(async (user_id) => {
            const u = await profileDb.getUser({ user_id: user_id })

            return {
              username: u!.username,
              avatar: await cdn.getFileLinkResource(u.avatar),
            }
          }),
        ),
        messages: mostRecent
          ? [
              {
                ...mostRecent,
                author: (
                  await profileDb.getUser({ user_id: mostRecent.author })
                ).username,
              },
            ]
          : [],
      }
    }),
  )
  res.json(createResponse(newchats))
}
