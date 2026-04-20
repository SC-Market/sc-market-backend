/**
 * Game Data Import Script - Blueprints & Crafting Recipes
 *
 * Imports blueprint and crafting recipe data from a JSON source file into the database.
 * Supports both initial import and incremental updates (upsert by blueprint_code + version).
 *
 * Usage:
 *   npx tsx scripts/import-game-data.ts --file ./data/blueprints.json [--version "4.0.1"] [--type LIVE]
 *
 * Expected JSON format:
 * {
 *   "version": "4.0.1",
 *   "blueprints": [
 *     {
 *       "code": "BP_KASTAK_CUSTODIAN_T3",
 *       "name": "Kastak Arms Custodian SMG Blueprint (Tier 3)",
 *       "description": "...",
 *       "output_item": "Kastak Arms Custodian SMG",
 *       "output_quantity": 1,
 *       "category": "FPS Weapons",
 *       "subcategory": "SMG",
 *       "rarity": "Uncommon",
 *       "tier": 3,
 *       "crafting_station": "Weapons Bench",
 *       "crafting_time_seconds": 300,
 *       "quality_calculation": "weighted_average",
 *       "base_success_rate": 95,
 *       "critical_success_chance": 5,
 *       "ingredients": [
 *         { "item": "Titanium Alloy", "quantity": 5, "min_quality_tier": 2 },
 *         { "item": "Polymer Composite", "quantity": 3 }
 *       ]
 *     }
 *   ]
 * }
 */

import { getKnex } from "../src/clients/database/knex-db.js"
import * as fs from "fs"
import * as path from "path"

interface ImportIngredient {
  item: string
  quantity: number
  min_quality_tier?: number
  recommended_quality_tier?: number
  is_alternative?: boolean
  alternative_group?: number
}

interface ImportBlueprint {
  code: string
  name: string
  description?: string
  output_item: string
  output_quantity?: number
  category?: string
  subcategory?: string
  rarity?: string
  tier?: number
  crafting_station?: string
  crafting_time_seconds?: number
  quality_calculation?: string
  base_success_rate?: number
  critical_success_chance?: number
  min_output_quality_tier?: number
  max_output_quality_tier?: number
  ingredients: ImportIngredient[]
}

interface ImportData {
  version: string
  version_type?: "LIVE" | "PTU" | "EPTU"
  blueprints: ImportBlueprint[]
}

