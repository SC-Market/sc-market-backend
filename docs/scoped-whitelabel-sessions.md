# Scoped White-Label Sessions — Implementation Plan

## Problem Statement

When a user visits a white-label domain (`org-site.com`), they currently get a full-privilege session identical to visiting `sc-market.space`. If the domain operator serves a modified frontend, that frontend can use the session to access any API endpoint — read the user's DMs, change their password, access other orgs' data, etc.

**Goal:** A session originating from a white-label domain should only be able to do things relevant to that org. Visiting a white-label site should carry no more risk than visiting any random website.

## Design Principles

1. **Zero risk from just visiting.** An unauthenticated visit to a malicious white-label domain must not leak any data or create any session state.
2. **Scoped by default.** Sessions created via a white-label domain are automatically scoped to that org. No opt-in required.
3. **Main site is unscoped.** Sessions on `sc-market.space` remain full-privilege.
4. **Transparent to honest operators.** A legitimate white-label site works identically to today — users just can't do things that don't make sense on that domain anyway.

## Architecture

### 1. Origin-Scoped JWT Tokens

Add two new claims to the access token:

```typescript
interface JWTPayload {
  sub: string          // user_id
  role: string         // "user" | "admin"
  username: string
  iat: number
  exp: number
  // NEW:
  origin?: string      // e.g. "https://org-site.com" — absent for main site
  org_id?: string      // spectrum_id of the org — absent for main site
}
```

**When a user authenticates via a white-label domain:**
- The OAuth flow already carries `origin` through the signed state token
- `completeLogin()` extracts the origin, resolves it to an org via `org_premium_tiers`, and embeds `origin` + `org_id` in the JWT
- The refresh token row also stores `origin` and `org_id`

**When a user authenticates via `sc-market.space`:**
- No `origin` or `org_id` claim — full-privilege token, same as today

**Token refresh inherits scope:** When a scoped refresh token is rotated, the new access token inherits the same `origin` and `org_id`. You can't escalate a scoped session to an unscoped one by refreshing.

### 2. Backend Enforcement Middleware

A new middleware, `enforceOriginScope`, runs after `populateUser` on every request:

```
Request → populateUser → enforceOriginScope → route handler
```

It does two things:

**a) Origin binding check:**
If the JWT has an `origin` claim, verify the request's `Origin` (or `Referer`) header matches. If it doesn't, reject with 403. This prevents a token minted for `org-site.com` from being exfiltrated and used from a different origin.

Note: `Origin` is only sent on cross-origin requests and POSTs. For same-origin GETs (e.g., the user navigating directly), `Referer` is the fallback. If neither is present (direct API call, curl, etc.), the scoped token still works — the scope restrictions below still apply regardless.

**b) Scope restriction:**
If the JWT has an `org_id` claim, attach it to the request context (e.g., `req.orgScope`). Route handlers and existing middleware check this to restrict access.

### 3. API Endpoint Classification

Every API endpoint falls into one of three categories:

| Category | Behavior when scoped | Examples |
|---|---|---|
| **Public / read-only** | Allowed, no change | Game data, market search, public profiles, public listings |
| **Org-contextual** | Allowed, but filtered to the scoped org | Org listings, org members, org orders, org services, org chat threads |
| **Account-sensitive** | Blocked | Change password/email, link/unlink auth providers, manage API tokens, delete account, change username, access other orgs, admin endpoints |

The key insight: most endpoints already take an org `spectrum_id` as a parameter. The middleware just needs to verify that parameter matches `req.orgScope` when present.

### 4. Specific Endpoint Restrictions

**Blocked entirely on scoped sessions:**
- `PUT /api/v1/profile` (edit own profile — except display preferences)
- `POST /api/v1/profile/avatar` (change avatar)
- `DELETE /api/v1/profile` (delete account)
- `POST /auth/citizenid/link` (link auth provider)
- `POST /api/v1/tokens` (create API tokens)
- `PUT /api/v1/tokens/:id` (modify API tokens)
- `GET /api/v1/email/*` (email management)
- `PUT /api/v1/push/*` (push notification management)
- `GET /api/admin/*` (all admin endpoints)
- `POST /logout` (can't log out the user's main session from a white-label domain — see section 6)

