import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("api_tokens", (table) => {
    table.timestamp("revoked_at").nullable();
    table.index("revoked_at", "idx_api_tokens_revoked");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("api_tokens", (table) => {
    table.dropIndex("revoked_at", "idx_api_tokens_revoked");
    table.dropColumn("revoked_at");
  });
}
