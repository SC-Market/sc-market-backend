/**
 * Shared identity rules for sign-up, linking and renames
 * (drafts/scmarket-identity-admin.md):
 *
 * - A linked identity never moves between accounts. If a Discord account is
 *   already another account's (its provider link, or the legacy
 *   accounts.discord_id column), a new link is skipped, never taken, and the
 *   user is told why (recordDiscordLinkSkipped + a notification).
 * - Renames never collide: a placeholder is a free `user_<8 hex>` name, and a
 *   rename that loses a race to another writer retries with a new one.
 */

import crypto from "node:crypto"
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null) return false
  const e = error as { code?: unknown; constraint?: unknown }
  return e.code === "23505" && (constraint === undefined || e.constraint === constraint)
}

/** Whether `error` is the username unique violation (accounts_username_key). */
export function isUsernameTaken(error: unknown): boolean {
  return isUniqueViolation(error, "accounts_username_key")
}

/** Another account holding this Discord id (provider link or legacy column), if any. */
export async function discordHolder(
  db: Knex,
  discordId: string,
  exceptUserId: string,
): Promise<string | null> {
  const provider = await db("account_providers")
    .where({ provider_type: "discord", provider_id: discordId })
    .whereNot("user_id", exceptUserId)
    .first("user_id")
  if (provider) return String(provider.user_id)
  if (!/^[0-9]{1,25}$/.test(discordId)) return null
  const legacy = await db("accounts")
    .where({ discord_id: discordId })
    .whereNot("user_id", exceptUserId)
    .first("user_id")
  return legacy ? String(legacy.user_id) : null
}

/**
 * Record that a Discord link was skipped because another account holds it:
 * an audit_logs row (identity.discord_link_skipped, no actor) whose id the
 * user's notification points at. It never names the other account.
 */
export async function recordDiscordLinkSkipped(
  db: Knex,
  userId: string,
  discordId: string,
  via: "citizenid_signup" | "citizenid_link",
): Promise<string> {
  const [row] = await db("audit_logs")
    .insert({
      action: "identity.discord_link_skipped",
      actor_id: null,
      subject_type: "user",
      subject_id: userId,
      metadata: {
        reason: "Discord account already linked to another SC Market account",
        before: {},
        after: { skipped_discord_id: discordId, via },
      },
    })
    .returning(["audit_log_id"])
  return String((row as { audit_log_id: string }).audit_log_id)
}

/** A free `user_<8 hex>` username. */
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

/** `preferred` if no account has it, else a free placeholder. */
export async function freeUsername(db: Knex, preferred: string): Promise<string> {
  const taken = await db("accounts").where({ username: preferred }).first("user_id")
  return taken ? placeholderUsername(db) : preferred
}

/**
 * Rename an account to a free placeholder. `extra(name)` adds other columns
 * to the same update (e.g. the display name). A rename that loses a race to
 * another writer of the same name retries with a new one; each attempt runs
 * in its own (sub)transaction, a savepoint inside a caller's transaction, so
 * a lost race doesn't abort it. Returns the new name.
 */
export async function renameToPlaceholder(
  db: Knex = getKnex(),
  userId: string,
  extra: (name: string) => Record<string, unknown> = () => ({}),
  random?: () => string,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const name = await placeholderUsername(db, random)
    try {
      await db.transaction(async (sp) => {
        await sp("accounts").where({ user_id: userId }).update({ username: name, ...extra(name) })
      })
      return name
    } catch (error) {
      if (!isUsernameTaken(error)) throw error
    }
  }
  throw new Error("Could not rename to a free placeholder username")
}
