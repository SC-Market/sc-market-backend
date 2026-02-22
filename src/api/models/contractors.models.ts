/**
 * TSOA models for contractors endpoints
 */

import { ApiResponse, MinimalContractor } from "./common.models.js"

/**
 * Contractor information
 */
export interface Contractor {
  contractor_id: string
  spectrum_id: string
  name: string
  avatar: string | null
  banner: string | null
  description: string
  size: number
  kind: "contractor" | "independent"
  archived: boolean
  owner_role: string
  default_role: string
  locale: string
  created_at: string
  updated_at: string
  roles?: ContractorRole[]
  member_count?: number
  is_member?: boolean
  user_role?: string
  language_codes?: string[]
}

/**
 * Contractor role
 */
export interface ContractorRole {
  role_id: string
  contractor_id: string
  name: string
  position: number
  manage_roles: boolean
  manage_orders: boolean
  kick_members: boolean
  manage_invites: boolean
  manage_org_details: boolean
  manage_stock: boolean
  manage_market: boolean
  manage_webhooks: boolean
  manage_recruiting: boolean
  manage_blocklist: boolean
}

/**
 * Contractor member
 */
export interface ContractorMember {
  user_id: string
  username: string
  display_name: string | null
  avatar: string | null
  roles: string[]
}

/**
 * Contractor invite code
 */
export interface ContractorInviteCode {
  invite_id: string
  contractor_id: string
  max_uses: number
  times_used: number
  created_at: string
}

/**
 * Contractor search result
 */
export interface ContractorSearchResult {
  spectrum_id: string
  name: string
  avatar: string | null
}

/**
 * Create contractor payload
 */
export interface CreateContractorPayload {
  /** Organization name */
  name: string
  /** Organization identifier (will be prefixed with ~) */
  identifier: string
  /** Organization description */
  description: string
  /** Logo URL */
  logo?: string
  /** Banner URL */
  banner?: string
  /** Language codes (ISO 639-1) */
  language_codes?: string[]
}

/**
 * Update contractor payload
 */
export interface UpdateContractorPayload {
  /** Organization name */
  name?: string
  /** Organization description */
  description?: string
  /** Language codes (ISO 639-1) */
  language_codes?: string[]
}

/**
 * Link contractor payload
 */
export interface LinkContractorPayload {
  /** RSI organization spectrum ID */
  contractor: string
}

/**
 * Contractor response
 */
export interface ContractorResponse extends ApiResponse<Contractor> {}

/**
 * Contractors list response
 */
export interface ContractorsListResponse
  extends ApiResponse<{
    contractors: Contractor[]
  }> {}

/**
 * Contractor search response
 */
export interface ContractorSearchResponse
  extends ApiResponse<ContractorSearchResult[]> {}

/**
 * Success response
 */
export interface SuccessResponse
  extends ApiResponse<{
    result: string
  }> {}
