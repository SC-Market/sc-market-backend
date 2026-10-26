import type { Knex } from "knex"

/**
 * notification_deliveries: one row per (event, recipient, channel) delivery
 * made by services/notify. It is the idempotency store (a retried request or
 * a redelivered queue message finds the row and does not send again) and the
 * audit log of what was sent where. status: sent | failed | skipped | shadow.
 * Rows older than 90 days are pruned by tasks/tasks.ts.
 *
 * Idempotent: a new, empty table (its indexes are built empty); safe to re-run.
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("notification_deliveries")) return
  await knex.schema.createTable("notification_deliveries", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("idempotency_key", 64).notNullable().unique()
    table.string("event_key", 64).notNullable()
    table.string("channel", 24).notNullable()
    table.uuid("user_id").nullable().references("user_id").inTable("accounts").onDelete("CASCADE")
    table.uuid("contractor_id").nullable()
    table.text("destination_ref").nullable()
    table.text("entity_id").nullable()
    table.string("status", 16).notNullable()
    table.integer("attempts").notNullable().defaultTo(0)
    table.text("last_error").nullable()
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("sent_at", { useTz: true }).nullable()
    table.index(["created_at"])
    table.index(["user_id", "event_key", "created_at"])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notification_deliveries")
}
