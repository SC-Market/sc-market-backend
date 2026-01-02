import express from "express"
import * as chatDb from "./database.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { serializeMessage } from "./serializers.js"
import { createResponse } from "../util/response.js"
import { chatServer } from "../../../../clients/messaging/websocket.js"
import * as orderDb from "../orders/database.js"
import * as offerDb from "../offers/database.js"
import logger from "../../../../logger/logger.js"

export function eqSet<T>(as: Set<T>, bs: Set<T>) {
  if (as.size !== bs.size) return false
  for (const a of as) if (!bs.has(a)) return false
  return true
}

export async function handle_chat_response(
  req: express.Request,
  res: express.Response,
) {
  const chat = req.chat!
  const msg_entries = await chatDb.getMessages({ chat_id: chat!.chat_id })
  const participants = await chatDb.getChatParticipants({
    chat_id: chat!.chat_id,
  })

  const messages = await Promise.all(
    msg_entries.map(async (msg) => {
      if (msg.author) {
        const user = await profileDb.getUser({ user_id: msg.author })
        return {
          ...msg,
          author: user!.username,
        }
      } else {
        return {
          ...msg,
          author: null,
        }
      }
    }),
  )

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
      // Log but don't fail if lookup fails
      logger.debug(`Failed to get order for chat: ${chat.order_id}`, error)
    }
  } else if (chat.session_id) {
    try {
      const sessions = await offerDb.getOfferSessions({ id: chat.session_id })
      const session = sessions[0]
      if (session) {
        // Get title from most recent offer
        try {
          const mostRecentOffer = await offerDb.getMostRecentOrderOffer(session.id)
          chatTitle = mostRecentOffer.title
        } catch (error) {
          logger.debug(`Failed to get most recent offer for session ${session.id}`, error)
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
      // Log but don't fail if lookup fails
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

export async function sendSystemMessage(
  chat_id: string,
  content: string,
  forward: boolean = false,
) {
  const message = await chatDb.insertMessage({
    chat_id: chat_id,
    content,
    author: null,
  })

  chatServer.emitMessage(await serializeMessage(message))
}
