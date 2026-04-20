/**
 * Import Star Citizen game data from P4K extraction
 *
 * This script processes the game-data.zip or game-data.json file produced by
 * extract-game-data.ts and imports the P4K item data into the database.
 *
 * Features:
 * - Parses input (zip or json)
 * - Maps P4K item types to database subcategories (62 type mappings)
 * - Matches P4K items to existing database items using:
 *   1. Exact name match (case-insensitive)
 *   2. CStone UUID match
 *   3. Fuzzy name match (Levenshtein distance)
 * - UPDATE matched items with P4K metadata
 * - INSERT new items not found in database
 * - Regenerate "Full Set" synthetic items from "Core" items
 * - Rebuild full-text search indexes
 * - Support --dry-run flag for preview without changes
 * - Provide detailed import summary (matched, inserted, updated, errors)
 *
 * Usage:
 *   npm run import-game-data -- --file ./game-data-export/game-data.json
 *   npm run import-game-data -- --file ./game-data-export/game-data.zip --dry-run
 *
 * Reference: docs/p4k-import-plan.md Phases 2-5
 */

import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import knex from "knex"

// --- CLI Arguments ---
const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run")
const FILE_ARG = (() => {
  const idx = process.argv.indexOf("--file")
  return idx !== -1 ? process.argv[idx + 1] : null
})()

if (!FILE_ARG) {
  console.error("Usage: --file <game-data.json or game-data.zip> [--dry-run]")
  console.error("")
  console.error("Examples:")
  console.error("  npm run import-game-data -- --file ./game-data-export/game-data.json")
  console.error("  npm run import-game-data -- --file ./game-data-export/game-data.zip --dry-run")
  process.exit(1)
}

// --- Database Connection ---
const db = knex({
  client: "pg",
  connection: {
    host: process.env.DATABASE_HOST || "localhost",
    port: +(process.env.DATABASE_PORT || "5432"),
    user: process.env.DATABASE_USER || "scmarket",
    password: process.env.DATABASE_PASS || "scmarket",
    database: process.env.DATABASE_TARGET || "scmarket",
    connectTimeout: 10000,
  },
  pool: { min: 0, max: 2 },
  acquireConnectionTimeout: 15000,
})

// --- P4K Type to DB Subcategory Mapping (62 types) ---
// Maps P4K item types to existing database subcategories
// Reference: docs/p4k-import-plan.md Phase 2
const P4K_TYPE_MAP: Record<string, string> = {
  Cargo: "Container",
  Paints: "Ship Livery",
  Char_Armor_Helmet: "Helmet",
  Char_Clothing_Torso_1: "Jackets",
  Char_Armor_Torso: "Torso",
  Char_Armor_Legs: "Legs",
  Char_Armor_Arms: "Arms",
  WeaponPersonal: "Ranged Weapon",
  Char_Clothing_Legs: "Legwear",
  Char_Clothing_Torso_0: "Shirts",
  Char_Clothing_Feet: "Footwear",
  Misc: "Other",
  Char_Clothing_Hat: "Hat",
  Char_Armor_Undersuit: "Undersuit",
  WeaponGun: "Ship Weapon",
  WeaponDefensive: "Countermeasure",
  WeaponAttachment: "Weapon Attachment",
  Food: "Food/Drink",
  Char_Clothing_Hands: "Gloves",
  Char_Armor_Backpack: "Backpack",
  MissileLauncher: "Missile Rack",
  Drink: "Food/Drink",
  Turret: "Ship Turret or Gimbal",
  PowerPlant: "Power Plant",
  Cooler: "Cooler",
  Shield: "Shield",
  Radar: "Radar",
  Missile: "Missile",
  QuantumDrive: "Quantum Drive",
  FPS_Consumable: "Medical Pen",
  MiningModifier: "Mining Modifier",
  WeaponMining: "Mining Head",
  MobiGlas: "Mobiglass",
  ExternalFuelTank: "Fuel Pod",
  TractorBeam: "Tractor Beam",
  Container: "Container",
  Gadget: "FPS Tool",
  Flair_Surface: "Decoration",
  SalvageHead: "Salvage Head",
  SalvageModifier: "Salvage Modifier",
  InventoryContainer: "Container",
  GroundVehicleMissileLauncher: "Missile Rack",
  EMP: "EMP",
  FPS_Deployable: "FPS Tool",
  Usable: "Other",
  JumpDrive: "Jump Drive",
  BombLauncher: "Bomb Launcher",
  QuantumInterdictionGenerator: "Quantum Interdiction Generator",
  ToolArm: "Tool Attachment",
  DockingCollar: "Ship Module",
  Module: "Ship Module",
  UtilityTurret: "Ship Turret or Gimbal",
  Bomb: "Bomb",
  Currency: "Other",
  TurretBase: "Ship Turret or Gimbal",
  SpaceMine: "Space Mine",
  RemovableChip: "Hacking Chip",
  Char_Clothing_Backpack: "Backpack (Clothing)",
  TowingBeam: "Towing Beam",
  Grenade: "Thrown Weapon",
  UNDEFINED: "Other",
}

