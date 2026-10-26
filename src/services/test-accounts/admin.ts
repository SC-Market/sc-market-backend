/**
 * Creating, listing and deleting test accounts (admin only, behind a fresh
 * step-up; see api/routes/v2/admin/TestAccountsController.ts).
 *
 * A test account has accounts.is_test, role "user" (DB CHECK), no OAuth
 * provider (it can only sign in through POST /api/auth/test-login), and one
 * confirmed TOTP factor whose secret is returned once, at creation.
 * rsi_confirmed is set so agents can exercise "verified" flows (listing,
 * buying); it is meaningless outside the test realm, which real users never
 * see.
 */

import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import { SiteRole } from "../../api/util/site-role.js"
import { revokeAllUserRefreshTokens } from "../../api/util/jwt.js"
import { auditLogService } from "../audit-log/audit-log.service.js"
import { getMfaService } from "../mfa/instance.js"
import type { ReqCtx } from "../mfa/service.js"

/** Test usernames start with "test" so they are recognisable everywhere. */
export const TEST_USERNAME_RE = /^test[a-z0-9_-]{2,36}$/i

export interface CreatedTestAccount {
  user_id: string
  username: string
  display_name: string
  otpauth_uri: string
  /** Base32 secret, no spaces. Shown once. */
  secret: string
  /** Same secret grouped by 4 for manual entry. */
  manual_key: string
  qr_data_url: string
}

export interface TestAccountSummary {
  user_id: string
  username: string
  display_name: string
  created_at: string
  banned: boolean
  has_authenticator: boolean
  last_login_at: string | null
  failed_logins_24h: number
}

export function validateTestAccountInput(username: string, displayName: string) {
  const u = (username ?? "").trim()
  const d = (displayName ?? "").trim()
  if (!TEST_USERNAME_RE.test(u)) {
    throw new BusinessLogicError(
      ErrorCode.VALIDATION_ERROR,
      'Username must start with "test", then 2-36 letters, digits, "-" or "_"',
    )
  }
  if (d.length < 1 || d.length > 100) {
    throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "Display name must be 1-100 characters")
  }
  return { username: u, displayName: d }
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; nativeError?: { code?: string } }
  return e?.code === "23505" || e?.nativeError?.code === "23505"
}

