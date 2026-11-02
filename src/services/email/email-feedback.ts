/**
 * SES feedback (bounces, complaints, deliveries) on user_emails rows.
 *
 * SES publishes a notification per event to an SNS topic, which posts it to
 * POST /api/webhooks/ses/feedback (api/routes/webhooks/ses-feedback.ts). The
 * webhook verifies the SNS signature (sns-signature.ts), then hands the SES
 * body here:
 *
 * - Bounce, Permanent (hard): the address is undeliverable at once.
 * - Complaint (the recipient marked it as spam): undeliverable at once, so
 *   nothing more is sent to someone who doesn't want it. A "not-spam"
 *   feedback report is not a complaint and is ignored.
 * - Bounce, Transient or Undetermined (soft): counted. SOFT_BOUNCE_LIMIT in a
 *   row (no delivery in between) make it undeliverable.
 * - Delivery: last_delivered_at, and the soft-bounce count starts over. It
 *   does not clear a bounce; re-verifying does (user-email-database.ts
 *   verifyUserEmail), so clearing is always the user's explicit step.
 *
 * Undeliverable = user_emails.email_bounced_at set (bounce_type says why).
 * The send path skips the address (email.service.ts sendEmail), Settings ›
 * Email shows a notice (GET /api/v2/email/deliverability), and the seller
 * reachability report counts it as not reachable.
 *
 * Addresses match user_emails.email case-insensitively. Addresses that are no
 * user's (the staff inbox) are ignored.
 */
import type { Knex } from "knex"
import type { EmailBounceType } from "../../clients/database/db-models.js"

/** Soft bounces in a row (no delivery in between) that make an address undeliverable. */
export const SOFT_BOUNCE_LIMIT = 3

/** We send one recipient per message; more than this in one notification is not ours. */
const MAX_RECIPIENTS = 50

export type SesFeedback =
  | {
      kind: "bounce"
      bounceType: Exclude<EmailBounceType, "complaint">
      /** SES bounceType/bounceSubType, e.g. "Permanent/General". */
      subtype: string
      recipients: string[]
    }
  | { kind: "complaint"; subtype: string; recipients: string[] }
  | { kind: "delivery"; recipients: string[] }
  | { kind: "ignored"; reason: string }

const str = (v: unknown): string | null => (typeof v === "string" ? v : null)

function addresses(list: unknown, pick: (entry: unknown) => unknown): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const entry of list.slice(0, MAX_RECIPIENTS)) {
    const value = str(pick(entry))?.trim()
    // SES gives bare addresses; anything longer than an address can be is not one.
    if (value && value.length <= 320 && value.includes("@")) out.push(value)
  }
  return out
}

const field = (key: string) => (entry: unknown) =>
  typeof entry === "object" && entry !== null
    ? (entry as Record<string, unknown>)[key]
    : undefined

/**
 * The SES notification in an SNS Notification's Message. Identity feedback
 * notifications name the event `notificationType`; configuration-set event
 * publishing names it `eventType`. Both are read.
 */
export function parseSesNotification(messageJson: string): SesFeedback {
  let body: unknown
  try {
    body = JSON.parse(messageJson)
  } catch {
    return { kind: "ignored", reason: "not_json" }
  }
  if (typeof body !== "object" || body === null) {
    return { kind: "ignored", reason: "not_an_object" }
  }
  const m = body as Record<string, unknown>
  const type = str(m.notificationType) ?? str(m.eventType)

  if (type === "Bounce") {
    const bounce = (m.bounce ?? {}) as Record<string, unknown>
    const bounceType = str(bounce.bounceType)
    const recipients = addresses(bounce.bouncedRecipients, field("emailAddress"))
    if (!bounceType || recipients.length === 0) {
      return { kind: "ignored", reason: "bounce_without_recipients" }
    }
    const subtype = `${bounceType}/${str(bounce.bounceSubType) ?? "Unknown"}`.slice(0, 100)
    return {
      kind: "bounce",
      bounceType: bounceType === "Permanent" ? "hard" : "soft",
      subtype,
      recipients,
    }
  }

  if (type === "Complaint") {
    const complaint = (m.complaint ?? {}) as Record<string, unknown>
    const feedbackType = str(complaint.complaintFeedbackType)
    if (feedbackType === "not-spam") return { kind: "ignored", reason: "not_spam" }
    const recipients = addresses(complaint.complainedRecipients, field("emailAddress"))
    if (recipients.length === 0) {
      return { kind: "ignored", reason: "complaint_without_recipients" }
    }
    return { kind: "complaint", subtype: (feedbackType ?? "unspecified").slice(0, 100), recipients }
  }

  if (type === "Delivery") {
    const delivery = (m.delivery ?? {}) as Record<string, unknown>
    const recipients = addresses(delivery.recipients, (e) => e)
    if (recipients.length === 0) {
      return { kind: "ignored", reason: "delivery_without_recipients" }
    }
    return { kind: "delivery", recipients }
  }

  return { kind: "ignored", reason: `type:${type ?? "missing"}` }
}

