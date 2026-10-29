/**
 * Admin identity tool (Admin -> Identity): look up an account by any of its
 * identifiers and fix identity conflicts by hand. See
 * drafts/scmarket-identity-admin.md.
 *
 * Owner rules:
 * - Linked identities (Discord, Citizen iD, Spectrum id) never move between
 *   accounts. An action only ever removes or sets a value on ONE account;
 *   setting a value another account holds is refused.
 * - Every action takes a reason and writes an audit_logs row in the same
 *   transaction as the change: if the audit write fails, nothing changes.
 * - Site admins, test accounts (Admin -> Test accounts) and tombstones
 *   (deleted accounts, already anonymized) can't be changed here.
 *
 * Authorization (admin, strict two-factor step-up) is the controller's job
 * (AdminIdentityController); this module trusts its caller.
 */

import crypto from "node:crypto"
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import { isSiteAdmin } from "../../api/util/site-role.js"

export type IdentityActionKind =
  | "username_released"
  | "discord_unlinked"
  | "spectrum_cleared"
  | "spectrum_set"
  | "account_deactivated"
  | "account_reactivated"

/** audit_logs.action for each kind ("identity." prefix). */
export const AUDIT_ACTION_PREFIX = "identity."
export function auditAction(kind: IdentityActionKind): string {
  return `${AUDIT_ACTION_PREFIX}${kind}`
}
export function kindFromAuditAction(action: string): IdentityActionKind | null {
  if (!action.startsWith(AUDIT_ACTION_PREFIX)) return null
  const kind = action.slice(AUDIT_ACTION_PREFIX.length)
  return (IDENTITY_ACTION_KINDS as readonly string[]).includes(kind)
    ? (kind as IdentityActionKind)
    : null
}
export const IDENTITY_ACTION_KINDS = [
  "username_released",
  "discord_unlinked",
  "spectrum_cleared",
  "spectrum_set",
  "account_deactivated",
  "account_reactivated",
] as const satisfies readonly IdentityActionKind[]

export const REASON_MIN = 5
export const REASON_MAX = 500
/** Spectrum user ids are numeric strings (accounts.spectrum_user_id varchar(50)). */
export const SPECTRUM_ID_RE = /^[0-9]{1,20}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DISCORD_ID_RE = /^[0-9]{5,25}$/
export const SEARCH_LIMIT = 25

export interface IdentityActor {
  user_id: string
}

export interface ActionResult {
  audit_log_id: string
  kind: IdentityActionKind
  /** Shown to the affected user (never the reason). */
  notice: { old_username?: string; new_username?: string }
}

interface LockedAccount {
  user_id: string
  username: string
  display_name: string
  role: string
  rsi_confirmed: boolean
  spectrum_user_id: string | null
  discord_id: string | number | null
  banned: boolean
  is_test: boolean
  is_tombstone: boolean
}

interface ProviderRow {
  provider_type: string
  provider_id: string
  is_primary: boolean
  metadata: Record<string, unknown> | null
}

function conflict(message: string, details?: Record<string, unknown>): never {
  throw new BusinessLogicError(ErrorCode.CONFLICT, message, details)
}

export function validateReason(raw: string | undefined): string {
  const reason = (raw ?? "").trim()
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new BusinessLogicError(
      ErrorCode.VALIDATION_ERROR,
      `A reason of ${REASON_MIN} to ${REASON_MAX} characters is required`,
    )
  }
  return reason
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  )
}

/** Locks the target row and applies the "never here" rules. */
async function lockTarget(trx: Knex, userId: string): Promise<LockedAccount> {
  const row = (await trx("accounts")
    .where({ user_id: userId })
    .forUpdate()
    .first(
      "user_id",
      "username",
      "display_name",
      "role",
      "rsi_confirmed",
      "spectrum_user_id",
      "discord_id",
      "banned",
      "is_test",
      "is_tombstone",
    )) as LockedAccount | undefined
  if (!row) throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Account not found")
  if (row.is_tombstone) {
    conflict("This account was deleted; its identities are already released")
  }
  if (row.is_test) {
    conflict("Test accounts are managed in Admin -> Test accounts")
  }
  if (isSiteAdmin(row)) {
    throw new BusinessLogicError(
      ErrorCode.FORBIDDEN,
      "Site admin accounts can't be changed with this tool",
    )
  }
  return row
}

