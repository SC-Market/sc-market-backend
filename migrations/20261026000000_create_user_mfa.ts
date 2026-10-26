import type { Knex } from "knex"

/**
 * Two-factor authentication (admin-2fa-design.md section 2).
 *
 * - user_mfa_factors: one row per factor. TOTP secrets are AES-256-GCM sealed
 *   with an env key (src/services/mfa/crypto.ts); confirmed_at is null while an
 *   enrollment is pending. At most one confirmed TOTP factor per user.
 * - user_mfa_recovery_codes: scrypt hashes of single-use recovery codes.
 * - user_mfa_events: append-only audit log (never codes or secrets).
 * - accounts.mfa_changed_at: bumped on enroll-confirm, factor removal, reset
 *   and code regeneration; a session's MFA only counts if it is newer.
 * - refresh_tokens.mfa_at / amr: the session's last successful MFA, copied on
 *   every refresh rotation.
 * - api_tokens.mfa_at: when a token carrying admin/moderation scopes was
 *   minted or changed under an MFA step-up. Such tokens only carry admin power
 *   while this is newer than the owner's accounts.mfa_changed_at.
 *
 * Additive only; nothing reads these until the MFA code ships.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_mfa_factors", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    t.uuid("user_id")
      .notNullable()
      .references("user_id")
      .inTable("accounts")
      .onDelete("CASCADE")
    t.text("type").notNullable()
    t.text("label").notNullable().defaultTo("Authenticator app")
    t.text("secret_ciphertext")
    t.text("secret_key_id")
    t.jsonb("public_data").notNullable().defaultTo("{}")
    t.bigInteger("last_used_counter")
    t.integer("failed_attempts").notNullable().defaultTo(0)
    t.integer("lockout_count").notNullable().defaultTo(0)
    t.timestamp("locked_until", { useTz: true })
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp("confirmed_at", { useTz: true })
    t.timestamp("last_used_at", { useTz: true })
    t.index(["user_id"], "idx_user_mfa_factors_user")
  })
  await knex.raw(
    `ALTER TABLE user_mfa_factors
       ADD CONSTRAINT user_mfa_factors_type_check
       CHECK (type IN ('totp', 'email', 'webauthn'))`,
  )
  await knex.raw(
    `CREATE UNIQUE INDEX uq_user_mfa_factors_confirmed_totp
       ON user_mfa_factors (user_id)
       WHERE type = 'totp' AND confirmed_at IS NOT NULL`,
  )

  await knex.schema.createTable("user_mfa_recovery_codes", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    t.uuid("user_id")
      .notNullable()
      .references("user_id")
      .inTable("accounts")
      .onDelete("CASCADE")
    t.uuid("batch_id").notNullable()
    t.text("code_hash").notNullable()
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp("used_at", { useTz: true })
    t.specificType("used_ip", "inet")
  })
  await knex.raw(
    `CREATE INDEX idx_user_mfa_recovery_codes_unused
       ON user_mfa_recovery_codes (user_id) WHERE used_at IS NULL`,
  )

  await knex.schema.createTable("user_mfa_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    // No FK: the audit trail outlives the factor and survives break-glass.
    t.uuid("user_id").notNullable()
    t.uuid("actor_user_id")
    t.text("event").notNullable()
    t.uuid("factor_id")
    t.text("factor_type")
    t.specificType("ip", "inet")
    t.text("user_agent")
    t.jsonb("metadata").notNullable().defaultTo("{}")
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })
  await knex.raw(
    `CREATE INDEX idx_user_mfa_events_user ON user_mfa_events (user_id, created_at DESC)`,
  )
  await knex.raw(
    `CREATE INDEX idx_user_mfa_events_event ON user_mfa_events (event, created_at DESC)`,
  )

  await knex.schema.alterTable("accounts", (t) => {
    t.timestamp("mfa_changed_at", { useTz: true })
  })
  await knex.schema.alterTable("refresh_tokens", (t) => {
    t.timestamp("mfa_at", { useTz: true })
    t.specificType("amr", "text[]")
  })
  await knex.schema.alterTable("api_tokens", (t) => {
    t.timestamp("mfa_at", { useTz: true })
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("api_tokens", (t) => t.dropColumn("mfa_at"))
  await knex.schema.alterTable("refresh_tokens", (t) => {
    t.dropColumn("mfa_at")
    t.dropColumn("amr")
  })
  await knex.schema.alterTable("accounts", (t) => t.dropColumn("mfa_changed_at"))
  await knex.schema.dropTableIfExists("user_mfa_events")
  await knex.schema.dropTableIfExists("user_mfa_recovery_codes")
  await knex.schema.dropTableIfExists("user_mfa_factors")
}
