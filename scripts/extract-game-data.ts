/**
 * Extract Star Citizen game data using StarBreaker CLI
 *
 * Extracts from Data.p4k (or pre-extracted DCB), resolves all localization
 * keys to English, and produces a game-data.zip with items, blueprints,
 * missions, resources, and starmap locations.
 *
 * Usage:
 *   npx tsx scripts/extract-game-data.ts --p4k /path/to/Data.p4k --starbreaker /path/to/starbreaker
 *   npx tsx scripts/extract-game-data.ts --dcb-dir /path/to/dcb_out --loc /path/to/global.ini
 */

import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"

// --- CLI args ---
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}

const P4K_PATH = getArg("p4k")
const STARBREAKER_BIN = getArg("starbreaker")
const DCB_DIR = getArg("dcb-dir")
const LOC_FILE = getArg("loc")
const OUTPUT_DIR = getArg("output") || path.join(process.cwd(), "game-data-export")

if (!DCB_DIR && (!P4K_PATH || !STARBREAKER_BIN)) {
  console.error("Usage: --p4k <path> --starbreaker <bin>  OR  --dcb-dir <path> --loc <global.ini>")
  process.exit(1)
}

// --- Step 1: Extract DCB and localization if needed ---
let dcbRoot: string
let locPath: string

if (DCB_DIR) {
  dcbRoot = DCB_DIR
  console.log(`Using existing DCB export: ${dcbRoot}`)
} else {
  dcbRoot = path.join(OUTPUT_DIR, "dcb_raw")
  fs.mkdirSync(dcbRoot, { recursive: true })
  console.log(`Extracting DCB from ${P4K_PATH}...`)
  execSync(`SC_DATA_P4K="${P4K_PATH}" "${STARBREAKER_BIN}" dcb extract --format json -o "${dcbRoot}"`, { stdio: "inherit" })
}

if (LOC_FILE) {
  locPath = LOC_FILE
} else if (P4K_PATH && STARBREAKER_BIN) {
  const locDir = path.join(OUTPUT_DIR, "loc_extract")
  fs.mkdirSync(locDir, { recursive: true })
  console.log("Extracting localization...")
  execSync(`SC_DATA_P4K="${P4K_PATH}" "${STARBREAKER_BIN}" p4k extract -o "${locDir}" --filter '**/english/global.ini'`, { stdio: "inherit" })
  locPath = path.join(locDir, "Data/Localization/english/global.ini")
} else {
  // Try to find it next to dcb-dir
  const guess = path.join(path.dirname(DCB_DIR!), "loc_extract/Data/Localization/english/global.ini")
  if (fs.existsSync(guess)) {
    locPath = guess
  } else {
    console.error("No localization file found. Use --loc <path> or --p4k to extract it.")
    process.exit(1)
  }
}

const RECORDS_DIR = path.join(dcbRoot, "libs/foundry/records")

// --- Step 2: Load localization ---
console.log(`Loading localization from ${locPath}...`)
const locMap = new Map<string, string>()

const locContent = fs.readFileSync(locPath, "utf-8")
for (const line of locContent.split("\n")) {
  const eq = line.indexOf("=")
  if (eq === -1) continue
  const key = line.slice(0, eq).trim()
  const value = line.slice(eq + 1).trim().replace(/\r$/, "")
  if (key && value) locMap.set(key.toLowerCase(), value)
}
console.log(`  Loaded ${locMap.size} localization keys`)

function loc(key: string | null | undefined): string | null {
  if (!key) return null
  // Strip leading @ if present
  const clean = key.startsWith("@") ? key.slice(1) : key
  const resolved = locMap.get(clean.toLowerCase()) || null
  // Reject placeholder values
  if (resolved && (resolved.includes("PLACEHOLDER") || resolved === "")) return null
  return resolved
}

// --- Helpers ---
function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"))
}

function findJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("._")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...findJsonFiles(full))
    else if (entry.name.endsWith(".json")) results.push(full)
  }
  return results
}

