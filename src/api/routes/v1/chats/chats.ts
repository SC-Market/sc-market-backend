import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { sendUserChatMessage } from "../util/discord.js"
import {
  createOfferMessageNotification,
  createOrderMessageNotification,
} from "../util/notifications.js"
import { envoyManager } from "../../../../clients/messaging/envoy.js"
import { eqSet, handle_chat_response } from "./helpers.js"
import { serializeMessage } from "./serializers.js"
import { related_to_order } from "../orders/middleware.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { related_to_offer } from "../offers/middleware.js"
import { related_to_chat, valid_chat } from "./middleware.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
} from "../openapi.js"

export const chatsRouter = express.Router()

oapi.schema("Message", {
  properties: {
    author: {
      title: "Message.author",
      nullable: true,
      type: "string",
    },
    content: {
      title: "Message.content",
      type: "string",
    },
    timestamp: {
      title: "Message.timestamp",
      type: "number",
    },
  },
  required: ["author", "content", "timestamp"],
  additionalProperties: false,
  title: "Message",
  type: "object",
})

oapi.schema("MessageBody", {
  properties: {
    content: {
      title: "MessageBody.content",
      type: "string",
    },
  },
  required: ["content"],
  additionalProperties: false,
  title: "MessageBody",
  type: "object",
})

oapi.schema("Chat", {
  properties: {
    chat_id: {
      title: "Chat.chat_id",
      type: "string",
    },
    participants: {
      items: {
        properties: {
          username: {
            title: "Chat.participants.[].username",
            type: "string",
          },
          avatar: {
            title: "Chat.participants.[].avatar",
            type: "string",
          },
        },
        required: ["username", "avatar"],
        additionalProperties: false,
        title: "Chat.participants.[]",
        type: "object",
      },
      title: "Chat.participants",
      type: "array",
    },
    messages: {
      items: {
        $ref: "#/components/schemas/Message",
        title: "Chat.messages.[]",
      },
      title: "Chat.messages",
      type: "array",
    },
    order_id: {
      title: "Chat.order_id",
      nullable: true,
      type: "string",
    },
  },
  required: ["chat_id", "participants", "messages", "order_id"],
  additionalProperties: false,
  title: "Chat",
  type: "object",
})

oapi.schema("ChatBody", {
  properties: {
    users: {
      items: {
        title: "ChatBody.users.[]",
        type: "string",
      },
      title: "ChatBody.users",
      type: "array",
    },
  },
  required: ["chat_id", "participants", "messages", "order_id"],
  additionalProperties: false,
  title: "Chat",
  type: "object",
})

