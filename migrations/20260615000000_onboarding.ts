import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("accounts", (table) => {
    table
      .timestamp("onboarding_completed_at", { useTz: true })
      .nullable()
      .defaultTo(null)
  })

  // Mark all existing users as having completed onboarding
  await knex("accounts")
    .whereNotNull("created_at")
    .update({ onboarding_completed_at: knex.fn.now() })

  // Add dm_reminder notification action for email reminders about unread DMs
  await knex("notification_actions").insert([
    { action_type_id: 82, action: "dm_reminder", entity: "chats" },
  ])
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("accounts", (table) => {
    table.dropColumn("onboarding_completed_at")
  })

  await knex("notification_actions").where("action_type_id", 82).del()
}