function refName(ref: any): string | null {
  if (!ref) return null
  if (typeof ref === "string") return path.basename(ref, ".json")
  const name = ref._RecordName_ || ""
  if (name.includes(".")) return name.split(".").slice(1).join(".")
  return ref._RecordPath_ ? path.basename(ref._RecordPath_, ".json") : null
}

function parseTime(t: any): number {
  if (!t) return 0
  return (t.days || 0) * 86400 + (t.hours || 0) * 3600 + (t.minutes || 0) * 60 + (t.seconds || 0)
}

// --- Step 3: Parse Items ---
function parseItems(): any[] {
  console.log("  Parsing items...")
  const base = path.join(RECORDS_DIR, "entities/scitem")
  const commoditiesDir = path.join(RECORDS_DIR, "entities/commodities")
  const files = [...findJsonFiles(base), ...findJsonFiles(commoditiesDir)]
  const items: any[] = []

  // First pass: build ammo lookup map
  const ammoMap = new Map<string, any>()
  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      const comps: any[] = rv?.Components || []
      
      for (const comp of comps) {
        if (!comp) continue
        if (comp._Type_ === "SAmmoContainerComponentParams") {
          const ammoParams = comp.ammoParamsRecord
          if (ammoParams) {
            const ammoId = path.basename(f, ".json")
            ammoMap.set(ammoId, {
              damage: ammoParams.damage ?? null,
              speed: ammoParams.speed ?? null,
              lifetime: ammoParams.lifetime ?? null,
              impactDamage: ammoParams.impactDamage ?? null,
              energyDamage: ammoParams.energyDamage ?? null,
              physicalDamage: ammoParams.physicalDamage ?? null,
              distortionDamage: ammoParams.distortionDamage ?? null,
            })
          }
        }
      }
    } catch {}
  }

  console.log(`  Built ammo lookup map with ${ammoMap.size} entries`)

  // Second pass: parse items with ammo data
  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      const comps: any[] = rv?.Components || []

      let displayNameKey: string | null = null
      let displayTypeKey: string | null = null
      let descKey: string | null = null
      let thumbnail: string | null = null
      let itemType: string | null = null
      let subType: string | null = null
      let size: number | null = null
      let grade: number | null = null
      let manufacturer: string | null = null
      let tags: string | null = null
      const attributes: Record<string, any> = {}

      for (const comp of comps) {
        if (!comp) continue
        const t = comp._Type_
        if (t === "SCItemPurchasableParams") {
          displayNameKey = comp.displayName || null
          displayTypeKey = comp.displayType || null
          thumbnail = comp.displayThumbnail || null
        } else if (t === "SAttachableComponentParams") {
          const ad = comp.AttachDef || {}
          itemType = ad.Type || null
          subType = ad.SubType || null
          size = ad.Size ?? null
          grade = ad.Grade ?? null
          tags = ad.Tags || null
          const mfr = ad.Manufacturer
          if (typeof mfr === "string" && mfr.includes("/")) {
            manufacturer = path.basename(mfr, ".json").replace("scitemmanufacturer.", "")
          } else if (mfr && typeof mfr === "object") {
            manufacturer = refName(mfr)?.replace("scitemmanufacturer.", "") || null
          }
        } else if (t === "SHealthComponentParams") {
          attributes.health = comp.Health ?? null
          attributes.healthMax = comp.Health ?? null
        } else if (t === "SCItemShieldGeneratorParams") {
          attributes.shieldMaxHP = comp.MaxShieldHealth ?? null
          attributes.shieldRegen = comp.MaxShieldRegen ?? null
          attributes.shieldDownedDelay = comp.DownedRegenDelay ?? null
          attributes.shieldDownedRegen = comp.DamagedRegenDelay ?? null
          attributes.shieldAbsorption = comp.AbsorptionMax ?? null
        } else if (t === "SCItemWeaponComponentParams") {
          attributes.ammoRef = comp.ammoContainerRecord ? path.basename(comp.ammoContainerRecord, ".json") : null
          // Extract fire rate and fire modes from fireActions
          const fireActions = comp.fireActions || []
          if (fireActions.length > 0) {
            attributes.fireRate = fireActions[0].fireRate ?? null
            attributes.fireModes = fireActions.map((a: any) => a.name).filter(Boolean)
          }
        } else if (t === "SAmmoContainerComponentParams") {
          attributes.magazineSize = comp.maxAmmoCount ?? null
          // Follow ammo params ref for damage/speed
          const ammoRef = comp.ammoParamsRecord
          if (ammoRef && typeof ammoRef === "string") {
            try {
              const ammoPath = path.resolve(path.dirname(f), ammoRef.replace("file://./", ""))
              if (fs.existsSync(ammoPath)) {
                const ammoData = readJson(ammoPath)._RecordValue_
                attributes.ammoSpeed = ammoData.speed ?? null
                attributes.ammoLifetime = ammoData.lifetime ?? null
                const dmg = ammoData.projectileParams?.damage
                if (dmg) {
                  attributes.damagePhysical = dmg.DamagePhysical || null
                  attributes.damageEnergy = dmg.DamageEnergy || null
                  attributes.damageDistortion = dmg.DamageDistortion || null
                  attributes.damageThermal = dmg.DamageThermal || null
                }
              }
            } catch {}
          }
        } else if (t === "SCItemSuitArmorParams") {
          const drRef = comp.damageResistance
          if (drRef && typeof drRef === "string") {
            const drName = path.basename(drRef, ".json")
            attributes.armorClass = drName
            try {
              const drPath = path.join(RECORDS_DIR, "damage", drName + ".json")
              if (fs.existsSync(drPath)) {
                const drData = readJson(drPath)._RecordValue_?.damageResistance
                if (drData) {
                  attributes.damageReduction = drData.PhysicalResistance?.Multiplier ?? null
                  attributes.energyReduction = drData.EnergyResistance?.Multiplier ?? null
                  attributes.thermalReduction = drData.ThermalResistance?.Multiplier ?? null
                  attributes.biochemReduction = drData.BiochemicalResistance?.Multiplier ?? null
                  attributes.stunReduction = drData.StunResistance?.Multiplier ?? null
                }
              }
            } catch {}
          }
        } else if (t === "SCItemInventoryContainerComponentParams") {
          const containerRef = comp.containerParams
          if (containerRef && typeof containerRef === "string") {
            try {
              const cPath = path.resolve(path.dirname(f), containerRef.replace("file://./", ""))
              if (fs.existsSync(cPath)) {
                const cData = readJson(cPath)._RecordValue_
                attributes.capacity = cData.inventoryType?.capacity?.microSCU ?? null
              }
            } catch {}
          }
        } else if (t === "SCItemClothingParams") {
          const tempRes = comp.TemperatureResistance
          if (tempRes) {
            attributes.tempMin = tempRes.MinResistance ?? null
            attributes.tempMax = tempRes.MaxResistance ?? null
          }
          const radRes = comp.RadiationResistance
          if (radRes) {
            attributes.radiationCapacity = radRes.MaximumRadiationCapacity ?? null
            attributes.radiationDissipation = radRes.RadiationDissipationRate ?? null
          }
        } else if (t === "SItemPortContainerComponentParams") {
          const ports = comp.Ports || []
          const weaponPorts = ports.filter((p: any) => {
            const name = (p?.Name || "").toLowerCase()
            return name.includes("weapon") || name.includes("optics") || name.includes("barrel") || name.includes("underbarrel")
          })
          if (weaponPorts.length > 0) {
            attributes.ports = weaponPorts.map((p: any) => ({
              name: p.Name,
              minSize: p.MinSize,
              maxSize: p.MaxSize,
              types: p.Types || [],
            }))
          }
        } else if (t === "SDistortionParams") {
          attributes.distortionMax = comp.Maximum ?? null
          attributes.distortionDecayRate = comp.DecayRate ?? null
          attributes.distortionRecoveryTime = comp.RecoveryTime ?? null
          attributes.distortionOverloadRatio = comp.OverloadRatio ?? null
        } else if (t === "SCItemQuantumDriveParams") {
          attributes.qdSpoolTime = comp.spoolUpTime ?? null
          attributes.qdSpeed = comp.driveSpeed ?? null
          attributes.qdFuelRate = comp.quantumFuelRequirement ?? null
          attributes.qdCooldownTime = comp.cooldownTime ?? null
          attributes.qdStage1AccelRate = comp.stage1AccelerationRate ?? null
          attributes.qdStage2AccelRate = comp.stage2AccelerationRate ?? null
        } else if (t === "SCItemPowerPlantParams" || t === "ItemResourceComponentParams") {
          // Power plants and resource components (coolers)
          attributes.powerOutput = comp.PowerOutput ?? comp.powerOutput ?? null
          attributes.powerDraw = comp.PowerDraw ?? comp.powerDraw ?? null
          attributes.coolingRate = comp.CoolingRate ?? comp.coolingRate ?? null
          attributes.thermalEnergyBase = comp.ThermalEnergyBase ?? null
          attributes.thermalEnergyDraw = comp.ThermalEnergyDraw ?? null
        } else if (t === "SCItemArmorParams") {
          // Armor stats
          attributes.damageReduction = comp.damageReduction ?? null
          attributes.signalReduction = comp.signalReduction ?? null
          attributes.tempMin = comp.temperatureMin ?? null
          attributes.tempMax = comp.temperatureMax ?? null
        } else if (t === "SCItemMiningModuleParams") {
          // Mining element stats
          attributes.instability = comp.instability ?? null
          attributes.resistance = comp.resistance ?? null
          attributes.optimalChargeWindowSize = comp.optimalChargeWindowSize ?? null
          attributes.optimalChargeRate = comp.optimalChargeRate ?? null
          attributes.shatterDamage = comp.shatterDamage ?? null
        }
      }

      // Only include items that have purchasable params (real items players interact with)
      if (!displayNameKey) continue

      const resolvedName = loc(displayNameKey)
      const resolvedType = loc(displayTypeKey)

      // Derive a readable name: resolved loc > cleaned key > cleaned filename
      let finalName: string
      if (resolvedName) {
        finalName = resolvedName
      } else if (displayNameKey && !displayNameKey.match(/LOC_PLACEHOLDER|LOC_UNINITIALIZED/i)) {
        // Turn @item_Namebehr_rifle_ballistic_01 into "Behr Rifle Ballistic 01"
        const stripped = displayNameKey.replace(/^@(item_Name|item_name|PH-item_Name_?|Item_Name)/i, "")
        finalName = stripped.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || path.basename(f, ".json").replace(/[_-]/g, " ").trim()
      } else {
        // Last resort: derive from filename
        finalName = path.basename(f, ".json").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()
      }

      // --- Derived attributes ---
      // Color: extract from item name
      const COLOR_WORDS = [
        "Black", "White", "Red", "Blue", "Green", "Grey", "Gray", "Orange",
        "Yellow", "Purple", "Pink", "Brown", "Tan", "Beige", "Olive", "Navy",
        "Teal", "Cyan", "Gold", "Silver", "Bronze", "Slate", "Charcoal",
        "Crimson", "Maroon", "Ivory", "Sand", "Cobalt", "Sage", "Rust",
        "Marigold", "Coral", "Lavender", "Indigo", "Khaki", "Camo",
      ]
      const nameLower = finalName.toLowerCase()
      const colors = COLOR_WORDS.filter((c) => nameLower.includes(c.toLowerCase()))
      if (colors.length > 0) attributes.color = colors.join(", ")

      // Effective range: ammo speed × lifetime
      if (attributes.ammoSpeed && attributes.ammoLifetime) {
        attributes.effectiveRange = Math.round(attributes.ammoSpeed * attributes.ammoLifetime)
      }

      // DPS: damage × fire rate / 60
      const totalDmgPerShot = (attributes.damagePhysical || 0) + (attributes.damageEnergy || 0)
      if (totalDmgPerShot > 0 && attributes.fireRate) {
        attributes.dps = Math.round((totalDmgPerShot * attributes.fireRate / 60) * 100) / 100
        attributes.alphaDamage = totalDmgPerShot
      }

      items.push({
        id: data._RecordId_,
        name: finalName,
        nameKey: displayNameKey,
        displayType: resolvedType || displayTypeKey,
        type: itemType || (f.includes("/commodities/") || (displayTypeKey && displayTypeKey.includes("commodities")) ? "Commodity" : null),
        subType,
        size,
        grade,
        manufacturer,
        tags,
        thumbnail,
        file: path.basename(f, ".json"),
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      })
    } catch {}
  }

  console.log(`  Items: ${items.length}`)
  return items
}