// --- Helper Functions ---

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy name matching
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

/**
 * Normalize item name for matching
 * Converts to lowercase and trims whitespace
 */
function normalize(name: string): string {
  return name.toLowerCase().trim()
}

/**
 * Check if an item is a Core armor piece
 * Used for Full Set generation
 */
function isCoreItem(name: string): boolean {
  const normalized = name.toLowerCase()
  return (
    normalized.includes(" core ") &&
    !normalized.match(/\b(life|thermal|power|reactor)core\b/)
  )
}

/**
 * Log with timestamp
 */
function log(msg: string, meta?: any) {
  const timestamp = new Date().toISOString()
  if (meta) {
    console.log(`[${timestamp}] ${msg}`, JSON.stringify(meta, null, 2))
  } else {
    console.log(`[${timestamp}] ${msg}`)
  }
}

// --- Type Definitions ---

interface P4KItem {
  id: string
  name: string
  nameKey: string | null
  displayType: string | null
  type: string | null
  subType: string | null
  size: number | null
  grade: number | null
  manufacturer: string | null
  tags: string | null
  thumbnail: string | null
  file: string
  attributes?: Record<string, any>
}

interface DBItem {
  id: string
  name: string
  cstone_uuid: string | null
  uex_uuid: string | null
  type: string | null
  p4k_id: string | null
}

interface MatchResult {
  dbId: string
  p4k: P4KItem
  matchType: "exact" | "cstone_uuid" | "fuzzy"
}

interface ImportStats {
  totalP4KItems: number
  validP4KItems: number
  existingDBItems: number
  matched: number
  matchedExact: number
  matchedCStoneUUID: number
  matchedFuzzy: number
  inserted: number
  updated: number
  nameChanges: number
  fullSetsCreated: number
  errors: string[]
}

