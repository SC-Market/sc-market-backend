/**
 * POST /api/auth/test-login without a database: the kill switch, the origin
 * rule (main site only, custom domains refused by both the custom-origin
 * guard and the handler), the budgets, and that every kind of failure gets
 * the same 401. Codes are checked by the real MfaService (in-memory repo).
 * The Postgres version (real repo, real cookies) is test-accounts.pg.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"

const h = vi.hoisted(() => {
  process.env.FRONTEND_URL = "https://sc-market.space"
  process.env.BACKEND_URL = "https://api.sc-market.space"
  return { logs: [] as unknown[] }
})
vi.mock("../../../logger/logger.js", () => {
  const rec = (level: string) => (...args: unknown[]) => h.logs.push([level, ...args])
  const logger = { info: rec("info"), warn: rec("warn"), error: rec("error"), debug: rec("debug") }
  return { default: logger, logger }
})

import { csrfProtection } from "../../../api/middleware/csrf.js"
import { customOriginGuard, matchCustomOriginDenylist } from "../../../api/middleware/custom-origin.js"
import { isSiteAdmin } from "../../../api/util/site-role.js"
import { parseKeyring } from "../../mfa/config.js"
import { MfaService } from "../../mfa/service.js"
import { codeForStep, stepAt } from "../../mfa/providers/totp.js"
import { aadFor, open } from "../../mfa/crypto.js"
import { memoryRepo } from "../../mfa/__tests__/memory-repo.js"
import { isTestLoginEnabled } from "../config.js"
import {
  createTestLoginHandler,
  GENERIC_FAILURE_MESSAGE,
  type TestLoginAccount,
  type TestLoginDeps,
  type TestLoginEvent,
} from "../test-login.js"

const ring = parseKeyring(JSON.stringify({ k1: Buffer.alloc(32, 3).toString("base64") }), undefined)
if (!ring.ok) throw new Error(ring.reason)
const keyring = ring.keyring
const MAIN = "https://sc-market.space"
const CUSTOM = "https://shop.example.com"

const ACCOUNTS: Record<string, TestLoginAccount> = {
  "test-buyer": { user_id: "u-test", username: "test-buyer", role: "user", is_test: true, banned: false, is_tombstone: false, deleted_at: null },
  "test-banned": { user_id: "u-banned", username: "test-banned", role: "user", is_test: true, banned: true, is_tombstone: false, deleted_at: null },
  alice: { user_id: "u-real", username: "alice", role: "user", is_test: false, banned: false, is_tombstone: false, deleted_at: null },
  boss: { user_id: "u-admin", username: "boss", role: "admin", is_test: false, banned: false, is_tombstone: false, deleted_at: null },
}

function budget(n: number) {
  const used = new Map<string, number>()
  return {
    used,
    async consume(key: string) {
      const v = (used.get(key) ?? 0) + 1
      used.set(key, v)
      if (v > n) throw new Error("limited")
    },
  }
}

async function setup(opts: { accountBudget?: number; ipBudget?: number } = {}) {
  const mem = memoryRepo()
  const free = { consume: async () => undefined }
  const mfa = new MfaService({ repo: mem.repo, keyring: () => keyring, verifyLimiter: free, enrollLimiter: free })
  // Every account has a working authenticator, so only the test-account rule
  // can explain a refusal.
  const factors: Record<string, string> = {}
  for (const a of Object.values(ACCOUNTS)) {
    const { factor_id } = await mfa.enrollConfirmedFactor(a, "totp", "x", "u-admin", { ip: null, userAgent: null })
    factors[a.username] = factor_id
  }
  const codeFor = (username: string, offset = 0) => {
    const f = mem.factors.find((x) => x.id === factors[username])!
    const secret = open(f.secret_ciphertext!, aadFor(f.id, f.user_id, f.type), keyring)
    return codeForStep(secret, stepAt(Date.now() / 1000) + offset)
  }
  const events: TestLoginEvent[] = []
  const sessions: string[] = []
  const accountLimiter = budget(opts.accountBudget ?? 100)
  const ipLimiter = budget(opts.ipBudget ?? 100)
  const deps: TestLoginDeps = {
    enabled: isTestLoginEnabled,
    findAccount: async (u) => ACCOUNTS[u] ?? null,
    mfa: () => mfa,
    accountLimiter,
    ipLimiter,
    recordEvent: async (e) => void events.push(e),
    issueSession: async (_req, res, account) => {
      sessions.push(account.user_id)
      res.cookie("scmarket.access", "jwt-for-" + account.user_id)
    },
  }
  const app = express()
  app.use(express.json())
  app.use(csrfProtection({ isOriginAllowed: (o) => [MAIN, CUSTOM].includes(o) }))
  app.use(customOriginGuard)
  const handler = createTestLoginHandler(deps)
  app.post("/api/auth/test-login", (req, res, next) => {
    handler(req, res).catch(next)
  })
  // The handler alone, without the guards in front of it.
  app.post("/bare/test-login", (req, res, next) => {
    handler(req, res).catch(next)
  })
  const login = (username: string, code: string, origin: string | null = MAIN, path = "/api/auth/test-login") => {
    const r = request(app).post(path)
    if (origin) r.set("Origin", origin)
    return r.send({ username, code })
  }
  return { login, codeFor, events, sessions, mem, accountLimiter }
}

beforeEach(() => {
  process.env.TEST_LOGIN_ENABLED = "true"
  h.logs.length = 0
})

describe("POST /api/auth/test-login", () => {
  it("signs a test account in with a valid code", async () => {
    const t = await setup()
    const res = await t.login("test-buyer", t.codeFor("test-buyer"))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, username: "test-buyer" })
    expect(res.headers["cache-control"]).toBe("no-store")
    expect(t.sessions).toEqual(["u-test"])
    expect(t.events.map((e) => [e.outcome, e.reason])).toEqual([["success", null]])
  })

  it("answers real accounts, admins, unknown names, banned accounts, wrong, malformed and replayed codes with the same 401", async () => {
    const t = await setup()
    const good = t.codeFor("test-buyer")
    expect((await t.login("test-buyer", good)).status).toBe(200)
    const outcomes = [
      await t.login("test-buyer", good), // replay
      await t.login("test-buyer", t.codeFor("test-buyer", 4)), // wrong
      await t.login("test-buyer", "abc"), // malformed
      await t.login("alice", t.codeFor("alice")), // real account, its own valid code
      await t.login("boss", t.codeFor("boss")), // admin, its own valid code
      await t.login("test-banned", t.codeFor("test-banned")),
      await t.login("no-such-user", "123456"),
    ]
    for (const res of outcomes) {
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: GENERIC_FAILURE_MESSAGE } })
      expect(res.headers["set-cookie"]).toBeUndefined()
    }
    expect(t.sessions).toEqual(["u-test"])
    expect(t.events.map((e) => e.reason)).toEqual([
      null,
      "mfa_invalid_code",
      "mfa_invalid_code",
      "mfa_invalid_code",
      "not_test_account",
      "not_test_account",
      "banned",
      "unknown_user",
    ])
  })

  it("a locked factor fails with the same 401, even with the right code", async () => {
    const t = await setup()
    for (let i = 0; i < 5; i++) await t.login("test-buyer", "000000")
    const res = await t.login("test-buyer", t.codeFor("test-buyer"))
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe(GENERIC_FAILURE_MESSAGE)
    expect(t.events.at(-1)?.reason).toBe("mfa_locked")
  })

  it("applies the per-username budget before the lookup, identically for any name", async () => {
    const t = await setup({ accountBudget: 2 })
    for (const name of ["test-buyer", "alice", "no-such-user"]) {
      await t.login(name, "000000")
      await t.login(name, "000000")
      const third = await t.login(name, "000000")
      expect(third.status).toBe(429)
      expect(third.body.error.code).toBe("RATE_LIMIT_EXCEEDED")
    }
    // Case-insensitive key: TEST-BUYER shares test-buyer's budget.
    expect((await t.login("TEST-BUYER", t.codeFor("test-buyer"))).status).toBe(429)
  })

  it("applies the per-IP budget", async () => {
    const t = await setup({ ipBudget: 1 })
    await t.login("a", "000000")
    expect((await t.login("b", "000000")).status).toBe(429)
  })

  it("kill switch: off unless TEST_LOGIN_ENABLED is exactly \"true\"", async () => {
    const t = await setup()
    for (const v of [undefined, "", "1", "TRUE", "True", "yes", "on"]) {
      if (v === undefined) delete process.env.TEST_LOGIN_ENABLED
      else process.env.TEST_LOGIN_ENABLED = v
      const res = await t.login("test-buyer", t.codeFor("test-buyer"))
      expect(res.status).toBe(404)
    }
    expect(t.sessions).toEqual([])
    expect(t.events).toEqual([])
    process.env.TEST_LOGIN_ENABLED = "true"
    expect((await t.login("test-buyer", t.codeFor("test-buyer"))).status).toBe(200)
  })

  it("only from the main site: custom domains, foreign origins and no origin are refused", async () => {
    const t = await setup()
    const code = t.codeFor("test-buyer")
    const custom = await t.login("test-buyer", code, CUSTOM)
    expect(custom.status).toBe(403)
    expect(custom.body.error.details).toEqual({ reason: "custom_domain_restricted" })
    expect(matchCustomOriginDenylist("POST", "/api/auth/test-login")?.why).toBe("test-account login")
    // The handler refuses them by itself too.
    expect((await t.login("test-buyer", code, CUSTOM, "/bare/test-login")).status).toBe(403)
    expect((await t.login("test-buyer", code, "https://evil.example")).status).toBe(403)
    expect((await t.login("test-buyer", code, null)).status).toBe(403)
    expect((await t.login("test-buyer", code, null, "/bare/test-login")).status).toBe(403)
    expect(t.sessions).toEqual([])
    expect((await t.login("test-buyer", code, MAIN)).status).toBe(200)
  })

  it("never logs or records the submitted code", async () => {
    const t = await setup()
    const good = t.codeFor("test-buyer")
    const bad = t.codeFor("test-buyer", 5)
    await t.login("test-buyer", bad)
    await t.login("alice", t.codeFor("alice"))
    await t.login("test-buyer", good)
    const everything = JSON.stringify([h.logs, t.events, t.mem.events])
    expect(everything).not.toContain(good)
    expect(everything).not.toContain(bad)
    expect(everything).not.toContain(t.codeFor("alice"))
    expect(h.logs.filter((l) => String((l as unknown[])[1]).startsWith("[test-login]"))).toHaveLength(3)
  })
})

describe("test accounts are never admins", () => {
  it("isSiteAdmin is false for a test account, whatever its role says", () => {
    expect(isSiteAdmin({ role: "admin", is_test: true })).toBe(false)
    expect(isSiteAdmin({ role: "admin", is_test: false })).toBe(true)
    expect(isSiteAdmin({ role: "admin" })).toBe(true)
    expect(isSiteAdmin({ role: "user", is_test: true })).toBe(false)
  })
})
