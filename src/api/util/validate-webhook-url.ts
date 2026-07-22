/**
 * Webhook URL validation to prevent Server-Side Request Forgery (SSRF).
 *
 * Notification webhook URLs are supplied by authenticated users and are later
 * POSTed to from inside the VPC when order/offer/comment/bid events fire. Without
 * validation, a user could point a webhook at internal/cloud-metadata hosts
 * (e.g. http://169.254.169.254/, http://localhost:5432, internal RDS) and turn
 * the server into a blind SSRF gadget.
 *
 * Since the only legitimate destination for these webhooks is Discord, we enforce
 * a strict allowlist of Discord webhook hosts + path. Because the hostname must
 * be an exact Discord host, DNS-rebinding to a private IP cannot match, so the
 * allowlist is itself the primary defense.
 */

/** Exact set of hostnames allowed for notification webhooks (Discord only). */
const ALLOWED_WEBHOOK_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "canary.discord.com",
  "ptb.discord.com",
])

const WEBHOOK_PATH_PREFIX = "/api/webhooks/"

export interface WebhookUrlValidationResult {
  valid: boolean
  /** Human-readable reason the URL was rejected. Only set when `valid` is false. */
  reason?: string
}

/**
 * Validate that a webhook URL is a permitted Discord webhook.
 *
 * Requirements:
 *  - Parses as a valid URL
 *  - Protocol is exactly "https:"
 *  - Hostname is exactly one of the allowed Discord hosts
 *  - Pathname starts with "/api/webhooks/"
 */
export function validateWebhookUrl(
  webhookUrl: unknown,
): WebhookUrlValidationResult {
  if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
    return { valid: false, reason: "Webhook URL must be a non-empty string" }
  }

  let url: URL
  try {
    url = new URL(webhookUrl)
  } catch {
    return { valid: false, reason: "Webhook URL is not a valid URL" }
  }

  if (url.protocol !== "https:") {
    return {
      valid: false,
      reason: `Webhook URL must use https (got "${url.protocol}")`,
    }
  }

  if (!ALLOWED_WEBHOOK_HOSTS.has(url.hostname)) {
    return {
      valid: false,
      reason: `Webhook URL host "${url.hostname}" is not an allowed Discord webhook host`,
    }
  }

  if (!url.pathname.startsWith(WEBHOOK_PATH_PREFIX)) {
    return {
      valid: false,
      reason: `Webhook URL path must start with "${WEBHOOK_PATH_PREFIX}"`,
    }
  }

  return { valid: true }
}

/** Convenience boolean form of {@link validateWebhookUrl}. */
export function isValidWebhookUrl(webhookUrl: unknown): boolean {
  return validateWebhookUrl(webhookUrl).valid
}
