import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("supplier_relationships", (table) => {
    table.uuid("relationship_id").primary().defaultTo(knex.raw("gen_random_uuid()"))

    // Who maintains the roster: user OR contractor org (exactly one)
    table.uuid("aggregator_id").nullable()
    table.uuid("aggregator_contractor_id").nullable()

    // The supplier: user OR contractor org (exactly one)
    table.uuid("supplier_id").nullable()
    table.uuid("supplier_contractor_id").nullable()

    // Roster metadata
    table.string("tier", 30).nullable()         // 'preferred' | 'approved' | 'restricted'
    table.text("notes").nullable()
    table.string("status", 30).notNullable().defaultTo("active")  // 'active' | 'suspended' | 'removed'

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Uniqueness: one relationship per aggregator+supplier pair
    table.unique(["aggregator_id", "supplier_id"],              { indexName: "uq_supplier_rel_user_user" })
    table.unique(["aggregator_id", "supplier_contractor_id"],   { indexName: "uq_supplier_rel_user_org" })
    table.unique(["aggregator_contractor_id", "supplier_id"],   { indexName: "uq_supplier_rel_org_user" })
    table.unique(["aggregator_contractor_id", "supplier_contractor_id"], { indexName: "uq_supplier_rel_org_org" })

    // Exactly one aggregator side
    table.check(
      "(aggregator_id IS NOT NULL AND aggregator_contractor_id IS NULL) OR (aggregator_id IS NULL AND aggregator_contractor_id IS NOT NULL)",
      [], "chk_supplier_rel_aggregator",
    )
    // Exactly one supplier side
    table.check(
      "(supplier_id IS NOT NULL AND supplier_contractor_id IS NULL) OR (supplier_id IS NULL AND supplier_contractor_id IS NOT NULL)",
      [], "chk_supplier_rel_supplier",
    )
    table.check("status IN ('active', 'suspended', 'removed')", [], "chk_supplier_rel_status")
  })

  await knex.schema.table("supplier_relationships", (table) => {
    table.index(["aggregator_id"],            "idx_supplier_rel_agg_user")
    table.index(["aggregator_contractor_id"], "idx_supplier_rel_agg_org")
    table.index(["supplier_id"],              "idx_supplier_rel_sup_user")
    table.index(["supplier_contractor_id"],   "idx_supplier_rel_sup_org")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("supplier_relationships")
}
