/**
 * The notification event catalog: every event SC Market notifies about, its
 * user-facing category, the legacy notification_actions row it maps to, the
 * channels it may use and what each channel gets by default.
 *
 * Defaults reproduce today's behaviour exactly (see the characterization
 * suite in services/notifications/__characterization__):
 * - in-app is always written;
 * - push is opt-out (a missing push_notification_preferences row = on);
 * - email is opt-in (a missing email_notification_preferences row = off);
 * - Discord DM is opt-out where it exists (only price alerts DM today).
 *
 * Events are migrated onto notify() one family at a time; an event listed
 * here with `migrated: false` is still sent by its legacy code path.
 */
import type { UserChannel } from "./channels.js"

export const CATEGORIES = {
  orders: { orgScoped: true, mandatory: false },
  order_messages: { orgScoped: true, mandatory: false },
  offers: { orgScoped: true, mandatory: false },
  offer_messages: { orgScoped: true, mandatory: false },
  market: { orgScoped: true, mandatory: false },
  reviews: { orgScoped: true, mandatory: false },
  watchlist: { orgScoped: false, mandatory: false },
  org: { orgScoped: false, mandatory: false },
  announcements: { orgScoped: false, mandatory: false },
  reminders: { orgScoped: false, mandatory: false },
  account: { orgScoped: false, mandatory: true },
} as const
export type CategoryId = keyof typeof CATEGORIES

export interface EventDefinition {
  category: CategoryId
  /** notification_actions.action: in-app rows, webhook_actions and the legacy preference tables key on it. */
  legacyAction: string
  /** Channels this event may use. */
  channels: readonly UserChannel[]
  /** Value when the user has no preference row. */
  defaults: Partial<Record<UserChannel, boolean>>
}

const LEGACY_DEFAULTS = { in_app: true, push: true, email: false, discord_dm: true } as const

function event(
  category: CategoryId,
  legacyAction: string,
  channels: readonly UserChannel[],
): EventDefinition {
  const defaults: Partial<Record<UserChannel, boolean>> = {}
  for (const c of channels) defaults[c] = LEGACY_DEFAULTS[c]
  return { category, legacyAction, channels, defaults }
}

const IN_APP_PUSH_EMAIL = ["in_app", "push", "email"] as const
const IN_APP_PUSH = ["in_app", "push"] as const

/**
 * Channels listed here are the ones the event uses TODAY (characterized), not
 * the ones it could use: e.g. contractor invites have an email template that
 * was never sent, so email is not listed. Widening a channel list is a
 * behaviour change for the owner to decide.
 */
export const CATALOG = {
  "order.created": event("orders", "order_create", IN_APP_PUSH_EMAIL),
  "order.assigned": event("orders", "order_assigned", IN_APP_PUSH_EMAIL),
  "order.status.not_started": event("orders", "order_status_not_started", IN_APP_PUSH_EMAIL),
  "order.status.in_progress": event("orders", "order_status_in_progress", IN_APP_PUSH_EMAIL),
  "order.status.fulfilled": event("orders", "order_status_fulfilled", IN_APP_PUSH_EMAIL),
  "order.status.cancelled": event("orders", "order_status_cancelled", IN_APP_PUSH_EMAIL),
  "order.message": event("order_messages", "order_message", IN_APP_PUSH_EMAIL),
  "order.review": event("reviews", "order_review", IN_APP_PUSH_EMAIL),
  "order.review_revision_requested": event("reviews", "order_review_revision_requested", IN_APP_PUSH),
  "offer.created": event("offers", "offer_create", IN_APP_PUSH_EMAIL),
  "offer.countered": event("offers", "counter_offer_create", IN_APP_PUSH_EMAIL),
  "offer.message": event("offer_messages", "offer_message", IN_APP_PUSH_EMAIL),
  "market.bid": event("market", "market_item_bid", IN_APP_PUSH),
  "org.invite": event("org", "contractor_invite", IN_APP_PUSH),
  "admin.alert": event("announcements", "admin_alert", IN_APP_PUSH),
  "reminder.unread_messages": event("reminders", "dm_reminder", ["email"]),
  "watchlist.price_alert": event("watchlist", "price_alert", ["in_app", "push", "email", "discord_dm"]),
} as const satisfies Record<string, EventDefinition>

export type EventKey = keyof typeof CATALOG

export function eventDefinition(key: EventKey): EventDefinition {
  const def = CATALOG[key]
  if (!def) throw new Error(`Unknown notification event: ${String(key)}`)
  return def
}
