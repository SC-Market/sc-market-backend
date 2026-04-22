/**
 * Game Data Import Service
 *
 * Handles importing P4K game data from extracted JSON files.
 * Extracted from scripts/import-game-data.ts for reuse in API endpoints.
 *
 * Features:
 * - Parses P4K item data
 * - Maps P4K item types to database subcategories
 * - Matches P4K items to existing database items (exact, CStone UUID, fuzzy)
 * - Updates matched items with P4K metadata
 * - Inserts new items not found in database
 * - Regenerates "Full Set" synthetic items from "Core" items
 * - Provides detailed import summary
 */

import { Knex } from "knex"
import logger from "../../logger/logger.js"

// --- P4K Type to DB Subcategory Mapping (62 types) ---
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
  Commodity: "Commodity",
  UNDEFINED: "Other",
}

// --- Type Definitions ---

export interface GameDataPayload {
  extractedAt: string
  localizationKeys: number
  gameVersion?: string
  gameChannel?: "LIVE" | "PTU" | "EPTU"
  counts: Record<string, number>
  items: P4KItem[]
  blueprints: P4KRawBlueprint[]
  missions: P4KMission[]
  resources: P4KRawResource[]
  ships: P4KShip[]
  manufacturers: P4KManufacturer[]
  starmap: P4KStarmapLocation[]
  blueprintRewardPools: P4KBlueprintRewardPool[]
  reputationAmounts: Record<string, number>
  reputationRanks: Array<{
    scope: string
    displayName: string
    ceiling: number
    ranks: Array<{ code: string; displayName: string; threshold: number; index: number }>
  }>
  refiningProcesses: P4KRefiningProcess[]
  lootTables: Array<{ name: string; entries: Array<Record<string, unknown>> }>
  rockCompositions: Array<{ name: string; depositName: string | null; minDistinctElements: number; elements: Array<Record<string, unknown>> }>
}

export interface P4KShip {
  id: string
  name: string
  nameKey: string | null
  focus: string | null
  manufacturer: string | null
  size: number | null
  description: string | null
  file: string
}

export interface P4KManufacturer {
  id: string
  code: string
  name: string
  nameKey: string | null
  description: string | null
}

export interface P4KStarmapLocation {
  id: string
  name: string
  nameKey: string | null
  description: string | null
  type: string
  parent: string | null
  jurisdiction: string | null
  size: number | null
  file: string
}

export interface P4KBlueprintRewardPool {
  id: string
  name: string
  rewards: Array<{ blueprint: string; weight: number }>
}

export interface P4KRefiningProcess {
  name: string
  speed: string
  quality: string
}

export interface P4KBlueprintSlot {
  type: string
  name?: string
  displayName?: string
  count?: number
  modifiers?: Array<{ property: string; startQuality: number; endQuality: number; modifierAtStart: number; modifierAtEnd: number }>
  resource?: string
  quantity_scu?: number
  minQuality?: number
  item?: string
  quantity?: number
  ingredients?: P4KBlueprintSlot[]
}

export interface P4KRawBlueprint {
  id: string
  name: string
  category: string | null
  craftedItem: string | null
  craftTimeSeconds: number
  slots: P4KBlueprintSlot[]
  optionalCosts: P4KBlueprintSlot[]
}

export interface P4KRawResource {
  id: string
  name: string
  nameKey: string | null
  description: string | null
  group: string
  groupKey: string
  parentGroup: string | null
  density: number | null
  canBePurchased?: boolean
  can_be_purchased?: boolean
  canBeSalvaged?: boolean
  can_be_salvaged?: boolean
  canBeLooted?: boolean
  can_be_looted?: boolean
  canBeMined?: boolean
  can_be_mined?: boolean
  miningLocations?: string | null
  mining_locations?: string | null
  purchaseLocations?: string | null
  purchase_locations?: string | null
}

export interface P4KItem {
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
  attributes?: Record<string, string | number | boolean | string[] | null>
}

export interface P4KMission {
  id: string
  name: string
  title: string | null
  titleKey: string | null
  description: string | null
  missionGiver: string | null
  type: string | null
  template: string | null
  career: string | null
  reward: { uec: number; max?: number } | null
  reputationRewards: Array<{ faction: string; scope: string; reward: string; amount?: number }> | null
  blueprintRewards: Array<{ pool: string; chance: number }> | null
  minStanding: string | null
  maxStanding: string | null
  canBeShared: boolean | null
  notForRelease: boolean
  workInProgress: boolean
  onceOnly: boolean
  canReacceptAfterFailing: boolean | null
  canReacceptAfterAbandoning: boolean | null
  abandonedCooldownTime: number | null
  personalCooldownTime: number | null
  deadline: number | null
  availableInPrison: boolean
  variantCount?: number
  // Rich metadata
  shipEncounters?: Array<{ role: string; waves: Array<{ name: string; shipCount: number }> }>
  npcEncounters?: Array<{ name: string; count: number }>
  haulingOrders?: Array<{ resource: string; minSCU: number; maxSCU: number }>
  entitySpawns?: Array<{ name: string; count: number }>
  illegal?: boolean
  lawful?: boolean
  difficulty?: number
  starSystem?: string
  maxCrimestat?: number
}

export interface P4KBlueprint {
  id: string
  name: string
  nameKey: string | null
  description: string | null
  descriptionKey: string | null
  outputItemId: string
  outputQuantity: number
  ingredients: Array<{
    itemId: string
    quantity: number
    minQuality?: number
    recommendedQuality?: number
  }>
  category: string | null
  subcategory: string | null
  rarity: string | null
  tier: number | null
  craftingStation: string | null
  craftingTime: number | null
  requiredSkill: number | null
  iconUrl: string | null
}

export interface P4KResource {
  id: string
  name: string
  itemId: string
  category: string | null
  subcategory: string | null
  maxStackSize: number | null
  baseValue: number | null
  canBeMined: boolean
  canBePurchased: boolean
  canBeSalvaged: boolean
  canBeLooted: boolean
  miningLocations: Record<string, string[]> | null
  purchaseLocations: Record<string, string[]> | null
  density: number | null
  description: string | null
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
  matchType: "exact" | "cstone_uuid" | "fuzzy" | "normalized"
}

export interface ImportStats {
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
  missionsProcessed: number
  missionsInserted: number
  missionsUpdated: number
  missionsSkipped: number
  blueprintsProcessed: number
  blueprintsInserted: number
  blueprintsUpdated: number
  blueprintsSkipped: number
  resourcesProcessed: number
  resourcesInserted: number
  resourcesUpdated: number
  resourcesSkipped: number
  errors: string[]
}

interface MissionValidationResult {
  valid: boolean
  errors: string[]
}

