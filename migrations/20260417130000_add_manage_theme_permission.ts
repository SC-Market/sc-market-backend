import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("contractor_roles", "manage_theme");
  if (!hasColumn) {
    await knex.schema.alterTable("contractor_roles", (table) => {
      table.boolean("manage_theme").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("contractor_roles", "manage_theme");
  if (hasColumn) {
    await knex.schema.alterTable("contractor_roles", (table) => {
      table.dropColumn("manage_theme");
    });
  }
}
