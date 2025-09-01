import { Server } from "socket.io"
import { Request } from "express"
import { MessageBody, User } from "../../api/routes/v1/api-models.js"
import { database } from "../database/knex-db.js"
import { can_view_chat } from "../../api/routes/v1/chats/middleware.js"
import logger from "../../logger/logger.js"

export type MessageType = MessageBody & { author: string | null }

export class WebsocketMessagingServer {
  io!: Server

  initialize(io: Server) {
    this.io = io
    io.on("connection", async (socket) => {
      const user = (socket.request as Request).user as User
      const user_id = user.user_id

      try {
        const chats = await database.getChatByParticipant(user_id)

        chats.forEach((chat) => {
          socket.join(chat.chat_id)
        })
      } catch (error) {
        logger.debug(`Failed to get chats for user ${user_id}: ${error}`)
      }

      socket.on("clientJoinRoom", async (chatInfo: { chat_id: string }) => {
        try {
          const chat = await database.getChat({ chat_id: chatInfo.chat_id })
          const { result: can_view } = await can_view_chat(user, chat)
          if (can_view) socket.join(chatInfo.chat_id)
        } catch (error) {
          logger.debug(`Failed to join chat room ${chatInfo.chat_id}: ${error}`)
        }
      })

      socket.on("clientLeaveRoom", (chatInfo: { chat_id: string }) => {
        socket.leave(chatInfo.chat_id)
      })
    })
  }

  emitMessage(message: MessageType) {
    if (this.io) {
      this.io.to(message.chat_id).emit("serverMessage", message)
    }
  }
}

export const chatServer = new WebsocketMessagingServer()
