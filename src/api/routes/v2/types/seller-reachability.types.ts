import type { DiscordInstallClickCount } from "./discord-install.types.js"

/**
 * Admin › Market › Seller reachability (services/seller-reachability):
 * counts only, never who.
 */

/** The seller's last_seen, with the buyer-facing "Last seen" cut-offs; unknown: an org with no member who manages orders or the market. */
export type ReachabilityBucket =
  | "today"
  | "this_week"
  | "this_month"
  | "over_a_month"
  | "unknown"

export interface ReachabilityCount {
  /** Sellers (a user, or an org) in this bucket reachable this way. */
  sellers: number
  /** Their publicly listed listings. */
  listings: number
}

export interface SellerReachabilityCounts {
  /** Sellers with at least one publicly listed listing. */
  sellers: number
  listings: number
  /** Discord linked, the last Discord DM attempt (if any, last 90 days) did not fail with 50007, and they share a server with the bot (or installed the app on their account, once signals.discord_user_install_counts_as_dm). */
  discord_dm: ReachabilityCount
  /** Reachable by Discord DM, and the last Discord DM attempt was delivered (a subset of discord_dm). */
  discord_dm_confirmed: ReachabilityCount
  /** Not reachable by Discord DM: the last DM failed with Discord error 50007 (DMs closed, or no shared server and no user install); an org: every contact with Discord linked. */
  discord_dm_closed: ReachabilityCount
  /** Discord linked, and the account shares at least one server with the SC Market bot (checked periodically, no DM sent) or installed the SC Market app on their own Discord account (seen on their interactions with the bot; cleared by a later 50007). Not part of any / none. */
  discord_server_or_app: ReachabilityCount
  /** A verified primary email that is not marked undeliverable (bounced or complained), not unsubscribed from announcement emails. */
  email: ReachabilityCount
  /** Reachable by email, and SES confirmed a delivery to the address in the last email_delivered_window_days (a subset of email). */
  email_confirmed: ReachabilityCount
  /** At least one push subscription. No per-delivery result exists. */
  push: ReachabilityCount
  /** At least one of Discord DM, email or push. */
  any: ReachabilityCount
  /** None of them. */
  none: ReachabilityCount
}

export interface SellerReachabilityBucket extends SellerReachabilityCounts {
  bucket: ReachabilityBucket
}

export interface SellerReachabilityReport {
  generated_at: string
  /** Every bucket, in order (today, this week, this month, over a month, unknown). */
  buckets: SellerReachabilityBucket[]
  totals: SellerReachabilityCounts
  /** Which channels have a recorded delivery result, so the UI can say how far "reachable" is checked. */
  signals: {
    /** Every Discord DM attempt (backend and bot) is recorded: sent, or failed with Discord's error code. */
    discord_dm_delivery_results: boolean
    /** How long those results are kept. */
    discord_dm_result_retention_days: number
    /** The Discord error code counted as "DM failed (closed)" (50007). */
    discord_dm_closed_code: number
    /** When the bot's server membership was last checked (ISO time), or null if never. */
    discord_shared_server_checked_at: string | null
    /** A membership result older than this many days is not counted. */
    discord_shared_server_fresh_days: number
    /** Whether installing the app on one's own Discord account counts as reachable by Discord DM (false until confirmed that the bot can DM such users without a shared server). */
    discord_user_install_counts_as_dm: boolean
    /** SES bounces, complaints and deliveries are recorded (bounced addresses are not reachable). */
    email_delivery_results: boolean
    /** How recent an email delivery counts for email_confirmed. */
    email_delivered_window_days: number
    /** Push has no per-delivery result (dead subscriptions are deleted). */
    push_delivery_results: boolean
  }
  /** The email category whose unsubscribes are checked. */
  email_category: "announcements"
  /** Clicks on "Add SC Market to Discord" links per install type and surface (last 7 and 30 days), most clicked first. */
  install_clicks: DiscordInstallClickCount[]
}
