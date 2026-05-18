import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("org_whitelabel_config"))) {
    await knex.schema.createTable("org_whitelabel_config", (table) => {
      table.uuid("contractor_id").primary().references("contractor_id").inTable("contractors").onDelete("CASCADE");
      table.string("focus_mode", 20).notNullable().defaultTo("public");
      table.string("homepage_path", 500);
      table.boolean("require_membership").notNullable().defaultTo(false);
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
      table.uuid("updated_by").references("user_id").inTable("accounts");
    });
  }

  if (!(await knex.schema.hasTable("org_sidebar_config"))) {
    await knex.schema.createTable("org_sidebar_config", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.uuid("contractor_id").notNullable().references("contractor_id").inTable("contractors").onDelete("CASCADE");
      table.string("standard_tab_key", 100);
      table.string("custom_label", 200);
      table.string("custom_path", 500);
      table.string("custom_icon", 100);
      table.boolean("is_external").defaultTo(false);
      table.boolean("enabled").notNullable().defaultTo(true);
      table.integer("sort_order").notNullable().defaultTo(0);
      table.unique(["contractor_id", "standard_tab_key"]);
      table.index("contractor_id", "idx_org_sidebar_config_contractor");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("org_sidebar_config");
  await knex.schema.dropTableIfExists("org_whitelabel_config");
}