async function main() {
  const args = process.argv.slice(2)
  const fileIdx = args.indexOf("--file")
  const versionIdx = args.indexOf("--version")
  const typeIdx = args.indexOf("--type")

  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error("Usage: npx tsx scripts/import-game-data.ts --file <path> [--version <ver>] [--type LIVE|PTU|EPTU]")
    process.exit(1)
  }

  const filePath = path.resolve(args[fileIdx + 1])
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ImportData
  const versionNumber = (versionIdx !== -1 && args[versionIdx + 1]) || raw.version
  const versionType = ((typeIdx !== -1 && args[typeIdx + 1]) || raw.version_type || "LIVE") as "LIVE" | "PTU" | "EPTU"

  if (!versionNumber) {
    console.error("Version number required (in JSON or via --version)")
    process.exit(1)
  }

  const knex = getKnex()
  console.log(`Importing ${raw.blueprints.length} blueprints for ${versionType} ${versionNumber}...`)

  // 1. Get or create game version
  let version = await knex("game_versions")
    .where({ version_type: versionType, version_number: versionNumber })
    .first()

  if (!version) {
    ;[version] = await knex("game_versions")
      .insert({ version_type: versionType, version_number: versionNumber, is_active: true })
      .returning("*")
    console.log(`Created game version: ${versionType} ${versionNumber}`)
  } else {
    console.log(`Using existing game version: ${version.version_id}`)
  }

  let imported = 0
  let skipped = 0
  let errors = 0

  for (const bp of raw.blueprints) {
    try {
      // 2. Resolve output game item
      const outputItem = await knex("game_items").where("name", bp.output_item).first()
      if (!outputItem) {
        console.warn(`  SKIP: Output item not found: "${bp.output_item}" (blueprint: ${bp.code})`)
        skipped++
        continue
      }

      // 3. Upsert blueprint
      const existing = await knex("blueprints")
        .where({ blueprint_code: bp.code, version_id: version.version_id })
        .first()

      let blueprintId: string
      if (existing) {
        await knex("blueprints").where("blueprint_id", existing.blueprint_id).update({
          blueprint_name: bp.name,
          blueprint_description: bp.description || null,
          output_game_item_id: outputItem.id,
          output_quantity: bp.output_quantity || 1,
          item_category: bp.category || null,
          item_subcategory: bp.subcategory || null,
          rarity: bp.rarity || null,
          tier: bp.tier || null,
          crafting_station_type: bp.crafting_station || null,
          crafting_time_seconds: bp.crafting_time_seconds || null,
          updated_at: knex.fn.now(),
        })
        blueprintId = existing.blueprint_id
      } else {
        const [row] = await knex("blueprints").insert({
          version_id: version.version_id,
          blueprint_code: bp.code,
          blueprint_name: bp.name,
          blueprint_description: bp.description || null,
          output_game_item_id: outputItem.id,
          output_quantity: bp.output_quantity || 1,
          item_category: bp.category || null,
          item_subcategory: bp.subcategory || null,
          rarity: bp.rarity || null,
          tier: bp.tier || null,
          crafting_station_type: bp.crafting_station || null,
          crafting_time_seconds: bp.crafting_time_seconds || null,
        }).returning("*")
        blueprintId = row.blueprint_id
      }

      // 4. Upsert crafting recipe
      const existingRecipe = await knex("crafting_recipes")
        .where({ blueprint_id: blueprintId, version_id: version.version_id })
        .first()

      if (!existingRecipe) {
        await knex("crafting_recipes").insert({
          blueprint_id: blueprintId,
          version_id: version.version_id,
          quality_calculation_type: bp.quality_calculation || "weighted_average",
          base_success_rate: bp.base_success_rate ?? 100,
          critical_success_chance: bp.critical_success_chance ?? 0,
          min_output_quality_tier: bp.min_output_quality_tier ?? 1,
          max_output_quality_tier: bp.max_output_quality_tier ?? 5,
        })
      } else {
        await knex("crafting_recipes").where("recipe_id", existingRecipe.recipe_id).update({
          quality_calculation_type: bp.quality_calculation || "weighted_average",
          base_success_rate: bp.base_success_rate ?? 100,
          critical_success_chance: bp.critical_success_chance ?? 0,
          min_output_quality_tier: bp.min_output_quality_tier ?? 1,
          max_output_quality_tier: bp.max_output_quality_tier ?? 5,
          updated_at: knex.fn.now(),
        })
      }

      // 5. Replace ingredients
      await knex("blueprint_ingredients").where({ blueprint_id: blueprintId }).delete()

      for (const ing of bp.ingredients) {
        const ingredientItem = await knex("game_items").where("name", ing.item).first()
        if (!ingredientItem) {
          console.warn(`  WARN: Ingredient not found: "${ing.item}" (blueprint: ${bp.code})`)
          continue
        }

        await knex("blueprint_ingredients").insert({
          blueprint_id: blueprintId,
          ingredient_game_item_id: ingredientItem.id,
          quantity_required: ing.quantity,
          min_quality_tier: ing.min_quality_tier || null,
          recommended_quality_tier: ing.recommended_quality_tier || null,
          is_alternative: ing.is_alternative || false,
          alternative_group: ing.alternative_group || null,
        })
      }

      imported++
    } catch (err) {
      console.error(`  ERROR: Failed to import "${bp.code}":`, err)
      errors++
    }
  }

  // Update version timestamp
  await knex("game_versions")
    .where("version_id", version.version_id)
    .update({ last_data_update: knex.fn.now() })

  console.log(`\nImport complete:`)
  console.log(`  Imported: ${imported}`)
  console.log(`  Skipped:  ${skipped}`)
  console.log(`  Errors:   ${errors}`)

  await knex.destroy()
}

main().catch((err) => {
  console.error("Import failed:", err)
  process.exit(1)
})
