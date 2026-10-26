/**
 * Site-wide account role (`accounts.role`).
 *
 * This is the ONLY place the role strings are spelled out. Everything else
 * compares against `SiteRole.*` or, for the admin check, calls `isSiteAdmin()`.
 * Keeping a single admin predicate means the admin MFA gate (populate-user role
 * masking) and any future policy change apply to every admin bypass at once.
 *
 * Not to be confused with contractor (org) member roles, which are a separate
 * per-org concept ("owner" / "admin" / "member" in contractor_roles).
 */

export const SiteRole = {
  User: "user",
  Admin: "admin",
} as const

export type SiteRole = (typeof SiteRole)[keyof typeof SiteRole]

export const SITE_ROLES: readonly SiteRole[] = Object.values(SiteRole)

/** Anything carrying a site role (DBUser, User, JWT payload, test fixtures). */
export interface HasSiteRole {
  role?: string | null
}

/**
 * Whether this account holds the site admin role.
 *
 * Callers pass `req.user`, so when admin MFA enforcement masks the role of a
 * non-elevated admin, every caller sees the masked value.
 */
export function isSiteAdmin(user: HasSiteRole | null | undefined): boolean {
  return user?.role === SiteRole.Admin
}

/** Whether `role` is one of the known site roles (user or admin). */
export function isKnownSiteRole(role: unknown): role is SiteRole {
  return SITE_ROLES.includes(role as SiteRole)
}
