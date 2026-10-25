import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import express, { Request, Response, NextFunction } from "express"
import cookieParser from "cookie-parser"
import request from "supertest"
import type { User } from "./v1/api-models.js"

/**
 * GET /api/auth/session — the silent app-start session check.
 *
 * Runs the real populateUser middleware and the real JWT helpers (signing /
 * verification / cookie layout). Only the DB-touching pieces are stubbed:
 * refresh-token rotation, the user lookup and the Postgres-backed rate
 * limiter (replaced by a recorder so the test can assert which bucket the
 * route is charged to).
 */

const h = vi.hoisted(() => ({
  users: new Map<string, User>(),
  /** raw refresh token → user_id for tokens rotateRefreshToken accepts */
  refreshTokens: new Map<string, string>(),
  rotations: [] as string[],
  limiterHits: [] as string[],
  rotateThrows: false,
}))

vi.mock("./v1/profiles/database.js", () => ({
  getUser: vi.fn(async ({ user_id }: { user_id: string }) => {
    const user = h.users.get(user_id)
    if (!user) throw new Error("Invalid user!")
    return user
  }),
}))

vi.mock("../util/jwt.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../util/jwt.js")>()
  return {
    ...original,
    rotateRefreshToken: vi.fn(async (raw: string) => {
      if (h.rotateThrows) throw new Error("db down")
      h.rotations.push(raw)
      const userId = h.refreshTokens.get(raw)
      if (!userId) return null
      h.refreshTokens.delete(raw)
      const newRawToken = `rotated-${h.rotations.length}`
      h.refreshTokens.set(newRawToken, userId)
      return { newRawToken, userId }
    }),
  }
})

vi.mock("../middleware/enhanced-ratelimiting.js", () => {
  const recorder =
    (name: string) => (_req: Request, _res: Response, next: NextFunction) => {
      h.limiterHits.push(name)
      next()
    }
  return {
    authRefreshLimit: recorder("authRefreshLimit"),
    authInitLimit: recorder("authInitLimit"),
    authCallbackLimit: recorder("authCallbackLimit"),
    authLogoutLimit: recorder("authLogoutLimit"),
    authSessionsLimit: recorder("authSessionsLimit"),
  }
})

const { setupAuthRoutes } = await import("./auth-routes.js")
const { populateUser } = await import("../middleware/populate-user.js")
const { generateAccessToken } = await import("../util/jwt.js")

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    username: "alice",
    display_name: "Alice",
    role: "user",
    banned: false,
    rsi_confirmed: true,
    ...overrides,
  } as User
}

/**
 * Express app with the same middleware order server.ts uses: cookies, a
 * stand-in for passport.session() (an `x-test-session-user` header plays the
 * legacy scmarket.sid session), populateUser, then the auth routes.
 */
function makeApp() {
  const app = express()
  app.use(cookieParser())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const sessionUserId = req.headers["x-test-session-user"]
    if (typeof sessionUserId === "string") {
      req.user = h.users.get(sessionUserId)
    }
    next()
  })
  app.use(populateUser)
  setupAuthRoutes(app, new URL("http://localhost:3000"))
  return app
}

function setCookies(res: request.Response): string[] {
  const raw = res.headers["set-cookie"] as unknown
  if (!raw) return []
  return Array.isArray(raw) ? (raw as string[]) : [raw as string]
}

