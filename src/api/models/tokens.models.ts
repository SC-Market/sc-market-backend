import { ApiResponse } from "./common.models.js"

/**
 * API token scope
 */
export type TokenScope =
  | "profile:read"
  | "profile:write"
  | "market:read"
  | "market:write"
  | "market:purchase"
  | "market:photos"
  | "orders:read"
  | "orders:write"
  | "orders:reviews"
  | "contractors:read"
  | "contractors:write"
  | "contractors:members"
  | "contractors:webhooks"
  | "contractors:blocklist"
  | "orgs:read"
  | "orgs:write"
  | "orgs:manage"
  | "services:read"
  | "services:write"
  | "services:photos"
  | "offers:read"
  | "offers:write"
  | "chats:read"
  | "chats:write"
  | "notifications:read"
  | "notifications:write"
  | "moderation:read"
  | "moderation:write"
  | "admin:read"
  | "admin:write"
  | "admin:spectrum"
  | "admin:stats"
  | "readonly"
  | "full"
  | "admin"

/**
 * API token details
 */
export interface ApiToken {
  id: string
  name: string
  description: string | null
  scopes: TokenScope[]
  contractor_spectrum_ids: string[]
  expires_at: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
}

/**
 * Create API token payload
 */
export interface CreateTokenPayload {
  /** Token name */
  name: string
  /** Token description */
  description?: string
  /** Token scopes */
  scopes: TokenScope[]
  /** Expiration date (ISO 8601 format) */
  expires_at?: string
  /** Contractor Spectrum IDs this token can access */
  contractor_spectrum_ids?: string[]
}

/**
 * Update API token payload
 */
export interface UpdateTokenPayload {
  /** Token name */
  name?: string
  /** Token description */
  description?: string
  /** Token scopes */
  scopes?: TokenScope[]
  /** Expiration date (ISO 8601 format) */
  expires_at?: string | null
  /** Contractor Spectrum IDs this token can access */
  contractor_spectrum_ids?: string[] | null
}

/**
 * Extend token expiration payload
 */
export interface ExtendTokenPayload {
  /** New expiration date (ISO 8601 format) */
  expires_at: string
}

/**
 * Token creation response (includes the actual token value)
 */
export interface TokenCreationResponse extends ApiResponse<{
  /** The actual token value (only shown on creation) */
  token: string
  /** Token details */
  data: ApiToken
}> {}

/**
 * Token response
 */
export interface TokenResponse extends ApiResponse<ApiToken> {}

/**
 * Token list response
 */
export interface TokenListResponse extends ApiResponse<ApiToken[]> {}

/**
 * Token stats response
 */
export interface TokenStatsResponse extends ApiResponse<{
  id: string
  name: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}> {}

/**
 * Available scopes response
 */
export interface AvailableScopesResponse extends ApiResponse<{
  scopes: TokenScope[]
}> {}

/**
 * Token revocation response
 */
export interface TokenRevocationResponse extends ApiResponse<{
  message: string
}> {}

/**
 * Token extension response
 */
export interface TokenExtensionResponse extends ApiResponse<{
  message: string
}> {}
