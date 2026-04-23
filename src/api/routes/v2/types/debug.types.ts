/**
 * Debug V2 Types
 *
 * TypeScript interfaces for debug endpoints in the V2 market system.
 * These types are used by DebugV2Controller for feature flag management.
 *
 * Requirements: 2.1-2.10, 59.1-59.6
 */

import { MarketVersion } from "../../../../services/market-v2/feature-flag.service.js"

/**
 * Response for getting feature flag
 *
 * Returns the current market version for the authenticated user,
 * along with developer status to determine if debug UI should be shown.
 */
export interface GetFeatureFlagResponse {
  /** User ID */
  user_id: string
  /** Current market version (V1 or V2) — backward compat */
  market_version: MarketVersion
  /** Whether user has developer privileges (admin or dev environment) */
  is_developer: boolean
  /** Whether this user has a manual override (show treatment picker if true) */
  has_override: boolean
  /** All resolved flags for this user */
  flags: Record<string, boolean>
  /** Which flags this user has overrides for */
  overridden_flags: string[]
}

/**
 * Request for setting feature flag
 *
 * Allows developers to switch between V1 and V2 market experiences.
 * Restricted to users with admin role.
 */
export interface SetFeatureFlagRequest {
  /** Market version to set (V1 or V2) */
  market_version: MarketVersion
}

/**
 * Response for setting feature flag
 *
 * Confirms the market version has been updated for the user.
 */
export interface SetFeatureFlagResponse {
  /** User ID */
  user_id: string
  /** Updated market version */
  market_version: MarketVersion
  /** Success message */
  message: string
}