**Allowed but org-filtered:**
- `GET /api/v1/contractors/:spectrum_id/*` — only if `spectrum_id === req.orgScope`
- `GET /api/v1/orders` — only orders related to the scoped org
- `GET /api/v1/offers` — only offers related to the scoped org
- `GET /api/v1/market` — when listing/buying, only within the scoped org's storefront
- `GET /api/v1/chats` — only chat threads related to orders/offers within the scoped org
- `GET /api/v1/notifications` — only notifications related to the scoped org

**Allowed unchanged:**
- All public/unauthenticated endpoints (game data, search, public profiles)
- `GET /api/v1/profile` (read own profile — needed for the UI to function)
- Market browsing (read-only, public data)

### 5. Frontend Awareness

The frontend already knows if it's on a custom domain (`IS_CUSTOM_DOMAIN`, `CURRENT_CUSTOM_ORG`). Extend this to hide UI that the backend would reject anyway:

**Hide on white-label domains:**
- Settings page sections: email, linked accounts, API tokens, account deletion
- Org switcher (lock to the current org)
- "Back to SC Market" link in the sidebar (replace with org branding)
- Admin panel links
- Push notification settings (these are account-global)

**Show but scope:**
- Orders list → only show orders for this org
- Offers → only show offers for this org
- Messages → only show threads related to this org
- Notifications → only show notifications for this org

**New UI element:**
- A subtle banner or indicator: "You're using [Org Name]'s site. [Manage your full account on SC Market →]"
- This gives users a clear path to the main site for account management, and signals that this is a scoped view.

### 6. Session Isolation

**Critical:** A scoped session on `org-site.com` must not be able to interfere with the user's main session on `sc-market.space`.

Since cookies are set by the backend (`api.sc-market.space`) with `SameSite=None`, both the main site and white-label sites share the same cookies. This means:

- Logging in on `org-site.com` sets the same `scmarket.access` cookie as logging in on `sc-market.space`
- A malicious white-label site could call the logout endpoint and destroy the user's main session

**Solution: Separate cookie namespaces for scoped sessions.**

When authenticating from a white-label domain, use different cookie names:

```
scmarket.access       → main site (unscoped)
scmarket.wl.access    → white-label (scoped, contains origin + org_id)
scmarket.refresh      → main site
scmarket.wl.refresh   → white-label
```

The `populateUser` middleware checks both cookie sets. If `scmarket.wl.access` is present, it takes precedence on requests with a matching `Origin` header. The main site cookies are never read or written by white-label auth flows.

**This means:**
- Logging in on a white-label site doesn't affect your main site session
- A malicious white-label site calling `/logout` only destroys the white-label session
- The user can be logged into the main site AND a white-label site simultaneously with different privilege levels

### 7. Migration Path

This is a significant change. Phased rollout:

**Phase 1: Backend infrastructure (no user-visible changes)**
- Add `origin` and `org_id` columns to `refresh_tokens`
- Add `origin` and `org_id` claims to JWT generation
- Add `enforceOriginScope` middleware (logs violations but doesn't block)
- Add `scmarket.wl.*` cookie handling
- Deploy, monitor logs for what would be blocked

**Phase 2: Enforcement on writes**
- `enforceOriginScope` starts blocking account-sensitive write endpoints
- Org-contextual endpoints start filtering by `org_id`
- Read-only endpoints remain unrestricted
- Frontend hides blocked UI elements on white-label domains

**Phase 3: Full enforcement**
- All endpoint categories enforced
- Notification/chat filtering active
- Audit logging for scoped session activity

### 8. What This Doesn't Solve (And Why That's OK)

- **A malicious org admin can still see what their members do on their site.** This is inherent — they can already see order activity, member lists, etc. through the normal org admin UI. Scoped sessions don't change this.
- **A user who deliberately enters credentials on a phishing site.** No technical measure prevents this. But scoped sessions ensure that *just visiting* a white-label site (without logging in) is zero-risk, and logging in only exposes org-relevant data.
- **In-session data access by injected JS.** If the user logs into a malicious white-label site, injected JS can read whatever the scoped session allows. But it can't access other orgs, can't change account settings, and can't persist beyond the session. The blast radius is contained to "things you'd see on that org's page anyway."

### Summary

The core idea is simple: **white-label sessions are like API tokens with org-scoped permissions.** The existing scope infrastructure for API tokens (`requireScopes`, `requireContractorAccess`) is reused, just triggered automatically by the authentication origin rather than by explicit token creation.
