# Rate Limiting Implementation Plan — V2 API + Auth Endpoints

Addresses security-audit findings **H2** (no rate limiting on the V2 API — 33 TSOA
controllers) and **H3** (no rate limiting on auth endpoints in
`src/api/routes/auth-routes.ts`).

**Scope:** planning only. No source changes are proposed to be made by this document.
Implementation touches `auth-routes.ts`, controllers, and `package.json`, which are
owned by other agents — this plan defines *what* they should do.

---

## 1. Current-state summary

### What already exists

**`src/api/middleware/enhanced-ratelimiting.ts`** — the real implementation.
- Uses `rate-limiter-flexible`'s `RateLimiterPostgres` with a `RateLimiterMemory`
  insurance limiter (`createMemoryFallback`, lines 66-72).
- Three persistent limiter instances keyed by tier — `rateLimiters.anonymous` (120
  pts/60s), `.authenticated` (500 pts/60s), `.admin` (300 pts/60s) (lines 75-97) —
  plus hour-based variants (`hourBasedRateLimiters`, 600 pts/3600s, lines 100-122).
- `detectUserTier(req)` (lines 125-140): `anonymous` if no `req.user`, `admin` if
  `user.role === "admin"`, else `authenticated`.
- `generateRateLimitKey(req, tier)` (lines 143-152): anonymous → `ip:<ip>`;
  authenticated/admin → `user:<user_id>:ip:<ip>`.
- Factory `createRateLimit(tieredConfig)` (lines 192-234): consumes `config.points`
  from the tier limiter, sets `X-RateLimit-*` headers, and on rejection returns
  **HTTP 429** with a structured `RATE_LIMIT_EXCEEDED` body. `createHourBasedRateLimit`
  is the hour-window equivalent (lines 237-279).
- **Key semantics quirk:** `points` in a `TieredRateLimit` config is the *cost per
  request*, consumed against a fixed per-tier bucket (e.g. authenticated bucket = 500
  pts/min). So `authenticated: { points: 1 }` ⇒ ~500 req/min; `{ points: 15 }` ⇒
  ~33 req/min; `{ points: 0.5 }` ⇒ ~1000 req/min. Pre-baked configs (lines 282-326):
  `criticalRateLimit`, `writeRateLimit`, `readRateLimit`, `bulkRateLimit`,
  `notificationRateLimit`, `commonWriteRateLimit`, `listingUpdateRateLimit`.
- **Fails open:** on Postgres unavailability the library falls back to the in-memory
  insurance limiter; if the whole `consume()` path throws for non-rate-limit reasons
  the request behaviour depends on the promise rejection shape (a `RateLimiterRes`
  rejection ⇒ 429; a thrown `Error` ⇒ unhandled). This is acceptable for availability
  but means a DB outage silently degrades enforcement to the small memory bucket.

**`src/api/middleware/ratelimiting.ts`** — legacy, **effectively a no-op**.
- `rate_limit(points)` consumes from `database.ratelimiter` but the `.catch()` handler
  calls `next()` instead of returning 429 (lines 15-18, the `res.status(429)` line is
  commented out). Any route relying on this has **no enforcement**. Treat as dead code;
  do not extend it.

**V1 already applies limits** via `enhanced-ratelimiting.ts` as normal Express
middleware in route definitions, e.g.:
- `src/api/routes/v1/offers/routes.ts:8-10,47-92` (`writeRateLimit`, `readRateLimit`,
  `commonWriteRateLimit`)
- `src/api/routes/v1/admin/routes.ts:4-5,49-105` (`criticalRateLimit`, `readRateLimit`)
- `src/api/routes/v1/admin/premium.ts`, `comments/routes.ts`, `ships/routes.ts`,
  `contracts/routes.ts`, `commodities/routes.ts`, `wiki/routes.ts`, `starmap/routes.ts`.
- Pattern: `router.get("/path", authMiddleware, readRateLimit, handler)`.

