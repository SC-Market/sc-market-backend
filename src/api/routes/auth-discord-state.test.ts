import { describe, it, expect, beforeEach, vi } from "vitest"
import express, { Request, Response, NextFunction } from "express"
import cookieParser from "cookie-parser"
import request from "supertest"

/**
 * Discord OAuth state must be bound to the browser that started the flow,
 * and account linking needs an explicit "link" intent.
 *
 * Attack this guards against: the attacker starts /auth/discord in their own
 * browser, authorizes with their Discord, stops before the callback and sends
 * the victim the callback URL (code + state). Before the fix the state was
 * only HMAC-checked, so it verified in the victim's browser, and because the
 * victim was logged in the verify callback linked the attacker's Discord to
 * the victim's account (account takeover via "Sign in with Discord").
 */

const h = vi.hoisted(() => ({
  authenticateCalls: [] as {
    strategy: string
    options: Record<string, unknown>
  }[],
  linkProvider: vi.fn(),
  getUser: vi.fn(),
  getUserByProvider: vi.fn(),
}))

vi.mock("passport", () => ({
  default: {
    authenticate: (strategy: string, options: Record<string, unknown>) => {
      h.authenticateCalls.push({ strategy, options })
      return (_req: Request, res: Response) => {
        res.status(200).json({ reachedProvider: true })
      }
    },
  },
}))

vi.mock("./v1/profiles/database.js", () => ({
  getUser: h.getUser,
  linkProvider: h.linkProvider,
  getUserByProvider: h.getUserByProvider,
  updateProviderTokens: vi.fn(),
  getUserProvider: vi.fn(async () => ({ provider_type: "discord" })),
  updateUser: vi.fn(),
}))

vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: {} }))

vi.mock("../middleware/enhanced-ratelimiting.js", () => {
  const pass = (_req: Request, _res: Response, next: NextFunction) => next()
  return {
    authRefreshLimit: pass,
    authInitLimit: pass,
    authCallbackLimit: pass,
    authLogoutLimit: pass,
    authSessionsLimit: pass,
  }
})

process.env.SESSION_SECRET = "test-session-secret"

const { setupAuthRoutes } = await import("./auth-routes.js")
const { createSignedState } = await import("../util/oauth-state.js")
const { createDiscordStrategy } = await import("../util/passport-strategies.js")

function makeApp(loggedInUserId?: string) {
  const app = express()
  app.use(cookieParser())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Minimal stand-ins for express-session and populateUser.
    ;(req as unknown as { session: Record<string, unknown> }).session = {
      save: (cb: (err?: unknown) => void) => cb(),
    }
    if (loggedInUserId) req.user = { user_id: loggedInUserId } as Express.User
    next()
  })
  setupAuthRoutes(app, new URL("http://localhost:3000"))
  return app
}

function cookieValue(res: request.Response, name: string): string | undefined {
  const raw =
    (res.headers["set-cookie"] as unknown as string[] | undefined) || []
  const c = raw.find(
    (x) => x.startsWith(`${name}=`) && !x.startsWith(`${name}=;`),
  )
  return c
    ? decodeURIComponent(c.split(";")[0].slice(name.length + 1))
    : undefined
}

describe("Discord OAuth state binding", () => {
  beforeEach(() => {
    h.authenticateCalls.length = 0
  })

  it("issues an httpOnly nonce cookie that matches the state", async () => {
    const res = await request(makeApp()).get(
      "/auth/discord?action=signin&path=/market",
    )
    expect(res.status).toBe(200)
    const nonce = cookieValue(res, "scmarket.dstate")
    expect(nonce).toBeTruthy()
    const state = h.authenticateCalls[0].options.state as string
    const payload = Buffer.from(state.split(":")[0], "base64url").toString(
      "utf-8",
    )
    expect(payload.split(":")[0]).toBe(nonce)
    const raw = (res.headers["set-cookie"] as unknown as string[]).join(";")
    expect(raw).toMatch(/HttpOnly/i)
  })

  it("rejects a validly signed state replayed in a browser without the nonce", async () => {
    // Attacker minted this in their own browser.
    const { token } = createSignedState(
      "/market",
      "test-session-secret",
      "signin",
    )
    const res = await request(makeApp("victim")).get(
      `/auth/discord/callback?code=attacker-code&state=${encodeURIComponent(token)}`,
    )
    expect(res.status).toBe(302)
    expect(h.authenticateCalls).toHaveLength(0)
  })

  it("rejects a state whose nonce belongs to a different browser", async () => {
    const attacker = createSignedState("/market", "test-session-secret", "link")
    const victim = createSignedState("/market", "test-session-secret", "link")
    const res = await request(makeApp("victim"))
      .get(
        `/auth/discord/callback?code=x&state=${encodeURIComponent(attacker.token)}`,
      )
      .set("Cookie", `scmarket.dstate=${victim.nonce}`)
    expect(res.status).toBe(302)
    expect(h.authenticateCalls).toHaveLength(0)
  })

  it("accepts the callback in the browser that started the flow", async () => {
    const { token, nonce } = createSignedState(
      "/market",
      "test-session-secret",
      "signin",
    )
    const res = await request(makeApp())
      .get(`/auth/discord/callback?code=x&state=${encodeURIComponent(token)}`)
      .set("Cookie", `scmarket.dstate=${nonce}`)
    expect(res.status).toBe(200)
    expect(h.authenticateCalls).toHaveLength(1)
  })

  it("refuses to start a link flow when logged out", async () => {
    const res = await request(makeApp()).get(
      "/auth/discord?action=link&path=/onboarding",
    )
    expect(res.status).toBe(401)
    expect(h.authenticateCalls).toHaveLength(0)
  })
})

describe("Discord verify callback linking intent", () => {
  type Verify = (
    req: unknown,
    at: string,
    rt: string,
    profile: unknown,
    cb: (err: unknown, user?: unknown) => void,
  ) => Promise<void>
  const verify = (
    createDiscordStrategy(new URL("http://localhost:7000")) as unknown as {
      _verify: Verify
    }
  )._verify

  const profile = {
    id: "attacker-discord",
    username: "atk",
    discriminator: "0",
  }

  beforeEach(() => {
    h.linkProvider.mockReset()
    h.getUser.mockReset()
    h.getUserByProvider.mockReset()
  })

  function run(req: unknown) {
    return new Promise<{ err: unknown; user: unknown }>((resolve) => {
      void verify(req, "at", "rt", profile, (err, user) =>
        resolve({ err, user }),
      )
    })
  }

  it("does not link Discord to a logged-in user without a link intent", async () => {
    h.getUserByProvider.mockResolvedValue({ user_id: "attacker" })
    const { user } = await run({
      isAuthenticated: () => true,
      user: { user_id: "victim" },
      session: { discord_auth_action: "signin" },
    })
    expect(h.linkProvider).not.toHaveBeenCalled()
    expect((user as { user_id: string }).user_id).toBe("attacker")
  })

  it("links only with an explicit link intent and a logged-in user", async () => {
    h.getUser.mockResolvedValue({ user_id: "victim" })
    await run({
      isAuthenticated: () => true,
      user: { user_id: "victim" },
      session: { discord_auth_action: "link" },
    })
    expect(h.linkProvider).toHaveBeenCalledWith("victim", expect.anything())
  })

  it("errors on a link intent without a logged-in user", async () => {
    const { err } = await run({
      isAuthenticated: () => false,
      session: { discord_auth_action: "link" },
    })
    expect(err).toBeTruthy()
    expect(h.linkProvider).not.toHaveBeenCalled()
  })
})