async function writeAudit(
  trx: Knex,
  actor: IdentityActor,
  userId: string,
  kind: IdentityActionKind,
  reason: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<string> {
  // Not auditLogService.record(): that one swallows errors, and here a
  // missing audit row must roll the change back.
  const [row] = await trx("audit_logs")
    .insert({
      action: auditAction(kind),
      actor_id: actor.user_id,
      subject_type: "user",
      subject_id: userId,
      metadata: { reason, before, after },
    })
    .returning(["audit_log_id"])
  return String((row as { audit_log_id: string }).audit_log_id)
}

/** A free `user_<8 hex>` username (the same shape new accounts fall back to). */
export async function placeholderUsername(
  db: Knex,
  random: () => string = () => crypto.randomBytes(4).toString("hex"),
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `user_${random()}`
    const taken = await db("accounts").where({ username: candidate }).first("user_id")
    if (!taken) return candidate
  }
  throw new Error("Could not find a free placeholder username")
}

type TrxRunner = <T>(fn: (trx: Knex) => Promise<T>) => Promise<T>
const defaultRunner: TrxRunner = (fn) => getKnex().transaction((trx) => fn(trx))

/**
 * Release the account's username: rename it to a free placeholder (and the
 * display name too when it is the same handle), so the handle's real owner
 * can sign up or verify with it. Nothing else changes; the holder gets their
 * own current RSI handle back with "Sync handle" in Settings.
 */
export async function releaseUsername(
  actor: IdentityActor,
  userId: string,
  rawReason: string,
  run: TrxRunner = defaultRunner,
): Promise<ActionResult> {
  const reason = validateReason(rawReason)
  return run(async (trx) => {
    const row = await lockTarget(trx, userId)
    const username = await placeholderUsername(trx)
    const sameDisplay = row.display_name.toLowerCase() === row.username.toLowerCase()
    const update = { username, ...(sameDisplay ? { display_name: username } : {}) }
    try {
      await trx("accounts").where({ user_id: userId }).update(update)
    } catch (error) {
      if (isUniqueViolation(error)) conflict("The placeholder username was just taken; try again")
      throw error
    }
    const audit_log_id = await writeAudit(
      trx,
      actor,
      userId,
      "username_released",
      reason,
      { username: row.username, display_name: row.display_name },
      update,
    )
    return {
      audit_log_id,
      kind: "username_released" as const,
      notice: { old_username: row.username, new_username: username },
    }
  })
}

/** Login providers (test accounts use TOTP, but they are refused here anyway). */
const LOGIN_PROVIDERS = ["discord", "citizenid"]

/**
 * Unlink Discord: delete the Discord provider and clear the legacy
 * accounts.discord_id column (and its old tokens), so that Discord account
 * can sign up or link elsewhere. Refused when Discord is the only way to log
 * in, unless allowNoLogin says the admin means to leave the account without
 * one.
 */
export async function unlinkDiscord(
  actor: IdentityActor,
  userId: string,
  rawReason: string,
  allowNoLogin: boolean,
  run: TrxRunner = defaultRunner,
): Promise<ActionResult> {
  const reason = validateReason(rawReason)
  return run(async (trx) => {
    const row = await lockTarget(trx, userId)
    const providers = (await trx("account_providers")
      .where({ user_id: userId })
      .forUpdate()
      .select("provider_type", "provider_id", "is_primary", "metadata")) as ProviderRow[]
    const discord = providers.find((p) => p.provider_type === "discord")
    const legacyId = row.discord_id === null || row.discord_id === undefined ? null : String(row.discord_id)
    if (!discord && legacyId === null) conflict("No Discord account is linked")

    const otherLogins = providers.filter(
      (p) => p.provider_type !== "discord" && LOGIN_PROVIDERS.includes(p.provider_type),
    )
    if (discord && otherLogins.length === 0 && !allowNoLogin) {
      conflict(
        "Discord is this account's only login method. Confirm that the account may be left without one.",
        { no_login_method: true },
      )
    }

    if (discord) {
      await trx("account_providers").where({ user_id: userId, provider_type: "discord" }).del()
      if (discord.is_primary && otherLogins.length > 0 && !otherLogins.some((p) => p.is_primary)) {
        await trx("account_providers")
          .where({ user_id: userId, provider_type: otherLogins[0].provider_type })
          .update({ is_primary: true })
      }
    }
    await trx("accounts").where({ user_id: userId }).update({
      discord_id: null,
      discord_access_token: "",
      discord_refresh_token: "",
    })

    const discordUsername =
      discord?.metadata && typeof discord.metadata.username === "string"
        ? discord.metadata.username
        : null
    const audit_log_id = await writeAudit(
      trx,
      actor,
      userId,
      "discord_unlinked",
      reason,
      {
        discord_provider_id: discord?.provider_id ?? null,
        discord_username: discordUsername,
        discord_id_column: legacyId,
      },
      { discord_provider_id: null, discord_id_column: null, left_without_login: otherLogins.length === 0 },
    )
    return { audit_log_id, kind: "discord_unlinked" as const, notice: {} }
  })
}