// --- Mission Type Mapping ---
// Maps P4K mission types to database categories
const MISSION_TYPE_MAP: Record<string, string> = {
  Combat: "Combat",
  Delivery: "Delivery",
  Investigation: "Investigation",
  Bounty: "Bounty Hunting",
  Mining: "Mining",
  Salvage: "Salvage",
  Rescue: "Rescue",
  Transport: "Transport",
  Escort: "Escort",
  Assassination: "Assassination",
  Patrol: "Patrol",
  Recon: "Reconnaissance",
}

// --- Helper Functions ---

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

/**
 * Normalize item name for matching
 */
function normalize(name: string): string {
  return name.toLowerCase().trim()
}

/** Strip CStone-specific naming patterns to match against p4k names */
function normalizeForMatching(name: string): string {
  return name.toLowerCase().trim()
    .replace(/\s*\(\d{2}_\d{2}_\d{2,}\)\s*/g, "")   // variant suffixes like (01_02_01)
    .replace(/\s*\(modified[^)]*\)\s*/gi, "")          // (Modified 9T), (Modified XT)
    .replace(/\s*\(iae \d{4}\)\s*/gi, "")              // (IAE 2952)
    .replace(/\s*alternative\s*/gi, "")                 // "Alternative"
    .replace(/\s+armor\s+/gi, " ")                     // "Armor" between words
    .replace(/\s+/g, " ").trim()
}

function truncate(val: string | null, maxLen: number): string | null {
  if (!val) return null
  return val.length > maxLen ? val.slice(0, maxLen) : val
}

/**
 * Check if an item is a Core armor piece
 */
function isCoreItem(name: string): boolean {
  const normalized = name.toLowerCase()
  return (
    normalized.includes(" core ") && !normalized.match(/\b(life|thermal|power|reactor)core\b/)
  )
}

// --- Main Import Service ---

export class GameDataImportService {
  /**
   * Import game data from parsed JSON
   *
   * @param knex Database connection
   * @param gameData Parsed game-data.json content
   * @returns Import statistics
   */
  async importGameData(knex: Knex, gameData: GameDataPayload): Promise<ImportStats> {
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
      missionsProcessed: 0,
      missionsInserted: 0,
      missionsUpdated: 0,
      missionsSkipped: 0,
      blueprintsProcessed: 0,
      blueprintsInserted: 0,
      blueprintsUpdated: 0,
      blueprintsSkipped: 0,
      resourcesProcessed: 0,
      resourcesInserted: 0,
      resourcesUpdated: 0,
      resourcesSkipped: 0,
      errors: [],
    }

