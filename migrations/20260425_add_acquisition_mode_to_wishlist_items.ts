import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wishlist_items", (table) => {
    table.string("acquisition_mode", 10).notNullable().defaultTo("buy");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("wishlist_items", (table) => {
    table.dropColumn("acquisition_mode");
  });
}
