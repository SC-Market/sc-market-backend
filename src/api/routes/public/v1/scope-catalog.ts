/**
 * The public API's scopes, token presets and operations: the single source of
 * truth for /api/public/v1 (design: drafts/scmarket-public-api-v1.md §3-§4).
 *
 * - Tokens are minted from a PRESET only (owner decision 1: no `full`, no
 *   `readonly`). A preset expands to explicit scopes, stored on the token.
 * - Every public operation is listed in PUBLIC_OPERATIONS with the scopes it
 *   requires. scripts/check-public-spec.ts (run by `npm run build`) and
 *   public-spec.test.ts fail when the generated spec has an operation that is
 *   not listed here, lacks `apiToken` security, or names other scopes; so a
 *   route can't ship unscoped and an internal path can't leak into the spec.
 * - The site's token UI reads scopes and presets from
 *   GET /api/v2/public-api-tokens/options, which serves this file.
 *
 * Kept free of runtime imports so the build check can load it with tsx.
 */

export const PUBLIC_SCOPES = [
  "shops:read",
  "listings:read",
  "stock:read",
  "orders:read",
  "orders:write",
  "offers:read",
  "offers:write",
] as const

export type PublicScope = (typeof PUBLIC_SCOPES)[number]

export function isPublicScope(scope: string): scope is PublicScope {
  return (PUBLIC_SCOPES as readonly string[]).includes(scope)
}

export const PUBLIC_TOKEN_PRESETS = {
  /** Keep listings and stock in sync with an external tool. */
  shop_sync: ["shops:read", "listings:read", "stock:read"],
  /** Work orders and answer offers from a bot. */
  order_desk: [
    "shops:read",
    "orders:read",
    "orders:write",
    "offers:read",
    "offers:write",
  ],
  /** Read everything the API serves, change nothing. */
  read_only: [
    "shops:read",
    "listings:read",
    "stock:read",
    "orders:read",
    "offers:read",
  ],
} as const satisfies Record<string, readonly PublicScope[]>

export type PublicTokenPreset = keyof typeof PUBLIC_TOKEN_PRESETS

export function isPublicTokenPreset(value: string): value is PublicTokenPreset {
  return Object.prototype.hasOwnProperty.call(PUBLIC_TOKEN_PRESETS, value)
}

/** Token lifetime: required, default 90 days, at most a year. */
export const PUBLIC_TOKEN_DEFAULT_LIFETIME_DAYS = 90
export const PUBLIC_TOKEN_MAX_LIFETIME_DAYS = 365
/** Active (unrevoked, unexpired) public tokens per user. */
export const PUBLIC_TOKEN_MAX_ACTIVE = 25

/** The TSOA security scheme every public operation must declare. */
export const PUBLIC_SECURITY_SCHEME = "apiToken"

/**
 * Every operation of the public spec, as "METHOD /path" (spec paths, relative
 * to /api/public/v1), with the scopes it requires. An empty list means the
 * token alone (token introspection).
 */
export const PUBLIC_OPERATIONS: Record<string, readonly PublicScope[]> = {
  "GET /me": [],
  "GET /shops": ["shops:read"],
  "GET /shops/{shop}": ["shops:read"],
  "GET /shops/{shop}/listings": ["listings:read"],
  "GET /listings/{listingId}": ["listings:read"],
  "GET /listings/{listingId}/stock": ["stock:read"],
  "GET /orders": ["orders:read"],
  "GET /orders/{orderId}": ["orders:read"],
  "GET /offers": ["offers:read"],
  "GET /offers/{offerId}": ["offers:read"],
}

/** Routes served outside TSOA by the public router itself (no token needed). */
export const PUBLIC_UNAUTHENTICATED_PATHS = ["/openapi.json"] as const

interface SpecOperation {
  security?: Array<Record<string, string[]>>
}
interface Spec {
  paths?: Record<string, Record<string, SpecOperation>>
}

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
])

/**
 * Problems with a generated public spec, empty when it is sound:
 * - an operation that is not in PUBLIC_OPERATIONS (e.g. an internal route);
 * - an operation without exactly `apiToken` security, or with other scopes;
 * - a catalog operation missing from the spec;
 * - a catalog scope that isn't a public scope.
 */
export function publicSpecProblems(spec: Spec): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(ops)) {
      if (!HTTP_METHODS.has(method)) continue
      const key = `${method.toUpperCase()} ${path}`
      seen.add(key)
      const expected = PUBLIC_OPERATIONS[key]
      if (!expected) {
        problems.push(
          `${key}: not a public operation (add it to PUBLIC_OPERATIONS or remove it from the public controllers)`,
        )
        continue
      }
      const security = op.security ?? []
      if (
        security.length !== 1 ||
        Object.keys(security[0]).length !== 1 ||
        !(PUBLIC_SECURITY_SCHEME in security[0])
      ) {
        problems.push(
          `${key}: must declare exactly @Security("${PUBLIC_SECURITY_SCHEME}", [...])`,
        )
        continue
      }
      const declared = [...security[0][PUBLIC_SECURITY_SCHEME]].sort()
      const wanted = [...expected].sort()
      if (declared.join(" ") !== wanted.join(" ")) {
        problems.push(
          `${key}: declares scopes [${declared.join(", ")}], catalog says [${wanted.join(", ")}]`,
        )
      }
      for (const scope of declared) {
        if (!isPublicScope(scope))
          problems.push(`${key}: unknown scope ${scope}`)
      }
    }
  }
  for (const key of Object.keys(PUBLIC_OPERATIONS)) {
    if (!seen.has(key))
      problems.push(`${key}: in PUBLIC_OPERATIONS but not in the spec`)
    for (const scope of PUBLIC_OPERATIONS[key]) {
      if (!isPublicScope(scope))
        problems.push(`${key}: catalog names unknown scope ${scope}`)
    }
  }
  return problems
}
