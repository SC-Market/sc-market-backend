/**
 * Tell a user an admin changed their account's identity (event
 * account.identity_changed: mandatory "account" category, in-app + push).
 * The in-app row points at the audit_logs row; what the user sees is built
 * by identityNoticeEntity() (notice-entity.ts) and never includes the admin's reason.
 *
 * Sent after the change committed, best effort: a failed notification is
 * logged, the change and its audit row stand.
 */

import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { notify } from "../notify/dispatcher.js"
import type { ActionResult, IdentityActionKind } from "./identity-admin.service.js"

export const IDENTITY_NOTIFICATION_ACTION = "account_identity_changed"

const PUSH_TEXT: Record<IdentityActionKind, { title: string; body: (n: ActionResult["notice"]) => string }> = {
  username_released: {
    title: "Your SC Market username was changed",
    body: (n) =>
      `An admin released the username ${n.old_username}. Your username is now ${n.new_username}. ` +
      `If ${n.old_username} is still your RSI handle, use Sync handle in Settings.`,
  },
  discord_unlinked: {
    title: "Discord was unlinked from your SC Market account",
    body: () => "An admin unlinked Discord from your account. You can link a Discord account again in Settings.",
  },
  spectrum_cleared: {
    title: "Your RSI account link was removed",
    body: () => "An admin removed the RSI (Spectrum) link from your account. Verify your RSI account again in Settings.",
  },
  spectrum_set: {
    title: "Your RSI account link was updated",
    body: () => "An admin updated the RSI (Spectrum) link on your account.",
  },
  account_deactivated: {
    title: "Your SC Market account was deactivated",
    body: () => "An admin deactivated your account. Contact SC Market support if you think this is a mistake.",
  },
  account_reactivated: {
    title: "Your SC Market account was reactivated",
    body: () => "An admin reactivated your account. You can log in again.",
  },
}

export async function notifyIdentityChanged(
  userId: string,
  actorId: string,
  result: ActionResult,
): Promise<void> {
  const baseUrl = env.FRONTEND_URL || "https://sc-market.space"
  const text = PUSH_TEXT[result.kind]
  try {
    await notify("account.identity_changed", [{ userId }], {
      entityId: result.audit_log_id,
      actorId,
      messages: {
        push: {
          title: text.title,
          body: text.body(result.notice),
          icon: `${baseUrl}/android-chrome-192x192.png`,
          badge: `${baseUrl}/android-chrome-192x192.png`,
          data: {
            url: `${baseUrl}/settings`,
            type: IDENTITY_NOTIFICATION_ACTION,
            entityId: result.audit_log_id,
          },
          tag: `identity-${result.audit_log_id}`,
        },
      },
    })
  } catch (error) {
    logger.warn("identity-admin: notification failed", {
      user_id: userId,
      audit_log_id: result.audit_log_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
