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
import type { DBOrgPremiumTier } from "../../clients/database/db-models.js"

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Origins a credentialed request may come from.
 *
 * https only. Plain http is accepted solely for loopback hosts outside
 * production (local dev on http://localhost:5173), because a credentialed
 * http origin can be spoofed by anyone on the network path.
 */
export function buildStaticAllowlist(config: {
  backendUrl: URL
  frontendUrl: URL
  premiumHosts?: string
  production: boolean
}): string[] {
  const origins = new Set<string>()
  for (const url of [config.backendUrl, config.frontendUrl]) {
    origins.add(`https://${url.host}`)
    if (!config.production && LOOPBACK_HOSTNAMES.has(url.hostname)) {
      origins.add(`http://${url.host}`)
    }
  }
  for (const host of (config.premiumHosts || "").split(",")) {
    if (host.trim()) origins.add(`https://${host.trim().toLowerCase()}`)
  }
  return [...origins]
}

/** Static origins that are always allowed. */
export const staticAllowlist: string[] = buildStaticAllowlist({
  backendUrl: new URL(env.BACKEND_URL || "http://localhost:7000"),
  frontendUrl: new URL(env.FRONTEND_URL || "http://localhost:5173"),
  premiumHosts: env.PREMIUM_HOSTS,
  production: env.NODE_ENV === "production",
})

/** `https://<domain>` for a registered shop custom domain (https only). */
export function customDomainOrigins(domains: string[]): string[] {
  return domains
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d !== "")
    .map((d) => `https://${d}`)
}

// Cache of custom domains from DB
let customDomainCache: string[] = []
let cacheTimestamp = 0
const CACHE_TTL = 60_000

export async function refreshCustomDomainCache(): Promise<void> {
  try {
    const { getKnex } = await import("../../clients/database/knex-db.js")
    const rows = await getKnex()<DBOrgPremiumTier>("org_premium_tiers")
      .whereNotNull("custom_domain")
      .whereNull("revoked_at")
      .select("custom_domain")
    customDomainCache = customDomainOrigins(
      rows.map((r) => r.custom_domain as string),
    )
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
