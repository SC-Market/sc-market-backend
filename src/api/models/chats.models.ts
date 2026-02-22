/**
 * Chat Models
 *
 * Type definitions for chat-related API requests and responses.
 * These models are used by TSOA to generate OpenAPI specifications
 * and validate request/response data.
 */

import { ApiResponse } from "./common.models.js"

/**
 * Message in a chat
 */
export interface Message {
  /** Author username (null for system messages) */
  author: string | null
  /** Message content */
  content: string
  /** Unix timestamp (Date object) */
  timestamp: Date
}

/**
 * Chat participant
 */
export interface ChatParticipant {
  /** Participant type */
  type: "user" | "contractor"
  /** Username (for user participants) */
  username?: string
  /** Contractor name (for contractor participants) */
  name?: string
  /** Avatar URL (can be null) */
  avatar: string | null
  /** Spectrum ID (for contractor participants) */
  spectrum_id?: string
}

/**
 * Chat details
 */
export interface Chat {
  /** Chat ID */
  chat_id: string
  /** Chat participants */
  participants: ChatParticipant[]
  /** Chat messages */
  messages: Message[]
  /** Related order ID (if any) */
  order_id: string | null
  /** Related offer session ID (if any) */
  session_id?: string | null
  /** Chat title (from order or offer) */
  title?: string | null
}

/**
 * Send message payload
 */
export interface SendMessagePayload {
  /** Message content */
  content: string
}

/**
 * Create chat payload
 */
export interface CreateChatPayload {
  /** Usernames of participants (excluding self) */
  users: string[]
}

/**
 * Chat response
 */
export interface ChatResponse extends ApiResponse<Chat> {}

/**
 * Chats list response
 */
export interface ChatsListResponse extends ApiResponse<Chat[]> {}

/**
 * Success response
 */
export interface ChatSuccessResponse
  extends ApiResponse<{ result: string }> {}
