import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Add p4k columns to game_items
  await knex.schema.alterTable("game_items", (table) => {
    table.uuid("p4k_id").nullable()
    table.string("p4k_file", 200).nullable()
    table.string("item_type", 100).nullable()
    table.string("sub_type", 100).nullable()
    table.integer("size").nullable()
    table.integer("grade").nullable()
    table.string("manufacturer", 100).nullable()
    table.string("display_type", 100).nullable()
    table.string("thumbnail_path", 500).nullable()
    table.string("name_key", 200).nullable()
  })

  await knex.raw(
    "CREATE UNIQUE INDEX idx_game_items_p4k_id ON game_items(p4k_id) WHERE p4k_id IS NOT NULL",
  )

  // Add new categories
  await knex("game_item_categories").insert([
    { category: "Component", subcategory: "Countermeasure" },
    { category: "Component", subcategory: "EMP" },
    { category: "Component", subcategory: "Quantum Interdiction Generator" },
    { category: "Vehicle Weapon", subcategory: "Space Mine" },
    { category: "Component", subcategory: "Radar" },
  ])
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_p4k_id")

  await knex.schema.alterTable("game_items", (table) => {
    table.dropColumn("p4k_id")
    table.dropColumn("p4k_file")
    table.dropColumn("item_type")
    table.dropColumn("sub_type")
    table.dropColumn("size")
    table.dropColumn("grade")
    table.dropColumn("manufacturer")
    table.dropColumn("display_type")
    table.dropColumn("thumbnail_path")
    table.dropColumn("name_key")
  })

  await knex("game_item_categories")
    .whereIn("subcategory", [
      "Countermeasure",
      "EMP",
      "Quantum Interdiction Generator",
      "Space Mine",
      "Radar",
    ])
    .delete()
}
