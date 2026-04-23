import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // New table: per-user, per-flag overrides
  await knex.schema.createTable("user_feature_overrides", (table) => {
    table.uuid("user_id").notNullable()
    table.string("flag_name", 100).notNullable()
    table.boolean("enabled").notNullable()
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())
    table.primary(["user_id", "flag_name"])
    table.index("flag_name")
  })

  // Migrate existing user_preferences.market_version → user_feature_overrides
  const hasPrefs = await knex.schema.hasTable("user_preferences")
  if (hasPrefs) {
    const prefs = await knex("user_preferences").select("user_id", "market_version", "updated_at")
    for (const p of prefs) {
      await knex("user_feature_overrides")
        .insert({
          user_id: p.user_id,
          flag_name: "market_v2",
          enabled: p.market_version === "V2",
          updated_at: p.updated_at,
        })
        .onConflict(["user_id", "flag_name"])
        .ignore()
    }
  }

  // Seed new flags in feature_flag_config (if they don't exist)
  const existing = await knex("feature_flag_config").select("flag_name")
  const existingNames = new Set(existing.map((r: any) => r.flag_name))

  // Rename market_version → market_v2
  if (existingNames.has("market_version")) {
    await knex("feature_flag_config")
      .where("flag_name", "market_version")
      .update({ flag_name: "market_v2" })
  } else if (!existingNames.has("market_v2")) {
    await knex("feature_flag_config").insert({
      flag_name: "market_v2",
      enabled: false,
      default_version: "V1",
      rollout_percentage: 0,
    })
  }

  if (!existingNames.has("crafting")) {
    await knex("feature_flag_config").insert({
      flag_name: "crafting",
      enabled: false,
      default_version: "V1",
      rollout_percentage: 0,
    })
  }

  if (!existingNames.has("wiki")) {
    await knex("feature_flag_config").insert({
      flag_name: "wiki",
      enabled: false,
      default_version: "V1",
      rollout_percentage: 0,
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_feature_overrides")
  // Restore market_v2 → market_version
  await knex("feature_flag_config")
    .where("flag_name", "market_v2")
    .update({ flag_name: "market_version" })
  await knex("feature_flag_config").whereIn("flag_name", ["crafting", "wiki"]).del()
}