// --- Step 4: Parse Blueprints ---
function parseModifiers(contextList: any[]): any[] {
  const mods: any[] = []
  for (const ctx of contextList || []) {
    if (ctx?._Type_ !== "CraftingCostContext_ResultGameplayPropertyModifiers") continue
    for (const mod of ctx.gameplayPropertyModifiers?.gameplayPropertyModifiers || []) {
      for (const vr of mod.valueRanges || []) {
        mods.push({
          property: path.basename(mod.gameplayPropertyRecord || "", ".json"),
          startQuality: vr.startQuality,
          endQuality: vr.endQuality,
          modifierAtStart: vr.modifierAtStart,
          modifierAtEnd: vr.modifierAtEnd,
        })
      }
    }
  }
  return mods
}

function parseCostOptions(options: any[]): any[] {
  const slots: any[] = []
  for (const opt of options || []) {
    if (opt?._Type_ === "CraftingCost_Resource") {
      slots.push({
        type: "resource",
        resource: refName(opt.resource),
        quantity_scu: opt.quantity?.standardCargoUnits || 0,
        minQuality: opt.minQuality || 0,
      })
    } else if (opt?._Type_ === "CraftingCost_Item") {
      slots.push({
        type: "item",
        item: typeof opt.entityClass === "string" ? path.basename(opt.entityClass, ".json") : refName(opt.entityClass),
        quantity: opt.quantity || 0,
        minQuality: opt.minQuality || 0,
      })
    } else if (opt?._Type_ === "CraftingCost_Select") {
      slots.push({
        type: "slot",
        name: opt.nameInfo?.debugName || "",
        displayName: loc(opt.nameInfo?.displayName) || opt.nameInfo?.displayName || "",
        count: opt.count || 1,
        modifiers: parseModifiers(opt.context || []),
        ingredients: parseCostOptions(opt.options || []),
      })
    }
  }
  return slots
}

