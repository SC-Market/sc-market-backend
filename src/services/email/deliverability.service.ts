/**
 * Settings › Email: is the user's address undeliverable (bounced or
 * complained, email-feedback.ts), and re-verifying it, which clears that
 * (user-email-database.ts verifyUserEmail).
 */
import * as userEmailDb from "../../api/routes/v1/email/user-email-database.js"
import * as emailVerificationDb from "../../api/routes/v1/email/verification-database.js"
import type { DBUserEmail } from "../../clients/database/db-models.js"
import type { EmailDeliverabilityResponse } from "../../api/routes/v2/types/email-deliverability.types.js"
import { emailService } from "./email.service.js"

/**
 * At most one re-verification email per address in this window: each send to
 * a bounced address is another chance of a bounce, which SES counts against
 * the account.
 */
export const REVERIFY_COOLDOWN_MS = 15 * 60 * 1000

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

async function reverifyAvailableAt(email: DBUserEmail, now: Date): Promise<Date | null> {
  const tokens = await emailVerificationDb.getActiveVerificationTokens(email.user_id, email.email_id)
  const latest = tokens[0]?.created_at
  if (!latest) return null
  const at = new Date(new Date(latest).getTime() + REVERIFY_COOLDOWN_MS)
  return at > now ? at : null
}

export async function getEmailDeliverability(
  userId: string,
  now = new Date(),
): Promise<EmailDeliverabilityResponse> {
  const email = await userEmailDb.getPrimaryEmail(userId)
  if (!email) {
    return {
      has_email: false,
      email_verified: false,
      undeliverable: false,
      bounced_at: null,
      bounce_type: null,
      last_delivered_at: null,
      reverify_available_at: null,
    }
  }
  const undeliverable = !!email.email_bounced_at
  return {
    has_email: true,
    email_verified: email.email_verified,
    undeliverable,
    bounced_at: iso(email.email_bounced_at),
    bounce_type: undeliverable ? email.bounce_type : null,
    last_delivered_at: iso(email.last_delivered_at),
    reverify_available_at: undeliverable ? iso(await reverifyAvailableAt(email, now)) : null,
  }
}

export type ReverifyResult =
  | { ok: true; reverifyAvailableAt: Date }
  | { ok: false; reason: "no_email" | "not_undeliverable" }
  | { ok: false; reason: "cooldown"; reverifyAvailableAt: Date }

/** Send a verification email to the user's undeliverable address. Following it clears the bounce. */
export async function requestReverify(userId: string, now = new Date()): Promise<ReverifyResult> {
  const email = await userEmailDb.getPrimaryEmail(userId)
  if (!email) return { ok: false, reason: "no_email" }
  if (!email.email_bounced_at) return { ok: false, reason: "not_undeliverable" }
  const availableAt = await reverifyAvailableAt(email, now)
  if (availableAt) return { ok: false, reason: "cooldown", reverifyAvailableAt: availableAt }
  await emailService.sendVerificationEmail(userId, email.email)
  return { ok: true, reverifyAvailableAt: new Date(now.getTime() + REVERIFY_COOLDOWN_MS) }
}
