/**
 * POST /api/auth/test-login { username, code }: sign a TEST account in with
 * its TOTP code, for automated browser agents
 * (docs/testing-with-test-accounts.md).
 *
 * - Off unless TEST_LOGIN_ENABLED=true: 404, as if the route did not exist.
 * - Main site only: the request must name an origin (Origin, or Referer) and
 *   it must be sc-market.space itself, never a white-label custom domain or
 *   no origin at all. (The global CSRF check already refuses foreign
 *   origins; this is stricter.) The custom-origin denylist covers it too.
 * - Strict budgets per submitted username and per IP, consumed before the
 *   account is looked up, so they behave the same for every username.
 * - Only accounts with accounts.is_test. Unknown usernames, real accounts,
 *   admins, banned or deleted accounts, wrong, replayed or malformed codes
 *   and locked factors all get the SAME 401 body. The code goes through
 *   MfaService.verify (constant-time check, replay protection, lockout,
 *   per-user and per-IP limiters, user_mfa_events audit).
 * - Every attempt is recorded in test_login_events and logged on one line.
 *   The submitted code is never stored or logged.
 * - Success issues the normal session cookies (issueLoginCookies, the same
 *   helper the OAuth callbacks use). From then on it is a normal session.
 */

import crypto from "node:crypto"
import type { Request, Response } from "express"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import { createErrorResponse } from "../../api/routes/v1/util/response.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { requestOrigin } from "../../api/middleware/csrf.js"
import { isMainSiteOrigin } from "../../api/util/allowed-origins.js"
import { issueLoginCookies } from "../../api/util/login-session.js"
import { isJWTAuthEnabled } from "../../api/util/jwt.js"
import { SiteRole } from "../../api/util/site-role.js"
import type { RateLimiterConfig } from "../../api/middleware/enhanced-ratelimiting.js"
import { getMfaService } from "../mfa/instance.js"
import type { Limiter, MfaService } from "../mfa/service.js"
import { matchStep } from "../mfa/providers/totp.js"
import {
  isTestLoginEnabled,
  TEST_LOGIN_PER_ACCOUNT_PER_HOUR,
  TEST_LOGIN_PER_IP_PER_HOUR,
} from "./config.js"

export const GENERIC_FAILURE_MESSAGE = "Invalid username or code"

export interface TestLoginAccount {
  user_id: string
  username: string
  role: string
  is_test: boolean
  banned: boolean
  is_tombstone: boolean
  deleted_at: Date | null
}

export type TestLoginOutcome = "success" | "failure" | "rate_limited"

export interface TestLoginEvent {
  username: string
  user_id: string | null
  outcome: TestLoginOutcome
  reason: string | null
  ip: string | null
  user_agent: string | null
  origin: string | null
}

export interface TestLoginDeps {
  enabled: () => boolean
  findAccount: (username: string) => Promise<TestLoginAccount | null>
  mfa: () => Pick<MfaService, "verify">
  accountLimiter: Limiter
  ipLimiter: Limiter
  recordEvent: (event: TestLoginEvent) => Promise<void>
  issueSession: (req: Request, res: Response, account: TestLoginAccount) => Promise<void>
}

function lazyLimiter(config: RateLimiterConfig): Limiter {
  let limiter: Promise<Limiter> | null = null
  return {
    async consume(key) {
      limiter ??= import("../../api/middleware/enhanced-ratelimiting.js").then((m) =>
        m.createRateLimiter(config),
      )
      return (await limiter).consume(key)
    },
  }
}

export function defaultTestLoginDeps(): TestLoginDeps {
  return {
    enabled: () => isTestLoginEnabled() && isJWTAuthEnabled(),
    async findAccount(username) {
      const row = await getKnex()("accounts")
        .where({ username })
        .first("user_id", "username", "role", "is_test", "banned", "is_tombstone", "deleted_at")
      return row ?? null
    },
    mfa: getMfaService,
    accountLimiter: lazyLimiter({
      points: TEST_LOGIN_PER_ACCOUNT_PER_HOUR,
      duration: 60 * 60,
      keyPrefix: "scmarket:testlogin:acct",
    }),
    ipLimiter: lazyLimiter({
      points: TEST_LOGIN_PER_IP_PER_HOUR,
      duration: 60 * 60,
      keyPrefix: "scmarket:testlogin:ip",
    }),
    async recordEvent(e) {
      await getKnex()("test_login_events").insert({
        username: e.username.slice(0, 100),
        user_id: e.user_id,
        outcome: e.outcome,
        reason: e.reason,
        ip: e.ip?.slice(0, 64) ?? null,
        user_agent: e.user_agent?.slice(0, 500) ?? null,
        origin: e.origin?.slice(0, 200) ?? null,
      })
    },
    async issueSession(req, res, account) {
      await issueLoginCookies(req, res, {
        user_id: account.user_id,
        username: account.username,
        role: SiteRole.User,
      })
    },
  }
}

