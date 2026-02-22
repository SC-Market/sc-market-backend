/**
 * Push notification models for TSOA
 */

import { ApiResponse } from "./common.models.js"

/**
 * Push subscription keys
 */
export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

/**
 * Push subscription payload
 */
export interface PushSubscriptionPayload {
  endpoint: string
  keys: PushSubscriptionKeys
  userAgent?: string
}

/**
 * Push subscription object
 */
export interface PushSubscription {
  subscription_id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent?: string | null
  created_at: string
  last_used_at?: string | null
}

/**
 * Push notification preference
 */
export interface PushPreference {
  action: string
  enabled: boolean
}

/**
 * Organization push preferences
 */
export interface OrganizationPushPreferences {
  contractor_id: string
  preferences: PushPreference[]
}

/**
 * Grouped push preferences
 */
export interface GroupedPushPreferences {
  individual: PushPreference[]
  organizations: OrganizationPushPreferences[]
}

/**
 * Update push preference payload (single or batch)
 */
export interface UpdatePushPreferencePayload {
  action?: string
  enabled?: boolean
  contractor_id?: string | null
  preferences?: Array<{
    action: string
    enabled: boolean
    contractor_id?: string | null
  }>
}

/**
 * Push subscription response
 */
export interface PushSubscriptionResponse extends ApiResponse<{
  subscription_id: string
  message: string
}> {}

/**
 * Push subscriptions list response
 */
export interface PushSubscriptionsResponse extends ApiResponse<{
  subscriptions: PushSubscription[]
}> {}

/**
 * Push preferences response
 */
export interface PushPreferencesResponse extends ApiResponse<{
  preferences: GroupedPushPreferences
}> {}

/**
 * Push operation response
 */
export interface PushOperationResponse extends ApiResponse<{
  message: string
}> {}