    try {
      // ========================================================================
      // STEP 1: Parse and validate input data
      // ========================================================================
      logger.info("Starting game data import")

      const p4kItems: P4KItem[] = gameData.items || []
      stats.totalP4KItems = p4kItems.length

      if (p4kItems.length === 0) {
        throw new Error("No items found in game data")
      }

      // Resolve game version from payload or default to LIVE
      const channel = gameData.gameChannel || "LIVE"
      const versionNumber = (gameData.gameVersion || "Unknown").slice(0, 200)

      let version = await knex("game_versions")
        .where({ version_type: channel, is_active: true })
        .first()

      if (!version) {
        const [newVersion] = await knex("game_versions")
          .insert({
            version_type: channel,
            version_number: versionNumber,
            is_active: true,
            last_data_update: new Date(),
          })
          .returning("*")
        version = newVersion
      } else if (versionNumber !== "Unknown") {
        await knex("game_versions")
          .where("version_id", version.version_id)
          .update({ version_number: versionNumber, last_data_update: new Date() })
      }

      const versionId: string = version.version_id

      logger.info(`Loaded ${p4kItems.length} items from P4K data`, { channel, versionNumber, versionId })

      // Filter to items with resolved names
      const filteredItems = p4kItems.filter(
        (i) => i.name && !i.name.startsWith("@") && !i.name.includes("PLACEHOLDER"),
      )

      // Deduplicate by name (keep the item with more attributes)
      const seenNames = new Map<string, P4KItem>()
      for (const item of filteredItems) {
        const key = item.name.toLowerCase().trim()
        const existing = seenNames.get(key)
        if (!existing || (item.attributes && Object.keys(item.attributes).length > (existing.attributes ? Object.keys(existing.attributes).length : 0))) {
          seenNames.set(key, item)
        }
      }
      const validItems = Array.from(seenNames.values())

      stats.validP4KItems = validItems.length
      logger.info(
        `${validItems.length} unique items with usable names (${p4kItems.length - validItems.length} filtered/deduped)`,
      )

      // ========================================================================
      // STEP 2: Load existing database items
      // ========================================================================
      logger.info("Loading existing database items")

      const dbItems: DBItem[] = await knex("game_items").select(
        "id",
        "name",
        "cstone_uuid",
        "uex_uuid",
        "type",
        "p4k_id",
      )
      stats.existingDBItems = dbItems.length
      logger.info(`${dbItems.length} existing items in database`)

      // Build lookup maps
      const dbByName = new Map<string, DBItem>()
      const dbByCstoneUuid = new Map<string, DBItem>()
      const dbByP4kId = new Map<string, DBItem>()
      const dbByNormalized = new Map<string, DBItem>()

      for (const item of dbItems) {
        dbByName.set(normalize(item.name), item)
        if (item.cstone_uuid) {
          dbByCstoneUuid.set(item.cstone_uuid, item)
        }
        if (item.p4k_id) {
          dbByP4kId.set(item.p4k_id, item)
        }
        const norm = normalizeForMatching(item.name)
        if (!dbByNormalized.has(norm)) {
          dbByNormalized.set(norm, item)
        }
      }

      // ========================================================================
      // STEP 3: Match P4K items to database items
      // ========================================================================
      logger.info("Matching P4K items to database items")

      const matches: MatchResult[] = []
      const inserts: P4KItem[] = []
      const nameChanges: { dbId: string; oldName: string; newName: string }[] = []

      for (const p4k of validItems) {
        let dbItem: DBItem | undefined
        let matchType: "exact" | "cstone_uuid" | "fuzzy" | "normalized" | undefined

        // Skip if already imported
        if (dbByP4kId.has(p4k.id)) {
          continue
        }

        // 1. Exact name match
        dbItem = dbByName.get(normalize(p4k.name))
        if (dbItem) {
          matchType = "exact"
          stats.matchedExact++
        }

        // 2. CStone UUID match
        if (!dbItem && p4k.id) {
          dbItem = dbByCstoneUuid.get(p4k.id)
          if (dbItem) {
            matchType = "cstone_uuid"
            stats.matchedCStoneUUID++
          }
        }

        // 3. Normalized name match (strips CStone suffixes like "(01_02_01)", "Armor", "(Modified)")
        if (!dbItem) {
          const norm = normalizeForMatching(p4k.name)
          dbItem = dbByNormalized.get(norm)
          if (dbItem) {
            matchType = "normalized"
            stats.matchedFuzzy++ // reuse fuzzy counter for normalized matches
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
            })
          }

          // Remove from lookup maps
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

      logger.info("Matching complete", {
        matched: stats.matched,
        exact: stats.matchedExact,
        cstone: stats.matchedCStoneUUID,
        fuzzy: stats.matchedFuzzy,
        inserts: stats.inserted,
      })

      // ========================================================================
      // STEP 4: Execute database updates
      // ========================================================================
      logger.info("Updating database")

      // Update matched items (no transaction - each batch is independent)
      const trx = knex

      if (matches.length > 0) {
          logger.info(`Updating ${matches.length} matched items`)
          const BATCH = 200
          for (let i = 0; i < matches.length; i += BATCH) {
            const batch = matches.slice(i, i + BATCH)
            for (const { dbId, p4k } of batch) {
              await trx.raw(
                `UPDATE game_items SET name = ?, type = ?, p4k_id = ?, p4k_file = ?,
                 item_type = ?, sub_type = ?, size = ?, grade = ?,
                 manufacturer = ?, display_type = ?, thumbnail_path = ?, name_key = ?
                 WHERE id = ?`,
                [
                  truncate(p4k.name, 100),
                  truncate(P4K_TYPE_MAP[p4k.type || ""] || "Other", 50),
                  p4k.id,
                  truncate(p4k.file, 200),
                  truncate(p4k.type, 100),
                  truncate(p4k.subType, 100),
                  p4k.size,
                  p4k.grade,
                  truncate(p4k.manufacturer, 100),
                  truncate(p4k.displayType, 100),
                  truncate(p4k.thumbnail, 500),
                  truncate(p4k.nameKey, 200),
                  dbId,
                ],
              )
            }
            if (i % 1000 === 0 && i > 0) logger.info(`  Updated ${i}/${matches.length}`)
          }

        // Insert new items
        if (inserts.length > 0) {
          logger.info(`Inserting ${inserts.length} new items`)
          const BATCH = 100
          for (let i = 0; i < inserts.length; i += BATCH) {
            const batch = inserts.slice(i, i + BATCH)
            await trx("game_items").insert(
              batch.map((p4k) => ({
                name: truncate(p4k.name, 100)!,
                type: truncate(P4K_TYPE_MAP[p4k.type || ""] || "Other", 50),
                p4k_id: p4k.id,
                p4k_file: truncate(p4k.file, 200),
                item_type: truncate(p4k.type, 100),
                sub_type: truncate(p4k.subType, 100),
                size: p4k.size,
                grade: p4k.grade,
                manufacturer: truncate(p4k.manufacturer, 100),
                display_type: truncate(p4k.displayType, 100),
                thumbnail_path: truncate(p4k.thumbnail, 500),
                name_key: truncate(p4k.nameKey, 200),
              })),
            ).onConflict("name").merge()
          }
        }

        // ========================================================================
        // STEP 4.5: Import item attributes from P4K data
        // ========================================================================
        logger.info("Importing item attributes")

        let attrCount = 0

        // Build all attribute rows first, then batch insert
        const attrRows: Array<{ game_item_id: string; attribute_name: string; attribute_value: string }> = []

        for (const { dbId, p4k } of matches) {
          if (!p4k.attributes || Object.keys(p4k.attributes).length === 0) continue
          for (const [attrName, attrValue] of Object.entries(p4k.attributes)) {
            if (attrValue === null || attrValue === undefined) continue
            attrRows.push({
              game_item_id: dbId,
              attribute_name: attrName,
              attribute_value: Array.isArray(attrValue) ? attrValue.join(", ") : String(attrValue),
            })
          }
        }

        // For inserts, we need to resolve IDs first
        if (inserts.length > 0) {
          const insertedItems = await trx("game_items")
            .whereIn("p4k_id", inserts.filter(p => p.id).map(p => p.id))
            .select("id", "p4k_id")
          const idMap = new Map(insertedItems.map((r: { id: string; p4k_id: string }) => [r.p4k_id, r.id]))

          for (const p4k of inserts) {
            if (!p4k.attributes || Object.keys(p4k.attributes).length === 0) continue
            const itemId = idMap.get(p4k.id)
            if (!itemId) continue
            for (const [attrName, attrValue] of Object.entries(p4k.attributes)) {
              if (attrValue === null || attrValue === undefined) continue
              attrRows.push({
                game_item_id: itemId,
                attribute_name: attrName,
                attribute_value: Array.isArray(attrValue) ? attrValue.join(", ") : String(attrValue),
              })
            }
          }
        }

        // Batch upsert attributes
        const ATTR_BATCH = 500
        for (let i = 0; i < attrRows.length; i += ATTR_BATCH) {
          const batch = attrRows.slice(i, i + ATTR_BATCH)
          await trx("game_item_attributes")
            .insert(batch.map(r => ({ ...r, updated_at: new Date() })))
            .onConflict(["game_item_id", "attribute_name"])
            .merge({ attribute_value: trx.raw("EXCLUDED.attribute_value"), updated_at: new Date() })
          if (i % 5000 === 0 && i > 0) logger.info(`  Attributes: ${i}/${attrRows.length}`)
        }
        attrCount = attrRows.length
        logger.info(`Imported ${attrCount} attributes`)

        // ========================================================================
        // STEP 5: Regenerate Full Set items
        // ========================================================================
        logger.info("Regenerating Full Set items")

        const cores = await trx("game_items")
          .select("id", "name", "image_url")
          .whereRaw("lower(name) LIKE '% core %'")
          .andWhereNot("type", "Full Set")

        let fullSetsCreated = 0
        for (const core of cores) {
          if (!isCoreItem(core.name)) {
            continue
          }

          const baseName = core.name.replace(/\s+Core\s+/i, " ").trim()
          const fullSetName = `${baseName} - Full Set`

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
        logger.info(`Created ${fullSetsCreated} Full Set items`)
      }

      // ========================================================================
      // STEP 6: Rebuild search index
      // ========================================================================
      logger.info("Rebuilding search index")

      try {
        await knex.raw("REINDEX INDEX CONCURRENTLY idx_game_items_search_vector")
      } catch (error) {
        try {
          await knex.raw("REINDEX INDEX idx_game_items_search_vector")
        } catch (err) {
          logger.warn("Search index rebuild skipped (index may not exist)")
        }
      }

      // ========================================================================
      // STEP 7: Import missions (if version_id provided)
      // ========================================================================
      if (gameData.missions && gameData.missions.length > 0) {
        logger.info("Importing missions")
        
        const missionStats = await this.importMissions(knex, gameData, versionId)
        stats.missionsProcessed = missionStats.processed
        stats.missionsInserted = missionStats.inserted
        stats.missionsUpdated = missionStats.updated
        stats.missionsSkipped = missionStats.skipped
        stats.errors.push(...missionStats.errors)

        logger.info("Mission import completed", {
          processed: missionStats.processed,
          inserted: missionStats.inserted,
          updated: missionStats.updated,
          skipped: missionStats.skipped,
        })
      }

      // ========================================================================
      // STEP 8: Import blueprints (if version_id provided)
      // ========================================================================
      if (gameData.blueprints && gameData.blueprints.length > 0) {
        logger.info("Importing blueprints")
        
        const blueprintStats = await this.importBlueprints(knex, gameData, versionId)
        stats.blueprintsProcessed = blueprintStats.processed
        stats.blueprintsInserted = blueprintStats.inserted
        stats.blueprintsUpdated = blueprintStats.updated
        stats.blueprintsSkipped = blueprintStats.skipped
        stats.errors.push(...blueprintStats.errors)

        logger.info("Blueprint import completed", {
          processed: blueprintStats.processed,
          inserted: blueprintStats.inserted,
          updated: blueprintStats.updated,
          skipped: blueprintStats.skipped,
        })
      }

      // ========================================================================
      // STEP 9: Import resources (if version_id provided)
      // ========================================================================
      if (gameData.resources && gameData.resources.length > 0) {
        logger.info("Importing resources")
        
        const resourceStats = await this.importResources(knex, gameData, versionId)
        stats.resourcesProcessed = resourceStats.processed
        stats.resourcesInserted = resourceStats.inserted
        stats.resourcesUpdated = resourceStats.updated
        stats.resourcesSkipped = resourceStats.skipped
        stats.errors.push(...resourceStats.errors)

        logger.info("Resource import completed", {
          processed: resourceStats.processed,
          inserted: resourceStats.inserted,
          updated: resourceStats.updated,
          skipped: resourceStats.skipped,
        })
      }

      // ========================================================================
      // STEP 10: Link mission blueprint rewards
      // ========================================================================
      if (gameData.missions && gameData.missions.length > 0) {
        logger.info("Linking mission blueprint rewards")
        
        const rewardStats = await this.linkMissionRewards(knex, gameData, versionId)
        
        logger.info("Mission reward linking completed", {
          processed: rewardStats.processed,
          linked: rewardStats.linked,
          skipped: rewardStats.skipped,
          errors: rewardStats.errors.length,
        })
        
        // Add reward linking errors to main stats
        stats.errors.push(...rewardStats.errors)
      }

      // ========================================================================
      // STEP 11: Import blueprint reward pools
      // ========================================================================
      if (gameData.blueprintRewardPools && gameData.blueprintRewardPools.length > 0) {
        logger.info("Importing blueprint reward pools")

        {
          for (const pool of gameData.blueprintRewardPools) {
            try {
              await knex("blueprint_reward_pools")
                .insert({
                  version_id: version.version_id,
                  pool_code: pool.name,
                  updated_at: new Date(),
                })
                .onConflict(["version_id", "pool_code"])
                .merge({ updated_at: new Date() })

              const [poolRow] = await knex("blueprint_reward_pools")
                .where({ version_id: versionId, pool_code: pool.name })
                .select("pool_id")

              // Replace pool entries
              await knex("blueprint_reward_pool_entries")
                .where("pool_id", poolRow.pool_id)
                .delete()

              for (const reward of pool.rewards) {
                const bp = await knex("blueprints")
                  .where({ version_id: version.version_id, blueprint_code: reward.blueprint })
                  .select("blueprint_id")
                  .first()

                if (bp) {
                  await knex("blueprint_reward_pool_entries").insert({
                    pool_id: poolRow.pool_id,
                    blueprint_id: bp.blueprint_id,
                    weight: reward.weight,
                  })
                }
              }
            } catch (err) {
              // Tables may not exist yet - skip silently
              logger.debug("Blueprint reward pool import skipped (table may not exist)")
              break
            }
          }
        }
      }

      // ========================================================================
      // STEP 12: Import refining processes
      // ========================================================================
      if (gameData.refiningProcesses && gameData.refiningProcesses.length > 0) {
        logger.info("Importing refining processes")
        try {
          await knex("refining_processes").delete()
          await knex("refining_processes").insert(
            gameData.refiningProcesses.map((p: P4KRefiningProcess) => ({
              name: p.name,
              speed: p.speed,
              quality: p.quality,
            })),
          )
        } catch {
          logger.debug("Refining processes import skipped (table may not exist)")
        }
      }

      // ========================================================================
      // STEP 12.5: Import reputation ranks
      // ========================================================================
      if (gameData.reputationRanks && gameData.reputationRanks.length > 0) {
        logger.info("Importing reputation ranks")
        try {
          await knex("reputation_ranks").delete()
          const rows: Array<Record<string, unknown>> = []
          for (const ladder of gameData.reputationRanks) {
            for (const rank of ladder.ranks || []) {
              rows.push({
                scope_code: ladder.scope,
                scope_display_name: ladder.displayName,
                ceiling: ladder.ceiling,
                standing_code: rank.code,
                standing_display_name: rank.displayName,
                threshold: rank.threshold,
                rank_index: rank.index,
              })
            }
          }
          const BATCH = 200
          for (let i = 0; i < rows.length; i += BATCH) {
            await knex("reputation_ranks").insert(rows.slice(i, i + BATCH))
          }
          logger.info(`Imported ${rows.length} reputation ranks across ${gameData.reputationRanks.length} scopes`)
        } catch {
          logger.debug("Reputation ranks import skipped (table may not exist)")
        }
      }

      // ========================================================================
      // STEP 12.6: Import loot tables
      // ========================================================================
      if (gameData.lootTables && gameData.lootTables.length > 0) {
        logger.info("Importing loot tables")
        try {
          await knex("loot_tables").delete()
          const BATCH = 100
          for (let i = 0; i < gameData.lootTables.length; i += BATCH) {
            await knex("loot_tables").insert(
              gameData.lootTables.slice(i, i + BATCH).map((t) => ({
                name: t.name,
                entries: JSON.stringify(t.entries),
              })),
            )
          }
          logger.info(`Imported ${gameData.lootTables.length} loot tables`)
        } catch {
          logger.debug("Loot tables import skipped (table may not exist)")
        }
      }

      // ========================================================================
      // STEP 12.7: Import rock compositions
      // ========================================================================
      if (gameData.rockCompositions && gameData.rockCompositions.length > 0) {
        logger.info("Importing rock compositions")
        try {
          await knex("rock_compositions").delete()
          const BATCH = 100
          for (let i = 0; i < gameData.rockCompositions.length; i += BATCH) {
            await knex("rock_compositions").insert(
              gameData.rockCompositions.slice(i, i + BATCH).map((r) => ({
                name: r.name,
                deposit_name: r.depositName,
                min_distinct_elements: r.minDistinctElements,
                elements: JSON.stringify(r.elements),
              })),
            )
          }
          logger.info(`Imported ${gameData.rockCompositions.length} rock compositions`)
        } catch {
          logger.debug("Rock compositions import skipped (table may not exist)")
        }
      }

      // ========================================================================
      // STEP 13: Import starmap locations
      // ========================================================================
      if (gameData.starmap && gameData.starmap.length > 0) {
        logger.info("Importing starmap locations")
        try {
          {
            for (const loc of gameData.starmap) {
              await knex("starmap_locations")
                .insert({
                  version_id: versionId,
                  location_code: loc.file,
                  location_name: loc.name,
                  location_type: loc.type,
                  parent_code: loc.parent,
                  jurisdiction: loc.jurisdiction,
                  description: loc.description,
                  size: loc.size,
                  updated_at: new Date(),
                })
                .onConflict(["version_id", "location_code"])
                .merge({
                  location_name: loc.name,
                  location_type: loc.type,
                  parent_code: loc.parent,
                  jurisdiction: loc.jurisdiction,
                  description: loc.description,
                  updated_at: new Date(),
                })
            }
            logger.info(`Imported ${gameData.starmap.length} starmap locations`)
          }
        } catch {
          logger.debug("Starmap import skipped (table may not exist)")
        }
      }

      // ========================================================================
      // STEP 14: Import manufacturers
      // ========================================================================
      if (gameData.manufacturers && gameData.manufacturers.length > 0) {
        logger.info("Importing manufacturers")
        try {
          for (const mfr of gameData.manufacturers) {
            if (!mfr.code) continue
            await knex("wiki_manufacturers")
              .insert({
                code: mfr.code,
                name: mfr.name || mfr.code,
                description: mfr.description || null,
                name_key: mfr.nameKey || null,
              })
              .onConflict("code")
              .merge({
                name: mfr.name || mfr.code,
                description: mfr.description || null,
              })
          }
          logger.info(`Imported ${gameData.manufacturers.length} manufacturers`)
        } catch {
          logger.debug("Manufacturers import skipped (table may not exist)")
        }
      }

      // ========================================================================
      // STEP 15: Import ships
      // ========================================================================
      if (gameData.ships && gameData.ships.length > 0) {
        logger.info("Importing ships")
        try {
          {
            for (const ship of gameData.ships) {
              if (!ship.name || ship.name.startsWith("@")) continue
              await knex("wiki_ships")
                .insert({
                  version_id: versionId,
                  ship_code: ship.file,
                  name: ship.name,
                  focus: ship.focus,
                  manufacturer_code: ship.manufacturer,
                  size: ship.size,
                  description: ship.description,
                })
                .onConflict(["version_id", "ship_code"])
                .merge({
                  name: ship.name,
                  focus: ship.focus,
                  manufacturer_code: ship.manufacturer,
                  description: ship.description,
                })
            }
            logger.info(`Imported ${gameData.ships.length} ships`)
          }
        } catch {
          logger.debug("Ships import skipped (table may not exist)")
        }
      }

      logger.info("Import completed successfully", stats)
      return stats
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error("Import failed", { error: errorMessage })
      stats.errors.push(errorMessage)
      throw error
    }
  }

