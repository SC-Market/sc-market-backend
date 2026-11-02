/**
 * Whether SC Market's email reaches the signed-in user's address
 * (Settings › Email). SES bounces and complaints mark an address
 * undeliverable (services/email/email-feedback.ts); nothing is emailed to it
 * until the user re-verifies it (or changes it).
 */

/** Why the address is undeliverable: a hard bounce, soft bounces in a row, or a spam complaint. */
export type EmailBounceKind = "hard" | "soft" | "complaint"

export interface EmailDeliverabilityResponse {
  /** The user has a primary email address. */
  has_email: boolean
  /** It is verified. */
  email_verified: boolean
  /** Marked undeliverable: nothing is emailed to it until it is re-verified. */
  undeliverable: boolean
  /** When it was marked undeliverable (ISO 8601), or null. */
  bounced_at: string | null
  bounce_type: EmailBounceKind | null
  /** The last delivery SES confirmed (ISO 8601), or null if none was recorded. */
  last_delivered_at: string | null
  /** A re-verification email can't be requested before this (ISO 8601); null: now. */
  reverify_available_at: string | null
}

export interface EmailReverifyResponse {
  /** A verification email was sent to the address. */
  sent: boolean
  /** When the next one can be requested (ISO 8601). */
  reverify_available_at: string
}
