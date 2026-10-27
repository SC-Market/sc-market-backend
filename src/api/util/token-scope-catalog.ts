/**
 * Token scopes that no route ever enforced, retired on 2026-10-27.
 *
 * They were grantable (and shown in the token UI as if they meant something
 * narrow: "Manage Webhooks", "Purchase Items", ...) but no v1 or v2 route
 * required any of them. Worse, on v2 any `*:read` passed unmapped read
 * routes, so `orgs:read` worked as a general read pass.
 *
 * New tokens can't be given them. Existing tokens that carry them keep
 * working with their other scopes; the retired ones are ignored by every
 * scope check, so they grant nothing (not even the old read pass).
 */
export const RETIRED_SCOPES: readonly string[] = [
  "market:purchase",
  "market:photos",
  "orders:reviews",
  "contractors:members",
  "contractors:webhooks",
  "contractors:blocklist",
  "orgs:read",
  "orgs:write",
  "orgs:manage",
  "services:photos",
]

export function isRetiredScope(scope: string): boolean {
  return RETIRED_SCOPES.includes(scope)
}

/** The scopes a token's checks may count: its granted scopes minus retired ones. */
export function effectiveTokenScopes(
  scopes: readonly string[] | undefined,
): string[] {
  return (scopes ?? []).filter((s) => !isRetiredScope(s))
}