function parseBlueprints(): any[] {
  const dir = path.join(RECORDS_DIR, "crafting/blueprints/crafting")
  const files = findJsonFiles(dir)
  const blueprints: any[] = []

  for (const f of files) {
    try {
      const data = readJson(f)
      const bp = data._RecordValue_?.blueprint
      if (bp?._Type_ !== "CraftingBlueprint") continue

      const tier = bp.tiers?.[0]
      const costs = tier?.recipe?.costs
      const mandatory = costs?.mandatoryCost

      blueprints.push({
        id: data._RecordId_,
        name: data._RecordName_?.split(".")?.slice(1).join(".") || "",
        category: refName(bp.category),
        craftedItem: bp.processSpecificData?.entityClass
          ? path.basename(bp.processSpecificData.entityClass, ".json")
          : null,
        craftTimeSeconds: parseTime(costs?.craftTime),
        slots: parseCostOptions(mandatory?.options || []),
        optionalCosts: parseCostOptions(costs?.optionalCosts || []),
      })
    } catch {}
  }

  console.log(`  Blueprints: ${blueprints.length}`)
  return blueprints
}

// --- Step 5: Parse Missions ---
function parseMissions(): any[] {
  const dir = path.join(RECORDS_DIR, "missionbroker/pu_missions")
  const files = findJsonFiles(dir)
  const missions: any[] = []

  for (const f of files) {
    try {
      const data = readJson(f)
      const v = data._RecordValue_
      if (v?._Type_ !== "MissionBrokerEntry") continue

      const repRewards: any = {}
      const labels = ["success", "failure", "abandon", "giveUp", "expired"]
      for (let i = 0; i < (v.missionResultReputationRewards?.length || 0); i++) {
        const amounts = v.missionResultReputationRewards[i]?.reputationAmounts
        if (amounts?.length) {
          repRewards[labels[i] || `result_${i}`] = amounts.map((a: any) => ({
            faction: refName(a.factionReputation),
            scope: refName(a.reputationScope),
            reward: refName(a.reward),
          }))
        }
      }

      missions.push({
        id: data._RecordId_,
        name: data._RecordName_?.split(".")?.slice(1).join(".") || "",
        title: loc(v.title) || v.title,
        titleKey: v.title,
        description: loc(v.description) || v.description,
        missionGiver: loc(v.missionGiver) || v.missionGiver,
        type: refName(v.type),
        location: refName(v.locationMissionAvailable),
        lawful: v.lawfulMission,
        reward: v.missionReward ? { uec: v.missionReward.reward || 0, max: v.missionReward.max || 0 } : null,
        reputationRewards: Object.keys(repRewards).length ? repRewards : null,
        maxInstances: v.maxInstances,
        maxPlayers: v.maxPlayersPerInstance,
        canBeShared: v.canBeShared,
        notForRelease: v.notForRelease || false,
      })
    } catch {}
  }

  console.log(`  Missions: ${missions.length}`)
  return missions
}