/** Cookies set with a non-empty value (i.e. not clearCookie). */
function issuedCookie(res: request.Response, name: string): string | undefined {
  return setCookies(res).find(
    (c) => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`),
  )
}

function clearedCookie(res: request.Response, name: string): boolean {
  return setCookies(res).some((c) => c.startsWith(`${name}=;`))
}

// config/env.ts exports process.env itself, so mutate keys in place —
// reassigning process.env would leave `env` pointing at the old object.
const ENV_KEYS = ["SESSION_SECRET", "JWT_SECRET", "JWT_AUTH_ENABLED"] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
}

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret"
    process.env.JWT_SECRET = "test-jwt-secret"
    delete process.env.JWT_AUTH_ENABLED
    h.users.clear()
    h.refreshTokens.clear()
    h.rotations.length = 0
    h.limiterHits.length = 0
    h.rotateThrows = false
  })

  afterEach(restoreEnv)

  it("anonymous (no cookies) → 200 { authenticated: false }, no-store, nothing cleared", async () => {
    const res = await request(makeApp()).get("/api/auth/session")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ authenticated: false })
    expect(res.headers["cache-control"]).toBe("no-store")
    expect(setCookies(res)).toEqual([])
    expect(h.rotations).toEqual([])
  })

  it("is charged to the auth refresh rate-limit bucket", async () => {
    await request(makeApp()).get("/api/auth/session")
    expect(h.limiterHits).toEqual(["authRefreshLimit"])
  })

  it("valid access token → 200 { authenticated: true } without rotating", async () => {
    const user = makeUser()
    h.users.set(user.user_id, user)
    h.refreshTokens.set("refresh-1", user.user_id)
    const access = generateAccessToken(user)

    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", [`scmarket.access=${access}`, "scmarket.refresh=refresh-1"])

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ authenticated: true })
    expect(h.rotations).toEqual([])
    expect(setCookies(res)).toEqual([])
  })

  it("expired access + valid refresh → 200 true, rotates and sets new cookies", async () => {
    const user = makeUser()
    h.users.set(user.user_id, user)
    h.refreshTokens.set("refresh-1", user.user_id)

    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", ["scmarket.access=not-a-valid-jwt", "scmarket.refresh=refresh-1"])

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ authenticated: true })
    expect(h.rotations).toEqual(["refresh-1"])

    const access = issuedCookie(res, "scmarket.access")
    const refresh = issuedCookie(res, "scmarket.refresh")
    expect(access).toBeDefined()
    expect(access).toMatch(/Path=\//)
    expect(access).toMatch(/HttpOnly/)
    expect(refresh).toMatch(/^scmarket\.refresh=rotated-1;/)
    expect(refresh).toMatch(/Path=\/api\/auth/)

    // The new access cookie authenticates on the next call without rotating.
    const newAccess = access!.split(";")[0]
    const again = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", [newAccess])
    expect(again.body).toEqual({ authenticated: true })
    expect(h.rotations).toEqual(["refresh-1"])
  })

  it("no access cookie + valid refresh → 200 true (same rotation as POST /api/auth/refresh)", async () => {
    const user = makeUser()
    h.users.set(user.user_id, user)
    h.refreshTokens.set("refresh-1", user.user_id)

    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", ["scmarket.refresh=refresh-1"])

    expect(res.body).toEqual({ authenticated: true })
    expect(issuedCookie(res, "scmarket.refresh")).toMatch(/rotated-1/)
  })

  it("invalid refresh → 200 false and clears the auth cookies (as refresh does)", async () => {
    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", ["scmarket.refresh=bogus"])

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ authenticated: false })
    expect(h.rotations).toEqual(["bogus"])
    expect(clearedCookie(res, "scmarket.access")).toBe(true)
    expect(clearedCookie(res, "scmarket.refresh")).toBe(true)
    expect(issuedCookie(res, "scmarket.access")).toBeUndefined()
  })

  it("banned user with a valid refresh → 200 false and cookies cleared", async () => {
    const user = makeUser({ banned: true })
    h.users.set(user.user_id, user)
    h.refreshTokens.set("refresh-1", user.user_id)

    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", ["scmarket.refresh=refresh-1"])

    expect(res.body).toEqual({ authenticated: false })
    expect(clearedCookie(res, "scmarket.access")).toBe(true)
    expect(issuedCookie(res, "scmarket.access")).toBeUndefined()
  })

  it("banned user with a still-valid access token → 200 false", async () => {
    const user = makeUser({ banned: true })
    h.users.set(user.user_id, user)
    const access = generateAccessToken(user)

    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", [`scmarket.access=${access}`])

    expect(res.body).toEqual({ authenticated: false })
  })

  it("deleted (tombstoned) user with a valid refresh → 200 false", async () => {
    const user = makeUser({ is_tombstone: true })
    h.users.set(user.user_id, user)
    h.refreshTokens.set("refresh-1", user.user_id)

    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", ["scmarket.refresh=refresh-1"])

    expect(res.body).toEqual({ authenticated: false })
  })

  it("refresh token for a user that no longer exists → 200 false", async () => {
    h.refreshTokens.set("refresh-1", "00000000-0000-0000-0000-00000000dead")

    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", ["scmarket.refresh=refresh-1"])

    expect(res.body).toEqual({ authenticated: false })
    expect(clearedCookie(res, "scmarket.refresh")).toBe(true)
  })

  it("rotation DB failure → 503 (frontend falls back to probing)", async () => {
    h.rotateThrows = true
    const res = await request(makeApp())
      .get("/api/auth/session")
      .set("Cookie", ["scmarket.refresh=refresh-1"])

    expect(res.status).toBe(503)
    expect(res.headers["cache-control"]).toBe("no-store")
  })

  describe("legacy session mode (JWT_AUTH_ENABLED=false)", () => {
    beforeEach(() => {
      process.env.JWT_AUTH_ENABLED = "false"
    })

    it("session user → 200 true", async () => {
      const user = makeUser()
      h.users.set(user.user_id, user)

      const res = await request(makeApp())
        .get("/api/auth/session")
        .set("x-test-session-user", user.user_id)

      expect(res.body).toEqual({ authenticated: true })
    })

    it("banned session user → 200 false", async () => {
      const user = makeUser({ banned: true })
      h.users.set(user.user_id, user)

      const res = await request(makeApp())
        .get("/api/auth/session")
        .set("x-test-session-user", user.user_id)

      expect(res.body).toEqual({ authenticated: false })
    })

    it("no session → 200 false and a refresh cookie is ignored (no rotation)", async () => {
      const user = makeUser()
      h.users.set(user.user_id, user)
      h.refreshTokens.set("refresh-1", user.user_id)

      const res = await request(makeApp())
        .get("/api/auth/session")
        .set("Cookie", ["scmarket.refresh=refresh-1"])

      expect(res.body).toEqual({ authenticated: false })
      expect(h.rotations).toEqual([])
      expect(setCookies(res)).toEqual([])
    })
  })
})

describe("POST /api/auth/refresh (behaviour preserved after extracting the rotation)", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret"
    process.env.JWT_SECRET = "test-jwt-secret"
    delete process.env.JWT_AUTH_ENABLED
    h.users.clear()
    h.refreshTokens.clear()
    h.rotations.length = 0
    h.rotateThrows = false
  })

  afterEach(restoreEnv)

  it("no refresh cookie → 401", async () => {
    const res = await request(makeApp()).post("/api/auth/refresh")
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: "No refresh token" })
  })

  it("valid refresh → 200 success with rotated cookies", async () => {
    const user = makeUser()
    h.users.set(user.user_id, user)
    h.refreshTokens.set("refresh-1", user.user_id)
    const res = await request(makeApp())
      .post("/api/auth/refresh")
      .set("Cookie", ["scmarket.refresh=refresh-1"])
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(issuedCookie(res, "scmarket.refresh")).toMatch(/rotated-1/)
  })

  it("invalid refresh → 401 and cookies cleared", async () => {
    const res = await request(makeApp())
      .post("/api/auth/refresh")
      .set("Cookie", ["scmarket.refresh=bogus"])
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: "Invalid or expired refresh token" })
    expect(clearedCookie(res, "scmarket.refresh")).toBe(true)
  })

  it("banned → 403 and cookies cleared", async () => {
    const user = makeUser({ banned: true })
    h.users.set(user.user_id, user)
    h.refreshTokens.set("refresh-1", user.user_id)
    const res = await request(makeApp())
      .post("/api/auth/refresh")
      .set("Cookie", ["scmarket.refresh=refresh-1"])
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: "Account suspended" })
    expect(clearedCookie(res, "scmarket.access")).toBe(true)
  })

  it("JWT disabled → 404", async () => {
    process.env.JWT_AUTH_ENABLED = "false"
    const res = await request(makeApp()).post("/api/auth/refresh")
    expect(res.status).toBe(404)
  })
})