**Compiled-only TSOA adapter (the one the audit flagged as missing from source).**
It exists in `dist/` but NOT in `src/`:
- `dist/api/middleware/tsoa-ratelimit.js` + `dist/api/middleware/tsoa-ratelimit.test.js`
  (also duplicated under `dist/src/...`).
- Interface recovered from the compiled output:
  - `createTsoaRateLimit(config: TieredRateLimit): RequestHandler` — wraps
    `createRateLimit`.
  - `createTsoaHourBasedRateLimit(config): RequestHandler` — wraps
    `createHourBasedRateLimit`.
  - Pre-configured exports mirroring the enhanced ones:
    `tsoaCriticalRateLimit`, `tsoaWriteRateLimit`, `tsoaReadRateLimit`,
    `tsoaBulkRateLimit`, `tsoaNotificationRateLimit`, `tsoaCommonWriteRateLimit`,
    `tsoaListingUpdateRateLimit`.
  - The wrapper is trivial — it just forwards `(req, res, next)` to the underlying
    Express middleware so it satisfies TSOA's `@Middlewares()` `RequestHandler`
    signature. The accompanying test asserts function arity of 3 and pass-through
    behaviour.
- **The source file `src/api/middleware/tsoa-ratelimit.ts` must be rebuilt** from this
  compiled artifact (plus its `.test.ts`). It is a faithful, low-risk re-transcription.

### What is missing

- No `src/api/middleware/tsoa-ratelimit.ts` (only the stale `dist/` copy).
- **Zero** `@Middlewares(...)` usage anywhere under `src/api/routes/v2/` (grep returns
  nothing) — so no V2 controller/endpoint is rate limited today.
- The V2 router (`src/api/routes/v2/api-router.ts`) mounts `RegisterRoutes` (line 193)
  with no rate-limit layer before or around it.
- **Auth endpoints have no limiting** in `auth-routes.ts`: `/auth/discord[/callback]`,
  `/auth/citizenid[/link][/callback]`, `POST /logout`, `POST /api/auth/refresh` +
  `POST /auth/refresh` (lines 606-607), `POST /auth/jwt-logout` (610), `GET
  /auth/sessions` (620), `DELETE /auth/sessions/:tokenId` (652). These are registered
  directly on `app` via `setupAuthRoutes(app, ...)` (server.ts:268), outside both the
  V1 and V2 routers.

### How V2 routes are wired (for hook-point analysis)

- `tsoa.json`: controllers matched by `src/api/routes/v2/**/*Controller.ts`;
  `routes.middleware: "express"`; auth module `.../v2/middleware/tsoa-auth.ts`;
  `esm: true`; routes/spec output to `src/api/routes/v2/generated/`.
- Generated `routes.ts` registers each endpoint as
  `app.<verb>(path, authenticateMiddleware([...]), ...fetchMiddlewares(Controller),
  ...fetchMiddlewares(Controller.prototype.method), async handler)`.
  - **`authenticateMiddleware` runs first**, so by the time
    `fetchMiddlewares`-supplied middleware runs, `req.user` is populated. This means
    `@Middlewares(tsoaWriteRateLimit)` correctly sees the authenticated user and can
    key by `user_id` — good.
  - `fetchMiddlewares(Controller)` = class-level `@Middlewares`;
    `fetchMiddlewares(Controller.prototype.method)` = method-level `@Middlewares`.
    Both are supported by the current generated template with no regeneration risk.
- Route counts in generated routes: 92 GET, 48 POST, 9 PUT, 15 DELETE, 1 PATCH.
- `apiV2Router` is mounted at `/api/v2` (server.ts:302). `trust proxy` is set to `2`
  (server.ts:172) so `req.ip` reflects the real client behind the two proxies — IP
  keying is reliable.

---

## 2. Recommended approach for V2

Two viable designs:

