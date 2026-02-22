/**
 * Profile Models for TSOA Controllers
 *
 * These type definitions are used by TSOA controllers to define
 * request/response schemas for profile endpoints in the OpenAPI spec.
 */

import { ApiResponse } from "./common.models.js"

/**
 * User profile entity
 *
 * @example
 * {
 *   "user_id": "user123",
 *   "username": "john_doe",
 *   "display_name": "John Doe",
 *   "avatar": "https://cdn.sc-market.space/avatar.jpg",
 *   "banner": "https://cdn.sc-market.space/banner.jpg",
 *   "bio": "Trader and explorer",
 *   "rsi_handle": "JohnDoe",
 *   "rsi_confirmed": true,
 *   "discord_username": "johndoe#1234",
 *   "role": "user",
 *   "created_at": "2024-01-01T00:00:00.000Z",
 *   "updated_at": "2024-01-01T00:00:00.000Z"
 * }
 */
export interface UserProfile {
  /** Unique user ID */
  user_id: string
  /** Username */
  username: string
  /** Display name */
  display_name: string | null
  /** Avatar URL */
  avatar: string | null
  /** Banner URL */
  banner: string | null
  /** User bio */
  bio: string | null
  /** RSI handle */
  rsi_handle: string | null
  /** Whether RSI is confirmed */
  rsi_confirmed: boolean
  /** Discord username */
  discord_username: string | null
  /** User role */
  role: "user" | "admin"
  /** ISO 8601 timestamp when created */
  created_at: string
  /** ISO 8601 timestamp when last updated */
  updated_at: string
}

/**
 * Payload for updating user profile
 * All fields are optional
 *
 * @example
 * {
 *   "display_name": "John Doe",
 *   "bio": "Updated bio"
 * }
 */
export interface UpdateProfilePayload {
  /** Updated display name */
  display_name?: string | null
  /** Updated bio */
  bio?: string | null
  /** Updated avatar URL */
  avatar?: string | null
  /** Updated banner URL */
  banner?: string | null
}

/**
 * Response containing user profile
 *
 * @example
 * {
 *   "data": {
 *     "profile": {...}
 *   }
 * }
 */
export interface ProfileResponse
  extends ApiResponse<{
    profile: UserProfile
  }> {}

/**
 * Response for profile search
 *
 * @example
 * {
 *   "data": {
 *     "profiles": [...]
 *   }
 * }
 */
export interface ProfileSearchResponse
  extends ApiResponse<{
    profiles: UserProfile[]
  }> {}
