import { Server } from "socket.io"
import { Request } from "express"
import { MessageBody, User } from "../../api/routes/v1/api-models.js"
import { database } from "../database/knex-db.js"
import { can_view_chat } from "../../api/routes/v1/chats/middleware.js"

export type MessageType = MessageBody & { author: string | null }

class WebsocketMessagingServer {
  io!: Server

  initialize(io: Server) {
    this.io = io
    io.on("connection", async (socket) => {
      const user = (socket.request as Request).user as User
      const user_id = user.user_id
      const chats = await database.getChatByParticipant(user_id)
      socket.join(user_id)
      chats.forEach((chat) => {
        socket.join(chat.chat_id)
      })

      socket.on("clientJoinRoom", async (chatInfo: { chat_id: string }) => {
        const chat = await database.getChat({ chat_id: chatInfo.chat_id })
        const { result: can_view } = await can_view_chat(user, chat)
        if (can_view) socket.join(chatInfo.chat_id)
      })

      socket.on("clientLeaveRoom", (chatInfo: { chat_id: string }) => {
        socket.leave(chatInfo.chat_id)
      })
    })
  }

  emitMessage(message: MessageType) {
    this.io.to(message.chat_id).emit("serverMessage", JSON.stringify(message))
  }
}

export const chatServer = new WebsocketMessagingServer()
