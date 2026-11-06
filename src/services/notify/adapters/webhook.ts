/**
 * Webhooks (destination channel): user, org and shop webhooks from
 * notification_webhooks + webhook_actions, and the staff channel's webhook
 * (STAFF_DISCORD_WEBHOOK_URL). The transports are the legacy ones, so the
 * request is the same: for notification_webhooks the URL allowlist, IP
 * pinning, no redirects and a 10 s timeout (util/webhooks.ts postWebhook);
 * for the staff webhook a plain POST, no redirects, 10 s timeout. Neither
 * retries in process, as before.
 *
 * Failures: a 408, 429 or 5xx, a timeout or a network error is retryable;
 * anything else (a disallowed URL, a redirect, another 4xx: deleted webhook,
 * revoked token, rejected body) is permanent. A permanent failure marks the
 * webhook row state='failing'; its next successful send sets it back to
 * 'ok'. Nothing filters on state, so a failing webhook is still tried.
 */
import { getKnex } from "../../../clients/database/knex-db.js"
import logger from "../../../logger/logger.js"
import { isRetryableWebhookStatus, postWebhook } from "../../../api/routes/v1/util/webhooks.js"
import {
  postStaffDiscordWebhook,
  redactStaffWebhookUrl,
  staffWebhookUrl,
} from "../../storefront/staff-webhook.js"
import type { DeliveryResult, DestinationAdapter } from "../channels.js"

export type WebhookState = "ok" | "failing"

/** Record a webhook's state when it changes. Never throws. */
export async function setWebhookState(webhookId: string, state: WebhookState): Promise<void> {
  try {
    await getKnex()("notification_webhooks")
      .where({ webhook_id: webhookId })
      .whereNot({ state })
      .update({ state })
  } catch (err) {
    logger.warn("notify: could not record webhook state", {
      webhook_id: webhookId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function sendStaff(body: unknown): Promise<DeliveryResult> {
  const url = staffWebhookUrl()
  if (!url) return { status: "skipped", reason: "STAFF_DISCORD_WEBHOOK_URL is not set" }
  let status: number
  try {
    status = await postStaffDiscordWebhook(url, body)
  } catch (err) {
    return { status: "retryable", error: redactStaffWebhookUrl(err instanceof Error ? err.message : String(err)) }
  }
  if (status >= 200 && status < 300) return { status: "sent" }
  const error = `Discord webhook answered HTTP ${status}`
  return isRetryableWebhookStatus(status) ? { status: "retryable", error } : { status: "permanent", error }
}

export const webhookAdapter: DestinationAdapter = {
  id: "webhook",
  async send(body, destination) {
    if (destination.channel !== "webhook") throw new Error(`webhook adapter got ${destination.channel}`)
    if ("staff" in destination) return sendStaff(body)

    const outcome = await postWebhook(body, destination.webhook)
    switch (outcome.status) {
      case "sent":
        await setWebhookState(destination.webhook.webhook_id, "ok")
        return { status: "sent" }
      case "skipped":
        return { status: "skipped", reason: outcome.reason }
      case "permanent":
        await setWebhookState(destination.webhook.webhook_id, "failing")
        return { status: "permanent", error: outcome.error.message }
      case "retryable":
        return { status: "retryable", error: outcome.error.message }
    }
  },
}
