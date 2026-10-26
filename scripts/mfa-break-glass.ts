/**
 * Break-glass: reset a user's two-factor authentication.
 *
 * For when the only admin has lost their authenticator and recovery codes.
 * Runbook (who, identity checks, follow-up): docs/security/mfa-break-glass.md.
 *
 * In one transaction: deletes the user's MFA factors and recovery codes,
 * bumps accounts.mfa_changed_at, revokes their refresh tokens, deletes their
 * legacy login_sessions and revokes their admin/moderation-scoped API tokens.
 * Writes a break_glass_reset event (actor null, operator in metadata) and an
 * audit_logs row.
 *
 * Usage (with the production DATABASE_* env, from an operator machine):
 *   npx tsx scripts/mfa-break-glass.ts --user <username|user_id> --reason "<text>" [--dry-run]
 */

import { parseArgs } from "node:util"
import os from "node:os"
import { getKnex } from "../src/clients/database/knex-db.js"
import { knexMfaRepo } from "../src/services/mfa/repo.js"
import { MfaService } from "../src/services/mfa/service.js"
import { auditLogService } from "../src/services/audit-log/audit-log.service.js"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ADMIN_ONLY_SCOPES = ["admin", "moderation:read", "moderation:write"]

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: "string" },
      reason: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  })
  if (!values.user || !values.reason || values.reason.trim().length < 3) {
    console.error('Usage: mfa-break-glass.ts --user <username|user_id> --reason "<text>" [--dry-run]')
    process.exit(2)
  }
  const knex = getKnex()
  const account = await knex("accounts")
    .where(UUID.test(values.user) ? { user_id: values.user } : { username: values.user })
    .first("user_id", "username", "role")
  if (!account) {
    console.error(`No account matches "${values.user}"`)
    process.exit(1)
  }

  const [factors, codes, sessions, tokens] = await Promise.all([
    knex("user_mfa_factors").where({ user_id: account.user_id }).count("* as n").first(),
    knex("user_mfa_recovery_codes").where({ user_id: account.user_id }).count("* as n").first(),
    knex("refresh_tokens")
      .where({ user_id: account.user_id })
      .whereNull("revoked_at")
      .count("* as n")
      .first(),
    knex("api_tokens")
      .where({ user_id: account.user_id })
      .whereNull("revoked_at")
      .whereRaw("scopes && ?::text[]", [ADMIN_ONLY_SCOPES])
      .count("* as n")
      .first(),
  ])
  console.log(`Account: ${account.username} (${account.user_id}), role ${account.role}`)
  console.log(
    `Will delete ${factors?.n} factor(s) and ${codes?.n} recovery code(s), ` +
      `revoke ${sessions?.n} session(s) and ${tokens?.n} admin-scoped token(s).`,
  )

  if (values["dry-run"]) {
    console.log("Dry run: nothing changed.")
    await knex.destroy()
    return
  }

  const operator = process.env.USER || os.userInfo().username
  const service = new MfaService({
    repo: knexMfaRepo(),
    verifyLimiter: { consume: async () => undefined },
    enrollLimiter: { consume: async () => undefined },
  })
  const result = await service.resetUser(account.user_id, null, values.reason, null, {
    operator,
    host: os.hostname(),
  })
  await auditLogService.record({
    action: "mfa_break_glass_reset",
    actorId: null,
    subjectType: "user",
    subjectId: account.user_id,
    metadata: { reason: values.reason, operator, ...result },
  })
  console.log("Done:", result)
  console.log("The user can now log in and set up two-factor authentication again.")
  await knex.destroy()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
