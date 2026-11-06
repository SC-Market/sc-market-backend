/**
 * The staff channel's Discord webhook (STAFF_DISCORD_WEBHOOK_URL): where the
 * storefront enquiry alert is posted (staff-alerts.ts). Shared by the legacy
 * sender and notify()'s webhook channel (services/notify/adapters/webhook.ts).
 *
 * The URL is a secret (whoever has it can post to the channel): it is never
 * logged, and redactStaffWebhookUrl strips it from error text.
 */
import { env } from "../../config/env.js"

const WEBHOOK_TIMEOUT_MS = 10_000

/** STAFF_DISCORD_WEBHOOK_URL, if set. */
export function staffWebhookUrl(): string | undefined {
  return env.STAFF_DISCORD_WEBHOOK_URL?.trim() || undefined
}

/** Error text with the staff webhook URL replaced. */
export function redactStaffWebhookUrl(message: string): string {
  const url = staffWebhookUrl()
  return url ? message.split(url).join("[webhook url]") : message
}

/**
 * POST to the staff webhook: no redirects, 10 s timeout. Returns the HTTP
 * status; throws on a network error or a timeout.
 */
export async function postStaffDiscordWebhook(url: string, body: unknown): Promise<number> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  })
  return res.status
}
