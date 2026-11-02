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
  /** Discord linked, and the last Discord DM attempt (if any, last 90 days) did not fail. */
  discord_dm: ReachabilityCount
  /** Discord linked, and the last Discord DM attempt was delivered (a subset of discord_dm). */
  discord_dm_confirmed: ReachabilityCount
  /** A verified primary email, not unsubscribed from announcement emails. No bounce data exists. */
  email: ReachabilityCount
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
    /** Discord DMs sent through notify() record sent / failed per attempt. */
    discord_dm_delivery_results: boolean
    /** How long those results are kept. */
    discord_dm_result_retention_days: number
    /** Email bounces and complaints are not recorded. */
    email_delivery_results: boolean
    /** Push has no per-delivery result (dead subscriptions are deleted). */
    push_delivery_results: boolean
  }
  /** The email category whose unsubscribes are checked. */
  email_category: "announcements"
}
