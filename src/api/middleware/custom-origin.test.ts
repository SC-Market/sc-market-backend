import { describe, it, expect, vi } from "vitest"
import express, { type Request } from "express"
import request from "supertest"
import {
  customOriginGuard,
  isCustomOriginRequest,
  matchCustomOriginDenylist,
} from "./custom-origin.js"
import { applySiteRolePolicy } from "../util/site-admin-policy.js"
import { isSiteAdmin } from "../util/site-role.js"
import {
  currentRequestUser,
  runInRequestContext,
  withRequestContext,
} from "../util/request-context.js"

// FRONTEND_URL / BACKEND_URL are unset in tests, so the main site is
// http://localhost:5173 and http://localhost:7000.
const MAIN = "http://localhost:5173"
const CUSTOM = "https://shop.example-org.com"

function guarded() {
  const a = express()
  a.use(customOriginGuard)
  a.all("*", (_req, res) => res.json({ ok: true }))
  return a
}

describe("isCustomOriginRequest", () => {
  const req = (headers: Record<string, string>) =>
    ({ headers }) as unknown as Request

  it("is false for the main site and for requests naming no origin", () => {
    expect(isCustomOriginRequest(req({ origin: MAIN }))).toBe(false)
    expect(isCustomOriginRequest(req({ origin: "http://localhost:7000" }))).toBe(false)
    expect(isCustomOriginRequest(req({}))).toBe(false)
  })

  it("is true for a custom domain, via Origin or (when absent) Referer", () => {
    expect(isCustomOriginRequest(req({ origin: CUSTOM }))).toBe(true)
    expect(isCustomOriginRequest(req({ referer: `${CUSTOM}/shop` }))).toBe(true)
    expect(
      isCustomOriginRequest(req({ origin: MAIN, referer: `${CUSTOM}/x` })),
    ).toBe(false)
  })
})

describe("customOriginGuard (sensitive-route denylist)", () => {
  it.each([
    ["POST", "/api/v1/tokens"],
    ["POST", "/api/tokens"],
    ["GET", "/api/v1/tokens"],
    ["GET", "/api/tokens/abc/stats"],
    ["GET", "/auth/sessions"],
    ["DELETE", "/auth/sessions/abc"],
    ["GET", "/api/admin/users"],
    ["PUT", "/api/v1/admin/premium/X"],
    ["GET", "/api/v2/admin/feature-flags/stats"],
    ["POST", "/api/v2/debug/feature-flag"],
    ["POST", "/api/v2/accounts/delete"],
    ["GET", "/api/v2/accounts/deletion-status"],
    ["PUT", "/api/profile/email"],
    ["POST", "/api/v1/profile/email/verify"],
    ["DELETE", "/api/profile/links/discord"],
    ["POST", "/api/profile/auth/unlink"],
    ["POST", "/api/profile/webhook/create"],
    ["GET", "/api/profile/webhooks"],
    ["GET", "/api/profile/my_data"],
    ["POST", "/api/push/subscribe"],
    ["POST", "/api/v2/shops/abc/transfer"],
    ["POST", "/api/v2/shops/abc/webhooks"],
    ["POST", "/api/contractors/ORG/transfer-ownership"],
    ["POST", "/api/contractors/ORG/roles"],
    ["POST", "/api/v1/contractors/ORG/roles/1/members/bob"],
    ["GET", "/api/contractors/ORG/webhooks"],
    ["POST", "/api/v2/integrations/scmdb/regenerate"],
    ["POST", "/api/v2/auth/mfa/verify"],
  ])("blocks %s %s from a custom domain", async (method, path) => {
    const res = await request(guarded())
      [method.toLowerCase() as "get"](path)
      .set("Origin", CUSTOM)
    expect(res.status).toBe(403)
    expect(res.body.error.details).toMatchObject({
      reason: "custom_domain_restricted",
    })
  })

  it.each([
    ["POST", "/api/v1/tokens"],
    ["GET", "/auth/sessions"],
    ["GET", "/api/admin/users"],
    ["POST", "/api/v2/accounts/delete"],
  ])("lets %s %s through from the main site", async (method, path) => {
    const res = await request(guarded())
      [method.toLowerCase() as "get"](path)
      .set("Origin", MAIN)
    expect(res.status).toBe(200)
  })

  // What a white-label storefront uses: browsing, cart/checkout, offers,
  // orders and their chats, notifications, the visitor's own profile.
  it.each([
    ["GET", "/api/v2/listings/search"],
    ["GET", "/api/v2/shops/abc"],
    ["GET", "/api/v1/domain/shop.example-org.com"],
    ["GET", "/api/v2/cart"],
    ["POST", "/api/v2/cart/items"],
    ["POST", "/api/v2/cart/checkout"],
    ["POST", "/api/offers"],
    ["GET", "/api/v2/orders/abc"],
    ["GET", "/api/chats/abc"],
    ["POST", "/api/chats/abc/messages"],
    ["GET", "/api/notification/1"],
    ["GET", "/api/profile"],
    ["POST", "/api/profile/settings/update"],
    ["GET", "/api/v2/debug/feature-flag"],
    ["POST", "/api/auth/refresh"],
    ["GET", "/api/auth/session"],
    ["POST", "/logout"],
    ["GET", "/api/contractors/ORG"],
    ["GET", "/api/push/subscribe"],
  ])("does not block storefront route %s %s", async (method, path) => {
    const res = await request(guarded())
      [method.toLowerCase() as "get"](path)
      .set("Origin", CUSTOM)
    expect(res.status).toBe(200)
  })

  it("does not interfere with preflights", async () => {
    const res = await request(guarded())
      .options("/api/v1/tokens")
      .set("Origin", CUSTOM)
    expect(res.status).toBe(200)
  })

  it("matches whole path segments only", () => {
    expect(matchCustomOriginDenylist("GET", "/api/tokensx")).toBeUndefined()
    expect(matchCustomOriginDenylist("GET", "/api/administrators")).toBeUndefined()
    expect(matchCustomOriginDenylist("GET", "/api/profile/emailx")).toBeUndefined()
  })
})

