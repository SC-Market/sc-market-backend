/**
 * Recruiting API Models
 * Type definitions for recruiting posts endpoints
 */

import { ApiResponse } from "./common.models.js"

/**
 * Recruiting post entity
 */
export interface RecruitingPost {
  post_id: string
  contractor: any // Contractor object
  title: string
  body: string
  timestamp: string
  upvotes: number
  downvotes: number
}

/**
 * Create recruiting post payload
 */
export interface CreateRecruitingPostPayload {
  title: string
  body: string
  contractor: string // spectrum_id
}

/**
 * Update recruiting post payload
 */
export interface UpdateRecruitingPostPayload {
  title?: string
  body?: string
}

/**
 * Create comment payload
 */
export interface CreateCommentPayload {
  content: string
  reply_to?: string
}

/**
 * Recruiting posts list response
 */
export interface RecruitingPostsListResponse extends ApiResponse<{
  total: number
  items: RecruitingPost[]
}> {}

/**
 * Single recruiting post response
 */
export interface RecruitingPostResponse extends ApiResponse<RecruitingPost> {}

/**
 * Comments list response
 */
export interface CommentsListResponse extends ApiResponse<any[]> {}

/**
 * Upvote response
 */
export interface UpvoteResponse {
  message: string
  already_voted: boolean
}
