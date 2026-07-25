/**
 * V2 API-token scope enforcement
 *
 * Bearer `scm_` API tokens carry a fixed set of granted scopes (e.g.
 * `market:read`, `orders:write`, `admin`). Browser sessions and JWT cookies do
 * NOT — they authenticate a full user and carry no `__tokenInfo`. This module
 * only ever constrains token requests; session/JWT requests are waved through
 * untouched, exactly like the v1 `requireScopes` middleware
 * (src/api/middleware/auth.ts).
 *
 * TSOA v2 controllers declare bare `@Security("loggedin" | "verified")` with no
 * scope argument, so there is nothing in the decorator to enforce against.
 * Instead we DERIVE the required scope for each request from:
 *   - the HTTP method → read (GET/HEAD) vs write (POST/PUT/PATCH/DELETE)
 *   - the router-relative path prefix → a scope domain
 *
 * Granularity (decided with the maintainer — "hybride"):
 *   - Domains that already have a v1 scope equivalent are enforced at
 *     `domain:level` (e.g. listings → market:read / market:write).
 *   - v2-only domains with no v1 precedent are enforced at the read/write LEVEL
 *     only: any read scope may read, any write scope may write. We do not invent
 *     an unfounded domain mapping for these.
 *   - Admin routes FAIL CLOSED: only the literal `admin` scope is accepted.
 *     `full` / `readonly` explicitly do not grant admin (mirrors v1
 *     `isAdminScope`). The admin *role* is still separately enforced inside the
 *     controllers via BaseController.requireAdmin(); both must hold.
 */

export interface TokenInfo {
  id: string
  name: string
  scopes: string[]
  expires_at?: Date
  contractor_ids?: string[]
}

type Level = "read" | "write"

// Router-relative path prefixes (mounted at /api/v2, so paths arrive without
// that prefix) mapped to the v1 scope domain that governs them. Longest prefix
// wins, so more specific entries (e.g. "admin/…") are matched before "admin".
//
// Only domains with a real v1 scope equivalent are listed. Prefixes NOT listed
// here are v2-only and fall back to level-only enforcement (see requiredScope).
const DOMAIN_PREFIXES: Array<{ prefix: string; domain: string }> = [
  // Admin surface — every admin/* route requires the `admin` scope (fail closed)
  { prefix: "admin", domain: "admin" },
  // Market
  { prefix: "listings", domain: "market" },
  { prefix: "stock-lots", domain: "market" },
  // Orders
  { prefix: "orders", domain: "orders" },
  // Offers
  { prefix: "offers", domain: "offers" },
  // Profile / account
  { prefix: "accounts", domain: "profile" },
]

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function levelForMethod(method: string): Level {
  return WRITE_METHODS.has(method.toUpperCase()) ? "write" : "read"
}

function isAdminScope(scope: string): boolean {
  return (
    scope.startsWith("admin:") ||
    scope === "admin" ||
    scope === "moderation:read" ||
    scope === "moderation:write"
  )
}

/**
 * Normalize a router-relative request path to its leading segment(s) and match
 * it against the domain table. Returns the governing scope domain, or null when
 * the route is v2-only (no v1 precedent → level-only enforcement).
 */
function domainForPath(path: string): string | null {
  // Strip leading slash and query, lower-case for matching.
  const clean = path.replace(/^\/+/, "").split("?")[0].toLowerCase()

  let best: { prefix: string; domain: string } | null = null
  for (const entry of DOMAIN_PREFIXES) {
    // Match a whole path segment prefix: "admin" matches "admin" and
    // "admin/imports" but not "administrators".
    if (clean === entry.prefix || clean.startsWith(entry.prefix + "/")) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry
    }
  }
  return best ? best.domain : null
}

/**
 * Whether a router-relative path targets the admin surface. Used to enforce the
 * admin *role* centrally (not just the admin token scope). Single source of
 * truth for "what is an admin route", shared with the domain table above.
 */
export function isAdminPath(path: string): boolean {
  return domainForPath(path) === "admin"
}

/**
 * The concrete scope this request requires. `domain:level` for known domains,
 * or a bare level marker for v2-only routes.
 */
export function requiredScope(
  method: string,
  path: string,
): { domain: string | null; level: Level } {
  return { domain: domainForPath(path), level: levelForMethod(method) }
}

/**
 * Decide whether a token's granted scopes satisfy the derived requirement.
 * Wildcard semantics mirror v1 requireScopes:
 *   - `admin`    → everything
 *   - `full`     → everything non-admin
 *   - `readonly` → any `:read` non-admin
 *   - exact `domain:level` match
 * For v2-only (domain === null) routes we require only the right LEVEL: a read
 * needs any `:read`/`readonly`/`full`/`admin`; a write needs any `:write`/`full`/
 * `admin`.
 */
export function tokenSatisfiesScope(
  userScopes: string[],
  req: { domain: string | null; level: Level },
): boolean {
  const { domain, level } = req

  // Admin surface: fail closed — only the literal `admin` scope passes.
  if (domain === "admin") {
    return userScopes.includes("admin")
  }

  if (domain) {
    const needed = `${domain}:${level}`
    if (userScopes.includes(needed)) return true
    if (userScopes.includes("admin")) return true
    if (userScopes.includes("full")) return true // domain is non-admin here
    if (level === "read" && userScopes.includes("readonly")) return true
    return false
  }

  // v2-only route → level-only enforcement.
  if (userScopes.includes("admin") || userScopes.includes("full")) return true
  if (level === "read") {
    if (userScopes.includes("readonly")) return true
    return userScopes.some((s) => s.endsWith(":read") && !isAdminScope(s))
  }
  // write
  return userScopes.some((s) => s.endsWith(":write") && !isAdminScope(s))
}

/**
 * Enforce token scopes for a v2 request. No-op unless this is a token request
 * (tokenInfo present). Throws an Error with status 403 on insufficient scope,
 * which tsoa-error-handler maps to an HTTP 403 FORBIDDEN response.
 */
export function enforceTokenScopes(
  tokenInfo: TokenInfo | undefined,
  method: string,
  path: string,
): void {
  if (!tokenInfo) return // session / JWT → full access, no scope check

  const req = requiredScope(method, path)
  if (!tokenSatisfiesScope(tokenInfo.scopes || [], req)) {
    const err = new Error("Insufficient token permissions") as Error & {
      status: number
    }
    err.status = 403
    throw err
  }
}
