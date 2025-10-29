import express from "express"
import {
  userAuthorized,
  requireChatsRead,
  requireChatsWrite,
} from "../../../middleware/auth.js"
import {
  criticalRateLimit,
  writeRateLimit,
  readRateLimit,
  commonWriteRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { related_to_order } from "../orders/middleware.js"
import { related_to_offer } from "../offers/middleware.js"
import { related_to_chat, valid_chat } from "./middleware.js"
import { handle_chat_response } from "./helpers.js"

import {
  getChatByOrderId,
  getChatByOfferSessionId,
  sendMessage,
  createChat,
  getChatById,
  getChats,
} from "./controller.js"

import {
  get_orders_order_id_spec,
  get_offers_session_id_spec,
  post_chat_id_messages_spec,
  post_root_spec,
  get_chat_id_spec,
  get_root_spec,
} from "./openapi.js"

export const chatsRouter = express.Router()

// Get a chat by order ID
chatsRouter.get(
  "/orders/:order_id",
  userAuthorized,
  requireChatsRead,
  get_orders_order_id_spec,
  readRateLimit,
  related_to_order,
  getChatByOrderId,
  handle_chat_response,
)

// Get a chat by offer session ID
chatsRouter.get(
  "/offers/:session_id",
  userAuthorized,
  requireChatsRead,
  get_offers_session_id_spec,
  readRateLimit,
  related_to_offer,
  getChatByOfferSessionId,
  handle_chat_response,
)

// Send a message
chatsRouter.post(
  "/:chat_id/messages",
  userAuthorized,
  requireChatsWrite,
  post_chat_id_messages_spec,
  commonWriteRateLimit,
  valid_chat,
  related_to_chat,
  sendMessage,
)

// Create a chat
chatsRouter.post(
  "",
  userAuthorized,
  requireChatsWrite,
  post_root_spec,
  commonWriteRateLimit,
  createChat,
)

// Get a chat by ID
chatsRouter.get(
  "/:chat_id",
  userAuthorized,
  requireChatsRead,
  get_chat_id_spec,
  readRateLimit,
  valid_chat,
  related_to_chat,
  getChatById,
)

// Get my chats
chatsRouter.get("", userAuthorized, requireChatsRead, get_root_spec, readRateLimit, getChats)