export type SpectrumFix =
  | { mode: "clear" }
  | { mode: "set"; spectrum_user_id: string }

/**
 * Fix the Spectrum link on ONE account:
 * - clear: spectrum_user_id NULL and rsi_confirmed false (refused while
 *   Citizen iD is linked: it is the authoritative RSI source, as in the
 *   user's own unlink);
 * - set: write a Spectrum id no other account holds (refused otherwise; an
 *   id is never moved). rsi_confirmed is left as it is.
 */
export async function fixSpectrum(
  actor: IdentityActor,
  userId: string,
  rawReason: string,
  fix: SpectrumFix,
  run: TrxRunner = defaultRunner,
): Promise<ActionResult> {
  const reason = validateReason(rawReason)
  if (fix.mode === "set" && !SPECTRUM_ID_RE.test(fix.spectrum_user_id)) {
    throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "A Spectrum id is digits only")
  }
  return run(async (trx) => {
    const row = await lockTarget(trx, userId)
    const before = { spectrum_user_id: row.spectrum_user_id, rsi_confirmed: row.rsi_confirmed }

    if (fix.mode === "clear") {
      if (row.spectrum_user_id === null && !row.rsi_confirmed) conflict("No Spectrum link to clear")
      const citizenId = await trx("account_providers")
        .where({ user_id: userId, provider_type: "citizenid" })
        .first("provider_id")
      if (citizenId) {
        conflict("Citizen iD is linked and is the source of this account's RSI details; unlink it first")
      }
      const after = { spectrum_user_id: null, rsi_confirmed: false }
      await trx("accounts").where({ user_id: userId }).update(after)
      const audit_log_id = await writeAudit(trx, actor, userId, "spectrum_cleared", reason, before, after)
      return { audit_log_id, kind: "spectrum_cleared" as const, notice: {} }
    }

    const value = fix.spectrum_user_id
    if (row.spectrum_user_id === value) conflict("The account already has this Spectrum id")
    const holder = (await trx("accounts")
      .where({ spectrum_user_id: value })
      .first("user_id", "username")) as { user_id: string; username: string } | undefined
    if (holder && holder.user_id !== userId) {
      conflict("Another account holds this Spectrum id. Clear it there first; ids are never moved.", {
        holder_user_id: holder.user_id,
        holder_username: holder.username,
      })
    }
    const after = { spectrum_user_id: value, rsi_confirmed: row.rsi_confirmed }
    try {
      await trx("accounts").where({ user_id: userId }).update({ spectrum_user_id: value })
    } catch (error) {
      if (isUniqueViolation(error)) conflict("Another account just took this Spectrum id")
      throw error
    }
    const audit_log_id = await writeAudit(trx, actor, userId, "spectrum_set", reason, before, after)
    return { audit_log_id, kind: "spectrum_set" as const, notice: {} }
  })
}

/**
 * Deactivate (banned = true; every login path and API token already refuses
 * banned accounts) and end the account's sessions, or reactivate it.
 */