chatsRouter.get(
  "/orders/:order_id",
  oapi.validPath({
    summary: "Get a chat by order ID",
    deprecated: false,
    description: "",
    operationId: "getChatByOrderId",
    tags: ["Chats"],
    parameters: [
      {
        name: "order_id",
        in: "path",
        description: "Related order for chat",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: oapi.schema("Chat"),
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  userAuthorized,
  related_to_order,
  async (req, res, next) => {
    let chat
    try {
      chat = await database.getChat({ order_id: req.params.order_id })
    } catch {
      res.status(404).json(createErrorResponse({ error: "Invalid chat" }))
      return
    }

    req.chat = chat
    next()
  },
  handle_chat_response,
)

chatsRouter.get(
  "/offers/:session_id",
  oapi.validPath({
    summary: "Get a chat by offer session ID",
    deprecated: false,
    description: "",
    operationId: "getChatByOrderId",
    tags: ["Chats"],
    parameters: [
      {
        name: "session_id",
        in: "path",
        description: "Related offer session for chat",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: oapi.schema("Chat"),
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  userAuthorized,
  related_to_offer,
  async (req, res, next) => {
    const session_id = req.params.session_id

    let chat
    try {
      chat = await database.getChat({ session_id: session_id })
    } catch {
      res.status(404).json(createErrorResponse({ error: "Invalid chat" }))
      return
    }

    req.chat = chat
    next()
  },
  handle_chat_response,
)

chatsRouter.post(
  "/:chat_id/messages",
  oapi.validPath({
    summary: "Send a message",
    deprecated: false,
    description: "",
    operationId: "sendMessage",
    tags: ["Chats"],
    parameters: [
      {
        name: "chat_id",
        in: "path",
        description: "ID of chat",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("MessageBody"),
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  title: "data",
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "MessageCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
    },
    security: [],
  }),
  userAuthorized,
  valid_chat,
  related_to_chat,
  async (req, res, next) => {
    const user = req.user as User
    const { content } = req.body as {
      content: string
    }

    if (!content) {
      res.status(400).json(createErrorResponse({ error: "Invalid content" }))
      return
    }

    const chat = req.chat!

    const message = await database.insertMessage({
      chat_id: chat.chat_id,
      content,
      author: user.user_id,
    })

    envoyManager.envoy.emitMessage(await serializeMessage(message))

    const order = req.order
    const session = req.offer_session
    if (order || session) {
      if ((order || session)!.thread_id) {
        await sendUserChatMessage(order || session!, user, content)
      }

      if (order) {
        await createOrderMessageNotification(order, message)
      }

      if (session) {
        await createOfferMessageNotification(session, message)
      }
    }

    res.status(200).json(createResponse({ result: "Success" }))
  },
)

chatsRouter.post(
  "",
  oapi.validPath({
    summary: "Creates a chat",
    deprecated: false,
    description: "",
    operationId: "createChat",
    tags: ["Chats"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("ChatBody"),
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  title: "data",
                  type: "object",
                  properties: {},
                },
              },
              required: ["data"],
              type: "object",
              title: "ChatCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res, next) => {
    const body: {
      users: string[]
    } = req.body as {
      users: string[]
    }
    const user = req.user as User

    const users = await Promise.all(
      body.users.map((user) => {
        return database.getUser({ username: user })
      }),
    )

    // TODO: Process blocked users and user access settings
    if (!users.every(Boolean)) {
      res.status(400).json(createErrorResponse({ error: "Invalid user!" }))
      return
    }

    users.push(user)

    const chats = await database.getChatByParticipant(user.user_id)

    for (const chat of chats) {
      const participants = await database.getChatParticipants({
        chat_id: chat!.chat_id,
      })
      if (eqSet(new Set(participants), new Set(users.map((u) => u?.user_id)))) {
        res.status(200).json(createResponse({ result: "Success" }))
        return
      }
    }

    await database.insertChat(Array.from(new Set(users.map((x) => x!.user_id))))

    res.status(200).json(createResponse({ result: "Success" }))
  },
)

chatsRouter.get(
  "/:chat_id",
  oapi.validPath({
    summary: "Get a chat by ID",
    deprecated: false,
    description: "",
    operationId: "getChatById",
    tags: ["Chats"],
    parameters: [
      {
        name: "chat_id",
        in: "path",
        description: "ID of chat",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: oapi.schema("Chat"),
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  userAuthorized,
  valid_chat,
  related_to_chat,
  async (req, res, next) => {
    const chat = req.chat!

    const msg_entries = await database.getMessages({ chat_id: chat!.chat_id })
    const participants = await database.getChatParticipants({
      chat_id: chat!.chat_id,
    })

    const messages = await Promise.all(msg_entries.map(serializeMessage))

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
      }),
    )
  },
)

chatsRouter.get(
  "",
  oapi.validPath({
    summary: "Get my chats",
    deprecated: false,
    description: "",
    operationId: "getChats",
    tags: ["Chats"],
    parameters: [],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: { type: "array", items: oapi.schema("Chat") },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
    },
    security: [],
  }),
  userAuthorized,
  async (req, res, next) => {
    const user = req.user as User
    const chats = await database.getChatByParticipant(user.user_id)
    const newchats = await Promise.all(
      chats.map(async (chat) => {
        const participants = await database.getChatParticipants({
          chat_id: chat!.chat_id,
        })
        const mostRecent = await database.getMostRecentMessage({
          chat_id: chat.chat_id,
        })
        return {
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
          messages: mostRecent
            ? [
                {
                  ...mostRecent,
                  author: (
                    await database.getUser({ user_id: mostRecent.author })
                  ).username,
                },
              ]
            : [],
        }
      }),
    )
    res.status(200).json(createResponse(newchats))
  },
)