  /**
   * Import missions from extracted game data
   *
   * @param knex Database connection
   * @param gameData Parsed game-data.json content
   * @param versionId Game version UUID to associate missions with
   * @returns Mission import statistics
   */
  async importMissions(
    knex: Knex,
    gameData: { missions?: P4KMission[] },
    versionId: string,
  ): Promise<{
    processed: number
    inserted: number
    updated: number
    skipped: number
    errors: string[]
  }> {
    const stats = {
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    }

    try {
      logger.info("Starting mission import", { versionId })

      // Parse mission data from extracted JSON
      const missions = this.parseMissionData(gameData)
      stats.processed = missions.length

      if (missions.length === 0) {
        logger.warn("No missions found in game data")
        return stats
      }

      logger.info(`Parsed ${missions.length} missions from game data`)

      // Process missions in transaction — full replace for this version
      await knex.transaction(async (trx) => {
        // Delete all existing missions for this version (cascades to child tables)
        const deleted = await trx("missions").where("version_id", versionId).delete()
        if (deleted) logger.info(`Deleted ${deleted} old missions for version ${versionId}`)

        for (const mission of missions) {
          try {
            // Validate mission data
            const validation = this.validateMissionData(mission)
            if (!validation.valid) {
              logger.debug("Skipped mission", {
                missionId: mission.id,
                errors: validation.errors,
              })
              stats.skipped++
              stats.errors.push(
                `Mission ${mission.id}: ${validation.errors.join(", ")}`,
              )
              continue
            }

            // Store mission in database
            const result = await this.upsertMission(trx, versionId, mission)
            if (result.action === "inserted") {
              stats.inserted++
            } else if (result.action === "updated") {
              stats.updated++
            }

            // Insert rich metadata into child tables
            const mid = result.missionId
            // Clear existing metadata for this mission
            await Promise.all([
              trx("mission_ship_encounters").where("mission_id", mid).delete(),
              trx("mission_npc_encounters").where("mission_id", mid).delete(),
              trx("mission_hauling_orders").where("mission_id", mid).delete(),
              trx("mission_entity_spawns").where("mission_id", mid).delete(),
            ])
            // Helper to deduplicate by key
            const dedup = <T>(arr: T[] | undefined, key: keyof T): T[] => {
              if (!arr?.length) return []
              const seen = new Set<unknown>()
              return arr.filter((item) => {
                const k = item[key]
                if (seen.has(k)) return false
                seen.add(k)
                return true
              })
            }
            const ships = dedup(mission.shipEncounters, "role")
            if (ships.length) {
              await trx("mission_ship_encounters").insert(
                ships.map((e) => ({ mission_id: mid, role: e.role, waves: JSON.stringify(e.waves) })),
              ).onConflict(["mission_id", "role"]).ignore()
            }
            const npcs = dedup(mission.npcEncounters, "name")
            if (npcs.length) {
              await trx("mission_npc_encounters").insert(
                npcs.map((e) => ({ mission_id: mid, name: e.name, count: e.count })),
              ).onConflict(["mission_id", "name"]).ignore()
            }
            const hauling = dedup(mission.haulingOrders, "resource")
            if (hauling.length) {
              await trx("mission_hauling_orders").insert(
                hauling.map((e) => ({ mission_id: mid, resource_name: e.resource, min_scu: e.minSCU, max_scu: e.maxSCU })),
              ).onConflict(["mission_id", "resource_name"]).ignore()
            }
            const entities = dedup(mission.entitySpawns, "name")
            if (entities.length) {
              await trx("mission_entity_spawns").insert(
                entities.map((e) => ({ mission_id: mid, name: e.name, count: e.count })),
              ).onConflict(["mission_id", "name"]).ignore()
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.error("Failed to import mission", {
              missionId: mission.id,
              error: errorMessage,
            })
            stats.errors.push(`Mission ${mission.id}: ${errorMessage}`)
            stats.skipped++
          }
        }
      })

      logger.info("Mission import completed", stats)
      return stats
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error("Mission import failed", { error: errorMessage })
      stats.errors.push(errorMessage)
      throw error
    }
  }

  /**
   * Parse mission data from extracted JSON
   * Subtask 8.4.1: Parse mission data from extracted JSON
   */
  private parseMissionData(gameData: { missions?: P4KMission[] }): P4KMission[] {
    const missions: P4KMission[] = []
    const rawMissions = gameData.missions || []

    for (const raw of rawMissions) {
      try {
        missions.push({
          id: raw.id,
          name: raw.name,
          title: raw.title || null,
          titleKey: raw.titleKey || null,
          description: raw.description || null,
          missionGiver: raw.missionGiver || null,
          type: raw.type || null,
          template: raw.template || null,
          career: raw.career || null,
          reward: raw.reward || null,
          reputationRewards: raw.reputationRewards || null,
          blueprintRewards: raw.blueprintRewards || null,
          minStanding: raw.minStanding || null,
          maxStanding: raw.maxStanding || null,
          canBeShared: raw.canBeShared ?? null,
          notForRelease: raw.notForRelease || false,
          workInProgress: raw.workInProgress || false,
          onceOnly: raw.onceOnly || false,
          canReacceptAfterFailing: raw.canReacceptAfterFailing ?? null,
          canReacceptAfterAbandoning: raw.canReacceptAfterAbandoning ?? null,
          abandonedCooldownTime: raw.abandonedCooldownTime || null,
          personalCooldownTime: raw.personalCooldownTime || null,
          deadline: raw.deadline || null,
          availableInPrison: raw.availableInPrison || false,
          variantCount: raw.variantCount,
          shipEncounters: raw.shipEncounters || undefined,
          npcEncounters: raw.npcEncounters || undefined,
          haulingOrders: raw.haulingOrders || undefined,
          entitySpawns: raw.entitySpawns || undefined,
          illegal: raw.illegal ?? undefined,
          lawful: raw.lawful ?? undefined,
          difficulty: raw.difficulty ?? undefined,
          starSystem: raw.starSystem || undefined,
          maxCrimestat: raw.maxCrimestat ?? undefined,
        })
      } catch (error) {
        logger.warn("Failed to parse mission", { missionId: raw.id, error })
      }
    }

    return missions
  }

  /**
   * Validate mission data
   * Subtask 8.4.2: Map mission types and categories
   */
  private validateMissionData(mission: P4KMission): MissionValidationResult {
    const errors: string[] = []

    // Required fields
    if (!mission.id) {
      errors.push("Missing mission ID")
    }
    if (!mission.name) {
      errors.push("Missing mission name")
    }

    // Skip missions marked as not for release
    if (mission.notForRelease || mission.workInProgress) {
      errors.push("Mission marked as not for release")
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Insert or update mission in database
   * Subtask 8.4.3: Store mission metadata in database
   * Subtask 8.4.4: Link missions to game versions
   * Subtask 8.4.5: Handle mission rewards and requirements
   */
  private async upsertMission(
    trx: Knex.Transaction,
    versionId: string,
    mission: P4KMission,
  ): Promise<{ action: "inserted" | "updated"; missionId: string }> {
    // Map mission type to category
    const category = mission.type ? MISSION_TYPE_MAP[mission.type] || mission.type : "Unknown"

    // Build mission record
    const missionRecord = {
      version_id: versionId,
      mission_code: mission.name,
      mission_name: mission.title || mission.name,
      mission_description: mission.description,
      category,
      mission_type: mission.type,
      career_type: mission.career,
      template_name: mission.template,
      title_loc_key: mission.titleKey,
      mission_giver_org: mission.missionGiver,
      credit_reward_min: mission.reward?.uec || null,
      credit_reward_max: mission.reward?.max || mission.reward?.uec || null,
      min_standing: mission.minStanding,
      max_standing: mission.maxStanding,
      is_shareable: mission.canBeShared ?? false,
      is_unique_mission: mission.onceOnly,
      available_in_prison: mission.availableInPrison,
      can_reaccept_after_failing: mission.canReacceptAfterFailing ?? false,
      can_reaccept_after_abandoning: mission.canReacceptAfterAbandoning ?? false,
      abandoned_cooldown_time: mission.abandonedCooldownTime,
      personal_cooldown_time: mission.personalCooldownTime,
      deadline_seconds: mission.deadline,
      has_blueprint_rewards: (mission.blueprintRewards?.length ?? 0) > 0,
      variant_count: mission.variantCount || null,
      is_illegal: mission.illegal ?? null,
      is_lawful: mission.lawful ?? null,
      difficulty_from_broker: mission.difficulty ?? null,
      star_system_derived: mission.starSystem || null,
      max_crimestat: mission.maxCrimestat ?? null,
      data_source: "extraction",
      is_verified: false,
      updated_at: new Date(),
    }

    // Check if mission already exists for this version
    const existing = await trx("missions")
      .where({ version_id: versionId, mission_code: mission.name })
      .first()

    if (existing) {
      await trx("missions")
        .where({ version_id: versionId, mission_code: mission.name })
        .update(missionRecord)
      return { action: "updated", missionId: existing.mission_id }
    } else {
      const [row] = await trx("missions").insert({
        ...missionRecord,
        created_at: new Date(),
      }).returning("mission_id")
      return { action: "inserted", missionId: row.mission_id }
    }
  }
  /**
   * Import blueprints from extracted game data
   *
   * @param knex Database connection
   * @param gameData Parsed game-data.json content
   * @param versionId Game version UUID to associate blueprints with
   * @returns Blueprint import statistics
   */
  async importBlueprints(
    knex: Knex,
    gameData: { blueprints?: P4KRawBlueprint[] },
    versionId: string,
  ): Promise<{
    processed: number
    inserted: number
    updated: number
    skipped: number
    errors: string[]
  }> {
    const stats = {
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    }

    try {
      logger.info("Starting blueprint import", { versionId })

      // Parse blueprint data from extracted JSON
      const blueprints = this.parseBlueprintData(gameData)
      stats.processed = blueprints.length

      if (blueprints.length === 0) {
        logger.warn("No blueprints found in game data")
        return stats
      }

      logger.info(`Parsed ${blueprints.length} blueprints from game data`)

      // Process blueprints in transaction
      await knex.transaction(async (trx) => {
        for (const blueprint of blueprints) {
          try {
            // Validate blueprint data
            const validation = this.validateBlueprintData(blueprint)
            if (!validation.valid) {
              logger.warn("Invalid blueprint data", {
                blueprintId: blueprint.id,
                errors: validation.errors,
              })
              stats.skipped++
              stats.errors.push(
                `Blueprint ${blueprint.id}: ${validation.errors.join(", ")}`,
              )
              continue
            }

            // Store blueprint in database
            const result = await this.upsertBlueprint(trx, versionId, blueprint)
            if (result === "inserted") {
              stats.inserted++
            } else if (result === "updated") {
              stats.updated++
            } else if (result === "skipped") {
              stats.skipped++
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.error("Failed to import blueprint", {
              blueprintId: blueprint.id,
              error: errorMessage,
            })
            stats.errors.push(`Blueprint ${blueprint.id}: ${errorMessage}`)
            stats.skipped++
          }
        }
      })

      logger.info("Blueprint import completed", stats)
      return stats
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error("Blueprint import failed", { error: errorMessage })
      stats.errors.push(errorMessage)
      throw error
    }
  }

  /**
   * Parse blueprint data from extracted JSON
   * Handles the P4K extraction format: craftedItem (filename), slots[] with nested ingredients
   */
  private parseBlueprintData(gameData: { blueprints?: P4KRawBlueprint[] }): P4KBlueprint[] {
    const blueprints: P4KBlueprint[] = []
    const rawBlueprints = gameData.blueprints || []

    for (const raw of rawBlueprints) {
      try {
        // Flatten nested slots into a flat ingredients array
        const ingredients: Array<{ itemId: string; quantity: number; minQuality?: number }> = []

        const flattenSlots = (slots: P4KBlueprintSlot[]) => {
          for (const slot of slots || []) {
            if (slot.type === "resource" && slot.resource) {
              ingredients.push({
                itemId: slot.resource,
                quantity: slot.quantity_scu || 1,
                minQuality: slot.minQuality || undefined,
              })
            } else if (slot.type === "item" && slot.item) {
              ingredients.push({
                itemId: slot.item,
                quantity: slot.quantity || 1,
                minQuality: slot.minQuality || undefined,
              })
            } else if (slot.type === "slot" && slot.ingredients) {
              flattenSlots(slot.ingredients)
            }
          }
        }

        flattenSlots(raw.slots || [])
        flattenSlots(raw.optionalCosts || [])

        blueprints.push({
          id: raw.id,
          name: raw.name,
          nameKey: null,
          description: null,
          descriptionKey: null,
          outputItemId: raw.craftedItem || "",
          outputQuantity: 1,
          ingredients,
          category: raw.category || null,
          subcategory: null,
          rarity: null,
          tier: null,
          craftingStation: null,
          craftingTime: raw.craftTimeSeconds || null,
          requiredSkill: null,
          iconUrl: null,
        })
      } catch (error) {
        logger.warn("Failed to parse blueprint", { blueprintId: raw.id, error })
      }
    }

    return blueprints
  }

  /**
   * Validate blueprint data
   * Subtask 8.5.2: Map blueprint types and categories
   */
  private validateBlueprintData(blueprint: P4KBlueprint): MissionValidationResult {
    const errors: string[] = []

    if (!blueprint.id) {
      errors.push("Missing blueprint ID")
    }
    if (!blueprint.name) {
      errors.push("Missing blueprint name")
    }
    if (!blueprint.outputItemId) {
      errors.push("Missing output item ID")
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Insert or update blueprint in database
   * Subtask 8.5.3: Store blueprint metadata in database
   * Subtask 8.5.4: Link blueprints to game versions
   * Subtask 8.5.5: Handle blueprint requirements and outputs
   */
  private async upsertBlueprint(
    trx: Knex.Transaction,
    versionId: string,
    blueprint: P4KBlueprint,
  ): Promise<"inserted" | "updated" | "skipped"> {
    // First, verify the output game item exists (match by p4k_file or name)
    const outputItem = await trx("game_items")
      .where("p4k_file", blueprint.outputItemId)
      .orWhere("name", blueprint.outputItemId)
      .orWhereRaw("p4k_file LIKE ?", [`%${blueprint.outputItemId}`])
      .first()

    if (!outputItem) {
      logger.debug("Output item not found, skipping blueprint", { outputItemId: blueprint.outputItemId })
      return "skipped"
    }

    // Build blueprint record
    const blueprintRecord = {
      version_id: versionId,
      blueprint_code: blueprint.id,
      blueprint_name: blueprint.name,
      blueprint_description: blueprint.description,
      output_game_item_id: outputItem.id,
      output_quantity: blueprint.outputQuantity,
      item_category: blueprint.category,
      item_subcategory: blueprint.subcategory,
      rarity: blueprint.rarity,
      tier: blueprint.tier,
      crafting_station_type: blueprint.craftingStation,
      crafting_time_seconds: blueprint.craftingTime,
      required_skill_level: blueprint.requiredSkill,
      icon_url: blueprint.iconUrl,
      is_active: true,
      updated_at: new Date(),
    }

    // Check if blueprint already exists for this version
    const existing = await trx("blueprints")
      .where({ version_id: versionId, blueprint_code: blueprint.id })
      .first()

    let blueprintId: string

    if (existing) {
      // Update existing blueprint
      await trx("blueprints")
        .where({ version_id: versionId, blueprint_code: blueprint.id })
        .update(blueprintRecord)
      blueprintId = existing.blueprint_id

      // Delete existing ingredients
      await trx("blueprint_ingredients")
        .where({ blueprint_id: blueprintId })
        .delete()
    } else {
      // Insert new blueprint
      const [inserted] = await trx("blueprints")
        .insert({
          ...blueprintRecord,
          created_at: new Date(),
        })
        .returning("blueprint_id")
      blueprintId = inserted.blueprint_id
    }

    // Insert ingredients
    for (let i = 0; i < blueprint.ingredients.length; i++) {
      const ing = blueprint.ingredients[i]

      // Find the ingredient game item (by name for resources, by p4k_file for items)
      const ingredientItem = await trx("game_items")
        .where("p4k_file", ing.itemId)
        .orWhere("name", ing.itemId)
        .orWhereRaw("lower(name) = ?", [ing.itemId.toLowerCase()])
        .first()

      if (!ingredientItem) {
        logger.warn("Ingredient item not found, skipping", {
          blueprintId: blueprint.id,
          ingredientId: ing.itemId,
        })
        continue
      }

      await trx("blueprint_ingredients").insert({
        blueprint_id: blueprintId,
        ingredient_game_item_id: ingredientItem.id,
        quantity_required: ing.quantity,
        min_quality_tier: null,
        recommended_quality_tier: null,
        is_alternative: false,
        display_order: i,
        created_at: new Date(),
      })
    }

    return existing ? "updated" : "inserted"
  }

  /**
   * Import resources from extracted game data
   *
   * @param knex Database connection
   * @param gameData Parsed game-data.json content
   * @param versionId Game version UUID to associate resources with
   * @returns Resource import statistics
   */
  async importResources(
    knex: Knex,
    gameData: { resources?: P4KRawResource[] },
    versionId: string,
  ): Promise<{
    processed: number
    inserted: number
    updated: number
    skipped: number
    errors: string[]
  }> {
    const stats = {
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    }

    try {
      logger.info("Starting resource import", { versionId })

      // Parse resource data from extracted JSON
      const resources = this.parseResourceData(gameData)
      stats.processed = resources.length

      if (resources.length === 0) {
        logger.warn("No resources found in game data")
        return stats
      }

      logger.info(`Parsed ${resources.length} resources from game data`)

      // Process resources in transaction
      await knex.transaction(async (trx) => {
        for (const resource of resources) {
          try {
            // Validate resource data
            const validation = this.validateResourceData(resource)
            if (!validation.valid) {
              logger.warn("Invalid resource data", {
                resourceId: resource.id,
                errors: validation.errors,
              })
              stats.skipped++
              stats.errors.push(
                `Resource ${resource.id}: ${validation.errors.join(", ")}`,
              )
              continue
            }

            // Store resource in database
            const result = await this.upsertResource(trx, versionId, resource)
            if (result === "inserted") {
              stats.inserted++
            } else if (result === "updated") {
              stats.updated++
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.error("Failed to import resource", {
              resourceId: resource.id,
              error: errorMessage,
            })
            stats.errors.push(`Resource ${resource.id}: ${errorMessage}`)
            stats.skipped++
          }
        }
      })

      logger.info("Resource import completed", stats)
      return stats
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error("Resource import failed", { error: errorMessage })
      stats.errors.push(errorMessage)
      throw error
    }
  }

  /**
   * Parse resource data from extracted JSON
   * Subtask 8.6.1: Parse resource data from extracted JSON
   */
  private parseResourceData(gameData: { resources?: P4KRawResource[] }): P4KResource[] {
    const resources: P4KResource[] = []
    const rawResources = gameData.resources || []

    for (const raw of rawResources) {
      try {
        resources.push({
          id: raw.id,
          name: raw.name,
          itemId: raw.id,
          category: raw.group || null,
          subcategory: raw.groupKey || null,
          maxStackSize: null,
          baseValue: null,
          canBeMined: false,
          canBePurchased: false,
          canBeSalvaged: false,
          canBeLooted: false,
          miningLocations: null,
          purchaseLocations: null,
          density: raw.density ?? null,
          description: raw.description ?? null,
        })
      } catch (error) {
        logger.warn("Failed to parse resource", { resourceId: raw.id, error })
      }
    }

    return resources
  }

  /**
   * Validate resource data
   * Subtask 8.6.2: Map resource types and categories
   */
  private validateResourceData(resource: P4KResource): MissionValidationResult {
    const errors: string[] = []

    if (!resource.id) errors.push("Missing resource ID")
    if (!resource.name) errors.push("Missing resource name")

    return { valid: errors.length === 0, errors }
  }

  /**
   * Insert or update resource in database
   * Subtask 8.6.3: Store resource metadata in database
   * Subtask 8.6.4: Link resources to game versions
   * Subtask 8.6.5: Handle resource properties and attributes
   */
  private async upsertResource(
    trx: Knex.Transaction,
    versionId: string,
    resource: P4KResource,
  ): Promise<"inserted" | "updated"> {
    // Find or create the game item
    let gameItem = await trx("game_items")
      .where("name", resource.name)
      .orWhereRaw("lower(name) = ?", [resource.name.toLowerCase()])
      .first()

    if (!gameItem) {
      // Create a new game item for this resource
      const [inserted] = await trx("game_items")
        .insert({
          name: resource.name,
          type: "Commodity",
          p4k_id: resource.itemId || null,
        })
        .returning("id")
      gameItem = inserted
    }

    const resourceRecord = {
      version_id: versionId,
      game_item_id: gameItem.id,
      resource_category: resource.category || "Unknown",
      resource_subcategory: resource.subcategory,
      resource_name: resource.name,
      group_name: resource.category,
      p4k_id: resource.itemId,
      density: resource.density ?? null,
      description: resource.description ?? null,
      updated_at: new Date(),
    }

    const existing = await trx("resources")
      .where({ version_id: versionId, game_item_id: gameItem.id })
      .first()

    if (existing) {
      // Update existing resource
      await trx("resources")
        .where({ version_id: versionId, game_item_id: gameItem.id })
        .update(resourceRecord)
      return "updated"
    } else {
      // Insert new resource
      await trx("resources").insert({
        ...resourceRecord,
        created_at: new Date(),
      })
      return "inserted"
    }
  }

  /**
   * Link mission blueprint rewards
   * 
   * This method processes mission blueprint reward data from the extracted game data
   * and creates the relationships in the mission_blueprint_rewards table.
   * 
   * @param knex Database connection
   * @param gameData Parsed game-data.json content
   * @param versionId Game version UUID to associate rewards with
   * @returns Reward linking statistics
   */
  async linkMissionRewards(
    knex: Knex,
    gameData: { missions?: P4KMission[] },
    versionId: string,
  ): Promise<{
    processed: number
    linked: number
    skipped: number
    errors: string[]
  }> {
    const stats = { processed: 0, linked: 0, skipped: 0, errors: [] as string[] }

    try {
      const missions = gameData.missions || []
      const withPools = missions.filter((m) => m.blueprintRewards?.length)
      stats.processed = withPools.length

      if (withPools.length === 0) {
        logger.info("No missions with blueprint rewards found")
        return stats
      }

      logger.info(`Linking ${withPools.length} missions to blueprint pools`)

      // Clear existing links for this version
      await knex("mission_blueprint_rewards")
        .whereIn("mission_id", knex("missions").where("version_id", versionId).select("mission_id"))
        .delete()

      for (const mission of withPools) {
        try {
          const dbMission = await knex("missions")
            .where({ version_id: versionId, mission_code: mission.name })
            .select("mission_id")
            .first()
          if (!dbMission) continue

          for (const br of mission.blueprintRewards || []) {
            // Find blueprints in this pool from the blueprint_reward_pools table
            const poolEntries = await knex("blueprint_reward_pool_entries as e")
              .join("blueprint_reward_pools as p", "p.pool_id", "e.pool_id")
              .where("p.pool_code", br.pool)
              .where("p.version_id", versionId)
              .select("e.blueprint_id", "e.weight")

            for (const entry of poolEntries) {
              try {
                const totalWeight = poolEntries.reduce((s: number, e: { weight: number }) => s + e.weight, 0)
                await knex("mission_blueprint_rewards")
                  .insert({
                    mission_id: dbMission.mission_id,
                    blueprint_id: entry.blueprint_id,
                    reward_pool_id: 1,
                    reward_pool_size: poolEntries.length,
                    selection_count: 1,
                    drop_probability: (entry.weight / totalWeight) * 100 * br.chance,
                    is_guaranteed: false,
                  })
                  .onConflict(["mission_id", "blueprint_id"])
                  .ignore()
                stats.linked++
              } catch {}
            }
          }
        } catch (err) {
          stats.skipped++
        }
      }

      logger.info(`Linked ${stats.linked} mission→blueprint rewards`)
      return stats
    } catch (error) {
      stats.errors.push(error instanceof Error ? error.message : String(error))
      return stats
    }
  }
}

export const gameDataImportService = new GameDataImportService()
