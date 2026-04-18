import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("org_whitelabel_config", (table) => {
    table.string("drawer_style", 20).notNullable().defaultTo("elevation");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("org_whitelabel_config", (table) => {
    table.dropColumn("drawer_style");
  });
}