describe("site-admin role from custom origins (applySiteRolePolicy)", () => {
  const admin = { user_id: "a1", role: "admin" as const, username: "boss" }

  function run(headers: Record<string, string>, user: object | undefined) {
    const req = { headers, user } as unknown as Request
    applySiteRolePolicy(req)
    return req
  }

  it("keeps the admin role on main-site and origin-less requests", () => {
    expect(isSiteAdmin(run({ origin: MAIN }, admin).user)).toBe(true)
    expect(isSiteAdmin(run({}, admin).user)).toBe(true)
  })

  it("masks the admin role on a custom-domain request", () => {
    const req = run({ origin: CUSTOM }, admin)
    expect(isSiteAdmin(req.user)).toBe(false)
    expect(req.user).toMatchObject({ user_id: "a1", role: "user" })
    expect(req.adminLocked).toBe("custom_origin")
    // The stored account object is not mutated.
    expect(admin.role).toBe("admin")
  })

  it("leaves regular users and anonymous requests alone", () => {
    const user = { user_id: "u1", role: "user" }
    expect(run({ origin: CUSTOM }, user).user).toBe(user)
    expect(run({ origin: CUSTOM }, undefined).user).toBeUndefined()
    expect(run({ origin: CUSTOM }, user).adminLocked).toBeUndefined()
  })

  it("has_permission gives a masked admin no bypass", async () => {
    vi.resetModules()
    vi.doMock("../routes/v1/contractors/database.js", () => ({
      getMemberRoles: async () => [],
      getContractorMembers: async () => [],
    }))
    const { has_permission } = await import("../routes/v1/util/permissions.js")
    const ctx = await import("../util/request-context.js")
    const policy = await import("../util/site-admin-policy.js")

    const check = (headers: Record<string, string>) => {
      const req = { headers, user: { ...admin } } as unknown as Request
      policy.applySiteRolePolicy(req)
      return ctx.withRequestContext(req, () =>
        has_permission("c1", "a1", "manage_orders"),
      )
    }
    expect(await check({ origin: MAIN })).toBe(true)
    expect(await check({ origin: CUSTOM })).toBe(false)
    // Outside any request: no admin short-circuit.
    expect(await has_permission("c1", "a1", "manage_orders")).toBe(false)
    vi.doUnmock("../routes/v1/contractors/database.js")
  })
})

describe("request context", () => {
  it("survives async hops and multipart parsing in the handler chain", async () => {
    const multer = (await import("multer")).default
    const a = express()
    a.use((req, _res, next) => {
      req.user = { user_id: "u1", role: "admin" } as Express.User
      next()
    })
    a.use(runInRequestContext)
    a.post(
      "/up",
      multer({ storage: multer.memoryStorage() }).single("f"),
      async (_req, res) => {
        await new Promise((r) => setTimeout(r, 1))
        res.json({ user: currentRequestUser()?.user_id ?? null })
      },
    )
    const res = await request(a).post("/up").attach("f", Buffer.from("x"), "a.png")
    expect(res.body.user).toBe("u1")
  })

  it("withRequestContext scopes the user to the callback", async () => {
    const req = { user: { user_id: "u2" } } as unknown as Request
    expect(withRequestContext(req, () => currentRequestUser()?.user_id)).toBe("u2")
    expect(currentRequestUser()).toBeUndefined()
  })
})
