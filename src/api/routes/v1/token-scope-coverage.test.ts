/**
 * Every authenticated v1 route must check the API token: a scope
 * (requireScopes / requireTokenScopes), session-only (requireSessionAuth), or
 * the admin gate. Some routes (comment edits and votes, org languages, invite
 * accept/decline, org blocklist and Discord settings, leaving an org, order
 * settings, moderation reports, RSI link/unlink, email changes) only checked
 * that someone was signed in, so a token with any scope could use them.
 *
 * GET /profile is the one deliberate exception (anyTokenIdentity): it is how
 * the token guide checks a token. GET /profile/my_data, the full data export,
 * is session-only.
 */

import { describe, it, expect, vi } from "vitest"
import type { Router } from "express"

vi.hoisted(() => {
  // The route modules import the CDN client, which needs B2 credentials.
  process.env.B2_KEY_ID ||= "test"
  process.env.B2_APP_KEY ||= "test"
})

// The routers build their Postgres-backed rate limiters at import; keep them
// in memory so nothing tries to reach a database.
vi.mock("rate-limiter-flexible", async (importOriginal) => {
  const original = await importOriginal<typeof import("rate-limiter-flexible")>()
  class RateLimiterPostgres extends original.RateLimiterMemory {
    constructor(opts: { points?: number; duration?: number }) {
      super({ points: opts.points, duration: opts.duration })
    }
  }
  return { ...original, RateLimiterPostgres }
})

const auth = await import("../../middleware/auth.js")
const contractorMw = await import("./contractors/middleware.js")
const { apiV1Router } = await import("./api-v1-router.js")
const { profileRouter } = await import("./profiles/routes.js")

type Handle = ((...args: unknown[]) => unknown) & { [k: symbol]: unknown }
type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handle }[] }
  handle?: Handle & { stack?: Layer[] }
  regexp?: RegExp
}

function routes(router: Router) {
  const out: { name: string; handles: Handle[] }[] = []
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) {
          out.push({
            name: `${m.toUpperCase()} ${prefix}${layer.route.path}`,
            handles: layer.route.stack.map((l) => l.handle),
          })
        }
      } else if (layer.handle?.stack) {
        const src = layer.regexp?.source ?? ""
        const mount = src
          .replace(/^\^/, "")
          .replace(/\\\/\?\(\?=\\\/\|\$\)$/i, "")
          .replace(/\\\//g, "/")
        walk(layer.handle.stack, prefix + (mount === "/" ? "" : mount))
      }
    }
  }
  walk((router as unknown as { stack: Layer[] }).stack, "")
  return out
}

const AUTHENTICATING = new Set<unknown>([
  auth.userAuthorized,
  auth.requireVerifiedUser,
  auth.guestAuthorized,
  contractorMw.org_authorized,
])
const isScopeCheck = (h: Handle) =>
  auth.TOKEN_SCOPE_CHECK in h || h === auth.adminAuthorized || h.name === "sessionOnly"

describe("v1 token scope coverage", () => {
  const all = routes(apiV1Router)

  it("finds the v1 routes", () => {
    expect(all.length).toBeGreaterThan(150)
  })

  it("every authenticated route checks the token's scopes (or is session-only / admin)", () => {
    const unchecked = all
      .filter((r) => r.handles.some((h) => AUTHENTICATING.has(h)))
      .filter((r) => !r.handles.some(isScopeCheck))
      .map((r) => r.name)
    expect(unchecked).toEqual([])
  })

  it("GET /profile works with any token, on purpose", () => {
    const root = routes(profileRouter).find((r) => r.name === "GET ")!
    expect(root.handles).toContain(auth.anyTokenIdentity)
  })

  it("GET /profile/my_data is session-only", () => {
    const myData = routes(profileRouter).find((r) => r.name === "GET /my_data")!
    expect(myData.handles).toContain(auth.requireSessionAuth)
    expect(myData.handles).not.toContain(auth.requireProfileRead)
  })
})

describe("requireSessionAuth", () => {
  const run = (req: object) => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()
    auth.requireSessionAuth(req as never, res as never, next)
    return { res, next }
  }

  it("refuses API tokens, valid or not", () => {
    expect(run({ headers: {}, __tokenInfo: { scopes: ["full"] } }).res.status).toHaveBeenCalledWith(403)
    expect(run({ headers: { authorization: "Bearer scm_live_bad" } }).res.status).toHaveBeenCalledWith(403)
  })

  it("lets browser sessions through", () => {
    expect(run({ headers: {} }).next).toHaveBeenCalled()
  })
})

describe("requireTokenScopes", () => {
  const run = (req: object) => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    const next = vi.fn()
    auth.requireTokenScopes("comments:write")(req as never, res as never, next)
    return { res, next }
  }

  it("refuses a token without the scope, admits one with it, and leaves sessions alone", () => {
    expect(run({ __tokenInfo: { scopes: ["profile:read"] } }).res.status).toHaveBeenCalledWith(403)
    expect(run({ __tokenInfo: { scopes: ["comments:write"] } }).next).toHaveBeenCalled()
    expect(run({ __tokenInfo: { scopes: ["full"] } }).next).toHaveBeenCalled()
    expect(run({}).next).toHaveBeenCalled()
  })
})
