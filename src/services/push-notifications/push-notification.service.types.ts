/**
 * Type definitions for PushNotificationService
 */

/**
 * Push subscription data from the browser
 */
export interface PushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userAgent?: string
}

/**
 * Push subscription stored in database
 */
export interface PushSubscription {
  subscription_id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: Date
  updated_at: Date
}

/**
 * Push notification payload
 */
export interface PushNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  data?: {
    url: string
    type: string
    entityId: string
    [key: string]: unknown
  }
  tag?: string
  requireInteraction?: boolean
  silent?: boolean
  vibrate?: number[]
  timestamp?: number
}

/**
 * Push notification preferences for a user
 * Maps action type names to enabled/disabled state
 */
export interface PushNotificationPreferences {
  [actionType: string]: boolean
}

/**
 * Push notification preference stored in database
 * Note: action_type_id is stored as INTEGER in database but returned as string by Knex
 */
export interface PushNotificationPreference {
  preference_id: string
  user_id: string
  action_type_id: string // Knex converts INTEGER to string
  contractor_id: string | null // NULL for individual preferences, UUID for org preferences
  enabled: boolean
  created_at: Date
  updated_at: Date
}
