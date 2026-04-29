/**
 * Shared origin allowlist for CORS, OAuth redirects, and WebSocket auth.
 *
 * Single source of truth — used by server.ts CORS, error-handler CORS,
 * auth-routes redirect validation, and WebSocket CORS.
 *
 * SECURITY MODEL:
 * Any origin in this list can make credentialed cross-origin requests to the API.
 * This means a malicious frontend served from an allowed origin could make API calls
 * on behalf of any logged-in user who visits it. Therefore:
 *
 * - Custom domains are ONLY added by site admins via org_premium_tiers (not self-service)
 * - Before adding a domain, verify the org is trustworthy
 * - If self-service domain registration is added in the future, it MUST include
 *   DNS ownership verification AND terms of service prohibiting frontend modification
 * - Revoking a domain in org_premium_tiers removes CORS access within 60 seconds (cache TTL)
 */

import { env } from "../../config/env.js"

const backend_url = new URL(env.BACKEND_URL || "http://localhost:7000")
const frontend_url = new URL(env.FRONTEND_URL || "http://localhost:5173")

/** Static origins that are always allowed. */
export const staticAllowlist: string[] = [
  `http://${backend_url.host}`,
  `https://${backend_url.host}`,
  `http://${frontend_url.host}`,
  `https://${frontend_url.host}`,
  "https://discord.com",
  ...(env.PREMIUM_HOSTS || "")
    .split(",")
    .filter((h) => h.trim())
    .map((h) => `https://${h.trim()}`),
]

// Cache of custom domains from DB
let customDomainCache: string[] = []
let cacheTimestamp = 0
const CACHE_TTL = 60_000

export async function refreshCustomDomainCache(): Promise<void> {
  try {
    const { getKnex } = await import("../../clients/database/knex-db.js")
    const rows = await getKnex()("org_premium_tiers")
      .whereNotNull("custom_domain")
      .whereNull("revoked_at")
      .select("custom_domain")
    customDomainCache = rows.flatMap((r: any) => [
      `https://${r.custom_domain}`,
      `http://${r.custom_domain}`,
    ])
    cacheTimestamp = Date.now()
  } catch {
    // DB not ready — keep existing cache
  }
}

export function getCustomDomainCache(): string[] {
  return customDomainCache
}

export function isCacheStale(): boolean {
  return Date.now() - cacheTimestamp > CACHE_TTL
}

/** Check if an origin is in the static allowlist or the custom domain cache. */
export function isOriginAllowed(origin: string): boolean {
  if (staticAllowlist.includes(origin)) return true
  if (customDomainCache.includes(origin)) return true
  return false
}

/** Async version that refreshes cache if stale before checking. */
export async function isOriginAllowedAsync(origin: string): Promise<boolean> {
  if (staticAllowlist.includes(origin)) return true
  if (isCacheStale()) {
    await refreshCustomDomainCache()
  }
  return customDomainCache.includes(origin)
}
