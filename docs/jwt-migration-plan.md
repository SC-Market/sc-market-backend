# JWT Authentication Migration Plan

## Overview

Migrate SC Market from `express-session` + PostgreSQL session store to **JWT access tokens + refresh tokens** stored in httpOnly cookies. This eliminates the entire class of session-related bugs (stale cookies, session store race conditions, deserialization failures, cookie domain/SameSite misconfiguration).

## Current State

- **Backend**: Express-session with `connect-pg-simple`, Passport serialize/deserialize, `login_sessions` table
- **Frontend**: `credentials: "include"` on all fetch calls, no client-side token storage, auth state derived from `GET /api/profile` success/failure
- **OAuth**: Discord + CitizenID via Passport strategies, session stores transient OAuth state
- **API tokens**: Existing `scm_` prefixed Bearer tokens for programmatic access (separate from session auth)
- **WebSocket**: Socket.IO handshake uses session middleware + `passport.session()`
- **52 files, 285 references** to `req.user` or `req.session`

## Target Architecture

```
Login:    OAuth callback → generate JWT pair → set httpOnly cookies → redirect
API:      Browser sends cookies automatically → middleware extracts JWT → validates → sets req.user
Refresh:  Access token expires → middleware checks refresh cookie → issues new access token
Logout:   Clear cookies + add refresh token to blocklist
WebSocket: Send access token in handshake query param → validate
```

### Token Design

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| Access token | 15 minutes | httpOnly cookie `scmarket.access` | Stateless auth for every request |
| Refresh token | 60 days | httpOnly cookie `scmarket.refresh` | Issue new access tokens |

**Access token payload (JWT)**:
```json
{
  "sub": "user_id (UUID)",
  "role": "user | admin",
  "username": "string",
  "iat": 1234567890,
  "exp": 1234568790
}
```

**Refresh token**: Opaque random string stored in DB (`refresh_tokens` table). Not a JWT — server-side validation only.

### Why httpOnly Cookies (Not localStorage)

- XSS-proof: JavaScript cannot read httpOnly cookies
- Automatic: Browser sends them on every request, no frontend code needed
- Same cookie mechanics the frontend already uses — minimal frontend changes
- `credentials: "include"` continues to work as-is

## Migration Phases

### Phase 1: Database Schema (1 day)

Create `refresh_tokens` table:
```sql
CREATE TABLE refresh_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of token
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP,                    -- NULL = active
  user_agent TEXT,                          -- for "active sessions" UI
  ip_address INET
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

### Phase 2: JWT Utility Module (1 day)

Create `src/api/util/jwt.ts`:

```typescript
// Token generation
function generateAccessToken(user: User): string
function generateRefreshToken(): string  // crypto.randomBytes(32)

// Token validation
function verifyAccessToken(token: string): JWTPayload | null
function verifyRefreshToken(tokenHash: string): RefreshTokenRecord | null

// Cookie helpers
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void
function clearAuthCookies(res: Response): void
```

Cookie configuration:
```typescript
// Access token cookie
{
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  maxAge: 15 * 60 * 1000  // 15 minutes
}

// Refresh token cookie
{
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/api/auth",  // only sent to auth endpoints
  maxAge: 60 * 24 * 60 * 60 * 1000  // 60 days
}
```

Dependencies: `jsonwebtoken` (already installed).

### Phase 3: Auth Middleware Replacement (2 days)

Replace session-based auth with JWT validation in `src/api/middleware/auth.ts`:

**New middleware: `jwtAuth`**
```
1. Read access token from cookie `scmarket.access`
2. If valid → set req.user from JWT payload (no DB lookup!)
3. If expired → check refresh cookie `scmarket.refresh`
   a. If valid refresh → generate new access token, set cookie, continue
   b. If invalid/missing → 401