// --- Step 6: Parse Resources ---
function parseResources(): any[] {
  const dbFile = path.join(RECORDS_DIR, "resourcetypedatabase/resourcetypedatabase.json")
  if (!fs.existsSync(dbFile)) return []

  const data = readJson(dbFile)
  const resources: any[] = []

  function walkGroups(groups: any[], parentGroup?: string) {
    for (const group of groups || []) {
      const groupName = group._RecordName_?.split(".")?.pop() || ""
      const groupDisplayName = loc(group.displayName) || group.displayName || groupName
      for (const res of group.resources || []) {
        resources.push({
          id: res._RecordId_,
          name: loc(res.displayName) || res._RecordName_?.split(".")?.pop() || "",
          nameKey: res.displayName,
          description: loc(res.description) || null,
          group: groupDisplayName,
          groupKey: groupName,
          parentGroup: parentGroup || null,
          density: res.densityType?.densityUnit?.gramsPerCubicCentimeter || null,
        })
      }
      walkGroups(group.groups || [], groupName)
    }
  }

  walkGroups(data._RecordValue_?.groups)
  console.log(`  Resources: ${resources.length}`)
  return resources
}

// --- Step 7: Parse Ships ---
function parseShips(): any[] {
  console.log("  Parsing ships...")
  const dir = path.join(RECORDS_DIR, "entities/spaceships")
  if (!fs.existsSync(dir)) {
    console.log("  Ships directory not found, skipping")
    return []
  }

  const files = findJsonFiles(dir)
  const ships: any[] = []

  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      if (!rv) continue
      const comps: any[] = rv.Components || []

      let displayName: string | null = null
      let displayType: string | null = null
      let manufacturer: string | null = null
      let size: number | null = null

      for (const comp of comps) {
        if (!comp) continue
        const t = comp._Type_
        if (t === "SCItemPurchasableParams") {
          displayName = comp.displayName || null
          displayType = comp.displayType || null
        } else if (t === "SAttachableComponentParams") {
          size = comp.AttachDef?.Size ?? null
          const mfr = comp.AttachDef?.Manufacturer
          if (typeof mfr === "string" && mfr.includes("/")) {
            manufacturer = path.basename(mfr, ".json").replace("scitemmanufacturer.", "")
          }
        } else if (t === "VehicleComponentParams" && !manufacturer) {
          const mfr = comp.manufacturer
          if (typeof mfr === "string" && mfr.includes("/")) {
            manufacturer = path.basename(mfr, ".json").replace("scitemmanufacturer.", "")
          }
        }
      }

      if (!displayName) continue

      const name = loc(displayName)
      const focus = loc(displayType)
      // Get description from localization
      const descKey = displayName.replace("vehicle_Name", "vehicle_Desc")
      const description = loc(descKey)

      ships.push({
        id: data._RecordId_,
        name: name || displayName,
        nameKey: displayName,
        focus: focus || displayType,
        manufacturer,
        size,
        description,
        file: path.basename(f, ".json"),
      })
    } catch {}
  }

  console.log(`  Ships: ${ships.length}`)
  return ships
}