### Option A — TSOA `@Middlewares` per-controller / per-method (RECOMMENDED)
Rebuild `src/api/middleware/tsoa-ratelimit.ts` (from the `dist/` artifact) and decorate
controllers. Apply a **class-level** `@Middlewares(tsoaReadRateLimit)` as a baseline on
each controller, and override with **method-level** `@Middlewares(tsoaWriteRateLimit /
tsoaCriticalRateLimit / ...)` on mutating or expensive endpoints.

**Pros**
- Per-endpoint granularity matching risk (write vs read vs bulk), which the audit asks
  for. Mirrors the existing, proven V1 pattern and reuses the same limiter buckets.
- The compiled adapter + its test already exist, so source recovery is mechanical and
  low-risk; TSOA already emits `fetchMiddlewares(...)` calls, no template changes.
- Auth runs before it, so user-tier keying works.
- Self-documents intent in the controller and shows up in code review per endpoint.

**Cons**
- Requires editing all 33 controllers (or at least the risk-bearing ones) and a
  `npm run tsoa:generate` afterwards. Coordinated with the controller-owning agent.
- A new endpoint added without a decorator inherits only the class-level baseline (or
  nothing if the class isn't decorated) — needs a lint/review convention.

### Option B — Express path-prefix middleware on `/api/v2`
Add one `apiV2Router.use(...)` layer (in `api-router.ts`, before `RegisterRoutes`) that
picks a limiter based on `req.method` and/or path prefix.

**Pros**
- Single choke point; guarantees *every* current and future V2 route is covered,
  including ones a dev forgets to decorate. Fastest to ship as a blanket safety net.

**Cons**
- `req.user` is populated (populateUser runs at server.ts:263 before the router), so
  tier keying still works — but per-endpoint tuning by path is brittle (path matching,
  ordering vs the `resolveShortSlug`/multer layers) and duplicates routing logic.
- Method-only coarseness treats all writes the same; can't easily distinguish
  "expensive bulk import" from "cheap acknowledgement".

### Recommendation
**Do both, layered:** ship **Option B first as a blanket floor** (a method-aware
default limiter mounted at `/api/v2`, before `RegisterRoutes` at api-router.ts:193) to
immediately close H2 for all 33 controllers, then **layer Option A** decorators onto the
high-risk endpoints for tighter, per-endpoint limits. The blanket layer guarantees no
gap; the decorators provide precision. Because limiter buckets are shared per-tier,
stacking a route through both a coarse and a fine limiter is additive cost — acceptable,
and the fine limiter is the binding constraint on hot paths.

If only one can be done under time pressure, **Option A on the high-risk write
endpoints + a blanket read limiter (Option B) for everything else.**

---

## 3. Recommended approach for auth endpoints (H3)

Auth routes are registered on the bare `app` in `setupAuthRoutes`, so add the existing
Express limiters directly to each route (same style as V1). Use **IP-keyed** limiting:
these endpoints are largely unauthenticated (login init/callback, refresh) so
`detectUserTier` returns `anonymous` and `generateRateLimitKey` already keys by `ip:<ip>`
— exactly what we want. `trust proxy = 2` makes `req.ip` trustworthy.

Recommended dedicated limiters (new configs in `enhanced-ratelimiting.ts`, or reuse
`criticalRateLimit` where noted) applied by the auth-routes-owning agent:

| Route | Method | Limiter (per IP) | Rationale |
|---|---|---|---|
| `/api/auth/refresh` + `/auth/refresh` | POST | **authRefreshLimit** ~30/min/IP | Called routinely by the SPA on token expiry; must not lock out a legit tab, but throttle refresh-token brute force / rotation abuse. |
| `/auth/discord`, `/auth/citizenid` (init) | GET | **authInitLimit** ~20/min/IP | OAuth kickoff; low legitimate rate, cap redirect-loop / state-flooding. |
| `/auth/discord/callback`, `/auth/citizenid/callback`, `/auth/citizenid/link/callback` | GET | **authCallbackLimit** ~20/min/IP | Attacker-controllable `state`/`code`; each hit does crypto verify + DB work. |
| `/auth/citizenid/link` | GET | authInitLimit ~20/min/IP | Authenticated but cheap; IP key fine. |
| `POST /logout`, `POST /auth/jwt-logout` | POST | **authLogoutLimit** ~30/min/IP | Cheap but revokes tokens + DB writes; cap abuse. |
| `GET /auth/sessions` | GET | readRateLimit / ~60/min | Read of own sessions. |
| `DELETE /auth/sessions/:tokenId` | DELETE | writeRateLimit / ~60/min per user | Session revocation; keyed by user when authenticated. |

Because these routes sit outside `/api/v2`, they use the *plain* `enhanced-ratelimiting`
middleware (not the `tsoa*` wrappers).

---

## 4. Concrete tiered limit proposal

Reminder on semantics: the per-tier bucket is fixed (anonymous 120 pts/min,
authenticated 500 pts/min, admin 300 pts/min); a config's `points` is **cost per
request**. Effective req/min ≈ bucket ÷ points. Numbers below express intended req/min
and the `points` that yield them.

### V2 — reads (GET)
- Target: authenticated ~500/min, anonymous ~120/min ⇒ `tsoaReadRateLimit`
  (`{ points: 1 }` all tiers). Use as the class-level baseline and the blanket floor.

### V2 — standard writes (POST/PUT/PATCH/DELETE, cheap mutations)
- Target: authenticated ~500/min, anonymous ~40/min ⇒ `tsoaWriteRateLimit`
  (`anonymous 3`, `authenticated 1`, `admin 1`). Note current authenticated cost of 1
  is generous (~500/min) — acceptable as a floor; tighten specific hot endpoints below.

### V2 — expensive / bulk / abuse-sensitive
- Target: ~33/min (auth+anon) ⇒ `tsoaCriticalRateLimit` / `tsoaBulkRateLimit`
  (`points: 15`). Apply to: bulk-update, imports (UEX/game-data), image upload,
  auction bid, order/offer/buy-order creation, account deletion.

### Per-domain endpoint classification (high-risk focus)

| Controller | Endpoint | Class | Limiter |
|---|---|---|---|
| Orders `orders/OrdersV2Controller.ts:77` | `POST /orders` (create) | expensive write | `tsoaCriticalRateLimit` (~15-30/min) |
| Orders `:327,514,932` | GETs | read | `tsoaReadRateLimit` |
| Offers `offers/OffersV2Controller.ts` | only `@Get` (`{sessionId}`, `search`) today; offer *mutations* live in V1/orders flow | read | `tsoaReadRateLimit` (search is DB-heavy → consider `tsoaCriticalRateLimit`) |
| BuyOrders `buy-orders/BuyOrdersV2Controller.ts:91,367` | `POST /buy-orders`, `POST /buy-orders/standing` | expensive write (triggers matching) | `tsoaCriticalRateLimit` |
| BuyOrders `:638,688,712,906` | `PUT/DELETE {id}`, `POST {id}/fulfill`, `POST decline` | write | `tsoaWriteRateLimit` |
| BuyOrders `:425,511,575,612` | search / matches-for-seller / mine / get | read (search+matches heavy) | `tsoaReadRateLimit`; search+matches → `tsoaCriticalRateLimit` |
| Cart `cart/CartV2Controller.ts:261,512,702` | `POST add`, `PUT {id}`, `DELETE {id}` | frequent write | `tsoaWriteRateLimit` |
| Cart `:777` | `POST checkout` | expensive write (creates orders/offers) | `tsoaCriticalRateLimit` |
| Cart `:73` | `GET /cart` | read | `tsoaReadRateLimit` |
| Listings `listings/ListingsV2Controller.ts:81,1408,1951` | `POST`, `PUT {id}`, `DELETE {id}` | write | `tsoaWriteRateLimit`; consider `tsoaListingUpdateRateLimit` (hour-based, 600/hr) on `PUT` |
| Listings `:1839,2014,2109` | `POST {id}/refresh`, `POST {id}/photos`, `POST import-uex` | expensive/bulk (upload, external fetch) | `tsoaCriticalRateLimit` / `tsoaBulkRateLimit` |
| Listings `:1982` | `POST {id}/views` | high-frequency counter | `tsoaCommonWriteRateLimit` (cheap, ~1000/min) |
| Listings `:515,912,1094,1116` | search / mine / inventory-summary / get | read (search heavy) | `tsoaReadRateLimit`; search → `tsoaCriticalRateLimit` |
| Auctions `auctions/AuctionsV2Controller.ts:100` | `POST {listingId}/bids` | expensive write (concurrency-sensitive) | `tsoaCriticalRateLimit` |
| Auctions `:59` | `GET {listingId}` | read | `tsoaReadRateLimit` |
| Images `images/ImagesV2Controller.ts:44` | `POST upload` | expensive (S3 + Rekognition) | `tsoaBulkRateLimit` (~15-30/min) |
| AccountDeletion `accounts/AccountDeletionV2Controller.ts:34,55` | `POST delete`, `POST cancel-deletion` | critical write | `tsoaCriticalRateLimit` |
| AccountDeletion `:68,85` | `GET deletion-status`, `GET deletion-precheck` | read | `tsoaReadRateLimit` |

Admin controllers (`admin/*`, import-jobs, scmdb sync): admin tier has its own 300/min
bucket; apply `tsoaCriticalRateLimit` to imports/bulk and `tsoaReadRateLimit` to reads.

### Auth (per IP) — proposed new configs
- `authRefreshLimit`: ~30/min/IP
- `authInitLimit` / `authCallbackLimit`: ~20/min/IP
- `authLogoutLimit`: ~30/min/IP

These are deliberately tighter than the general anonymous bucket (120/min) because
credential/token endpoints are the highest-value brute-force targets. Implement as
dedicated `createRateLimit` configs (or a small dedicated `RateLimiterPostgres` bucket
with `blockDuration` to slow repeat offenders).

---

## 5. Phased rollout checklist

**Phase 0 — recover source (prerequisite)**
- [ ] Recreate `src/api/middleware/tsoa-ratelimit.ts` from
      `dist/api/middleware/tsoa-ratelimit.js` (TS types re-added; import from
      `./enhanced-ratelimiting.js`).
- [ ] Recreate `src/api/middleware/tsoa-ratelimit.test.ts` from the `dist/` test.
- [ ] Confirm `rate-limiter-flexible` is a declared dependency in `package.json`
      (package.json is owned by another agent — flag to them if missing).
- [ ] `npm run test` for the adapter; `npm run build`.

**Phase 1 — auth endpoints (H3), ship first (highest risk, smallest surface)**
- [ ] Add `authRefresh/Init/Callback/Logout` limiters to `enhanced-ratelimiting.ts`.
- [ ] Have the auth-routes agent apply them per the table in §3.
- [ ] Verify 429 body + `X-RateLimit-*` / `Retry-After` headers; verify legit SPA
      refresh cadence is well under the cap.

**Phase 2 — V2 blanket floor (Option B)**
- [ ] Add a method-aware limiter layer in `api-router.ts` immediately before
      `RegisterRoutes(apiV2Router)` (line 193): reads → read limiter, mutations →
      write limiter. Guarantees H2 is closed for all 33 controllers at once.
- [ ] Exclude/relax `/health`, `/openapi.json`, `/docs`.

**Phase 3 — V2 per-endpoint precision (Option A)**
- [ ] Add class-level `@Middlewares(tsoaReadRateLimit)` baseline to each controller.
- [ ] Add method-level overrides on the high-risk endpoints per §4 table.
- [ ] `npm run tsoa:generate` and confirm `fetchMiddlewares(...)` lines appear for the
      decorated methods in generated `routes.ts`.
- [ ] `npm run build` + tests.

**Phase 4 — monitoring & tuning**
- [ ] Log/emit a metric on every 429 (endpoint, tier, key-hash) via existing logger /
      Bugsnag. Watch for false positives in the first days.
- [ ] Dashboard: 429 rate per endpoint + per tier.
- [ ] Add a "rate limit exceeded" integration/unit test per limiter class.

### Fail-open vs fail-closed decision
- **Keep fail-open (current behaviour) for reads and normal writes** — a Postgres
  outage should not take down the whole read API. The in-memory insurance limiter still
  provides a small backstop.
- **Consider fail-closed (or a much tighter memory fallback) for the most sensitive
  auth/mutation endpoints** (refresh, account deletion, checkout) if a threat model
  warrants it — but only after monitoring confirms the DB limiter path is stable, to
  avoid self-inflicted outages. Default recommendation: ship fail-open everywhere,
  revisit for auth after Phase 4 data.

---

## 6. Gotchas

1. **Legacy `ratelimiting.ts` `rate_limit()` is a no-op** — its `.catch()` calls
   `next()` (line 17) instead of returning 429 (the 429 is commented out, line 16). Any
   route trusting it is unprotected. Do not extend it; migrate callers to
   `enhanced-ratelimiting.ts`. Treat as dead code for removal in a follow-up.
2. **`enhanced-ratelimiting` fails open when Postgres is down** — falls back to the
   10-point/60s in-memory insurance limiter (`createMemoryFallback`). Enforcement
   degrades but does not error. Acceptable, but the memory bucket is small and
   per-process (not shared across the two proxies/instances), so under a DB outage
   limits are both looser and inconsistent across instances. Note in runbook.
3. **`points` = cost-per-request, not requests-per-window.** Reviewers routinely
   misread `{ points: 1 }` as "1 request". Effective rate = tier bucket ÷ points. Some
   pre-baked authenticated configs (`writeRateLimit`, `readRateLimit` = 1 point ⇒
   ~500/min) are quite loose; tighten with `points: 15` for expensive endpoints.
4. **Adapter is thin.** `createTsoaRateLimit` only forwards to `createRateLimit`; it
   does not add TSOA-specific error translation. A 429 sent by the limiter bypasses the
   `tsoaErrorHandler` (it writes the response directly), so the 429 body shape is the
   `RATE_LIMIT_EXCEEDED` object, not the TSOA error envelope — confirm the frontend
   handles that shape on V2.
5. **Middleware ordering in generated routes:** `authenticateMiddleware` runs before
   `fetchMiddlewares` limiters, so `req.user` is set and user-tier keying works. But the
   Option B blanket layer runs even earlier (router-level) where `populateUser`
   (server.ts:263) has already run — also fine. Don't place a limiter *before*
   `populateUser` or every request keys as anonymous.
6. **`req.ip` correctness depends on `trust proxy = 2`** (server.ts:172). If deployment
   topology changes (extra proxy hop), IP keying silently collapses all clients behind
   one proxy IP into a single bucket — revalidate on infra changes.
7. **Offers V2 is currently read-only** (`OffersV2Controller` exposes only `@Get`).
   Offer *creation/mutation* still flows through V1 (`v1/offers/routes.ts`, already
   limited) or the orders/cart flow — don't assume an unprotected V2 offer-write
   endpoint exists; there isn't one yet.
8. **`dist/` has duplicate trees** (`dist/api/...` and `dist/src/api/...`). The stale
   compiled adapter appears in both; the source of truth is whatever `tsc` emits — do
   not hand-edit `dist/`. Recreate the `.ts` source only.
9. **Multer + short-slug layers** run in `api-router.ts` before `RegisterRoutes`
   (photo/image/import uploads, `resolveShortSlug`). Place the Option B blanket limiter
   carefully relative to these so upload endpoints are still limited but not
   double-counted; the per-controller decorators (Option A) are cleaner for the upload
   endpoints (`ImagesV2Controller`, listing photos).
