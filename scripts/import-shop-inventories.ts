/**
 * Shop Inventory Import Script
 *
 * Imports in-game NPC shop inventory data extracted from Star Citizen's Data.p4k.
 * Links items to existing game_items records via p4k_id matching.
 *
 * Usage:
 *   npx tsx scripts/import-shop-inventories.ts --file ./path/to/shop-inventories.json
 *
 * Expected JSON format:
 * [
 *   {
 *     "shop": "Casaba Outlet",
 *     "location": "Area 18",
 *     "filename": "Inv_CasabaOutlet_Area18.json",
 *     "items": [
 *       { "id": "uuid", "name": "Item Name", "type": "Armor", "subType": "LightArmor", "buyPrice": 1200, "sellPrice": 0 }
 *     ]
 *   }
 * ]
 */

import { getKnex } from "../src/clients/database/knex-db.js"
import * as fs from "fs"
import * as path from "path"

interface ShopItem {
  id: string
  name: string
  type?: string
  subType?: string
  buyPrice?: number
  sellPrice?: number
}

interface ShopEntry {
  shop: string
  location: string
  filename?: string
  items: ShopItem[]
}

export async function importShopInventories(knexInstance?: any, filePath?: string) {
  const knex = knexInstance || getKnex()

  if (!filePath) {
    // Check CLI args first, then fallback to default location
    const args = process.argv.slice(2)
    const fileIdx = args.indexOf("--file")

    if (fileIdx !== -1 && args[fileIdx + 1]) {
      filePath = path.resolve(args[fileIdx + 1])
    } else {
      // Default: look in game-data-export directory
      const defaultPath = path.resolve(__dirname, "../game-data-export/shop-inventories.json")
      if (fs.existsSync(defaultPath)) {
        filePath = defaultPath
      } else {
        console.error("Usage: npx tsx scripts/import-shop-inventories.ts --file <path>")
        console.error("  Or place shop-inventories.json in game-data-export/")
        process.exit(1)
      }
    }
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const shops: ShopEntry[] = JSON.parse(fs.readFileSync(filePath, "utf-8"))
  console.log(`Loaded ${shops.length} shops from ${filePath}`)

  let totalShops = 0
  let totalItems = 0
  let linkedItems = 0
  let errors = 0

  // Pre-load all game_items with p4k_id for fast lookup
  console.log("Loading game_items p4k_id index...")
  const gameItems = await knex("game_items")
    .whereNotNull("p4k_id")
    .select("id", "p4k_id")

  const p4kIdToGameItemId = new Map<string, string>()
  for (const gi of gameItems) {
    p4kIdToGameItemId.set(gi.p4k_id, gi.id)
  }
  console.log(`Indexed ${p4kIdToGameItemId.size} game_items with p4k_id`)

  for (const shopEntry of shops) {
    try {
      // Upsert shop
      const [shop] = await knex("game_shops")
        .insert({
          name: shopEntry.shop,
          location: shopEntry.location,
          filename: shopEntry.filename || null,
        })
        .onConflict(["name", "location"])
        .merge({
          filename: shopEntry.filename || null,
          updated_at: knex.fn.now(),
        })
        .returning("*")

      totalShops++

      // Batch upsert items (chunks of 100 for performance)
      const chunkSize = 100
      for (let i = 0; i < shopEntry.items.length; i += chunkSize) {
        const chunk = shopEntry.items.slice(i, i + chunkSize)
        const rows = chunk.map((item) => {
          const gameItemId = p4kIdToGameItemId.get(item.id) || null
          if (gameItemId) linkedItems++
          return {
            shop_id: shop.id,
            game_item_id: gameItemId,
            item_uuid: item.id,
            item_name: item.name || null,
            item_type: item.type || null,
            item_sub_type: item.subType || null,
            buy_price: item.buyPrice ?? null,
            sell_price: item.sellPrice ?? null,
          }
        })

        await knex("game_shop_items")
          .insert(rows)
          .onConflict(["shop_id", "item_uuid"])
          .merge({
            game_item_id: knex.raw("EXCLUDED.game_item_id"),
            item_name: knex.raw("EXCLUDED.item_name"),
            item_type: knex.raw("EXCLUDED.item_type"),
            item_sub_type: knex.raw("EXCLUDED.item_sub_type"),
            buy_price: knex.raw("EXCLUDED.buy_price"),
            sell_price: knex.raw("EXCLUDED.sell_price"),
            updated_at: knex.fn.now(),
          })

        totalItems += chunk.length
      }

      console.log(`  [${totalShops}/${shops.length}] ${shopEntry.shop} @ ${shopEntry.location}: ${shopEntry.items.length} items`)
    } catch (err) {
      console.error(`  ERROR: Failed to import shop "${shopEntry.shop}" @ "${shopEntry.location}":`, err)
      errors++
    }
  }

  const result = {
    shops: totalShops,
    items: totalItems,
    linked: linkedItems,
    unlinked: totalItems - linkedItems,
    errors,
  }

  console.log(`\nImport complete:`)
  console.log(`  Shops:        ${result.shops}`)
  console.log(`  Items:        ${result.items}`)
  console.log(`  Linked:       ${result.linked} (matched to game_items via p4k_id)`)
  console.log(`  Unlinked:     ${result.unlinked}`)
  console.log(`  Errors:       ${result.errors}`)

  if (!knexInstance) {
    await knex.destroy()
  }

  return result
}

// CLI entrypoint
if (process.argv[1]?.includes("import-shop-inventories")) {
  importShopInventories().catch((err) => {
    console.error("Import failed:", err)
    process.exit(1)
  })
}