export async function createTestAccount(
  input: { username: string; display_name: string },
  actorId: string,
  ctx: ReqCtx,
  knex: Knex = getKnex(),
): Promise<CreatedTestAccount> {
  const { username, displayName } = validateTestAccountInput(input.username, input.display_name)

  const clash = await knex("accounts").whereRaw("lower(username) = lower(?)", [username]).first("user_id")
  if (clash) throw new BusinessLogicError(ErrorCode.CONFLICT, "That username is taken")

  let user: { user_id: string; username: string }
  try {
    user = await knex.transaction(async (trx) => {
      const [row] = await trx("accounts")
        .insert({
          username,
          display_name: displayName,
          is_test: true,
          role: SiteRole.User,
          rsi_confirmed: true,
          discord_id: null,
        })
        .returning(["user_id", "username"])
      await trx("account_settings").insert({ user_id: row.user_id })
      return row
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw new BusinessLogicError(ErrorCode.CONFLICT, "That username is taken")
    throw err
  }

  let enrolled
  try {
    enrolled = await getMfaService().enrollConfirmedFactor(user, "totp", "Test login", actorId, ctx)
  } catch (err) {
    // No half-made accounts: an account without a factor could never log in.
    await knex("accounts").where({ user_id: user.user_id, is_test: true }).del().catch(() => {})
    throw err
  }

  await auditLogService.record({
    action: "test_account.created",
    actorId,
    subjectType: "user",
    subjectId: user.user_id,
    metadata: { username },
  })
  logger.warn("[test-accounts] created", { user_id: user.user_id, username, actor_id: actorId })

  const manualKey = enrolled.display.manual_key
  return {
    user_id: user.user_id,
    username: user.username,
    display_name: displayName,
    otpauth_uri: enrolled.display.otpauth_uri,
    secret: manualKey.replace(/\s+/g, ""),
    manual_key: manualKey,
    qr_data_url: enrolled.display.qr_data_url,
  }
}

export async function listTestAccounts(knex: Knex = getKnex()): Promise<TestAccountSummary[]> {
  const rows = await knex("accounts as a")
    .where("a.is_test", true)
    .where("a.is_tombstone", false)
    .select(
      "a.user_id",
      "a.username",
      "a.display_name",
      "a.created_at",
      "a.banned",
      knex.raw(
        `EXISTS (SELECT 1 FROM user_mfa_factors f WHERE f.user_id = a.user_id AND f.confirmed_at IS NOT NULL) AS has_authenticator`,
      ),
      knex.raw(
        `(SELECT MAX(e.created_at) FROM test_login_events e WHERE e.user_id = a.user_id AND e.outcome = 'success') AS last_login_at`,
      ),
      knex.raw(
        `(SELECT COUNT(*)::int FROM test_login_events e WHERE e.user_id = a.user_id AND e.outcome = 'failure' AND e.created_at > NOW() - INTERVAL '24 hours') AS failed_logins_24h`,
      ),
    )
    .orderBy("a.created_at", "asc")
  return rows.map((r: Record<string, unknown>) => ({
    user_id: String(r.user_id),
    username: String(r.username),
    display_name: String(r.display_name),
    created_at: new Date(r.created_at as string).toISOString(),
    banned: r.banned === true,
    has_authenticator: r.has_authenticator === true,
    last_login_at: r.last_login_at ? new Date(r.last_login_at as string).toISOString() : null,
    failed_logins_24h: Number(r.failed_logins_24h ?? 0),
  }))
}

export interface DeleteTestAccountResult {
  /** "deleted": the account and its data are gone. "disabled": something
   * still referenced it, so it was banned, signed out and stripped of its
   * authenticator instead (it stays hidden as a test account). */
  mode: "deleted" | "disabled"
  orgs: number
  shops: number
}

/**
 * Delete a test account with its test orgs (where it is the only member),
 * their shops, listings and its orders. Real accounts are never touched: the
 * lookup requires is_test.
 */
export async function deleteTestAccount(
  username: string,
  actorId: string,
  knex: Knex = getKnex(),
): Promise<DeleteTestAccountResult> {
  const account = await knex("accounts").where({ username, is_test: true }).first("user_id", "username")
  if (!account) throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Test account not found")
  const userId: string = account.user_id

  const counts = { orgs: 0, shops: 0 }
  let mode: DeleteTestAccountResult["mode"] = "deleted"
  try {
    await knex.transaction(async (trx) => {
      const orgIds: string[] = await trx("contractors as c")
        .where("c.is_test", true)
        .whereExists(function () {
          this.select(trx.raw("1")).from("contractor_members as m").whereRaw("m.contractor_id = c.contractor_id").where("m.user_id", userId)
        })
        .whereNotExists(function () {
          this.select(trx.raw("1")).from("contractor_members as m").whereRaw("m.contractor_id = c.contractor_id").whereNot("m.user_id", userId)
        })
        .pluck("c.contractor_id")
      const shopIds: string[] = await trx("shops")
        .where("is_test", true)
        .where(function () {
          this.where("owner_user_id", userId)
          if (orgIds.length) this.orWhereIn("owner_contractor_id", orgIds)
        })
        .pluck("shop_id")
      counts.orgs = orgIds.length
      counts.shops = shopIds.length

      // Orders and offers this account or its shops/orgs are party to (all
      // test parties, by the isolation rules).
      const partyOf = (q: Knex.QueryBuilder) =>
        q.where(function () {
          this.where("customer_id", userId).orWhere("assigned_id", userId)
          if (shopIds.length) this.orWhereIn("shop_id", shopIds)
          if (orgIds.length) this.orWhereIn("contractor_id", orgIds)
        })
      await partyOf(trx("orders")).del()
      await partyOf(trx("offer_sessions")).del()
      if (shopIds.length) {
        await trx("listings").whereIn("shop_id", shopIds).del()
        await trx("shops").whereIn("shop_id", shopIds).del()
      }
      if (orgIds.length) await trx("contractors").whereIn("contractor_id", orgIds).del()
      await trx("accounts").where({ user_id: userId, is_test: true }).del()
    })
  } catch (error) {
    logger.warn("[test-accounts] hard delete failed; disabling instead", { user_id: userId, error })
    mode = "disabled"
    await knex.transaction(async (trx) => {
      await trx("accounts").where({ user_id: userId, is_test: true }).update({ banned: true })
      await trx("user_mfa_factors").where({ user_id: userId }).del()
    })
    await revokeAllUserRefreshTokens(userId)
  }

  await auditLogService.record({
    action: "test_account.deleted",
    actorId,
    subjectType: "user",
    subjectId: userId,
    metadata: { username: account.username, mode, ...counts },
  })
  logger.warn("[test-accounts] deleted", { user_id: userId, username: account.username, mode, actor_id: actorId })
  return { mode, ...counts }
}
