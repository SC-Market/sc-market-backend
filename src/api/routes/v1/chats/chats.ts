import express from "express"
import {
  userAuthorized,
  AuthRequest,
  requireChatsRead,
  requireChatsWrite,
} from "../../../middleware/auth.js"
import { related_to_order } from "../orders/middleware.js"
import { related_to_offer } from "../offers/middleware.js"
import { related_to_chat, valid_chat } from "./middleware.js"
import { handle_chat_response } from "./helpers.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
} from "../openapi.js"
import * as chatsController from "./chatsController.js"

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

// Get a chat by order ID
chatsRouter.get(
  "/orders/:order_id",
  userAuthorized,
  requireChatsRead,
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
  chatsController.getChatByOrderId,
  handle_chat_response,
)

// Get a chat by offer session ID
chatsRouter.get(
  "/offers/:session_id",
  userAuthorized,
  requireChatsRead,
  oapi.validPath({
    summary: "Get a chat by offer session ID",
    deprecated: false,
    description: "",
    operationId: "getChatByOfferSessionId",
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
  chatsController.getChatByOfferSessionId,
  handle_chat_response,
)

// Send a message
chatsRouter.post(
  "/:chat_id/messages",
  userAuthorized,
  requireChatsWrite,
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
  chatsController.sendMessage,
)

// Create a chat
chatsRouter.post(
  "",
  userAuthorized,
  requireChatsWrite,
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
  chatsController.createChat,
)

// Get a chat by ID
chatsRouter.get(
  "/:chat_id",
  userAuthorized,
  requireChatsRead,
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
  chatsController.getChatById,
)

// Get my chats
chatsRouter.get(
  "",
  userAuthorized,
  requireChatsRead,
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
  chatsController.getChats,
)