export async function setAccountActive(
  actor: IdentityActor,
  userId: string,
  rawReason: string,
  active: boolean,
  run: TrxRunner = defaultRunner,
): Promise<ActionResult> {
  const reason = validateReason(rawReason)
  if (!active && actor.user_id === userId) {
    throw new BusinessLogicError(ErrorCode.FORBIDDEN, "You can't deactivate your own account")
  }
  return run(async (trx) => {
    const row = await lockTarget(trx, userId)
    if (active && !row.banned) conflict("The account is already active")
    if (!active && row.banned) conflict("The account is already deactivated")

    await trx("accounts").where({ user_id: userId }).update({ banned: !active })
    let sessionsEnded = 0
    if (!active) {
      sessionsEnded = await trx("refresh_tokens").where({ user_id: userId }).del()
      await trx.raw(`DELETE FROM login_sessions WHERE sess->'passport'->>'user' = ?`, [userId])
    }
    const kind: IdentityActionKind = active ? "account_reactivated" : "account_deactivated"
    const audit_log_id = await writeAudit(
      trx,
      actor,
      userId,
      kind,
      reason,
      { banned: row.banned },
      { banned: !active, ...(active ? {} : { refresh_tokens_revoked: sessionsEnded }) },
    )
    return { audit_log_id, kind, notice: {} }
  })
}

// ── Read side ──────────────────────────────────────────────────────────

