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
 * Events are migrated onto notify() one family at a time; the orders, offers
 * and chat messages switch over per event (cutover.ts).
 */
import type { UserChannel } from "./channels.js"

export const CATEGORIES = {
  orders: { orgScoped: true, mandatory: false, emailMandatory: false },
  order_messages: { orgScoped: true, mandatory: false, emailMandatory: false },
  offers: { orgScoped: true, mandatory: false, emailMandatory: false },
  offer_messages: { orgScoped: true, mandatory: false, emailMandatory: false },
  market: { orgScoped: true, mandatory: false, emailMandatory: false },
  reviews: { orgScoped: true, mandatory: false, emailMandatory: false },
  watchlist: { orgScoped: false, mandatory: false, emailMandatory: false },
  org: { orgScoped: false, mandatory: false, emailMandatory: false },
  // Activity inside an org you help run (members joining).
  org_members: { orgScoped: true, mandatory: false, emailMandatory: false },
  // Owner decision: admin alerts can't be turned off in-app, push or Discord
  // DM (shown locked on). Owner decision (2026-11-01): their email respects
  // the user's email opt-outs and unsubscribe links (on by default).
  announcements: { orgScoped: false, mandatory: true, emailMandatory: false },
  reminders: { orgScoped: false, mandatory: false, emailMandatory: false },
  contracts: { orgScoped: true, mandatory: false, emailMandatory: false },
  // Replies to a branded storefront enquiry you sent (services/storefront).
  // Personal: it goes to the person who sent it, whatever org or shop it was for.
  storefront: { orgScoped: false, mandatory: false, emailMandatory: false },
  account: { orgScoped: false, mandatory: true, emailMandatory: false },
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
   * Orders, offers and chat messages: the legacy code never sent them as a
   * Discord DM, so Discord DM is not delivered for them (by notify(), live
   * or shadow) and is shown locked ("coming soon") in the settings. Turning
   * it on is a separate owner decision. Whether notify() or the legacy code
   * sends these events is cutover.ts.
   */
  discordDmLocked?: true
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
  // Mandatory (category): delivered in-app, push and Discord DM whatever the
  // preferences. Email is on by default but respects the user's email
  // opt-outs and unsubscribes (owner decision 2026-11-01; only legal,
  // security and dispute emails may ignore them, see emailMandatory).
  // The admin picks the channels per alert (admin_alerts.channels).
  "admin.alert": event("announcements", "admin_alert", ALL, { email: true }),
  // Owner decision (2026-11-01): Discord DM on by default (users with Discord
  // linked), email still opt-in. Only this reminder DMs about messages; the
  // order/offer/message events themselves stay DM-locked (DISCORD_DM_LOCKED).
  "reminder.unread_messages": event("reminders", "dm_reminder", ["email", "discord_dm"], { discord_dm: true }),
  // Pending-offer reminders (services/offer-reminders), owner decision
  // 2026-11-02: to the seller side ~24 h and ~72 h after an offer arrives
  // with no response, then to the buyer (keep waiting, message, withdraw).
  // Personal preferences (reminders category): one digest per user spans
  // every org. Discord DM on by default for the seller reminders (where
  // sellers are reachable); in-app and push on; email off (opt-in).
  "reminder.offer_pending": event("reminders", "offer_pending_reminder", ALL, { discord_dm: true }),
  "reminder.offer_pending_final": event("reminders", "offer_pending_final_reminder", ALL, { discord_dm: true }),
  "reminder.offer_waiting_buyer": event("reminders", "offer_waiting_buyer", ALL),
  // "Still selling?" 3 days before a listing expires (services/listing-expiry),
  // to the shop's owner or the org members who manage its market.
  "listing.expiring": event("market", "listing_expiring", ["in_app", "discord_dm"], { discord_dm: true }),
  "watchlist.price_alert": event("watchlist", "price_alert", ALL, { discord_dm: true }),
  // A new public listing matches one of your buy orders
  // (services/buy-order-matching). Personal, next to price alerts. It was a
  // push only, with no setting; push stays on by default, Discord DM is
  // available and off (owner decision: DM on every event group).
  "buy_order.match": event("watchlist", "buy_order_match", ["push", "discord_dm"]),
  // Opt-in: only users subscribed in contract_alert_subscriptions are recipients.
  "contract.public_created": event("contracts", "public_contract_create", NO_EMAIL),
  // Someone made an offer on your public contract (was order_contractor_applied).
  "contract.offer_received": event("contracts", "contract_offer_received", ALL),
  // An admin changed your account's identity (services/identity-admin).
  // Mandatory (account category); in-app and push only, no email template yet.
  "account.identity_changed": event("account", "account_identity_changed", ["in_app", "push"]),
  // To site admins: an org or shop asked for a branded storefront
  // (services/storefront/enquiries.ts). In-app only; the account category
  // makes it mandatory and keeps it out of the settings matrix.
  "admin.storefront_enquiry": event("account", "storefront_enquiry_created", ["in_app"]),
  // To the person who sent a storefront enquiry, when staff accept it (status
  // completed: the storefront is set up) or decline it. Owner decision
  // (2026-11-01): through notify() with their preferences. It answers their
  // own request, so email is on by default (still opt-out and unsubscribable);
  // Discord DM follows the usual off-by-default.
  "storefront.enquiry_accepted": event("storefront", "storefront_enquiry_accepted", ALL, { email: true }),
  "storefront.enquiry_declined": event("storefront", "storefront_enquiry_declined", ALL, { email: true }),
  // Owner decision (ships with the cutover; shadow-only until then): the four
  // order_status_* events become one, and offer_create + counter_offer_create
  // become one. They replace the per-status / per-type entries above at cutover.
  "order.status_changed": merged("orders", ORDER_STATUS_ACTIONS, ALL),
  "offer.received": merged("offers", OFFER_ACTIONS, ALL),
} as const satisfies Record<string, EventDefinition>

/** Orders, offers and chat messages (see discordDmLocked). */
const DISCORD_DM_LOCKED: EventKey[] = [
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
for (const key of DISCORD_DM_LOCKED) (CATALOG[key] as EventDefinition).discordDmLocked = true

// Listing expiry is off until the owner turns it on (services/listing-expiry,
// LISTING_EXPIRY_ENABLED): keep its notice out of the settings until then.
if (process.env.LISTING_EXPIRY_ENABLED !== "true") {
  ;(CATALOG["listing.expiring"] as EventDefinition).shadowOnly = true
}

export function isMandatory(def: EventDefinition): boolean {
  return CATEGORIES[def.category].mandatory
}

/**
 * Whether this channel of the event ignores the user's preferences. Email is
 * forced only for categories marked emailMandatory: owner decision
 * (2026-11-01), only legal, security and dispute emails may ignore the
 * user's email opt-outs and unsubscribes. No category sends one today.
 */
export function isMandatoryOn(def: EventDefinition, channel: UserChannel): boolean {
  const category = CATEGORIES[def.category]
  if (!category.mandatory) return false
  return channel === "email" ? category.emailMandatory : true
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
    return { mandatory: isMandatoryOn(def, "email"), defaultOn: !!def.defaults.email }
  }
  return { mandatory: false, defaultOn: false }
}
