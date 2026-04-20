/**
 * Import game items from P4K game-data.json (produced by extract-game-data.ts)
 *
 * Matches existing DB items by name/UUID, updates with authoritative p4k data,
 * inserts new items, and regenerates Full Set synthetic items.
 *
 * Usage:
 *   npm run import-game-data -- --file ./game-data-export/game-data.json
 *   npm run import-game-data -- --file ./game-data-export/game-data.zip --dry
 */

import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import knex from "knex"

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run")
const FILE_ARG = (() => {
  const idx = process.argv.indexOf("--file")
  return idx !== -1 ? process.argv[idx + 1] : null
})()

if (!FILE_ARG) {
  console.error("Usage: --file <game-data.json or game-data.zip> [--dry]")
  process.exit(1)
}

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

// --- Type mapping ---
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

// --- Helpers ---
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

function normalize(name: string): string {
  return name.toLowerCase().trim()
}

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
}

interface DBItem {
  id: string
  name: string
  cstone_uuid: string | null
  uex_uuid: string | null
  type: string | null
}

// --- Main ---
async function importGameData() {
  const log = (msg: string, meta?: any) => console.log(msg, meta ? JSON.stringify(meta) : "")

  log("Starting P4K game data import", { dryRun: DRY_RUN, file: FILE_ARG })

  // Load data
  let jsonPath = FILE_ARG!
  if (jsonPath.endsWith(".zip")) {
    const tmpDir = path.join("/tmp", "game-data-import-" + Date.now())
    fs.mkdirSync(tmpDir, { recursive: true })
    execSync(`unzip -o "${jsonPath}" -d "${tmpDir}"`, { stdio: "pipe" })
    jsonPath = path.join(tmpDir, "game-data.json")
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
  const p4kItems: P4KItem[] = data.items || []
  log(`Loaded ${p4kItems.length} items from game data (extracted ${data.extractedAt})`)

  // Filter to items with resolved names (exclude placeholders and loc keys)
  const validItems = p4kItems.filter((i) => i.name && !i.name.startsWith("@") && !i.name.includes("PLACEHOLDER"))
  log(`${validItems.length} items with usable names`)

  // Load existing DB items
  const dbItems: DBItem[] = await db("game_items").select("id", "name", "cstone_uuid", "uex_uuid", "type")
  log(`${dbItems.length} existing items in database`)

  // Build lookup maps
  const dbByName = new Map<string, DBItem>()
  const dbByCstoneUuid = new Map<string, DBItem>()
  for (const item of dbItems) {
    dbByName.set(normalize(item.name), item)
    if (item.cstone_uuid) dbByCstoneUuid.set(item.cstone_uuid, item)
  }

  // Match p4k items to DB items
  let matched = 0, inserted = 0
  const updates: { dbId: string; p4k: P4KItem }[] = []
  const inserts: P4KItem[] = []
  const nameChanges: { dbId: string; oldName: string; newName: string }[] = []

  for (const p4k of validItems) {
    // 1. Exact name match
    let dbItem = dbByName.get(normalize(p4k.name))

    // 2. CStone UUID match — DISABLED: CStone UUIDs are not p4k record IDs
    // if (!dbItem && p4k.id) {
    //   dbItem = dbByCstoneUuid.get(p4k.id)
    // }

    // 3. Fuzzy match (Levenshtein ≤ 2, names > 10 chars to avoid false positives)
    if (!dbItem && p4k.name.length > 10 && p4k.name.length <= 60) {
      const norm = normalize(p4k.name)
      for (const [dbName, candidate] of dbByName) {
        if (Math.abs(dbName.length - norm.length) > 2) continue
        if (levenshtein(norm, dbName) <= 1) {
          dbItem = candidate
          break
        }
      }
    }

    if (dbItem) {
      matched++
      updates.push({ dbId: dbItem.id, p4k })
      if (normalize(dbItem.name) !== normalize(p4k.name)) {
        nameChanges.push({ dbId: dbItem.id, oldName: dbItem.name, newName: p4k.name })
      }
      dbByName.delete(normalize(dbItem.name))
      if (dbItem.cstone_uuid) dbByCstoneUuid.delete(dbItem.cstone_uuid)
    } else {
      inserts.push(p4k)
    }
  }

  log(`Matching: ${matched} matched, ${inserts.length} new, ${nameChanges.length} name changes`)

  if (DRY_RUN) {
    log(`[DRY RUN] Would update ${updates.length} items`)
    log(`[DRY RUN] Would insert ${inserts.length} new items`)
    if (nameChanges.length > 0) {
      log(`[DRY RUN] Name changes (first 20):`)
      for (const nc of nameChanges.slice(0, 20)) {
        console.log(`  "${nc.oldName}" → "${nc.newName}"`)
      }
    }
    log(`[DRY RUN] Sample inserts (first 20):`)
    for (const ins of inserts.slice(0, 20)) {
      console.log(`  ${ins.name} (${P4K_TYPE_MAP[ins.type || ""] || "Other"})`)
    }
    await db.destroy()
    return
  }

  // Execute in transaction
  await db.transaction(async (trx) => {
    const BATCH = 100
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH)
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
      }
      if (i % 500 === 0 && i > 0) log(`  Updated ${i}/${updates.length}`)
    }
    log(`Updated ${updates.length} items`)

    for (let i = 0; i < inserts.length; i += BATCH) {
      const batch = inserts.slice(i, i + BATCH)
      await trx("game_items").insert(
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
      )
      inserted += batch.length
    }
    log(`Inserted ${inserted} new items`)

    // Regenerate Full Sets
    const cores = await trx("game_items")
      .select("id", "name", "image_url")
      .whereRaw("lower(name) LIKE '% core %'")
      .andWhereNot("type", "Full Set")

    let fullSetsCreated = 0
    for (const core of cores) {
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
    log(`Full Sets: ${fullSetsCreated} created from ${cores.length} cores`)
  })

  log("Import complete", { matched, inserted, nameChanges: nameChanges.length })
  await db.destroy()
}

importGameData().catch((err) => {
  console.error("Import failed:", err.message)
  process.exit(1)
})
