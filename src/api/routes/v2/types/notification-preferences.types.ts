/**
 * Settings -> Notifications: the category x channel matrix, with per-event
 * overrides under each category.
 */

export type NotificationChannelId = "in_app" | "push" | "email" | "discord_dm"

export type NotificationCategoryId =
  | "orders"
  | "order_messages"
  | "offers"
  | "offer_messages"
  | "market"
  | "reviews"
  | "watchlist"
  | "org"
  | "org_members"
  | "announcements"
  | "reminders"
  | "contracts"

export type NotificationEventKey =
  | "order.created"
  | "order.assigned"
  | "order.status.not_started"
  | "order.status.in_progress"
  | "order.status.fulfilled"
  | "order.status.cancelled"
  | "order.message"
  | "order.review"
  | "order.review_revision_requested"
  | "offer.created"
  | "offer.countered"
  | "offer.message"
  | "market.bid"
  | "org.invite"
  | "org.member_joined"
  | "admin.alert"
  | "reminder.unread_messages"
  | "watchlist.price_alert"
  | "offer.accepted"
  | "offer.rejected"
  | "contract.public_created"
  | "contract.offer_received"

export interface NotificationPreferenceCell {
  channel: NotificationChannelId
  enabled: boolean
  /** Shown but not switchable. */
  locked: boolean
  /** Why: always delivered, Discord not linked, set once under Personal, or not available for this event yet. */
  reason?: "always_on" | "discord_not_linked" | "personal_only" | "coming_soon"
  /** Value when the user never chose. */
  default: boolean
}

export interface NotificationPreferenceEvent {
  event: NotificationEventKey
  cells: NotificationPreferenceCell[]
}

export interface NotificationPreferenceCategory {
  category: NotificationCategoryId
  /** Per channel across the category's events: on, off or mixed. */
  cells: { channel: NotificationChannelId; state: "on" | "off" | "mixed"; locked: boolean }[]
  events: NotificationPreferenceEvent[]
}

export interface NotificationPreferenceScope {
  /** null: personal notifications. */
  contractor_id: string | null
  name: string
  spectrum_id: string | null
}

export interface NotificationPreferencesResponse {
  /** The scope `categories` is for. */
  contractor_id: string | null
  /** Personal plus every org the user belongs to (org-scoped categories only). */
  scopes: NotificationPreferenceScope[]
  categories: NotificationPreferenceCategory[]
  /** Org scope only: whether the user muted this org (push, email and Discord DM stop; in-app stays). */
  mute?: NotificationOrgMute
}

export interface NotificationOrgMute {
  muted: boolean
  /** When the mute ends (ISO); null = until turned back on. */
  until: string | null
}

export interface UpdateNotificationOrgMuteRequest {
  contractor_id: string
  muted: boolean
  /** ISO time the mute ends; omit or null for "until I turn it back on". */
  until?: string | null
}

export interface NotificationPreferenceUpdate {
  /** Set the whole category... */
  category?: NotificationCategoryId
  /** ...or one event (per-event override). */
  event?: NotificationEventKey
  channel: NotificationChannelId
  enabled: boolean
}

export interface UpdateNotificationPreferencesRequest {
  /** null or omitted: personal. */
  contractor_id?: string | null
  updates: NotificationPreferenceUpdate[]
}
