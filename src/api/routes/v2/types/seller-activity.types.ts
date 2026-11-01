/**
 * What a buyer sees about a shop's seller (services/seller-activity).
 * Privacy: last seen is a coarse bucket, never a timestamp, and is null when
 * the seller hides their online status.
 */

/** When the seller was last active on SC Market, coarsely. */
export type LastSeenBucket = "today" | "this_week" | "this_month" | "over_a_month"

/**
 * Typical (median) time to the seller's first reply in order and offer chats,
 * last 90 days: within an hour, within 6 hours, within a day, within 3 days,
 * or slower (including buyers left unanswered).
 */
export type ReplyTimeBucket =
  | "within_hour"
  | "within_hours"
  | "within_day"
  | "within_days"
  | "slow"

export interface SellerActivity {
  /** Coarse last-seen bucket; null if the seller hides it or has no activity yet. */
  last_seen: LastSeenBucket | null
  /** Typical reply time in order/offer chats; null below the minimum sample size. */
  reply_time: ReplyTimeBucket | null
  /** Number of chats the reply time is based on; null when reply_time is null. */
  reply_sample_size: number | null
  /** Orders this shop has completed. */
  completed_orders: number
}