// --- Step 8: Parse Manufacturers ---
function parseManufacturers(): any[] {
  console.log("  Parsing manufacturers...")
  const dir = path.join(RECORDS_DIR, "scitemmanufacturer")
  if (!fs.existsSync(dir)) {
    console.log("  Manufacturers directory not found, skipping")
    return []
  }

  const files = findJsonFiles(dir)
  const manufacturers: any[] = []

  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      if (!rv || rv._Type_ !== "SCItemManufacturer") continue

      const code = path.basename(f, ".json").replace("scitemmanufacturer.", "")
      const locData = rv.Localization || {}
      const nameKey = locData.Name || null
      const descKey = locData.Description || null

      manufacturers.push({
        id: data._RecordId_,
        code,
        name: loc(nameKey) || code,
        nameKey,
        description: loc(descKey) || null,
      })
    } catch {}
  }

  console.log(`  Manufacturers: ${manufacturers.length}`)
  return manufacturers
}

// --- Step 9: Parse Starmap ---
function parseStarmap(): any[] {
  // Load type definitions
  const typesFile = path.join(RECORDS_DIR, "starmap/starmapobjecttypes.json")
  const typeMap = new Map<string, string>()
  if (fs.existsSync(typesFile)) {
    const td = readJson(typesFile)
    for (const t of td._RecordValue_?.types || []) {
      typeMap.set(t._RecordId_, t.name || "Unknown")
    }
  }

  const systemDir = path.join(RECORDS_DIR, "starmap/pu/system")
  if (!fs.existsSync(systemDir)) return []

  const files = findJsonFiles(systemDir)
  const locations: any[] = []

  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      if (rv?._Type_ !== "StarMapObject") continue
      if (rv.hideInStarmap) continue

      const typeRef = rv.type
      const typeId = typeRef?._RecordId_ || ""
      const locationType = typeMap.get(typeId) || "Unknown"

      // Derive parent from file path hierarchy
      const parentRef = rv.parent
      const parentFile = parentRef ? path.basename(typeof parentRef === "string" ? parentRef : parentRef?._RecordPath_ || "", ".json") : null

      locations.push({
        id: data._RecordId_,
        name: loc(rv.name) || rv.name,
        nameKey: rv.name,
        description: loc(rv.description) || null,
        type: locationType,
        parent: parentFile,
        jurisdiction: refName(rv.jurisdiction),
        navIcon: rv.navIcon || null,
        size: rv.size || null,
        file: path.basename(f, ".json"),
      })
    } catch {}
  }

  console.log(`  Starmap locations: ${locations.length}`)
  return locations
}