// --- Main Import Function ---
async function importGameData() {
  log("=".repeat(80))
  log("P4K Game Data Import")
  log("=".repeat(80))
  log("Configuration", { dryRun: DRY_RUN, file: FILE_ARG })

  if (DRY_RUN) {
    log("⚠️  DRY RUN MODE - No database changes will be made")
  }

  const stats: ImportStats = {
    totalP4KItems: 0,
    validP4KItems: 0,
    existingDBItems: 0,
    matched: 0,
    matchedExact: 0,
    matchedCStoneUUID: 0,
    matchedFuzzy: 0,
    inserted: 0,
    updated: 0,
    nameChanges: 0,
    fullSetsCreated: 0,
    errors: [],
  }

  try {
    // ========================================================================
    // STEP 1: Load and Parse Input File
    // ========================================================================
    log("\n" + "=".repeat(80))
    log("STEP 1: Loading P4K Game Data")
    log("=".repeat(80))

    let jsonPath = FILE_ARG!
    if (jsonPath.endsWith(".zip")) {
      log("Extracting ZIP file...")
      const tmpDir = path.join("/tmp", "game-data-import-" + Date.now())
      fs.mkdirSync(tmpDir, { recursive: true })
      execSync(`unzip -o "${jsonPath}" -d "${tmpDir}"`, { stdio: "pipe" })
      jsonPath = path.join(tmpDir, "game-data.json")
      log(`Extracted to: ${jsonPath}`)
    }

    if (!fs.existsSync(jsonPath)) {
      throw new Error(`File not found: ${jsonPath}`)
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
    const p4kItems: P4KItem[] = data.items || []
    stats.totalP4KItems = p4kItems.length

    log(`Loaded ${p4kItems.length} items from P4K data`)
    log(`Extracted at: ${data.extractedAt}`)
    log(`Localization keys: ${data.localizationKeys}`)

    // Filter to items with resolved names (exclude placeholders and loc keys)
    const validItems = p4kItems.filter(
      (i) => i.name && !i.name.startsWith("@") && !i.name.includes("PLACEHOLDER")
    )
    stats.validP4KItems = validItems.length
    log(`${validItems.length} items with usable names (${p4kItems.length - validItems.length} filtered out)`)

    // ========================================================================
    // STEP 2: Load Existing Database Items
    // ========================================================================
    log("\n" + "=".repeat(80))
    log("STEP 2: Loading Existing Database Items")
    log("=".repeat(80))

    const dbItems: DBItem[] = await db("game_items").select(
      "id",
      "name",
      "cstone_uuid",
      "uex_uuid",
      "type",
      "p4k_id"
    )
    stats.existingDBItems = dbItems.length
    log(`${dbItems.length} existing items in database`)

    // Build lookup maps for efficient matching
    const dbByName = new Map<string, DBItem>()
    const dbByCstoneUuid = new Map<string, DBItem>()
    const dbByP4kId = new Map<string, DBItem>()

    for (const item of dbItems) {
      dbByName.set(normalize(item.name), item)
      if (item.cstone_uuid) {
        dbByCstoneUuid.set(item.cstone_uuid, item)
      }
      if (item.p4k_id) {
        dbByP4kId.set(item.p4k_id, item)
      }
    }

    log(`Built lookup maps: ${dbByName.size} by name, ${dbByCstoneUuid.size} by CStone UUID, ${dbByP4kId.size} by P4K ID`)

    // ========================================================================
    // STEP 3: Match P4K Items to Database Items
    // ========================================================================
    log("\n" + "=".repeat(80))
    log("STEP 3: Matching P4K Items to Database Items")
    log("=".repeat(80))
    log("Matching strategy: 1) Exact name → 2) CStone UUID → 3) Fuzzy name")

    const matches: MatchResult[] = []
    const inserts: P4KItem[] = []
    const nameChanges: { dbId: string; oldName: string; newName: string; matchType: string }[] = []

    for (const p4k of validItems) {
      let dbItem: DBItem | undefined
      let matchType: "exact" | "cstone_uuid" | "fuzzy" | undefined

      // Skip if already imported (has p4k_id)
      if (dbByP4kId.has(p4k.id)) {
        continue
      }

      // 1. Exact name match (case-insensitive)
      dbItem = dbByName.get(normalize(p4k.name))
      if (dbItem) {
        matchType = "exact"
        stats.matchedExact++
      }

      // 2. CStone UUID match
      // CStone UUIDs are often the same as P4K record IDs
      if (!dbItem && p4k.id) {
        dbItem = dbByCstoneUuid.get(p4k.id)
        if (dbItem) {
          matchType = "cstone_uuid"
          stats.matchedCStoneUUID++
        }
      }

      // 3. Fuzzy match (Levenshtein ≤ 2, names > 10 chars to avoid false positives)
      if (!dbItem && p4k.name.length > 10 && p4k.name.length <= 60) {
        const norm = normalize(p4k.name)
        const dbNameEntries = Array.from(dbByName.entries())
        for (const [dbName, candidate] of dbNameEntries) {
          // Skip if length difference is too large
          if (Math.abs(dbName.length - norm.length) > 2) continue
          
          // Calculate Levenshtein distance
          const distance = levenshtein(norm, dbName)
          if (distance <= 2) {
            dbItem = candidate
            matchType = "fuzzy"
            stats.matchedFuzzy++
            log(`Fuzzy match (distance=${distance}): "${candidate.name}" → "${p4k.name}"`)
            break
          }
        }
      }

      if (dbItem && matchType) {
        stats.matched++
        matches.push({ dbId: dbItem.id, p4k, matchType })

        // Track name changes
        if (normalize(dbItem.name) !== normalize(p4k.name)) {
          nameChanges.push({
            dbId: dbItem.id,
            oldName: dbItem.name,
            newName: p4k.name,
            matchType,
          })
        }

        // Remove from lookup maps to avoid duplicate matches
        dbByName.delete(normalize(dbItem.name))
        if (dbItem.cstone_uuid) {
          dbByCstoneUuid.delete(dbItem.cstone_uuid)
        }
      } else {
        inserts.push(p4k)
      }
    }

    stats.nameChanges = nameChanges.length
    stats.inserted = inserts.length

    log(`\nMatching Results:`)
    log(`  Total matched: ${stats.matched}`)
    log(`    - Exact name: ${stats.matchedExact}`)
    log(`    - CStone UUID: ${stats.matchedCStoneUUID}`)
    log(`    - Fuzzy: ${stats.matchedFuzzy}`)
    log(`  New items to insert: ${stats.inserted}`)
    log(`  Name changes: ${stats.nameChanges}`)

    if (nameChanges.length > 0) {
      log(`\nSample name changes (first 10):`)
      for (const nc of nameChanges.slice(0, 10)) {
        log(`  [${nc.matchType}] "${nc.oldName}" → "${nc.newName}"`)
      }
    }

    if (inserts.length > 0) {
      log(`\nSample new items (first 10):`)
      for (const ins of inserts.slice(0, 10)) {
        const mappedType = P4K_TYPE_MAP[ins.type || ""] || "Other"
        log(`  ${ins.name} (${ins.type} → ${mappedType})`)
      }
    }

    if (DRY_RUN) {
      log("\n" + "=".repeat(80))
      log("DRY RUN COMPLETE - No changes made to database")
      log("=".repeat(80))
      log("Summary", stats)
      await db.destroy()
      return
    }

    // ========================================================================
    // STEP 4: Execute Database Updates
    // ========================================================================
    log("\n" + "=".repeat(80))
    log("STEP 4: Updating Database")
    log("=".repeat(80))

    await db.transaction(async (trx) => {
      // Update matched items
      if (matches.length > 0) {
        log(`Updating ${matches.length} matched items...`)
        const BATCH = 100
        for (let i = 0; i < matches.length; i += BATCH) {
          const batch = matches.slice(i, i + BATCH)
          for (const { dbId, p4k } of batch) {
            await trx("game_items").where("id", dbId).update({
              name: p4k.name,
              type: P4K_TYPE_MAP[p4k.type || ""] || "Other",
              p4k_id: p4k.id,
              p4k_file: p4k.file,
              item_type: p4k.type,
              sub_type: p4k.subType,
              size: p4k.size,
              grade: p4k.grade,
              manufacturer: p4k.manufacturer,
              display_type: p4k.displayType,
              thumbnail_path: p4k.thumbnail,
              name_key: p4k.nameKey,
            })

            // Import attributes if present
            if (p4k.attributes && Object.keys(p4k.attributes).length > 0) {
              // Delete existing attributes for this item
              await trx("game_item_attributes")
                .where("game_item_id", dbId)
                .delete()

              // Insert new attributes
              const attributeRows = Object.entries(p4k.attributes)
                .filter(([_, value]) => value !== null && value !== undefined)
                .map(([name, value]) => ({
                  game_item_id: dbId,
                  attribute_name: name,
                  attribute_value: typeof value === "object" ? JSON.stringify(value) : String(value),
                }))

              if (attributeRows.length > 0) {
                await trx("game_item_attributes").insert(attributeRows)
              }
            }
          }
          if (i % 500 === 0 && i > 0) {
            log(`  Progress: ${i}/${matches.length}`)
          }
        }
        stats.updated = matches.length
        log(`✓ Updated ${matches.length} items`)
      }

      // Insert new items
      if (inserts.length > 0) {
        log(`Inserting ${inserts.length} new items...`)
        const BATCH = 100
        for (let i = 0; i < inserts.length; i += BATCH) {
          const batch = inserts.slice(i, i + BATCH)
          
          // Insert items and get their IDs
          const insertedItems = await trx("game_items").insert(
            batch.map((p4k) => ({
              name: p4k.name,
              type: P4K_TYPE_MAP[p4k.type || ""] || "Other",
              p4k_id: p4k.id,
              p4k_file: p4k.file,
              item_type: p4k.type,
              sub_type: p4k.subType,
              size: p4k.size,
              grade: p4k.grade,
              manufacturer: p4k.manufacturer,
              display_type: p4k.displayType,
              thumbnail_path: p4k.thumbnail,
              name_key: p4k.nameKey,
            })),
          ).returning("id")

          // Insert attributes for new items
          for (let j = 0; j < batch.length; j++) {
            const p4k = batch[j]
            const itemId = insertedItems[j].id || insertedItems[j]

            if (p4k.attributes && Object.keys(p4k.attributes).length > 0) {
              const attributeRows = Object.entries(p4k.attributes)
                .filter(([_, value]) => value !== null && value !== undefined)
                .map(([name, value]) => ({
                  game_item_id: itemId,
                  attribute_name: name,
                  attribute_value: typeof value === "object" ? JSON.stringify(value) : String(value),
                }))

              if (attributeRows.length > 0) {
                await trx("game_item_attributes").insert(attributeRows)
              }
            }
          }

          if (i % 500 === 0 && i > 0) {
            log(`  Progress: ${i}/${inserts.length}`)
          }
        }
        log(`✓ Inserted ${inserts.length} new items`)
      }

      // ========================================================================
      // STEP 5: Regenerate Full Set Items
      // ========================================================================
      log("\n" + "=".repeat(80))
      log("STEP 5: Regenerating Full Set Items")
      log("=".repeat(80))

      // Find all Core items
      const cores = await trx("game_items")
        .select("id", "name", "image_url")
        .whereRaw("lower(name) LIKE '% core %'")
        .andWhereNot("type", "Full Set")

      log(`Found ${cores.length} Core items`)

      let fullSetsCreated = 0
      for (const core of cores) {
        if (!isCoreItem(core.name)) {
          continue
        }

        const baseName = core.name.replace(/\s+Core\s+/i, " ").trim()
        const fullSetName = `${baseName} - Full Set`

        // Check if Full Set already exists
        const exists = await trx("game_items").where("name", fullSetName).first()
        if (!exists) {
          await trx("game_items").insert({
            name: fullSetName,
            type: "Full Set",
            description: `Full armor set for ${baseName}`,
            image_url: core.image_url || null,
          })
          fullSetsCreated++
        }
      }

      stats.fullSetsCreated = fullSetsCreated
      log(`✓ Created ${fullSetsCreated} Full Set items from ${cores.length} Core items`)
    })

    // ========================================================================
    // STEP 6: Rebuild Full-Text Search Index
    // ========================================================================
    log("\n" + "=".repeat(80))
    log("STEP 6: Rebuilding Full-Text Search Index")
    log("=".repeat(80))

    try {
      await db.raw("REINDEX INDEX CONCURRENTLY idx_game_items_search_vector")
      log("✓ Search index rebuilt successfully")
    } catch (error) {
      // Index might not exist, try without CONCURRENTLY
      try {
        await db.raw("REINDEX INDEX idx_game_items_search_vector")
        log("✓ Search index rebuilt successfully")
      } catch (err) {
        log("⚠️  Search index rebuild skipped (index may not exist)")
      }
    }

    // ========================================================================
    // STEP 7: Final Summary
    // ========================================================================
    log("\n" + "=".repeat(80))
    log("IMPORT COMPLETE")
    log("=".repeat(80))
    log("Summary:")
    log(`  P4K Items Processed: ${stats.validP4KItems}`)
    log(`  Existing DB Items: ${stats.existingDBItems}`)
    log(`  Matched: ${stats.matched} (exact: ${stats.matchedExact}, cstone: ${stats.matchedCStoneUUID}, fuzzy: ${stats.matchedFuzzy})`)
    log(`  Updated: ${stats.updated}`)
    log(`  Inserted: ${stats.inserted}`)
    log(`  Name Changes: ${stats.nameChanges}`)
    log(`  Full Sets Created: ${stats.fullSetsCreated}`)
    log(`  Errors: ${stats.errors.length}`)

    if (stats.errors.length > 0) {
      log("\nErrors encountered:")
      for (const error of stats.errors.slice(0, 10)) {
        log(`  - ${error}`)
      }
      if (stats.errors.length > 10) {
        log(`  ... and ${stats.errors.length - 10} more`)
      }
    }

    log("\n✓ Import completed successfully")
  } catch (error) {
    log("\n" + "=".repeat(80))
    log("IMPORT FAILED")
    log("=".repeat(80))
    log("Error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.stack) {
      log("Stack trace:", error.stack)
    }
    throw error
  } finally {
    await db.destroy()
  }
}

// --- Script Execution ---
importGameData().catch((err) => {
  console.error("\n❌ Import failed:", err.message)
  if (err.stack) {
    console.error("\nStack trace:")
    console.error(err.stack)
  }
  process.exit(1)
})
