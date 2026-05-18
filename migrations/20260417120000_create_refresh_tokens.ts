import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("refresh_tokens"))) {
    await knex.schema.createTable("refresh_tokens", (table) => {
      table.uuid("token_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.uuid("user_id").notNullable().references("user_id").inTable("accounts").onDelete("CASCADE");
      table.string("token_hash", 64).notNullable().unique();
      table.timestamp("expires_at").notNullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("revoked_at");
      table.text("user_agent");
      table.specificType("ip_address", "inet");

      table.index("user_id", "idx_refresh_tokens_user");
      table.index("token_hash", "idx_refresh_tokens_hash");
      table.index("expires_at", "idx_refresh_tokens_expires");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("refresh_tokens");
}
