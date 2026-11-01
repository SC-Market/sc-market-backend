/**
 * One-time notice for users whose key email notifications were turned on by
 * the backfill (migration 20261101140000_backfill_key_email_defaults): the
 * next notification email they get carries a banner, "We turned on email
 * for order updates, offers and unread messages. Turn off with one click",
 * with a one-click link that turns exactly those back off and a "Manage
 * preferences" link. Shown once (email_defaults_notices.shown_at). No
 * separate bulk email is sent.
 */
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import { keyDefaultsUnsubscribeUrl, preferencesUrl } from "./unsubscribe-token.js"

export interface DefaultsNotice {
  unsubscribeUrl: string
  preferencesUrl: string
}

export async function pendingDefaultsNotice(userId: string): Promise<DefaultsNotice | null> {
  try {
    const row = await getKnex()("email_defaults_notices")
      .where({ user_id: userId })
      .whereNull("shown_at")
      .first("user_id")
    if (!row) return null
    return { unsubscribeUrl: keyDefaultsUnsubscribeUrl(userId), preferencesUrl: preferencesUrl() }
  } catch (error) {
    // The banner is optional; never block the email over it.
    logger.warn("Email defaults notice lookup failed", { userId, error })
    return null
  }
}

export async function markDefaultsNoticeShown(userId: string): Promise<void> {
  try {
    await getKnex()("email_defaults_notices")
      .where({ user_id: userId })
      .whereNull("shown_at")
      .update({ shown_at: new Date() })
  } catch (error) {
    logger.warn("Email defaults notice update failed", { userId, error })
  }
}
