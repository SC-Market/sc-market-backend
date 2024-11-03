import express from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { envoyManager } from "../../../../clients/messaging/envoy.js"
import { serializeMessage } from "./serializers.js"
import { createResponse } from "../util/response.js"

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
  const msg_entries = await database.getMessages({ chat_id: chat!.chat_id })
  const participants = await database.getChatParticipants({
    chat_id: chat!.chat_id,
  })

  const messages = await Promise.all(
    msg_entries.map(async (msg) => {
      if (msg.author) {
        const user = await database.getUser({ user_id: msg.author })
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

  res.status(200).json(
    createResponse({
      chat_id: chat.chat_id,
      participants: await Promise.all(
        participants.map(async (user_id) => {
          const u = await database.getUser({ user_id: user_id })
          return {
            username: u!.username,
            avatar: await cdn.getFileLinkResource(u.avatar),
          }
        }),
      ),
      messages: messages,
      order_id: chat.order_id,
      session_id: chat.session_id,
    }),
  )
}

export async function sendSystemMessage(
  chat_id: string,
  content: string,
  forward: boolean = false,
) {
  const message = await database.insertMessage({
    chat_id: chat_id,
    content,
    author: null,
  })

  envoyManager.envoy.emitMessage(await serializeMessage(message))
}
