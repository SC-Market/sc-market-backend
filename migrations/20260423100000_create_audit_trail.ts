import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("audit_trail", (table) => {
    table.uuid("audit_id").primary().defaultTo(knex.fn.uuid());
    table.string("entity_type").notNullable(); // listing, order, offer, cart, stock_lot
    table.uuid("entity_id").notNullable();
    table.string("action").notNullable(); // created, updated, deleted, checkout, accepted, rejected, etc.
    table.uuid("actor_id").nullable(); // user who performed the action (null for system)
    table.string("actor_username").nullable();
    table.uuid("contractor_id").nullable(); // org context if applicable
    table.jsonb("details").nullable(); // action-specific metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["entity_type", "entity_id"], "idx_audit_entity");
    table.index("actor_id", "idx_audit_actor");
    table.index("created_at", "idx_audit_created");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_trail");
}
