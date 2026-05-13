import type { Knex } from "knex"

/**
 * Extends buy_orders_v2 with supplier targeting and visibility controls.
 *
 * visibility:
 *   'public'      — visible to all sellers on the market (default, existing behaviour)
 *   'roster_only' — visible only to suppliers on the aggregator's roster
 *   'private'     — direct to one specific supplier (target_supplier_*)
 *
 * negotiable:
 *   Whether the buyer accepts counter-offers / offer sessions against this standing order.
 */
export async function up(knex: Knex): Promise<void> {
  const hasVis = await knex.schema.hasColumn("buy_orders_v2", "visibility")
  if (!hasVis) {
    await knex.schema.alterTable("buy_orders_v2", (table) => {
      table.string("visibility", 20).notNullable().defaultTo("public")
      table.uuid("target_supplier_id").nullable()
      table.uuid("target_supplier_contractor_id").nullable()
      table.timestamp("declined_at", { useTz: true }).nullable()
      table.uuid("declined_by").nullable()
      table.boolean("negotiable").notNullable().defaultTo(false)

      table.check(
        "visibility IN ('public', 'roster_only', 'private')",
        [], "chk_buy_orders_v2_visibility",
      )
    })

    await knex.schema.table("buy_orders_v2", (table) => {
      table.index(["visibility"],                    "idx_bov2_visibility")
      table.index(["target_supplier_id"],            "idx_bov2_target_supplier")
      table.index(["target_supplier_contractor_id"], "idx_bov2_target_supplier_org")
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasVis = await knex.schema.hasColumn("buy_orders_v2", "visibility")
  if (hasVis) {
    await knex.schema.alterTable("buy_orders_v2", (table) => {
      table.dropColumn("visibility")
      table.dropColumn("target_supplier_id")
      table.dropColumn("target_supplier_contractor_id")
      table.dropColumn("declined_at")
      table.dropColumn("declined_by")
      table.dropColumn("negotiable")
    })
  }
}