4. If no access cookie → check Bearer header (existing API token flow, unchanged)
5. If nothing → 401
```

Key change: **No DB lookup on every request.** The access token is self-contained. DB is only hit when:
- Refresh token is used (every 15 min)
- API token is used (existing `scm_` tokens)
- User profile is explicitly fetched

**Existing middleware mapping:**
| Current | New |
|---------|-----|
| `userAuthorized` | `jwtAuth` (same behavior, JWT instead of session) |
| `guestAuthorized` | `jwtAuth` (same) |
| `adminAuthorized` | `jwtAuth` + role check from JWT payload |
| `requireVerifiedUser` | `jwtAuth` + fetch `rsi_confirmed` from DB (only when needed) |
| `requireScopes(...)` | Unchanged for API tokens; JWT gets full access (same as current session behavior) |
| `pageAuthentication` | Remove (unused redirect pattern) |

### Phase 4: OAuth Callback Changes (1 day)

Update `src/api/routes/auth-routes.ts`:

**Discord callback** (after `req.logIn` succeeds):
```typescript
// Instead of: req.session.save() → redirect
// Do:
const accessToken = generateAccessToken(user)
const refreshToken = generateRefreshToken()
await saveRefreshToken(user.user_id, refreshToken, req)
setAuthCookies(res, accessToken, refreshToken)
res.redirect(successRedirect)
```

**CitizenID callback**: Same pattern.

**OAuth state handling**: Currently uses `req.session` to store `discord_auth_action` and `citizenid_redirect_path`. Replace with:
- Discord: Already uses signed state token (no session needed)
- CitizenID: Move `citizenid_redirect_path`, `citizenid_auth_action`, `citizenid_origin` into the signed state token (same pattern as Discord)

### Phase 5: New Auth Endpoints (1 day)

Add to `src/api/routes/auth-routes.ts`:

```
POST /auth/refresh     — Exchange refresh token for new access token
POST /auth/logout      — Revoke refresh token + clear cookies
GET  /auth/sessions    — List active refresh tokens (for "manage sessions" UI)
DELETE /auth/sessions/:id — Revoke specific refresh token
```

**Logout flow**:
```typescript
1. Read refresh token from cookie
2. Mark as revoked in DB (set revoked_at)
3. Clear both cookies
4. Return 200
```

### Phase 6: WebSocket Auth Migration (0.5 day)

Update Socket.IO handshake in `server.ts`:

```typescript
// Instead of: session middleware → passport.session()
// Do:
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
    || parseCookie(socket.handshake.headers.cookie)?.['scmarket.access']
  if (!token) return next(new Error("Unauthorized"))
  const payload = verifyAccessToken(token)
  if (!payload) return next(new Error("Unauthorized"))
  socket.data.user = payload
  next()
})
```

Update `websocket.ts` to read from `socket.data.user` instead of `socket.request.user`.

### Phase 7: Frontend Changes (1 day)

**Minimal changes required** since we're using httpOnly cookies:

1. **`generatedApi.ts` and `service.ts`**: Keep `credentials: "include"` — cookies are sent automatically. No changes needed.

2. **Add 401 interceptor** in `generatedApi.ts`:
```typescript
const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions)
  if (result.error?.status === 401) {
    // Try refresh
    const refreshResult = await baseQuery(
      { url: '/auth/refresh', method: 'POST' },
      api, extraOptions
    )
    if (refreshResult.data) {
      // Retry original request with new access token (cookie already set)
      result = await baseQuery(args, api, extraOptions)
    } else {
      // Refresh failed — redirect to login
      api.dispatch(serviceApi.util.resetApiState())
      window.location.href = '/login'
    }
  }
  return result
}
```

3. **Logout** (`ProfileNavAvatar.tsx`): Change `POST /logout` to `POST /auth/logout`. Rest stays the same (clear RTK cache, clear SW cache, navigate to `/`).

4. **Remove retry on 401**: Update `generatedApi.ts` retry logic to skip 401s.

5. **Service worker**: No changes — `credentials: "include"` sends cookies automatically.

### Phase 8: Cleanup & Remove Sessions (1 day)

1. Remove `express-session`, `connect-pg-simple` from `package.json`
2. Remove session middleware from `server.ts`
3. Remove `passport.serializeUser` / `passport.deserializeUser`
4. Remove `login_sessions` table (migration)
5. Remove `req.session` references from auth routes
6. Remove `session.regenerate()`, `session.save()`, `session.destroy()` calls
7. Keep `passport` for OAuth strategy callbacks only (it doesn't require sessions)
8. Update `trust proxy` comment (still needed for `secure` cookie flag)

### Phase 9: Testing (1 day)

- Test OAuth login → JWT cookies set → API calls work → refresh works → logout works
- Test expired access token → auto-refresh → transparent to user
- Test expired refresh token → 401 → redirect to login
- Test WebSocket with JWT
- Test existing `scm_` API tokens still work
- Test admin override still works
- Test cross-origin (white-label domains) cookie behavior
- Test service worker background sync with JWT cookies
- Load test: verify no DB lookup per request (only on refresh)

## Rollout Strategy

### Option A: Big Bang (Recommended)
Deploy all changes at once. On first request after deploy, users with old session cookies get 401 → frontend redirects to login → fresh JWT cookies. One-time re-login for all users.

### Option B: Gradual (More Complex)
Support both session and JWT simultaneously during transition. Auth middleware checks JWT first, falls back to session. More code, more bugs, not worth it for this user base.

**Recommendation: Option A.** The re-login is a one-time event and users are accustomed to it from previous cookie changes.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| JWT secret compromise | Use RS256 (asymmetric) instead of HS256 if concerned; or rotate symmetric key with grace period |
| Refresh token theft | httpOnly + Secure + SameSite=None; refresh token rotation (issue new refresh on each use) |
| Can't revoke access tokens | 15-min lifetime limits damage; refresh token revocation stops new access tokens |
| Clock skew | Add 30s leeway to JWT verification |
| Migration breaks existing sessions | Expected — users re-login once (Option A) |

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| 1. Database schema | 1 day | None |
| 2. JWT utility module | 1 day | Phase 1 |
| 3. Auth middleware | 2 days | Phase 2 |
| 4. OAuth callbacks | 1 day | Phase 2 |
| 5. New auth endpoints | 1 day | Phase 2 |
| 6. WebSocket auth | 0.5 day | Phase 3 |
| 7. Frontend changes | 1 day | Phase 5 |
| 8. Cleanup | 1 day | All above |
| 9. Testing | 1 day | All above |
| **Total** | **~9.5 days** | |

## Files to Create

- `src/api/util/jwt.ts` — Token generation, validation, cookie helpers
- `migrations/YYYYMMDD_create_refresh_tokens.ts` — Refresh token table

## Files to Modify

**Backend (major changes):**
- `src/api/middleware/auth.ts` — Replace session checks with JWT validation
- `src/api/routes/auth-routes.ts` — OAuth callbacks set JWT cookies instead of sessions
- `src/server.ts` — Remove session middleware, update WebSocket auth
- `src/api/routes/v2/middleware/tsoa-auth.ts` — JWT validation for TSOA
- `src/api/routes/v2/base/BaseController.ts` — Read from JWT payload

**Backend (minor changes — `req.user` type stays the same):**
- All 52 files reading `req.user` — No changes needed if we populate `req.user` from JWT in middleware (same interface)

**Frontend:**
- `src/store/generatedApi.ts` — Add `baseQueryWithReauth` wrapper
- `src/views/people/ProfileNavAvatar.tsx` — Update logout endpoint
- `src/store/profile.ts` — Update logout mutation URL

## Files to Delete

- `src/api/routes/v1/util/session-cleanup.ts` (if exists)
- Session-related test fixtures

## Dependencies

- `jsonwebtoken` — Already installed
- `connect-pg-simple` — Remove
- `express-session` — Remove
