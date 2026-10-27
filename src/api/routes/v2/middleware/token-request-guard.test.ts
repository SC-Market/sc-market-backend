/**
 * Token checks on every v2 route (tokenRequestGuard), not just @Security ones.
 *
 * Public routes that read req.user served a token's identity with no scope or
 * contractor_ids check. E.g. a token restricted to other orgs read its user's
 * private org listings through GET /listings/{id}.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const state: { db: unknown } = { db: null }
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {},
}))

const { tokenRequestGuard, expressAuthentication } =
  await import("./tsoa-auth.js")
const { buildV2RouteTable, matchV2Route, v2RouteTable } =
  await import("./v2-route-table.js")

const LISTING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

const table = () =>
  buildV2RouteTable({
    paths: {
      "/listings/{id}": { get: {} },
      "/listings/mine": { get: { security: [{ loggedin: [] }] } },
      "/listings/{id}/views": { post: {} },
      "/shops/{slug}": { get: {} },
      "/shops/by-owner": { get: {} },
      "/shops/{shopId}/customers": { get: { security: [{ loggedin: [] }] } },
      "/game-data/crafting/simulate": { post: {} },
    },
  })

const user = { user_id: "me", role: "user", rsi_confirmed: true }
const token = (scopes: string[], contractor_ids: string[] = []) => ({
  id: "t",
  name: "t",
  scopes,
  contractor_ids,
})

function req(
  method: string,
  path: string,
  opts: { token?: ReturnType<typeof token>; body?: unknown } = {},
) {
  return {
    method,
    path,
    query: {},
    params: {},
    body: opts.body ?? {},
    user: { ...user },
    __tokenInfo: opts.token,
    auth: opts.token ? { method: "token" } : { method: "session" },
  } as Record<string, unknown>
}

async function run(r: Record<string, unknown>) {
  const next = vi.fn()
  await tokenRequestGuard(table)(r as never, {} as never, next)
  return next
}

beforeEach(() => {
  state.db = createFakeKnex({
    listings: [{ listing_id: LISTING, shop_id: "shop-b" }],
    shops: [
      { shop_id: "shop-b", slug: "orgb", owner_contractor_id: "org-b" },
      { shop_id: "shop-a", slug: "orga", owner_contractor_id: "org-a" },
    ],
    contractors: [],
    orders: [],
    offer_sessions: [],
    contractor_members: [
      { contractor_id: "org-a", user_id: "me" },
      { contractor_id: "org-b", user_id: "me" },
    ],
  })
})

describe("v2 route table", () => {
  it("prefers literal paths over {param} siblings, and extracts params", () => {
    expect(matchV2Route(table(), "GET", "/shops/by-owner")?.route.path).toBe(
      "/shops/by-owner",
    )
    expect(matchV2Route(table(), "GET", "/shops/orgb")?.params).toEqual({
      slug: "orgb",
    })
    expect(matchV2Route(table(), "GET", "/listings/mine")?.route.secured).toBe(
      true,
    )
    expect(
      matchV2Route(table(), "GET", `/listings/${LISTING}`)?.route.secured,
    ).toBe(false)
    expect(matchV2Route(table(), "GET", "/shops/x/customers")?.params).toEqual({
      shopId: "x",
    })
    expect(matchV2Route(table(), "DELETE", "/shops/x")).toBeNull()
  })

  it("loads the real generated spec", () => {
    const real = v2RouteTable()
    expect(real.length).toBeGreaterThan(100)
    expect(
      matchV2Route(real, "GET", `/listings/${LISTING}`)?.route.secured,
    ).toBe(false)
    expect(matchV2Route(real, "GET", "/orders")?.route.secured).toBe(true)
  })
})

describe("tokenRequestGuard", () => {
  it("leaves session requests alone", async () => {
    const r = req("GET", `/listings/${LISTING}`)
    const next = await run(r)
    expect(next).toHaveBeenCalledWith()
    expect(r.user).toEqual(user)
  })

  it("public route, token lacking the org grant: served as anonymous", async () => {
    const r = req("GET", `/listings/${LISTING}`, {
      token: token(["market:read"], ["org-a"]),
    })
    const next = await run(r)
    expect(next).toHaveBeenCalledWith()
    expect(r.user).toBeUndefined()
    expect(r.__tokenInfo).toBeUndefined()
  })

  it("public route, token lacking the scope: served as anonymous", async () => {
    const r = req("GET", "/shops/orga", {
      token: token(["chats:write"], ["org-a"]),
    })
    const next = await run(r)
    expect(next).toHaveBeenCalledWith()
    expect(r.user).toBeUndefined()
  })

  it("public route, token with the scope and grant: keeps its identity, checked once", async () => {
    const r = req("GET", "/shops/orga", {
      token: token(["market:read"], ["org-a"]),
    })
    const next = await run(r)
    expect(next).toHaveBeenCalledWith()
    expect(r.user).toEqual(user)
    expect(r.__v2TokenChecked).toBe(true)
  })

  it("@Security route, token lacking the org grant: 403", async () => {
    const r = req("GET", "/shops/shop-b/customers", {
      token: token(["market:read"], ["org-a"]),
    })
    const next = await run(r)
    expect(next.mock.calls[0][0]).toMatchObject({ status: 403 })
  })

  it("uses the route's path params (not available before TSOA routing otherwise)", async () => {
    const ok = req("GET", "/shops/shop-a/customers", {
      token: token(["market:read"], ["org-a"]),
    })
    expect(await run(ok)).toHaveBeenCalledWith()
    const bad = req("GET", "/shops/shop-b/customers", {
      token: token(["market:read"], ["org-a"]),
    })
    expect((await run(bad)).mock.calls[0][0]).toMatchObject({ status: 403 })
  })

  it("checks nested body references on public writes", async () => {
    const r = req("POST", "/game-data/crafting/simulate", {
      token: token(["full"]),
      body: { inputs: [{ shopId: "shop-b" }] },
    })
    // full tokens are not org-restricted (owner question): passes.
    expect(await run(r)).toHaveBeenCalledWith()
    expect(r.user).toEqual(user)
  })

  it("expressAuthentication does not repeat checks the guard passed", async () => {
    const r = req("GET", "/shops/shop-a/customers", {
      token: token(["market:read"], ["org-a"]),
    })
    await run(r)
    state.db = null // any DB use would throw
    await expect(
      expressAuthentication(r as never, "loggedin"),
    ).resolves.toMatchObject({ user_id: "me" })
  })
})

describe("session-only routes: API tokens are refused outright", () => {
  const realTable = () => v2RouteTable()
  const runReal = async (r: Record<string, unknown>) => {
    const next = vi.fn()
    await tokenRequestGuard(realTable)(r as never, {} as never, next)
    return next
  }
  const forbidden = (next: ReturnType<typeof vi.fn>) => {
    expect(next).toHaveBeenCalledTimes(1)
    const err = next.mock.calls[0][0] as Error & { status?: number }
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(403)
  }

  it.each([
    ["GET", "/auth/mfa/status"],
    ["POST", "/auth/mfa/verify"],
    ["POST", "/auth/mfa/totp/enroll"],
    ["DELETE", "/auth/mfa/factors/x"],
    // Public route: a token is not served as anonymous here, it is a 403.
    ["GET", "/debug/feature-flag"],
    ["POST", "/debug/feature-flag"],
  ])("%s %s with any token, even full/admin, is a 403", async (method, path) => {
    for (const scopes of [["readonly"], ["profile:read"], ["full"], ["admin"]]) {
      const r = req(method, path, { token: token(scopes) })
      forbidden(await runReal(r))
    }
  })

  it("the routes exist in the generated spec (the guard covers real paths)", () => {
    expect(matchV2Route(realTable(), "GET", "/auth/mfa/status")?.route.secured).toBe(true)
    expect(matchV2Route(realTable(), "GET", "/debug/feature-flag")?.route.secured).toBe(false)
  })

  it("sessions are untouched", async () => {
    for (const path of ["/auth/mfa/status", "/debug/feature-flag"]) {
      const r = req("GET", path)
      const next = await runReal(r)
      expect(next).toHaveBeenCalledWith()
      expect(r.user).toEqual(user)
    }
  })

  it("expressAuthentication refuses a token on auth/mfa too", async () => {
    const r = req("GET", "/auth/mfa/status", { token: token(["full"]) })
    await expect(expressAuthentication(r as never, "loggedin")).rejects.toMatchObject({
      status: 403,
    })
  })
})
