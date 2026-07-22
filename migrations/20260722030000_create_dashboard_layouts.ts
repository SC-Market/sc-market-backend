import type { Knex } from "knex"

/**
 * Stores customizable dashboard layouts. One row per owner:
 *   - owner_type 'user' -> owner_id = accounts.user_id      (personal dashboard)
 *   - owner_type 'org'  -> owner_id = contractors.contractor_id (shared org dashboard)
 *   - owner_type 'shop' -> owner_id = shops.shop_id          (shared shop dashboard)
 *
 * owner_id is a plain varchar (not an FK) because it spans three tables;
 * referential integrity is enforced in the service, which resolves the owner and
 * checks permissions before every read/write.
 *
 * `config` holds the DashboardConfig JSON blob (widgets, scopes, grid layout).
 * A size guard keeps the blob bounded since there is no other JSONB-size limit in
 * the schema; ~256 KB is far above any realistic dashboard.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("dashboard_layouts"))) {
    await knex.schema.createTable("dashboard_layouts", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
      table.string("owner_type", 10).notNullable()
      table.string("owner_id").notNullable()
      table.jsonb("config").notNullable()
      table.uuid("updated_by").notNullable()
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      table.unique(["owner_type", "owner_id"], {
        indexName: "uq_dashboard_layouts_owner",
      })
      table.check(
        "owner_type IN ('user','org','shop')",
        [],
        "chk_dashboard_layouts_owner_type",
      )
      table.check(
        "octet_length(config::text) < 262144",
        [],
        "chk_dashboard_layouts_config_size",
      )
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dashboard_layouts")
}
