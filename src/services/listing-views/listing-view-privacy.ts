import { createHmac, hkdfSync } from "node:crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"

/**
 * What `listing_views` keeps about a viewer, and for how long.
 *
 * - viewer_ip_hash: HMAC-SHA256 of the IP under a key that changes every UTC
 *   day. The key is derived with HKDF from SESSION_SECRET using an info label
 *   no other code uses, so it can't collide with session/JWT signing. A plain
 *   hash of an IP is reversible by trying all 2^32 IPv4 addresses; an HMAC
 *   isn't without the secret. Because the key rotates daily, two hashes only
 *   match when the same IP viewed on the same UTC day, and nothing (including
 *   us) can link a visitor across days. Nothing reads this column today:
 *   unique-view dedupe is by session_id within 24h (trackListingView). It is
 *   kept as a same-day abuse signal only.
 * - user_agent: first USER_AGENT_MAX_LENGTH characters.
 * - referrer_origin: scheme + host + port of the Referer, never its path or
 *   query string.
 * - Rows without a viewer_id (logged-out views) are deleted after
 *   ANONYMOUS_VIEW_RETENTION_DAYS by purgeAnonymousListingViews.
 */

export const IP_HASH_HKDF_INFO = "listing-view-ip-v1"
export const USER_AGENT_MAX_LENGTH = 256
export const ANONYMOUS_VIEW_RETENTION_DAYS = 90
export const PURGE_BATCH_SIZE = 5000
/** Upper bound per run so one run never holds the job for long. */
export const PURGE_MAX_BATCHES = 200

let cachedKey: { day: string; secret: string; key: Buffer } | null = null

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function dailyKey(secret: string, day: string): Buffer {
  if (cachedKey && cachedKey.day === day && cachedKey.secret === secret) {
    return cachedKey.key
  }
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.alloc(0),
      `${IP_HASH_HKDF_INFO}:${day}`,
      32,
    ),
  )
  cachedKey = { day, secret, key }
  return key
}

/** `::ffff:1.2.3.4` and `1.2.3.4` are the same client. */
function normalizeIp(ip: string): string {
  const trimmed = ip.trim().toLowerCase()
  return trimmed.startsWith("::ffff:") && trimmed.includes(".")
    ? trimmed.slice("::ffff:".length)
    : trimmed
}

/**
 * Hex HMAC-SHA256 of `ip` under today's key, or null when there is no IP or
 * no SESSION_SECRET (then nothing about the IP is stored).
 */
export function hashViewerIp(
  ip: string | undefined | null,
  now: Date = new Date(),
  secret: string | undefined = env.SESSION_SECRET,
): string | null {
  if (!ip || !secret) return null
  return createHmac("sha256", dailyKey(secret, utcDay(now)))
    .update(normalizeIp(ip))
    .digest("hex")
}

export function truncateUserAgent(
  ua: string | undefined | null,
): string | null {
  if (!ua) return null
  return ua.slice(0, USER_AGENT_MAX_LENGTH)
}

/** `https://example.com/a?b=c` -> `https://example.com`; anything else -> null. */
export function referrerOrigin(
  referrer: string | undefined | null,
): string | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * Delete logged-out listing views older than ANONYMOUS_VIEW_RETENTION_DAYS in
 * batches of PURGE_BATCH_SIZE (each batch is its own short statement, using
 * idx_listing_views_timestamp). Returns the number of rows deleted.
 */
export async function purgeAnonymousListingViews(): Promise<number> {
  const knex = getKnex()
  let total = 0
  for (let i = 0; i < PURGE_MAX_BATCHES; i++) {
    const deleted: number = await knex("listing_views")
      .whereIn(
        "view_id",
        knex("listing_views")
          .select("view_id")
          .whereNull("viewer_id")
          .where(
            "timestamp",
            "<",
            knex.raw(
              `NOW() - INTERVAL '${ANONYMOUS_VIEW_RETENTION_DAYS} days'`,
            ),
          )
          .limit(PURGE_BATCH_SIZE),
      )
      .delete()
    total += deleted
    if (deleted < PURGE_BATCH_SIZE) break
  }
  return total
}
