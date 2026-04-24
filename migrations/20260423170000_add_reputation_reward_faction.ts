import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TABLE missions ADD COLUMN IF NOT EXISTS reputation_reward_faction varchar(200)")
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.dropColumn("reputation_reward_faction")
  })
}
