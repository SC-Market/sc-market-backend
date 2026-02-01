import { oapi } from "../openapi.js"
import {
  Response400,
  Response401,
  Response403,
  Response404,
  Response429Read,
  Response429CommonWrite,
  RateLimitHeaders,
} from "../openapi.js"

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
  required: ["users"],
  additionalProperties: false,
  title: "ChatBody",
  type: "object",
})

export const get_orders_order_id_spec = oapi.validPath({
  summary: "Get a chat by order ID",
  deprecated: false,
  description:
    "Retrieve chat details for a specific order. Rate limited: Anonymous users (10 req/min), Authenticated users (30 req/min), Admin users (100 req/min).",
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
  },
  security: [],
})

export const get_offers_session_id_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
  },
  security: [],
})

export const post_chat_id_messages_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "429": Response429CommonWrite,
  },
  security: [],
})

export const post_root_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "429": Response429CommonWrite,
  },
  security: [],
})

export const get_chat_id_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
  },
  security: [],
})

export const get_root_spec = oapi.validPath({
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
      headers: RateLimitHeaders,
    },
    "400": Response400,
    "401": Response401,
    "403": Response403,
    "404": Response404,
    "429": Response429Read,
  },
  security: [],
})
