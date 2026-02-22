/**
 * Email models for TSOA
 */

import { ApiResponse } from "./common.models.js"

/**
 * Email notification type
 */
export interface EmailNotificationType {
  action_type_id: number
  action: string
  entity: string
  description: string | null
}

/**
 * Email preference
 */
export interface EmailPreference {
  action: string
  enabled: boolean
}

/**
 * Organization email preferences
 */
export interface OrganizationEmailPreferences {
  contractor_id: string
  preferences: EmailPreference[]
}

/**
 * Grouped email preferences
 */
export interface GroupedEmailPreferences {
  individual: EmailPreference[]
  organizations: OrganizationEmailPreferences[]
}

/**
 * User email info
 */
export interface UserEmailInfo {
  email_id: string
  email: string
  email_verified: boolean
  is_primary: boolean
}

/**
 * Update email preference payload (single or batch)
 */
export interface UpdateEmailPreferencePayload {
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
 * Notification types response
 */
export interface NotificationTypesResponse extends ApiResponse<{
  notificationTypes: EmailNotificationType[]
}> {}

/**
 * Email preferences response
 */
export interface EmailPreferencesResponse extends ApiResponse<{
  preferences: GroupedEmailPreferences
  email: UserEmailInfo | null
}> {}

/**
 * Email operation response
 */
export interface EmailOperationResponse extends ApiResponse<{
  message: string
}> {}
