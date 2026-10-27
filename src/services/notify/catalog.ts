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
  // Activity inside an org you help run (members joining).
  org_members: { orgScoped: true, mandatory: false },
  // Owner decision: admin alerts can't be turned off (shown locked on).
  announcements: { orgScoped: false, mandatory: true },
  reminders: { orgScoped: false, mandatory: false },
  contracts: { orgScoped: true, mandatory: false },
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
  /**
   * Still delivered by the legacy notification.service.ts code (notify()
   * runs in shadow mode). Channels the legacy code has no sender for
   * (Discord DM) can't be turned on until the event is switched over.
   */
  legacyDelivery?: true
  /**
   * Owner decision: one event for what used to be several notification
   * actions (the four order statuses; new offer and counter offer). The
   * occurrence still names its own action (NotifyOptions.legacyAction): the
   * in-app row, push and email say which status, or new vs counter offer.
   * Preferences are read across all of them (preferences.ts, "merged").
   */
  mergedActions?: readonly string[]
  /** Planned in shadow mode only; not shown or editable in the settings matrix yet. */
  shadowOnly?: true
}

/**
 * Defaults are today's: in-app and push on, email off (opt-in). Discord DM is
 * available on every event group for users with Discord linked (owner
 * decision) and off by default, except where it was on before (price alerts).
 */
const LEGACY_DEFAULTS = { in_app: true, push: true, email: false, discord_dm: false } as const

function event(
  category: CategoryId,
  legacyAction: string,
  channels: readonly UserChannel[],
  overrides: Partial<Record<UserChannel, boolean>> = {},
): EventDefinition {
  const defaults: Partial<Record<UserChannel, boolean>> = {}
  for (const c of channels) defaults[c] = overrides[c] ?? LEGACY_DEFAULTS[c]
  return { category, legacyAction, channels, defaults }
}

const ALL = ["in_app", "push", "email", "discord_dm"] as const

export const ORDER_STATUS_ACTIONS = [
  "order_status_not_started",
  "order_status_in_progress",
  "order_status_fulfilled",
  "order_status_cancelled",
] as const
export const OFFER_ACTIONS = ["offer_create", "counter_offer_create"] as const

function merged(category: CategoryId, actions: readonly string[], channels: readonly UserChannel[]): EventDefinition {
  return { ...event(category, actions[0], channels), mergedActions: actions, shadowOnly: true }
}
/** Channels without email: these never sent email (a template exists for some; widening is the owner's call). */
const NO_EMAIL = ["in_app", "push", "discord_dm"] as const

export const CATALOG = {
  "order.created": event("orders", "order_create", ALL),
  "order.assigned": event("orders", "order_assigned", ALL),
  "order.status.not_started": event("orders", "order_status_not_started", ALL),
  "order.status.in_progress": event("orders", "order_status_in_progress", ALL),
  "order.status.fulfilled": event("orders", "order_status_fulfilled", ALL),
  "order.status.cancelled": event("orders", "order_status_cancelled", ALL),
  "order.message": event("order_messages", "order_message", ALL),
  "order.review": event("reviews", "order_review", ALL),
  "order.review_revision_requested": event("reviews", "order_review_revision_requested", NO_EMAIL),
  "offer.created": event("offers", "offer_create", ALL),
  "offer.countered": event("offers", "counter_offer_create", ALL),
  "offer.accepted": event("offers", "offer_accepted", ALL),
  "offer.rejected": event("offers", "offer_rejected", ALL),
  "offer.message": event("offer_messages", "offer_message", ALL),
  "market.bid": event("market", "market_item_bid", NO_EMAIL),
  // Owner decision: invites email by default (opt-out).
  "org.invite": event("org", "contractor_invite", ALL, { email: true }),
  // Owner decision (§8): to members with manage_invites; in-app only by default.
  "org.member_joined": event("org_members", "org_member_joined", ["in_app", "push", "discord_dm"], { push: false }),
  // Mandatory (category): delivered on in-app and push whatever the preferences.
  // Owner decision: email too, mandatory like the other channels.
  "admin.alert": event("announcements", "admin_alert", ["in_app", "push", "email"]),
  "reminder.unread_messages": event("reminders", "dm_reminder", ["email"]),
  "watchlist.price_alert": event("watchlist", "price_alert", ALL, { discord_dm: true }),
  // Opt-in: only users subscribed in contract_alert_subscriptions are recipients.
  "contract.public_created": event("contracts", "public_contract_create", NO_EMAIL),
  // Someone made an offer on your public contract (was order_contractor_applied).
  "contract.offer_received": event("contracts", "contract_offer_received", ALL),
  // Owner decision (ships with the cutover; shadow-only until then): the four
  // order_status_* events become one, and offer_create + counter_offer_create
  // become one. They replace the per-status / per-type entries above at cutover.
  "order.status_changed": merged("orders", ORDER_STATUS_ACTIONS, ALL),
  "offer.received": merged("offers", OFFER_ACTIONS, ALL),
} as const satisfies Record<string, EventDefinition>

/** Orders, offers and chat messages: shadow mode until parity is proven on real traffic. */
const LEGACY_DELIVERY: EventKey[] = [
  "order.created",
  "order.assigned",
  "order.status.not_started",
  "order.status.in_progress",
  "order.status.fulfilled",
  "order.status.cancelled",
  "order.message",
  "offer.created",
  "offer.countered",
  "offer.message",
  "order.status_changed",
  "offer.received",
]
for (const key of LEGACY_DELIVERY) (CATALOG[key] as EventDefinition).legacyDelivery = true

export function isMandatory(def: EventDefinition): boolean {
  return CATEGORIES[def.category].mandatory
}

export type EventKey = keyof typeof CATALOG

export function eventDefinition(key: EventKey): EventDefinition {
  const def = CATALOG[key]
  if (!def) throw new Error(`Unknown notification event: ${String(key)}`)
  return def
}

/**
 * The email policy for a legacy action, for the email queue's send-time
 * check: mandatory (always sent) or the catalog default when the user has no
 * row. Actions not in the catalog keep the opt-in default.
 */
export function emailDefaultFor(action: string): { mandatory: boolean; defaultOn: boolean } {
  for (const def of Object.values(CATALOG) as EventDefinition[]) {
    if (def.legacyAction !== action || !def.channels.includes("email")) continue
    return { mandatory: isMandatory(def), defaultOn: !!def.defaults.email }
  }
  return { mandatory: false, defaultOn: false }
}
