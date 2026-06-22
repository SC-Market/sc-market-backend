import type { Knex } from "knex"

/**
 * Backfill shop tags from the game item types in their listings.
 * Maps game_item.type to shop tags.
 */
export async function up(knex: Knex): Promise<void> {
  // Map game item types to shop tags
  const typeToTag: Record<string, string> = {
    weapon: "Weapons",
    armor: "Armor",
    component: "Components",
    commodity: "Cargo",
    mining_head: "Mining",
    mining_modifier: "Mining",
    salvage: "Salvage",
    medical: "Medical",
    vehicle: "Vehicles",
    ship_weapon: "Weapons",
    power_plant: "Components",
    cooler: "Components",
    shield: "Components",
    quantum_drive: "Components",
  }

  // For each shop, find distinct game item types from their listings and map to tags
  const shops = await knex("shops").select("shop_id")

  for (const shop of shops) {
    const itemTypes = await knex("listings")
      .join("listing_items", "listings.listing_id", "listing_items.listing_id")
      .join("game_items", "listing_items.game_item_id", "game_items.id")
      .where("listings.shop_id", shop.shop_id)
      .whereNotNull("game_items.type")
      .distinct("game_items.type")
      .pluck("game_items.type")

    const tags = [...new Set(
      itemTypes
        .map((type: string) => typeToTag[type])
        .filter(Boolean)
    )]

    if (tags.length > 0) {
      await knex("shops")
        .where("shop_id", shop.shop_id)
        .where(knex.raw("tags = ARRAY[]::TEXT[]"))
        .update({ tags })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("shops").update({ tags: knex.raw("ARRAY[]::TEXT[]") })
}
