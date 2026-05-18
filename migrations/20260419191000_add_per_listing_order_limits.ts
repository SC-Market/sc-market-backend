import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("listings", (table) => {
    table.integer("min_order_quantity").nullable();
    table.integer("max_order_quantity").nullable();
    table.bigInteger("min_order_value").nullable();
    table.bigInteger("max_order_value").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("listings", (table) => {
    table.dropColumn("min_order_quantity");
    table.dropColumn("max_order_quantity");
    table.dropColumn("min_order_value");
    table.dropColumn("max_order_value");
  });
}
