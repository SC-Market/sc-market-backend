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

/**
 * Origins of the main site itself (frontend and API hosts), as opposed to
 * shop custom domains and PREMIUM_HOSTS. Requests from any other origin are
 * "custom origin" requests (see middleware/custom-origin.ts).
 */
export const mainSiteOrigins: string[] = buildStaticAllowlist({
  backendUrl: new URL(env.BACKEND_URL || "http://localhost:7000"),
  frontendUrl: new URL(env.FRONTEND_URL || "http://localhost:5173"),
  production: env.NODE_ENV === "production",
})

export function isMainSiteOrigin(origin: string): boolean {
  return mainSiteOrigins.includes(origin)
}

// Cache of custom domains from DB.
//
// Fails closed: if a refresh fails, the custom domains are dropped (only the
// static origins stay allowed) until a refresh succeeds, and a cache older
// than MAX_STALENESS is never used. A revoked domain therefore stops working
// within CACHE_TTL, and immediately in this process when an admin handler
// calls invalidateCustomDomainCache().
let customDomainCache: string[] = []
let cacheTimestamp = 0
let inflight: Promise<void> | null = null
const CACHE_TTL = 60_000
const RETRY_AFTER_FAILURE = 10_000
const MAX_STALENESS = 5 * 60_000

async function loadCustomDomains(): Promise<void> {
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
    customDomainCache = []
    // Retry soon rather than on every request.
    cacheTimestamp = Date.now() - CACHE_TTL + RETRY_AFTER_FAILURE
  }
}

/** Reload the custom domains from the DB (single-flight). */
export function refreshCustomDomainCache(): Promise<void> {
  if (!inflight) {
    inflight = loadCustomDomains().finally(() => {
      inflight = null
    })
  }
  return inflight
}

/** Make the next check reload from the DB (call after changing a domain). */
export function invalidateCustomDomainCache(): void {
  cacheTimestamp = 0
}

export function getCustomDomainCache(): string[] {
  return Date.now() - cacheTimestamp > MAX_STALENESS ? [] : customDomainCache
}

export function isCacheStale(): boolean {
  return Date.now() - cacheTimestamp > CACHE_TTL
}

/** Check if an origin is in the static allowlist or the custom domain cache. */
export function isOriginAllowed(origin: string): boolean {
  if (staticAllowlist.includes(origin)) return true
  return getCustomDomainCache().includes(origin)
}

/** Async version that refreshes cache if stale before checking. */
export async function isOriginAllowedAsync(origin: string): Promise<boolean> {
  if (staticAllowlist.includes(origin)) return true
  if (isCacheStale()) {
    await refreshCustomDomainCache()
  }
  return getCustomDomainCache().includes(origin)
}

const HOSTNAME_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * Validate and normalize a shop custom domain before it is stored (and so
 * becomes a credentialed CORS origin). Lower-cases it and rejects anything
 * that is not a public multi-label hostname: IPs, localhost, single labels,
 * and the main site's own hosts.
 */
export function normalizeCustomDomain(
  input: string,
): { ok: true; domain: string } | { ok: false; reason: string } {
  const domain = input.trim().toLowerCase().replace(/\.$/, "")
  if (domain.length === 0 || domain.length > 253) {
    return { ok: false, reason: "Invalid domain format" }
  }
  if (IPV4_RE.test(domain)) {
    return { ok: false, reason: "IP addresses are not allowed" }
  }
  if (!HOSTNAME_RE.test(domain)) {
    return { ok: false, reason: "Invalid domain format" }
  }
  if (domain === "localhost" || domain.endsWith(".localhost")) {
    return { ok: false, reason: "localhost is not allowed" }
  }
  const mainHosts = mainSiteOrigins.map((o) => new URL(o).hostname)
  const mainZones = new Set(
    mainHosts.map((h) => h.split(".").slice(-2).join(".")),
  )
  for (const zone of mainZones) {
    if (domain === zone || domain.endsWith(`.${zone}`)) {
      return { ok: false, reason: "The main site's domains are not allowed" }
    }
  }
  return { ok: true, domain }
}
