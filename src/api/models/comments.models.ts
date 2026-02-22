/**
 * Comments API Models
 * Type definitions for comments endpoints
 */

import { ApiResponse } from "./common.models.js"
import { MinimalUser } from "./common.models.js"

/**
 * Comment entity
 */
export interface Comment {
  comment_id: string
  author: MinimalUser | null
  content: string
  timestamp: Date
  replies: Comment[]
  upvotes?: string | number
  downvotes?: string | number
  reply_to?: string | null
  created_at?: string
  updated_at?: string
  deleted?: boolean
}

/**
 * Reply to comment request payload
 */
export interface CommentReplyPayload {
  content: string
}

/**
 * Update comment request payload
 */
export interface CommentUpdatePayload {
  content: string
}

/**
 * Comment response
 */
export interface CommentResponse extends ApiResponse<Comment> {}
