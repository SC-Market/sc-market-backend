/**
 * Debug V2 Types
 *
 * TypeScript interfaces for debug endpoints in the V2 market system.
 * These types are used by DebugV2Controller for feature flag management.
 */

/**
 * Response for getting feature flags
 *
 * Returns every resolved flag for the caller, along with developer status to
 * determine if debug UI should be shown.
 */
export interface GetFeatureFlagResponse {
  /** User ID */
  user_id: string
  /**
   * Always "V2". The V1 market and its `market_v2` flag are retired; the field
   * is only kept until no client reads it. Use `flags` instead.
   * @deprecated
   */
  market_version: "V2"
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
 * Request for setting a per-user flag override.
 */
export interface SetFeatureFlagRequest {
  /** Flag name to set (must have a feature_flag_config row, e.g. "market_v2_redesign") */
  flag_name: string
  /** Whether to enable or disable the flag */
  enabled: boolean
}

/**
 * Response for setting a per-user flag override.
 */
export interface SetFeatureFlagResponse {
  /** User ID */
  user_id: string
  /** Success message */
  message: string
}