/** Why a test account cannot log in, or null when it can. */
function accountProblem(account: TestLoginAccount | null): string | null {
  if (!account) return "unknown_user"
  if (!account.is_test) return "not_test_account"
  // The DB CHECK makes this impossible; refuse anyway.
  if (account.role !== SiteRole.User) return "not_user_role"
  if (account.banned) return "banned"
  if (account.is_tombstone || account.deleted_at) return "deleted"
  return null
}

const DUMMY_SECRET = crypto.randomBytes(20)

export function createTestLoginHandler(deps: TestLoginDeps) {
  return async function testLogin(req: Request, res: Response): Promise<void> {
    res.set("Cache-Control", "no-store")
    if (!deps.enabled()) {
      res.status(404).json(createErrorResponse(ErrorCode.NOT_FOUND, "Not found"))
      return
    }

    const origin = requestOrigin(req)
    const body = (req.body ?? {}) as { username?: unknown; code?: unknown }
    const username = typeof body.username === "string" ? body.username.trim() : ""
    const code = typeof body.code === "string" ? body.code.trim() : ""
    const ctx = {
      ip: req.ip || null,
      userAgent: req.headers["user-agent"]?.toString() || null,
    }

    const record = async (outcome: TestLoginOutcome, reason: string | null, userId: string | null) => {
      const line = { username, user_id: userId, reason, ip: ctx.ip, origin }
      if (outcome === "success") logger.warn("[test-login] success", line)
      else logger.info(`[test-login] ${outcome}`, line)
      try {
        await deps.recordEvent({ ...line, outcome, user_agent: ctx.userAgent })
      } catch (error) {
        logger.error("[test-login] failed to record event", { error })
      }
    }

    if (origin === null || !isMainSiteOrigin(origin)) {
      await record("failure", "origin_not_main_site", null)
      res
        .status(403)
        .json(
          createErrorResponse(
            ErrorCode.FORBIDDEN,
            "This action is only available on sc-market.space",
            { reason: "custom_domain_restricted" },
          ),
        )
      return
    }

    if (username === "" || username.length > 100) {
      res
        .status(400)
        .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "username and code are required"))
      return
    }

    try {
      await deps.ipLimiter.consume(`ip:${ctx.ip ?? "unknown"}`)
      await deps.accountLimiter.consume(`u:${username.toLowerCase()}`)
    } catch {
      await record("rate_limited", "rate_limited", null)
      res
        .status(429)
        .json(createErrorResponse(ErrorCode.RATE_LIMIT_EXCEEDED, "Too many attempts, try again later"))
      return
    }

    const fail = async (reason: string, userId: string | null) => {
      await record("failure", reason, userId)
      res.status(401).json(createErrorResponse(ErrorCode.UNAUTHORIZED, GENERIC_FAILURE_MESSAGE))
    }

    const account = await deps.findAccount(username)
    const problem = accountProblem(account)
    if (problem) {
      // Same TOTP work as a real check, so the answer is not faster.
      matchStep(DUMMY_SECRET, code, Date.now() / 1000)
      return fail(problem, account?.user_id ?? null)
    }

    try {
      await deps.mfa().verify(account!.user_id, { code }, ctx, "verify")
    } catch (error) {
      if (error instanceof BusinessLogicError) {
        return fail(String(error.code).toLowerCase(), account!.user_id)
      }
      throw error
    }

    await deps.issueSession(req, res, account!)
    await record("success", null, account!.user_id)
    res.json({ success: true, username: account!.username })
  }
}

let handler: ReturnType<typeof createTestLoginHandler> | null = null

/** Express handler with the production dependencies. */
export function testLoginHandler(req: Request, res: Response): Promise<void> {
  handler ??= createTestLoginHandler(defaultTestLoginDeps())
  return handler(req, res)
}