// --- Step 10: Write output and zip ---
console.log("\nParsing game data...")
const items = parseItems()
const blueprints = parseBlueprints()
const missions = parseMissions()
const resources = parseResources()
const ships = parseShips()
const manufacturers = parseManufacturers()
const starmap = parseStarmap()

// --- Parse Blueprint Reward Pools (mission → blueprint links) ---
function parseBlueprintRewardPools(): any[] {
  const dir = path.join(RECORDS_DIR, "crafting/blueprintrewards/blueprintmissionpools")
  if (!fs.existsSync(dir)) return []
  const files = findJsonFiles(dir)
  const pools: any[] = []

  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      if (rv?._Type_ !== "BlueprintPoolRecord") continue

      const rewards = (rv.blueprintRewards || []).map((r: any) => ({
        blueprint: r.blueprintRecord ? path.basename(r.blueprintRecord, ".json") : null,
        weight: r.weight ?? 1,
      })).filter((r: any) => r.blueprint)

      if (rewards.length > 0) {
        pools.push({
          id: data._RecordId_,
          name: path.basename(f, ".json"),
          rewards,
        })
      }
    } catch {}
  }

  console.log(`  Blueprint reward pools: ${pools.length}`)
  return pools
}

// --- Parse Reputation Reward Amounts (resolve names to numbers) ---
function parseReputationAmounts(): Record<string, number> {
  const dir = path.join(RECORDS_DIR, "reputation/rewards")
  if (!fs.existsSync(dir)) return {}
  const files = findJsonFiles(dir)
  const amounts: Record<string, number> = {}

  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      const amount = rv?.reputationAmount
      if (typeof amount === "number") {
        amounts[path.basename(f, ".json")] = amount
      }
    } catch {}
  }

  console.log(`  Reputation amounts: ${Object.keys(amounts).length}`)
  return amounts
}

