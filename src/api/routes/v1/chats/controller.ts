import { Request, Response, NextFunction } from "express"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as chatDb from "./database.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"
import * as orderDb from "../orders/database.js"
import * as offerDb from "../offers/database.js"
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

  // Get order/offer information and contractor if chat is attached to order or offer
  let chatTitle: string | null = null
  let contractorParticipant = null
  if (chat.order_id) {
    try {
      const order = await orderDb.getOrder({ order_id: chat.order_id })
      chatTitle = order.title
      if (order.contractor_id) {
        const contractor = await contractorDb.getMinimalContractor({
          contractor_id: order.contractor_id,
        })
        contractorParticipant = {
          type: "contractor",
          name: contractor.name,
          avatar: contractor.avatar,
          spectrum_id: contractor.spectrum_id,
        }
      }
    } catch (error) {
      logger.debug(`Failed to get order for chat: ${chat.order_id}`, error)
    }
  } else if (chat.session_id) {
    try {
      const sessions = await offerDb.getOfferSessions({ id: chat.session_id })
      const session = sessions[0]
      if (session) {
        // Get title from most recent offer
        try {
          const mostRecentOffer = await offerDb.getMostRecentOrderOffer(
            session.id,
          )
          chatTitle = mostRecentOffer.title
        } catch (error) {
          logger.debug(
            `Failed to get most recent offer for session ${session.id}`,
            error,
          )
        }
        if (session.contractor_id) {
          const contractor = await contractorDb.getMinimalContractor({
            contractor_id: session.contractor_id,
          })
          contractorParticipant = {
            type: "contractor",
            name: contractor.name,
            avatar: contractor.avatar,
            spectrum_id: contractor.spectrum_id,
          }
        }
      }
    } catch (error) {
      logger.debug(
        `Failed to get offer session for chat: ${chat.session_id}`,
        error,
      )
    }
  }

  // Get user participants
  const userParticipants = await Promise.all(
    participants.map(async (user_id) => {
      const u = await profileDb.getUser({ user_id: user_id })
      return {
        type: "user",
        username: u!.username,
        avatar: await cdn.getFileLinkResource(u.avatar),
      }
    }),
  )

  // Combine user and contractor participants
  const allParticipants = contractorParticipant
    ? [...userParticipants, contractorParticipant]
    : userParticipants

  res.json(
    createResponse({
      chat_id: chat.chat_id,
      participants: allParticipants,
      messages: messages,
      order_id: chat.order_id,
      session_id: chat.session_id,
      title: chatTitle,
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

      // Get order/offer information and contractor if chat is attached to order or offer
      let chatTitle: string | null = null
      let contractorParticipant = null
      if (chat.order_id) {
        try {
          const order = await orderDb.getOrder({ order_id: chat.order_id })
          chatTitle = order.title
          if (order.contractor_id) {
            const contractor = await contractorDb.getMinimalContractor({
              contractor_id: order.contractor_id,
            })
            contractorParticipant = {
              type: "contractor",
              name: contractor.name,
              avatar: contractor.avatar,
              spectrum_id: contractor.spectrum_id,
            }
          }
        } catch (error) {
          logger.debug(`Failed to get order for chat: ${chat.order_id}`, error)
        }
      } else if (chat.session_id) {
        try {
          const sessions = await offerDb.getOfferSessions({
            id: chat.session_id,
          })
          const session = sessions[0]
          if (session) {
            // Get title from most recent offer
            try {
              const mostRecentOffer = await offerDb.getMostRecentOrderOffer(
                session.id,
              )
              chatTitle = mostRecentOffer.title
            } catch (error) {
              logger.debug(
                `Failed to get most recent offer for session ${session.id}`,
                error,
              )
            }
            if (session.contractor_id) {
              const contractor = await contractorDb.getMinimalContractor({
                contractor_id: session.contractor_id,
              })
              contractorParticipant = {
                type: "contractor",
                name: contractor.name,
                avatar: contractor.avatar,
                spectrum_id: contractor.spectrum_id,
              }
            }
          }
        } catch (error) {
          logger.debug(
            `Failed to get offer session for chat: ${chat.session_id}`,
            error,
          )
        }
      }

      // Get participant info
      // Note: user_id is a foreign key to accounts(user_id), so it should always exist
      // But we handle errors gracefully in case of data integrity issues
      const participantInfo = await Promise.all(
        participants.map(async (user_id) => {
          try {
            const u = await profileDb.getUser({ user_id: user_id })
            return {
              type: "user",
              username: u.username,
              avatar: await cdn.getFileLinkResource(u.avatar),
            }
          } catch (error) {
            // This shouldn't happen if foreign key constraint is enforced
            // Log error for investigation but don't crash
            logger.error(
              `User not found for participant ${user_id} in chat ${chat.chat_id}. Foreign key constraint violation?`,
              error,
            )
            return null
          }
        }),
      )

      // Filter out null participants (shouldn't happen if FKs are working)
      const validUserParticipants = participantInfo.filter(
        (p): p is { type: "user"; username: string; avatar: string } =>
          p !== null,
      )

      // Combine user and contractor participants
      const allParticipants = contractorParticipant
        ? [...validUserParticipants, contractorParticipant]
        : validUserParticipants

      // Get most recent message author
      // Note: author can be null for system messages (allowed by FK constraint)
      // If non-null, it's a foreign key to accounts(user_id) and should exist
      let messageAuthor: string | null = null
      if (
        mostRecent &&
        mostRecent.author !== null &&
        mostRecent.author !== undefined
      ) {
        try {
          const authorUser = await profileDb.getUser({
            user_id: mostRecent.author,
          })
          messageAuthor = authorUser.username
        } catch (error) {
          // This shouldn't happen if foreign key constraint is enforced
          logger.error(
            `Author not found for message ${mostRecent.message_id}, author: ${mostRecent.author}. Foreign key constraint violation?`,
            error,
          )
          messageAuthor = null
        }
      }

      return {
        chat_id: chat.chat_id,
        participants: allParticipants,
        messages: mostRecent
          ? [
              {
                ...mostRecent,
                author: messageAuthor,
              },
            ]
          : [],
        order_id: chat.order_id,
        session_id: chat.session_id,
        title: chatTitle,
      }
    }),
  )
  res.json(createResponse(newchats))
}
