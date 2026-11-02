/**
 * The "Still selling?" DM campaign (services/dm-campaigns/still-selling.service.ts):
 * the admin dry run / send / progress, and the no-login landing page of its
 * "Keep them live" and "Pause them" links.
 */

export type StillSellingLocale =
  | "en"
  | "de"
  | "es"
  | "fr"
  | "ja"
  | "uk"
  | "zh-CN"
  | "zh-TW"

export interface StillSellingButton {
  label: string
  url: string
}

/** A rendered DM: its one line of text and its link buttons. */
export interface StillSellingSampleMessage {
  locale: StillSellingLocale
  text: string
  buttons: StillSellingButton[]
}

/** Per-recipient results recorded for the campaign so far. */
export interface StillSellingProgress {
  /** DMs attempted (claimed): delivered + failed + in_flight. */
  sent: number
  delivered: number
  failed: number
  /** Of failed: Discord error 50007 (DMs closed / no shared server). */
  failed_closed: number
  /** Claimed but with no result (in flight, or the process stopped mid-send; never retried). */
  in_flight: number
  /** Recipients who used "Keep them live". */
  clicked_keep: number
  /** Recipients who used "Pause them". */
  clicked_pause: number
  /** Listings refreshed through "Keep them live". */
  kept_listings: number
  /** Listings paused through "Pause them". */
  paused_listings: number
}

export type StillSellingFinishReason =
  | "done"
  | "limit"
  | "disabled"
  | "stopped"
  | "error"

export interface StillSellingRunState {
  running: boolean
  started_at: string | null
  finished_at: string | null
  finish_reason: string | null
  /** The most this run may send (the count the admin confirmed). */
  limit: number | null
  sent_this_run: number
}

export interface StillSellingDryRun {
  campaign: string
  /** The kill switch: nothing is sent unless this env var is "true". */
  kill_switch_env: string
  enabled: boolean
  /** People the campaign would DM now (not contacted yet, DM-reachable). */
  recipients: number
  /** Distinct stale listings their DMs would be about. */
  listings: number
  /** A rendered DM with fake data (3 listings, 2 months) and placeholder links. */
  sample: StillSellingSampleMessage
  progress: StillSellingProgress
  run: StillSellingRunState
  batch_size: number
  batch_pause_seconds: number
  stale_days: number
  inactive_days: number
}

export interface StillSellingSendRequest {
  /** The recipient count the admin confirmed (from the dry run); the run sends to at most this many. */
  expected_recipients: number
}

export interface StillSellingSendResponse {
  run: StillSellingRunState
}

export type StillSellingAction = "keep" | "pause"

export interface StillSellingActionListing {
  title: string
  status: string
}

/** GET /still-selling/{token}: what confirming would do. */
export interface StillSellingActionPreview {
  valid: boolean
  /** Why the link doesn't work: invalid (bad or unknown link) or expired. */
  reason?: "invalid" | "expired"
  action?: StillSellingAction
  /** Listings of the DM the user may still manage. */
  listings_total: number
  /** Of those, how many the action would change now. */
  listings_applicable: number
  /** The listings it would change (titles, at most 20). */
  listings: StillSellingActionListing[]
  expires_at?: string
  /** The seller's listings page (relative). */
  manage_path?: string
  /** When this action was first used from the link, if it was. */
  used_at?: string | null
}

/** POST /still-selling/{token}: the result. */
export interface StillSellingActionResult {
  ok: boolean
  reason?: "invalid" | "expired"
  action?: StillSellingAction
  /** Listings changed now. */
  changed: number
  listings_total: number
  manage_path?: string
}