// --- Parse Refining Processes ---
function parseRefiningProcesses(): any[] {
  const dir = path.join(RECORDS_DIR, "refiningprocess")
  if (!fs.existsSync(dir)) return []
  const files = findJsonFiles(dir)
  const processes: any[] = []

  for (const f of files) {
    try {
      const data = readJson(f)
      const rv = data._RecordValue_
      if (rv?._Type_ !== "RefiningProcess") continue
      processes.push({
        name: loc(rv.processName) || rv.processName,
        speed: rv.refiningSpeed,
        quality: rv.refiningQuality,
      })
    } catch {}
  }

  console.log(`  Refining processes: ${processes.length}`)
  return processes
}

const blueprintRewardPools = parseBlueprintRewardPools()
const reputationAmounts = parseReputationAmounts()
const refiningProcesses = parseRefiningProcesses()

// --- Resolve reputation amounts in missions ---
for (const mission of missions) {
  if (!mission.reputationRewards) continue
  for (const [outcome, rewards] of Object.entries(mission.reputationRewards as Record<string, any[]>)) {
    for (const r of rewards) {
      if (r.reward && reputationAmounts[r.reward] !== undefined) {
        r.amount = reputationAmounts[r.reward]
      }
    }
  }
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

const outputData = {
  extractedAt: new Date().toISOString(),
  localizationKeys: locMap.size,
  counts: {
    items: items.length,
    blueprints: blueprints.length,
    missions: missions.length,
    resources: resources.length,
    ships: ships.length,
    manufacturers: manufacturers.length,
    locations: starmap.length,
    blueprintRewardPools: blueprintRewardPools.length,
    refiningProcesses: refiningProcesses.length,
  },
  items,
  blueprints,
  missions,
  resources,
  ships,
  manufacturers,
  starmap,
  blueprintRewardPools,
  reputationAmounts,
  refiningProcesses,
}

const jsonPath = path.join(OUTPUT_DIR, "game-data.json")
fs.writeFileSync(jsonPath, JSON.stringify(outputData))

const zipPath = path.join(OUTPUT_DIR, "game-data.zip")
execSync(`cd "${OUTPUT_DIR}" && zip -j "${zipPath}" game-data.json`, { stdio: "inherit" })

const zipSize = (fs.statSync(zipPath).size / 1024).toFixed(0)
console.log(`\nDone! Output: ${zipPath} (${zipSize} KB)`)
console.log(`  ${items.length} items, ${blueprints.length} blueprints, ${missions.length} missions`)
console.log(`  ${resources.length} resources, ${ships.length} ships, ${manufacturers.length} manufacturers, ${starmap.length} locations`)