export interface BounceOutcome {
  /** user_emails rows for the address. */
  matched: number
  /** Rows that are undeliverable after this bounce. */
  undeliverable: number
}

type Row = { email_id: string; user_id: string; undeliverable: boolean }

function rowsOf(result: unknown): Row[] {
  return ((result as { rows?: Row[] })?.rows ?? []) as Row[]
}

/**
 * A bounce or complaint for one address. Hard bounces and complaints mark it
 * undeliverable; a soft bounce counts and marks it at SOFT_BOUNCE_LIMIT.
 * Called by emailService.handleBounce.
 */
export async function recordBounce(
  db: Knex | Knex.Transaction,
  email: string,
  type: EmailBounceType,
  subtype: string | null,
): Promise<BounceOutcome> {
  const result =
    type === "soft"
      ? await db.raw(
          `UPDATE user_emails
              SET soft_bounce_count = soft_bounce_count + 1,
                  email_bounced_at = CASE WHEN email_bounced_at IS NULL AND soft_bounce_count + 1 >= ?
                                          THEN now() ELSE email_bounced_at END,
                  bounce_type = CASE WHEN email_bounced_at IS NULL AND soft_bounce_count + 1 >= ?
                                     THEN 'soft' ELSE bounce_type END,
                  bounce_subtype = CASE WHEN email_bounced_at IS NULL AND soft_bounce_count + 1 >= ?
                                        THEN ? ELSE bounce_subtype END,
                  updated_at = now()
            WHERE lower(email) = lower(?)
        RETURNING email_id, user_id, email_bounced_at IS NOT NULL AS undeliverable`,
          [SOFT_BOUNCE_LIMIT, SOFT_BOUNCE_LIMIT, SOFT_BOUNCE_LIMIT, subtype, email],
        )
      : await db.raw(
          `UPDATE user_emails
              SET email_bounced_at = now(),
                  bounce_type = ?,
                  bounce_subtype = ?,
                  updated_at = now()
            WHERE lower(email) = lower(?)
        RETURNING email_id, user_id, true AS undeliverable`,
          [type, subtype, email],
        )
  const rows = rowsOf(result)
  return { matched: rows.length, undeliverable: rows.filter((r) => r.undeliverable).length }
}

/** A delivery to one address: last_delivered_at, and soft bounces start over. Returns rows matched. */
export async function recordDelivery(
  db: Knex | Knex.Transaction,
  email: string,
): Promise<number> {
  const result = await db.raw(
    `UPDATE user_emails
        SET last_delivered_at = now(), soft_bounce_count = 0
      WHERE lower(email) = lower(?)
  RETURNING email_id, user_id, email_bounced_at IS NOT NULL AS undeliverable`,
    [email],
  )
  return rowsOf(result).length
}

/** Processed notifications are kept this long (the webhook refuses older ones after a day). */
export const FEEDBACK_EVENT_RETENTION = "2 days"

/**
 * Claim an SNS MessageId inside the transaction that applies it. False when
 * it was already applied (SNS redelivery or a replay): apply nothing.
 */
export async function claimFeedbackMessage(
  trx: Knex.Transaction,
  messageId: string,
  notificationType: string,
): Promise<boolean> {
  const result = await trx.raw(
    `INSERT INTO email_feedback_events (message_id, notification_type)
     VALUES (?, ?)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING message_id`,
    [messageId, notificationType],
  )
  return rowsOf(result).length > 0
}

export async function pruneFeedbackEvents(db: Knex): Promise<void> {
  await db.raw(
    `DELETE FROM email_feedback_events WHERE received_at < now() - INTERVAL '${FEEDBACK_EVENT_RETENTION}'`,
  )
}
