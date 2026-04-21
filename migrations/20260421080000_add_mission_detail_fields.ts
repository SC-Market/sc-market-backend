import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.integer("max_crimestat").nullable()
    table.boolean("fail_if_sent_to_prison").defaultTo(false)
    table.boolean("fail_if_became_criminal").defaultTo(false)
    table.boolean("can_reaccept_after_failing").defaultTo(false)
    table.boolean("can_reaccept_after_abandoning").defaultTo(false)
    table.float("abandoned_cooldown_time").nullable()
    table.float("personal_cooldown_time").nullable()
    table.float("deadline_seconds").nullable()
    table.string("linked_mission_code", 200).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    table.dropColumn("max_crimestat")
    table.dropColumn("fail_if_sent_to_prison")
    table.dropColumn("fail_if_became_criminal")
    table.dropColumn("can_reaccept_after_failing")
    table.dropColumn("can_reaccept_after_abandoning")
    table.dropColumn("abandoned_cooldown_time")
    table.dropColumn("personal_cooldown_time")
    table.dropColumn("deadline_seconds")
    table.dropColumn("linked_mission_code")
  })
}
