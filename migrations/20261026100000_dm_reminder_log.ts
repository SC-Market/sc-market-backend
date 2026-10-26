import type { Knex } from "knex"

/**
 * dm_reminder_log: when each user was last sent the "you have unread
 * messages" email (tasks/tasks.ts runs the reminder every 6 hours). Without it
 * the reminder went to the same user on every run.
 *
 * Idempotent: a new, empty table; safe to re-run.
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("dm_reminder_log")) return
  await knex.schema.createTable("dm_reminder_log", (table) => {
    table
      .uuid("user_id")
      .primary()
      .references("user_id")
      .inTable("accounts")
      .onDelete("CASCADE")
    table.timestamp("last_reminded_at", { useTz: true }).notNullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dm_reminder_log")
}
