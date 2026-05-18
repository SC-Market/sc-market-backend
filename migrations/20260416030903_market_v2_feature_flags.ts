import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("user_preferences"))) {
    await knex.schema.createTable("user_preferences", (table) => {
      table.uuid("user_id").primary().references("user_id").inTable("accounts").onDelete("CASCADE");
      table.string("market_version", 10).notNullable().defaultTo("V1");
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
      table.index("user_id");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_preferences");
}