export interface IdentitySearchRow {
  user_id: string
  username: string
  display_name: string
  role: string
  rsi_confirmed: boolean
  spectrum_user_id: string | null
  discord_provider_id: string | null
  discord_id_column: string | null
  banned: boolean
  is_test: boolean
  is_tombstone: boolean
  deletion_pending: boolean
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

const SEARCH_COLUMNS = [
  "a.user_id",
  "a.username",
  "a.display_name",
  "a.role",
  "a.rsi_confirmed",
  "a.spectrum_user_id",
  "a.banned",
  "a.is_test",
  "a.is_tombstone",
]

/**
 * Accounts matching `q` as: user id (exact), Discord id (provider or legacy
 * column, exact), Spectrum id (exact), username (case-insensitive prefix),
 * display name (case-insensitive substring). Exact username first.
 */
export async function searchIdentities(rawQuery: string): Promise<IdentitySearchRow[]> {
  const q = (rawQuery ?? "").trim()
  if (q.length < 2 || q.length > 100) {
    throw new BusinessLogicError(ErrorCode.VALIDATION_ERROR, "Search needs 2 to 100 characters")
  }
  const knex = getKnex()
  const like = escapeLike(q.toLowerCase())
  const rows = await knex("accounts as a")
    .leftJoin("account_providers as d", function () {
      this.on("d.user_id", "=", "a.user_id").andOn("d.provider_type", "=", knex.raw("'discord'"))
    })
    .where((w) => {
      if (isUuid(q)) w.orWhere("a.user_id", q)
      if (DISCORD_ID_RE.test(q)) {
        w.orWhere("d.provider_id", q).orWhereRaw("a.discord_id::text = ?", [q])
      }
      w.orWhere("a.spectrum_user_id", q)
        .orWhereRaw("lower(a.username) LIKE ? ESCAPE '\\'", [`${like}%`])
        .orWhereRaw("lower(a.display_name) LIKE ? ESCAPE '\\'", [`%${like}%`])
    })
    .orderByRaw("(lower(a.username) = ?) DESC, a.username ASC", [q.toLowerCase()])
    .limit(SEARCH_LIMIT)
    .select(
      ...SEARCH_COLUMNS,
      "d.provider_id as discord_provider_id",
      knex.raw("a.discord_id::text AS discord_id_column"),
      knex.raw("(a.deleted_at IS NOT NULL AND NOT a.is_tombstone) AS deletion_pending"),
    )
  return rows as IdentitySearchRow[]
}

export interface IdentityProvider {
  provider_type: string
  provider_id: string
  /** Discord username or RSI handle recorded at link time. */
  provider_username: string | null
  is_primary: boolean
  linked_at: string | null
  /** Last login with this provider (token refresh at login). */
  last_used_at: string | null
}

export interface IdentitySession {
  /** When this session last refreshed (refresh tokens rotate every ~15 min). */
  refreshed_at: string
  expires_at: string
  user_agent: string | null
}

export interface IdentityAuditEntry {
  audit_log_id: string
  kind: IdentityActionKind
  actor_user_id: string | null
  actor_username: string | null
  reason: string | null
  created_at: string
}

export interface IdentityDetail extends IdentitySearchRow {
  created_at: string | null
  deleted_at: string | null
  deletion_scheduled_at: string | null
  /** accounts.discord_id is set but no Discord provider matches it (stale legacy column). */
  discord_column_stale: boolean
  providers: IdentityProvider[]
  sessions: IdentitySession[]
  /** Other accounts whose username differs only by case. */
  username_twins: { user_id: string; username: string }[]
  recent_actions: IdentityAuditEntry[]
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function getIdentityDetail(userId: string): Promise<IdentityDetail> {
  if (!isUuid(userId)) throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Account not found")
  const knex = getKnex()
  const account = await knex("accounts as a")
    .leftJoin("account_providers as d", function () {
      this.on("d.user_id", "=", "a.user_id").andOn("d.provider_type", "=", knex.raw("'discord'"))
    })
    .where("a.user_id", userId)
    .first(
      ...SEARCH_COLUMNS,
      "a.created_at",
      "a.deleted_at",
      "a.deletion_scheduled_at",
      "d.provider_id as discord_provider_id",
      knex.raw("a.discord_id::text AS discord_id_column"),
      knex.raw("(a.deleted_at IS NOT NULL AND NOT a.is_tombstone) AS deletion_pending"),
    )
  if (!account) throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Account not found")

  const [providers, sessions, twins, audit] = await Promise.all([
    knex("account_providers")
      .where({ user_id: userId })
      .orderBy("linked_at", "asc")
      .select(
        "provider_type",
        "provider_id",
        "is_primary",
        "linked_at",
        "last_used_at",
        knex.raw("COALESCE(metadata->>'username', metadata->>'rsiUsername') AS provider_username"),
      ),
    knex("refresh_tokens")
      .where({ user_id: userId })
      .whereNull("revoked_at")
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .limit(20)
      .select("created_at", "expires_at", "user_agent"),
    knex("accounts")
      .whereRaw("lower(username) = lower(?)", [account.username])
      .whereNot("user_id", userId)
      .limit(10)
      .select("user_id", "username"),
    knex("audit_logs as l")
      .leftJoin("accounts as actor", "actor.user_id", "l.actor_id")
      .where({ "l.subject_type": "user", "l.subject_id": userId })
      .where("l.action", "like", `${AUDIT_ACTION_PREFIX}%`)
      .orderBy("l.created_at", "desc")
      .limit(20)
      .select(
        "l.audit_log_id",
        "l.action",
        "l.actor_id",
        "actor.username as actor_username",
        knex.raw("l.metadata->>'reason' AS reason"),
        "l.created_at",
      ),
  ])

  return {
    user_id: account.user_id,
    username: account.username,
    display_name: account.display_name,
    role: account.role,
    rsi_confirmed: account.rsi_confirmed,
    spectrum_user_id: account.spectrum_user_id,
    discord_provider_id: account.discord_provider_id,
    discord_id_column: account.discord_id_column,
    banned: account.banned,
    is_test: account.is_test === true,
    is_tombstone: account.is_tombstone,
    deletion_pending: account.deletion_pending === true,
    created_at: iso(account.created_at),
    deleted_at: iso(account.deleted_at),
    deletion_scheduled_at: iso(account.deletion_scheduled_at),
    discord_column_stale:
      account.discord_id_column !== null && account.discord_id_column !== account.discord_provider_id,
    providers: providers.map((p: Record<string, unknown>) => ({
      provider_type: String(p.provider_type),
      provider_id: String(p.provider_id),
      provider_username: (p.provider_username as string | null) ?? null,
      is_primary: p.is_primary === true,
      linked_at: iso(p.linked_at),
      last_used_at: iso(p.last_used_at),
    })),
    sessions: sessions.map((s: Record<string, unknown>) => ({
      refreshed_at: iso(s.created_at) ?? "",
      expires_at: iso(s.expires_at) ?? "",
      user_agent: (s.user_agent as string | null) ?? null,
    })),
    username_twins: twins.map((t: Record<string, unknown>) => ({
      user_id: String(t.user_id),
      username: String(t.username),
    })),
    recent_actions: audit.flatMap((a: Record<string, unknown>) => {
      const kind = kindFromAuditAction(String(a.action))
      if (!kind) return []
      return [
        {
          audit_log_id: String(a.audit_log_id),
          kind,
          actor_user_id: (a.actor_id as string | null) ?? null,
          actor_username: (a.actor_username as string | null) ?? null,
          reason: (a.reason as string | null) ?? null,
          created_at: iso(a.created_at) ?? "",
        },
      ]
    }),
  }
}
