import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("accounts", (table) => {
    table.timestamp("deleted_at", { useTz: true }).nullable().defaultTo(null)
    table
      .timestamp("deletion_scheduled_at", { useTz: true })
      .nullable()
      .defaultTo(null)
    table.boolean("is_tombstone").notNullable().defaultTo(false)
    table.text("deletion_reason").nullable().defaultTo(null)
  })

  await knex.raw(`
    CREATE INDEX idx_accounts_pending_deletion
    ON accounts (deletion_scheduled_at)
    WHERE deleted_at IS NOT NULL AND is_tombstone = false
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_accounts_pending_deletion")
  await knex.schema.alterTable("accounts", (table) => {
    table.dropColumn("deleted_at")
    table.dropColumn("deletion_scheduled_at")
    table.dropColumn("is_tombstone")
    table.dropColumn("deletion_reason")
  })
}
