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
  if (key && value) {
    locMap.set(key.toLowerCase(), value)
    // Also store without ,P or ,p suffix for plural form keys
    const commaIdx = key.indexOf(",")
    if (commaIdx > 0) locMap.set(key.slice(0, commaIdx).toLowerCase(), value)
  }
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

/** Convert ~mission(Variable|SubField) placeholders to [VARIABLE] and clean markup */
function cleanMissionText(text: string | null): string | null {
  if (!text) return null
  return text
    .replace(/~mission\(([^|)]+)(?:\|[^)]*)?\)/g, (_, key: string) => {
      const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim()
      return `[${label.toUpperCase()}]`
    })
    .replace(/\\n/g, "\n")
    .replace(/<EM\d*>/g, "")
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
            attributes.fireModes = fireActions.map((a: Record<string, unknown>) => a.name).filter(Boolean)
            attributes.fireActions = fireActions.map((a: Record<string, unknown>) => ({
              name: a.name,
              type: (a._Type_ as string || "").replace("SWeaponActionFire", "").replace("Params", ""),
              fireRate: a.fireRate,
              heatPerShot: a.heatPerShot || null,
              wearPerShot: a.wearPerShot || null,
              spinUpTime: a.spinUpTime || null,
              spinDownTime: a.spinDownTime || null,
            }))
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
                  attributes.distortionReduction = drData.DistortionResistance?.Multiplier ?? null
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
        manufacturerName: manufacturer ? mfrNameMap.get(manufacturer) || null : null,
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

      const BLUEPRINT_CATEGORY_NAMES: Record<string, string> = {
        FPSWeapons: "Personal Weapons",
        FPSArmours: "Armor",
        VehicleWeaponsS1: "Vehicle Weapons (S1)",
        VehicleWeaponsS2: "Vehicle Weapons (S2)",
        VehicleWeaponsS3: "Vehicle Weapons (S3)",
        VehicleWeaponsS4: "Vehicle Weapons (S4)",
        VehicleWeaponsS5: "Vehicle Weapons (S5)",
        VehicleWeaponsS6: "Vehicle Weapons (S6)",
        Medical: "Medical",
        FuseBattery: "Fuse Battery",
      }
      const rawCat = refName(bp.category) || ""

      blueprints.push({
        id: data._RecordId_,
        name: data._RecordName_?.split(".")?.slice(1).join(".") || "",
        category: BLUEPRINT_CATEGORY_NAMES[rawCat] || rawCat,
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

// Interfaces for mission metadata
interface ShipWave { name: string; minShips: number; maxShips: number }
interface ShipEncounter { role: string; alignment: "hostile" | "friendly" | "neutral"; waves: ShipWave[]; shipPool?: string[] }
interface NpcEncounter { name: string; count: number }
interface HaulingOrder { resource: string; minSCU: number; maxSCU: number }
interface EntitySpawn { name: string; count: number }

// Pre-build template illegal lookup
const templateIllegalMap = new Map<string, boolean>()
const templateTypeMap = new Map<string, string>()
const templateDir = path.join(RECORDS_DIR, "contracts/contracttemplates")
if (fs.existsSync(templateDir)) {
  for (const tf of findJsonFiles(templateDir)) {
    try {
      const td = readJson(tf)._RecordValue_
      const tname = path.basename(tf, ".json")
      const cdi = td?.contractDisplayInfo
      if (cdi?.illegal === true) templateIllegalMap.set(tname, true)
      const typeRef = cdi?.type
      if (typeRef && typeof typeRef === "string" && typeRef !== "None") {
        templateTypeMap.set(tname, refName(typeRef) || "")
      }
    } catch {}
  }
}
console.log(`  Template illegal lookup: ${templateIllegalMap.size} illegal templates`)
console.log(`  Template type lookup: ${templateTypeMap.size} templates with mission type`)

// Pre-build ship pool resolver (tag-based ship matching)
const tagDbFile = path.join(RECORDS_DIR, "tagdatabase/tagdatabase.tagdatabase.json")
const shipPoolCache = new Map<string, string[]>() // serialized tag set -> ship names
if (fs.existsSync(tagDbFile)) {
  const tagData = readJson(tagDbFile)._RecordValue_
  const tagNameMap: Record<string, string> = {}
  const tagParent: Record<string, string> = {}
  const walkTags = (tl: any[], prefix = "", pid?: string) => {
    for (const t of tl) {
      const tid = t._RecordId_ as string
      const full = prefix ? `${prefix}.${t.tagName || ""}` : (t.tagName || "")
      tagNameMap[tid] = full
      if (pid) tagParent[tid] = pid
      walkTags(t.children || [], full, tid)
    }
  }
  walkTags(tagData.tags || [])

  // Build descendant sets
  const childrenOf: Record<string, Set<string>> = {}
  for (const [c, p] of Object.entries(tagParent)) {
    if (!childrenOf[p]) childrenOf[p] = new Set()
    childrenOf[p].add(c)
  }
  const tagDesc: Record<string, Set<string>> = {}
  const buildDesc = (tid: string): Set<string> => {
    if (tagDesc[tid]) return tagDesc[tid]
    const r = new Set([tid])
    for (const c of childrenOf[tid] || []) for (const d of buildDesc(c)) r.add(d)
    tagDesc[tid] = r
    return r
  }
  for (const tid of Object.keys(tagNameMap)) if (!tagParent[tid]) buildDesc(tid)

  const MATCH_PREFIXES = ["Ship.", "Missions.VehicleType.", "AI.ShipClass.", "AI.Ship.CombatClass."]
  const isMatchTag = (tid: string) => MATCH_PREFIXES.some(p => (tagNameMap[tid] || "").startsWith(p))

  // Build ship -> tags from spaceship entities
  const shipDb = new Map<string, Set<string>>()
  const spDir = path.join(RECORDS_DIR, "entities/spaceships")
  if (fs.existsSync(spDir)) {
    for (const sf of findJsonFiles(spDir)) {
      try {
        const sd = readJson(sf)._RecordValue_
        let sName: string | null = null
        for (const comp of sd.Components || sd.components || []) {
          if (comp?._Type_ === "SAttachableComponentParams") {
            const lk = comp.AttachDef?.Localization?.Name
            if (lk) sName = loc(lk) || null
            break
          }
        }
        if (!sName || sName.startsWith("<=")) continue
        const tags = new Set<string>()
        for (const t of sd.tags || []) if (t?._RecordId_) tags.add(t._RecordId_)
        if (tags.size) {
          const existing = shipDb.get(sName)
          if (existing) for (const t of tags) existing.add(t)
          else shipDb.set(sName, tags)
        }
      } catch {}
    }
  }
  console.log(`  Ship pool resolver: ${shipDb.size} ships, ${Object.keys(tagNameMap).length} tags`)

  // Expose match function for use in extractPropertyOverrides
  ;(globalThis as Record<string, unknown>).__shipPoolMatch = (reqTagIds: string[]) => {
    const key = reqTagIds.sort().join(",")
    if (shipPoolCache.has(key)) return shipPoolCache.get(key)!
    const identityReqs = reqTagIds.filter(isMatchTag)
    if (!identityReqs.length) { shipPoolCache.set(key, []); return [] }
    const result: string[] = []
    for (const [name, tags] of shipDb) {
      if (identityReqs.every(r => {
        const desc = tagDesc[r] || new Set([r])
        for (const d of desc) if (tags.has(d)) return true
        return false
      })) result.push(name)
    }
    result.sort()
    shipPoolCache.set(key, result)
    return result
  }
}

// Pre-build resource name lookup from resourcetypedatabase
const resourceNameMap = new Map<string, string>()
const resDbFile = path.join(RECORDS_DIR, "resourcetypedatabase/resourcetypedatabase.json")
if (fs.existsSync(resDbFile)) {
  const resDb = readJson(resDbFile)._RecordValue_
  function walkResGroups(groups: Array<Record<string, unknown>>): void {
    for (const g of groups || []) {
      for (const r of (g.resources as Array<Record<string, unknown>>) || []) {
        const rn = ((r._RecordName_ as string) || "").split(".").pop() || ""
        const dn = r.displayName as string
        const resolved = loc(dn)
        if (rn && resolved) resourceNameMap.set(rn, resolved)
      }
      walkResGroups((g.groups as Array<Record<string, unknown>>) || [])
    }
  }
  walkResGroups((resDb?.groups as Array<Record<string, unknown>>) || [])
}
console.log(`  Resource name lookup: ${resourceNameMap.size} entries`)

// System detection from debugName
const SYSTEM_PATTERN = /(Stanton|Pyro|Nyx|Terra|Magnus|Castra|Odin|Helios|Oso|Kilian|Davien|Rhetor|Vega|Tiber)/i
function detectSystem(debugName: string): string | null {
  const m = debugName.match(SYSTEM_PATTERN)
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null
}

function extractPropertyOverrides(po: Record<string, unknown>): {
  shipEncounters: ShipEncounter[]
  npcEncounters: NpcEncounter[]
  haulingOrders: HaulingOrder[]
  entitySpawns: EntitySpawn[]
} {
  const shipEncounters: ShipEncounter[] = []
  const npcEncounters: NpcEncounter[] = []
  const haulingOrders: HaulingOrder[] = []
  const entitySpawns: EntitySpawn[] = []

  const overrides = (po as { propertyOverrides?: Array<{ value?: Record<string, unknown> }> }).propertyOverrides
  if (!overrides) return { shipEncounters, npcEncounters, haulingOrders, entitySpawns }

  for (const prop of overrides) {
    const v = prop?.value
    if (!v) continue
    const t = v._Type_ as string

    if (t === "MissionPropertyValue_ShipSpawnDescriptions") {
      const matchFn = (globalThis as Record<string, unknown>).__shipPoolMatch as ((ids: string[]) => string[]) | undefined
      for (const sd of (v as { spawnDescriptions?: Array<Record<string, unknown>> }).spawnDescriptions || []) {
        const waves: ShipWave[] = []
        const allShips = new Set<string>()
        for (const wave of (sd as { ships?: Array<{ options?: Array<Record<string, unknown>> }> }).ships || []) {
          // Each ships[] entry is a wave group; options are alternatives (game picks one)
          const opts = wave.options || []
          if (!opts.length) continue
          const counts = opts.map(o => (o as { concurrentAmount?: number }).concurrentAmount || 1)
          const waveName = ((opts[0] as { autoSpawnSettings?: { name?: string } }).autoSpawnSettings?.name) || "ship"
          waves.push({ name: waveName, minShips: Math.min(...counts), maxShips: Math.max(...counts) })
          // Resolve ship pool from all option tags
          if (matchFn) {
            for (const opt of opts) {
              const tagList = ((opt as { tags?: { tags?: Array<{ _RecordId_?: string }> } }).tags?.tags || [])
              const tagIds = tagList.filter((t): t is { _RecordId_: string } => !!t?._RecordId_).map(t => t._RecordId_)
              if (tagIds.length) for (const s of matchFn(tagIds)) allShips.add(s)
            }
          }
        }
        if (waves.length) {
          const roleName = (sd as { Name?: string }).Name || "unknown"
          const rl = roleName.toLowerCase()
          const alignment: "hostile" | "friendly" | "neutral" =
            /target|enemy|attacker|hostile|pirate|criminal|wave\d|defender/i.test(rl) ? "hostile" :
            /escort|salvage|chicken|protect|friendly|allied|cargo/i.test(rl) ? "friendly" : "neutral"
          shipEncounters.push({ role: roleName, alignment, waves, shipPool: allShips.size ? [...allShips].sort() : undefined })
        }
      }
    } else if (t === "MissionPropertyValue_NPCSpawnDescriptions") {
      for (const sd of (v as { spawnDescriptions?: Array<Record<string, unknown>> }).spawnDescriptions || []) {
        const opts = (sd as { options?: Array<Record<string, unknown>> }).options || []
        npcEncounters.push({ name: (sd as { Name?: string }).Name || "unknown", count: opts.length })
      }
    } else if (t === "MissionPropertyValue_HaulingOrders") {
      for (const hoc of (v as { haulingOrderContent?: Array<Record<string, unknown>> }).haulingOrderContent || []) {
        if ((hoc as { _Type_?: string })._Type_ === "HaulingOrderContent_Resource") {
          const res = (hoc as { resource?: Record<string, unknown> }).resource
          const resName = res ? (res as { _RecordName_?: string })._RecordName_?.split(".")?.pop() || refName(res) || "" : ""
          const localized = resourceNameMap.get(resName) || loc(resName) || resName
          haulingOrders.push({
            resource: localized,
            minSCU: (hoc as { minSCU?: number }).minSCU || 0,
            maxSCU: (hoc as { maxSCU?: number }).maxSCU || 0,
          })
        }
      }
    } else if (t === "MissionPropertyValue_EntitySpawnDescriptions") {
      for (const sd of (v as { spawnDescriptions?: Array<Record<string, unknown>> }).spawnDescriptions || []) {
        let count = 0
        for (const ew of (sd as { entities?: Array<{ options?: Array<Record<string, unknown>> }> }).entities || []) {
          for (const opt of ew.options || []) {
            count += (opt as { amount?: number }).amount || 1
          }
        }
        entitySpawns.push({ name: (sd as { Name?: string }).Name || "unknown", count })
      }
    }
  }

  return { shipEncounters, npcEncounters, haulingOrders, entitySpawns }
}

interface ItemReward { name: string; ref: string }

interface ExtractedMission {
  id: string
  name: string
  title: string | null
  titleKey: string | null
  description: string | null
  missionGiver: string
  type: string | null
  template: string | null
  reward: { uec: number; max: number } | null
  reputationRewards: Array<{ faction: string; scope: string; reward: string; amount?: number }> | null
  blueprintRewards?: Array<{ pool: string; chance: number }> | Array<{ blueprintId: string; blueprint: string; weight: number; totalWeight: number; chance: number; poolName: string }> | null
  minStanding: string | { code: string; displayName: string; xp: number } | null
  maxStanding: string | { code: string; displayName: string; xp: number } | null
  notForRelease: boolean
  workInProgress: boolean
  onceOnly: boolean
  canBeShared: boolean | null
  canReacceptAfterAbandoning: boolean | null
  canReacceptAfterFailing: boolean | null
  abandonedCooldownTime: number | null
  personalCooldownTime: number | null
  deadline: number | null
  timeToComplete: number | null
  availableInPrison: boolean
  illegal: boolean
  hideInMobiGlas: boolean
  requiredScenarios?: string[]
  starSystem: string | null
  acceptLocations?: string[]
  shipEncounters?: ShipEncounter[]
  npcEncounters?: NpcEncounter[]
  haulingOrders?: HaulingOrder[]
  entitySpawns?: EntitySpawn[]
  pickupCount?: number
  deliveryCount?: number
  destinations?: string[]
  itemRewards?: ItemReward[]
  tokenSubstitutions?: Record<string, string>
  // Added by post-processing
  career?: string | null
  lawful?: boolean
  difficulty?: number
  maxCrimestat?: number
  buyIn?: number
  maxPlayersPerInstance?: number
  isIntro?: boolean
  linkedIntros?: string[]
  variantCount?: number
}

function parseMissions(): ExtractedMission[] {
  const dir = path.join(RECORDS_DIR, "contracts/contractgenerator")
  const files = findJsonFiles(dir)
  const missions: ExtractedMission[] = []

  for (const f of files) {
    try {
      const data = readJson(f)._RecordValue_
      for (const gen of data.generators || []) {
        // Generator-level params (inherited by contracts)
        const genParams: Record<string, string> = {}
        const gp = gen.contractParams
        if (gp) {
          for (const sp of gp.stringParamOverrides || []) {
            if (sp?.param && sp?.value) genParams[sp.param] = sp.value
          }
        }
        const genType = gp?.missionTypeOverride && gp.missionTypeOverride !== "None"
          ? refName(gp.missionTypeOverride) : null

        const introNames = new Set<string>((gen.introContracts || []).map((c: { debugName?: string }) => c.debugName).filter((n: string | undefined): n is string => !!n))
        const mainNames = (gen.contracts || []).map((c: { debugName?: string }) => c.debugName).filter(Boolean)
        const allContracts = [...(gen.contracts || []), ...(gen.introContracts || [])]
        for (const contract of allContracts) {
          if (!contract.debugName) continue

          // Contract-level string param overrides (override generator-level)
          const params = { ...genParams }
          const po = contract.paramOverrides
          if (po) {
            for (const sp of po.stringParamOverrides || []) {
              if (sp?.param && sp?.value) params[sp.param] = sp.value
            }
          }

          const contractType = po?.missionTypeOverride && po.missionTypeOverride !== "None"
            ? refName(po.missionTypeOverride) : genType

          // Resolve type from template if no override
          const templateName = contract.template ? path.basename(contract.template, ".json") : null
          const missionType = contractType || (templateName ? templateTypeMap.get(templateName) : null) || templateName

          // Resolve title and description from loc
          const stripAt = (s: string) => s.startsWith("@") ? s.slice(1) : s
          const title = cleanMissionText(loc(params.Title) || stripAt(params.Title || ""))
          const description = cleanMissionText(loc(params.Description) || stripAt(params.Description || ""))
          const contractor = loc(params.Contractor) || stripAt(params.Contractor || "")

          // Extract int param overrides (cooldowns, max players, etc.)
          const intParams: Record<string, number> = {}
          for (const ip of (gen.contractParams?.intParamOverrides || [])) {
            if (ip?.param && typeof ip.value === "number") intParams[ip.param] = ip.value
          }
          for (const ip of (po?.intParamOverrides || [])) {
            if (ip?.param && typeof ip.value === "number") intParams[ip.param] = ip.value // contract overrides gen
          }

          // Extract reward (UEC) - check multiple sources
          let rewardUec = 0
          let rewardMax = 0
          const cr = contract.contractResults?.contractResults || []
          for (const r of cr) {
            if (r?._Type_ === "ContractResult_Reward" && r.contractReward) {
              rewardUec = r.contractReward.reward || 0
              rewardMax = r.contractReward.max || rewardUec
            }
          }

          // Extract blueprint pools
          const blueprintPools: { pool: string; chance: number }[] = []
          for (const r of cr) {
            if (r?._Type_ === "BlueprintRewards") {
              const bp = r.blueprintPool
              if (bp && bp !== "None") {
                const poolName = path.basename(typeof bp === "string" ? bp : bp._RecordPath_ || "", ".json")
                if (poolName) {
                  blueprintPools.push({ pool: poolName, chance: r.chance ?? 1 })
                }
              }
            }
          }

          // Extract reputation rewards
          const repRewards: { faction: string; scope: string; reward: string }[] = []
          for (const r of cr) {
            if (r?._Type_ === "ContractResult_LegacyReputation") {
              const ra = r.contractResultReputationAmounts
              if (ra) {
                repRewards.push({
                  faction: refName(ra.factionReputation) || "",
                  scope: refName(ra.reputationScope) || "",
                  reward: refName(ra.reward) || "",
                })
              }
            }
          }

          // Standing requirements
          const minStanding = contract.minStanding ? refName(contract.minStanding) : null
          const maxStanding = contract.maxStanding ? refName(contract.maxStanding) : null

          // Deadline / lifetime
          const lifetime = contract.contractLifeTime
          const deadline = lifetime?.contractCompletionTime || null
          const timeToComplete = contract.contractResults?.timeToComplete || null

          // Template name (already computed above as templateName)

          // Extract rich metadata from propertyOverrides
          const metadata = po ? extractPropertyOverrides(po) : null

          // Illegal flag: check template, then boolParamOverrides
          let illegal = templateName ? (templateIllegalMap.get(templateName) || false) : false
          // Check generator-level boolParams
          for (const bp of gen.contractParams?.boolParamOverrides || []) {
            if (bp?.param === "Illegal" && bp.value === true) illegal = true
          }
          // Contract-level overrides
          if (po?.boolParamOverrides) {
            for (const bp of po.boolParamOverrides) {
              if (bp?.param === "Illegal" && bp.value === true) illegal = true
              if (bp?.param === "Illegal" && bp.value === false) illegal = false
            }
          }

          // Star system from debugName
          const starSystem = detectSystem(contract.debugName)

          // Accept locations from prerequisites
          const acceptLocations: string[] = []
          const allPrereqs = [
            ...(gen.defaultAvailability?.prerequisites || []),
            ...(contract.additionalPrerequisites || []),
          ]
          for (const prereq of allPrereqs) {
            if (prereq?._Type_ === "ContractPrerequisite_Location" && prereq.locationAvailable) {
              const locName = loc(refName(prereq.locationAvailable)) || refName(prereq.locationAvailable) || ""
              if (locName) acceptLocations.push(locName)
            }
            if (prereq?._Type_ === "ContractPrerequisite_Locality" && prereq.localityAvailable) {
              const locName = refName(prereq.localityAvailable) || ""
              if (locName) acceptLocations.push(locName)
            }
          }

          // Event/scenario requirements
          const requiredScenarios = [
            ...(data.required_active_scenarios || []),
            ...(gen.required_active_scenarios || []),
            ...(contract.required_active_scenarios || []),
          ]
            .filter((s: string) => s && s !== "None")
            .map((s: string) => path.basename(s, ".json"))
            .filter((s: string, i: number, a: string[]) => a.indexOf(s) === i) // dedup

          // Hide in MobiGlas
          const hideInMobiGlas = gen.defaultAvailability?.hideInMobiGlas || false

          // Extract pickupCount / deliveryCount from intParamOverrides and propertyOverrides
          let pickupCount: number | undefined
          let deliveryCount: number | undefined
          if (po) {
            for (const ip of po.intParamOverrides || []) {
              if (ip?.param === "PickupCount") pickupCount = ip.value
              if (ip?.param === "DeliveryCount") deliveryCount = ip.value
            }
            for (const prop of po.propertyOverrides || []) {
              const v = prop?.value
              if (v?._Type_ === "MissionPropertyValue_Integer") {
                const vn = (prop.missionVariableName || "").toLowerCase()
                if (vn.includes("pickup") && !pickupCount) {
                  const opt = v.options?.[0]
                  if (opt?.value) pickupCount = opt.value
                }
                if (vn.includes("delivery") && !deliveryCount) {
                  const opt = v.options?.[0]
                  if (opt?.value) deliveryCount = opt.value
                }
              }
            }
          }

          // Extract destinations from propertyOverrides (location variable names for dropoff/destination/pickup)
          const destinations: string[] = []
          if (po?.propertyOverrides) {
            for (const prop of po.propertyOverrides) {
              const v = prop?.value
              if (v?._Type_ === "MissionPropertyValue_Location") {
                const vn = prop.missionVariableName || ""
                if (/dropoff|destination|pickup|cargodeck/i.test(vn) && vn) {
                  destinations.push(vn)
                }
              }
            }
          }

          // Extract item rewards from contractResults
          const itemRewards: ItemReward[] = []
          for (const r of cr) {
            if (r?._Type_ === "ContractResult_Item") {
              const ref = r.item || r.entityClass
              if (ref) {
                const name = typeof ref === "string" ? path.basename(ref, ".json") : refName(ref) || ""
                itemRewards.push({ name, ref: typeof ref === "string" ? ref : ref._RecordPath_ || "" })
              }
            } else if (r?._Type_ === "ContractResult_ItemsWeighting") {
              for (const item of r.items || []) {
                const ref = item?.item || item?.entityClass
                if (ref) {
                  const name = typeof ref === "string" ? path.basename(ref, ".json") : refName(ref) || ""
                  itemRewards.push({ name, ref: typeof ref === "string" ? ref : ref._RecordPath_ || "" })
                }
              }
            }
          }

          // Collect ALL string param overrides as tokenSubstitutions (merged generator + contract level)
          const tokenSubstitutions: Record<string, string> = { ...params }

          // Hauling orders from template name fallback
          let haulingFromTemplate: HaulingOrder[] | undefined
          if (templateName && templateName.startsWith("haulcargo_") && !metadata?.haulingOrders.length) {
            const m = templateName.match(/^haulcargo_[a-z0-9]+_(?:bulk|small|supply|firesale|wtp)_(.+?)(?:_(?:large|medium|stanton|interstellar))?$/)
            if (m) {
              const resourceCode = m[1]
              // Case-insensitive lookup in resourceNameMap
              let friendlyName: string | undefined
              for (const [key, val] of resourceNameMap) {
                if (key.toLowerCase() === resourceCode.toLowerCase()) { friendlyName = val; break }
              }
              haulingFromTemplate = [{ resource: friendlyName || resourceCode, minSCU: 0, maxSCU: 0 }]
            }
          }

          missions.push({
            id: contract.id,
            name: contract.debugName,
            title,
            titleKey: params.Title || null,
            description,
            missionGiver: contractor,
            type: missionType,
            template: templateName,
            reward: rewardUec ? { uec: rewardUec, max: rewardMax || rewardUec } : null,
            reputationRewards: repRewards.length ? repRewards : null,
            blueprintRewards: blueprintPools.length ? blueprintPools : null,
            minStanding,
            maxStanding,
            notForRelease: contract.notForRelease || false,
            workInProgress: contract.workInProgress || false,
            onceOnly: gen.defaultAvailability?.onceOnly || false,
            canBeShared: gen.defaultAvailability?.canBeShared ?? null,
            canReacceptAfterAbandoning: gen.defaultAvailability?.canReacceptAfterAbandoning ?? null,
            canReacceptAfterFailing: gen.defaultAvailability?.canReacceptAfterFailing ?? null,
            abandonedCooldownTime: intParams.AbandonedCooldownTime ?? (gen.defaultAvailability?.abandonedCooldownTime || null),
            personalCooldownTime: intParams.PersonalCooldownTime ?? (() => {
              if (po?.hasPersonalCooldown) return po.personalCooldownTime || null
              if (gen.defaultAvailability?.hasPersonalCooldown) return gen.defaultAvailability.personalCooldownTime
              return null
            })(),
            maxPlayersPerInstance: intParams.MaxPlayersPerInstance ?? gen.defaultAvailability?.maxPlayersPerInstance ?? null,
            deadline,
            timeToComplete: timeToComplete || null,
            availableInPrison: gen.defaultAvailability?.availableInPrison || false,
            illegal,
            hideInMobiGlas,
            isIntro: introNames.has(contract.debugName) || undefined,
            linkedIntros: !introNames.has(contract.debugName) && introNames.size ? [...introNames] : undefined,
            requiredScenarios: requiredScenarios.length ? requiredScenarios : undefined,
            starSystem,
            acceptLocations: acceptLocations.length ? acceptLocations : undefined,
            shipEncounters: metadata?.shipEncounters.length ? metadata.shipEncounters : undefined,
            npcEncounters: metadata?.npcEncounters.length ? metadata.npcEncounters : undefined,
            haulingOrders: metadata?.haulingOrders.length ? metadata.haulingOrders : haulingFromTemplate,
            entitySpawns: metadata?.entitySpawns.length ? metadata.entitySpawns : undefined,
            pickupCount,
            deliveryCount,
            destinations: destinations.length ? destinations : undefined,
            itemRewards: itemRewards.length ? itemRewards : undefined,
            tokenSubstitutions: Object.keys(tokenSubstitutions).length ? tokenSubstitutions : undefined,
          })
        }
      }
    } catch {}
  }

  console.log(`  Missions (contracts): ${missions.length}`)
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
  console.log("  Parsing ships & vehicles...")
  const dir = path.join(RECORDS_DIR, "entities/spaceships")
  const gvDir = path.join(RECORDS_DIR, "entities/groundvehicles")
  if (!fs.existsSync(dir) && !fs.existsSync(gvDir)) {
    console.log("  Ships directory not found, skipping")
    return []
  }

  const files = [...(fs.existsSync(dir) ? findJsonFiles(dir) : []), ...(fs.existsSync(gvDir) ? findJsonFiles(gvDir) : [])]
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
// --- Pre-build manufacturer name lookup ---
const mfrNameMap = new Map<string, string>()
const mfrDir = path.join(RECORDS_DIR, "scitemmanufacturer")
if (fs.existsSync(mfrDir)) {
  for (const f of findJsonFiles(mfrDir)) {
    try {
      const d = readJson(f)
      const rv = d._RecordValue_
      if (rv?._Type_ !== "SCItemManufacturer") continue
      const code = path.basename(f, ".json").replace("scitemmanufacturer.", "")
      const name = loc(rv.Localization?.Name) || null
      if (name) mfrNameMap.set(code, name)
    } catch {}
  }
}
console.log(`  Manufacturer lookup: ${mfrNameMap.size} entries`)

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

// --- Parse reputation rank ladders ---
function parseReputationRanks(): any[] {
  const scopeDir = path.join(RECORDS_DIR, "reputation/scopes")
  const standingDir = path.join(RECORDS_DIR, "reputation/standings")
  if (!fs.existsSync(scopeDir)) return []

  // Load all standing files for display names
  const standingData = new Map<string, Record<string, unknown>>()
  if (fs.existsSync(standingDir)) {
    for (const f of findJsonFiles(standingDir)) {
      try {
        const d = readJson(f)._RecordValue_
        standingData.set(path.basename(f, ".json"), d)
      } catch {}
    }
  }

  const ladders: any[] = []
  for (const f of findJsonFiles(scopeDir)) {
    try {
      const d = readJson(f)._RecordValue_
      const sm = d.standingMap
      if (!sm || !sm.standings || !sm.standings.length) continue

      const scopeCode = path.basename(f, ".json")
      const ceiling = sm.reputationCeiling || 0
      const rankCount = sm.standings.length

      const ranks = sm.standings.map((ref: string, idx: number) => {
        const code = typeof ref === "string" ? path.basename(ref, ".json") : ""
        const sd = standingData.get(code) || {}
        const displayName = loc(sd.displayName as string) || sd.displayName || code
        // Evenly distribute thresholds across ceiling
        const threshold = rankCount > 1 ? Math.round((ceiling / (rankCount - 1)) * idx) : 0
        return { code, displayName, threshold, index: idx }
      })

      ladders.push({
        scope: scopeCode,
        displayName: loc(d.displayName) || d.displayName || scopeCode,
        ceiling,
        ranks,
      })
    } catch {}
  }

  console.log(`  Reputation rank ladders: ${ladders.length}`)
  return ladders
}

const reputationRanks = parseReputationRanks()

// --- Parse loot tables ---
function parseLootTables(): { tables: number; archetypes: number; data: Record<string, unknown>[] } {
  const tableDir = path.join(RECORDS_DIR, "lootgeneration/loottables")
  if (!fs.existsSync(tableDir)) return { tables: 0, archetypes: 0, data: [] }
  const files = findJsonFiles(tableDir)
  const tables: Record<string, unknown>[] = []

  for (const f of files) {
    try {
      const d = readJson(f)._RecordValue_
      const entries = d.lootTable?.lootArchetypes || d.lootArchetypes || []
      if (!entries.length) continue
      tables.push({
        name: path.basename(f, ".json"),
        entries: entries.map((e: Record<string, unknown>) => ({
          name: (e as { name?: string }).name,
          weight: (e as { weight?: number }).weight,
          archetype: refName((e as { archetype?: unknown }).archetype || (e as { lootArchetypeRecord?: unknown }).lootArchetypeRecord),
          minResults: ((e as { numberOfResultsConstraints?: { minResults?: number } }).numberOfResultsConstraints)?.minResults,
          maxResults: ((e as { numberOfResultsConstraints?: { maxResults?: number } }).numberOfResultsConstraints)?.maxResults,
        })),
      })
    } catch {}
  }

  console.log(`  Loot tables: ${tables.length}`)
  return { tables: tables.length, archetypes: 0, data: tables }
}

// --- Parse mining rock compositions ---
function parseRockCompositions(): Record<string, unknown>[] {
  const dir = path.join(RECORDS_DIR, "mining/rockcompositionpresets")
  if (!fs.existsSync(dir)) return []
  const files = findJsonFiles(dir)
  const compositions: Record<string, unknown>[] = []

  for (const f of files) {
    try {
      const d = readJson(f)._RecordValue_
      if (d._Type_ !== "MineableComposition") continue
      compositions.push({
        name: path.basename(f, ".json"),
        depositName: loc(d.depositName) || d.depositName,
        minDistinctElements: d.minimumDistinctElements,
        elements: (d.compositionArray || []).map((p: Record<string, unknown>) => ({
          element: refName(p.mineableElement),
          minPct: p.minPercentage,
          maxPct: p.maxPercentage,
          probability: p.probability,
        })),
      })
    } catch {}
  }

  console.log(`  Rock compositions: ${compositions.length}`)
  return compositions
}

const lootTables = parseLootTables()
const rockCompositions = parseRockCompositions()

// --- Resolve reputation amounts in missions ---
for (const mission of missions) {
  if (!mission.reputationRewards) continue
  for (const r of mission.reputationRewards as Array<{ reward: string; amount?: number }>) {
    if (r.reward && reputationAmounts[r.reward] !== undefined) {
      r.amount = reputationAmounts[r.reward]
    }
  }
}

// --- Resolve location names in missions ---
const starmapLookup = new Map<string, string>()
for (const loc of starmap) {
  starmapLookup.set(loc.file, loc.name)
  starmapLookup.set(`starmapobject.${loc.file}`, loc.name)
}

// --- Build mission type career name lookup ---
const careerLookup = new Map<string, string>()
const missionTypeDir = path.join(RECORDS_DIR, "missiontype/pu")
if (fs.existsSync(missionTypeDir)) {
  for (const f of findJsonFiles(missionTypeDir)) {
    try {
      const d = readJson(f)
      const rv = d._RecordValue_
      const name = loc(rv?.LocalisedTypeName)
      if (name) careerLookup.set(path.basename(f, ".json"), name)
    } catch {}
  }
}

for (const mission of missions) {
  if (mission.type) {
    mission.career = careerLookup.get(mission.type as string) || null
  }
  // Resolve accept location refs to friendly names
  if (mission.acceptLocations) {
    mission.acceptLocations = (mission.acceptLocations as string[]).map((l: string) =>
      starmapLookup.get(l) || starmapLookup.get(`starmapobject.${l}`) || l
    )
  }
}

// --- Resolve standing refs to display names + XP ---
const standingLookup = new Map<string, { displayName: string; xp: number }>()
for (const ladder of reputationRanks) {
  for (const rank of (ladder as { ranks: { code: string; displayName: string; threshold: number }[] }).ranks) {
    standingLookup.set(rank.code, { displayName: rank.displayName, xp: rank.threshold })
  }
}
for (const mission of missions) {
  if (typeof mission.minStanding === "string") {
    const s = standingLookup.get(mission.minStanding)
    if (s) mission.minStanding = { code: mission.minStanding, ...s }
  }
  if (typeof mission.maxStanding === "string") {
    const s = standingLookup.get(mission.maxStanding)
    if (s) mission.maxStanding = { code: mission.maxStanding, ...s }
  }
}

// Blueprint pools are already on contracts — just count
const withBP = missions.filter((m) => m.blueprintRewards?.length).length
console.log(`  Missions with blueprint rewards: ${withBP}`)

// --- Mission broker enrichment ---
interface BrokerData { lawful: boolean; difficulty: number; maxCrimestat: number; buyIn: number; reward: number; rewardMax: number }
const brokerByTitle = new Map<string, BrokerData>()
const brokerDir = path.join(RECORDS_DIR, "missionbroker/pu_missions")
if (fs.existsSync(brokerDir)) {
  for (const bf of findJsonFiles(brokerDir)) {
    try {
      const bd = readJson(bf)._RecordValue_
      if (bd?._Type_ !== "MissionBrokerEntry") continue
      const titleKey = bd.title as string
      if (!titleKey || brokerByTitle.has(titleKey)) continue
      const wl = bd.reputationPrerequisites?.wantedLevel
      brokerByTitle.set(titleKey, {
        lawful: bd.lawfulMission === true,
        difficulty: typeof bd.missionDifficulty === "number" && bd.missionDifficulty >= 0 ? bd.missionDifficulty : -1,
        maxCrimestat: typeof wl?.maxValue === "number" ? wl.maxValue : 5,
        buyIn: bd.missionBuyInAmount || 0,
        reward: bd.missionReward?.reward || 0,
        rewardMax: bd.missionReward?.max || 0,
      })
    } catch {}
  }
  console.log(`  Mission broker entries loaded: ${brokerByTitle.size}`)

  let enriched = 0
  for (const m of missions) {
    const tk = m.titleKey as string | null
    if (!tk) continue
    const bd = brokerByTitle.get(tk)
    if (!bd) continue
    m.lawful = bd.lawful
    if (bd.difficulty >= 0) m.difficulty = bd.difficulty
    if (bd.maxCrimestat < 5) m.maxCrimestat = bd.maxCrimestat
    if (bd.buyIn > 0) m.buyIn = bd.buyIn
    if (!m.reward && bd.reward > 0) {
      m.reward = { uec: bd.reward, max: bd.rewardMax || bd.reward }
    }
    enriched++
  }
  console.log(`  Missions enriched from broker: ${enriched}`)
}

// --- Merge location-variant missions ---
// Strip system/planet names from contract debugNames to merge location variants
const LOCATION_PARTS = /_(Stanton[1-4]|Pyro[1-6]|Nyx[1-3]|Hurston|Crusader|ArcCorp|microTech|Terra|Magnus|Castra|Odin|Helios|Oso|Kilian|Davien|Rhetor|Vega|Tiber)/g
const stripLocation = (name: string) => name.replace(LOCATION_PARTS, "")
const cleanTitle = (t: string) => t.replace(/~mission\([^)]*\)/g, "[VARIABLE]").trim()

// Filter out notForRelease and workInProgress before merging
const activeMissions = missions.filter((m) => !m.notForRelease && !m.workInProgress)

const mergeGroups = new Map<string, ExtractedMission[]>()
for (const m of activeMissions) {
  const k = stripLocation(m.name as string)
  if (!mergeGroups.has(k)) mergeGroups.set(k, [])
  mergeGroups.get(k)!.push(m)
}

function unionByKey<T>(groups: ExtractedMission[], field: keyof ExtractedMission, key: string): T[] | undefined {
  const seen = new Map<string, T>()
  for (const m of groups) {
    for (const item of (m[field] as T[] | undefined) || []) {
      const k = (item as Record<string, unknown>)[key] as string
      if (k && !seen.has(k)) seen.set(k, item)
    }
  }
  return seen.size ? [...seen.values()] : undefined
}

const mergedMissions: ExtractedMission[] = []
for (const [key, group] of mergeGroups) {
  const base = { ...group[0] }
  base.name = key
  base.title = cleanTitle((base.title as string) || "")
  if (group.length > 1) {
    const rewards = group.map((m) => (m.reward as { uec?: number })?.uec || 0).filter(Boolean)
    if (rewards.length) {
      base.reward = { uec: Math.min(...rewards), max: Math.max(...rewards) }
    }
    // Merge blueprint rewards (union of pools)
    const allPools = new Map<string, number>()
    for (const m of group) {
      for (const br of (m.blueprintRewards as { pool: string; chance: number }[] | undefined) || []) {
        allPools.set(br.pool, br.chance)
      }
    }
    if (allPools.size) {
      base.blueprintRewards = [...allPools.entries()].map(([pool, chance]) => ({ pool, chance }))
    }
    // Union metadata arrays across variants
    base.shipEncounters = unionByKey<ShipEncounter>(group, "shipEncounters", "role")
    base.npcEncounters = unionByKey<NpcEncounter>(group, "npcEncounters", "name")
    base.haulingOrders = unionByKey<HaulingOrder>(group, "haulingOrders", "resource")
    base.entitySpawns = unionByKey<EntitySpawn>(group, "entitySpawns", "name")
    base.itemRewards = unionByKey<ItemReward>(group, "itemRewards", "name")
    // Union destinations
    const allDests = new Set<string>()
    for (const m of group) for (const d of m.destinations || []) allDests.add(d)
    if (allDests.size) base.destinations = [...allDests]
    // Collect all star systems from variants
    const systems = new Set(group.map((m) => m.starSystem).filter(Boolean))
    if (systems.size > 1) base.starSystem = [...systems].join(", ")
    base.variantCount = group.length
  }
  mergedMissions.push(base)
}
console.log(`  Merged ${activeMissions.length} active missions → ${mergedMissions.length} templates`)

// --- Resolve blueprint pool references to individual blueprints ---
const poolMap = new Map(blueprintRewardPools.map((p: { name: string; rewards: { blueprint: string; weight: number }[] }) => [p.name, p]))
const bpLookup = new Map(blueprints.map((bp: { name: string; id: string }) => [bp.name.toLowerCase(), { name: bp.name, id: bp.id }]))
let resolvedLinks = 0
for (const m of mergedMissions) {
  const poolRefs = m.blueprintRewards
  if (!poolRefs?.length) continue
  const resolved: { blueprintId: string; blueprint: string; weight: number; totalWeight: number; chance: number; poolName: string }[] = []
  for (const ref of poolRefs) {
    if (!("pool" in ref)) continue
    const pool = poolMap.get(ref.pool)
    if (!pool) continue
    const totalWeight = pool.rewards.reduce((s: number, r: { weight: number }) => s + r.weight, 0)
    for (const r of pool.rewards) {
      const bp = bpLookup.get(r.blueprint.toLowerCase())
      if (bp) {
        resolved.push({ blueprintId: bp.id, blueprint: bp.name, weight: r.weight, totalWeight, chance: ref.chance, poolName: ref.pool })
      }
    }
  }
  if (resolved.length) {
    m.blueprintRewards = resolved
    resolvedLinks += resolved.length
  } else {
    m.blueprintRewards = undefined
  }
}
console.log(`  Resolved ${resolvedLinks} mission→blueprint links`)

// --- Tag blueprint sources (default / mission_reward / unsourced) ---
const defaultBpFile = path.join(RECORDS_DIR, "crafting/globalparams/craftingglobalparams.json")
const defaultBpSet = new Set<string>()
if (fs.existsSync(defaultBpFile)) {
  const gp = readJson(defaultBpFile)._RecordValue_
  for (const ref of gp?.defaultBlueprintSelection?.blueprintRecords || []) {
    if (typeof ref === "string") defaultBpSet.add(path.basename(ref, ".json").toLowerCase())
  }
}
const poolBpSet = new Set<string>()
for (const p of blueprintRewardPools) {
  for (const r of (p as { rewards: { blueprint: string }[] }).rewards) {
    poolBpSet.add(r.blueprint.toLowerCase())
  }
}
for (const bp of blueprints) {
  const key = (bp.name as string).toLowerCase()
  if (defaultBpSet.has(key)) bp.source = "default"
  else if (poolBpSet.has(key)) bp.source = "mission_reward"
  else bp.source = "unsourced"
}
const bpSources = { default: 0, mission_reward: 0, unsourced: 0 }
for (const bp of blueprints) bpSources[bp.source as keyof typeof bpSources]++
console.log(`  Blueprint sources: ${bpSources.default} default, ${bpSources.mission_reward} mission reward, ${bpSources.unsourced} unsourced`)

// --- Collect unique events/scenarios from missions ---
const eventSet = new Set<string>()
for (const m of mergedMissions) {
  for (const s of (m.requiredScenarios as string[] | undefined) || []) eventSet.add(s)
}
const events = [...eventSet].sort()
if (events.length) console.log(`  Events/scenarios: ${events.length} (${events.join(", ")})`)

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

const outputData = {
  extractedAt: new Date().toISOString(),
  localizationKeys: locMap.size,
  counts: {
    items: items.length,
    blueprints: blueprints.length,
    missions: mergedMissions.length,
    resources: resources.length,
    ships: ships.length,
    manufacturers: manufacturers.length,
    locations: starmap.length,
    blueprintRewardPools: blueprintRewardPools.length,
    refiningProcesses: refiningProcesses.length,
  },
  items,
  blueprints,
  missions: mergedMissions,
  resources,
  ships,
  manufacturers,
  starmap,
  blueprintRewardPools,
  reputationAmounts,
  reputationRanks,
  refiningProcesses,
  events,
  dismantleParams: (() => {
    const df = path.join(RECORDS_DIR, "crafting/blueprints/dismantle/globalgenericdismantle.json")
    if (!fs.existsSync(df)) return null
    const d = readJson(df)._RecordValue_?.blueprint?.processSpecificData
    return d ? {
      efficiency: d.efficiency,
      dismantleTimeSeconds: parseTime(d.dismantleTime),
    } : null
  })(),
  lootTables: lootTables.data,
  rockCompositions,
}

const jsonPath = path.join(OUTPUT_DIR, "game-data.json")
fs.writeFileSync(jsonPath, JSON.stringify(outputData))

const zipPath = path.join(OUTPUT_DIR, "game-data.zip")
execSync(`cd "${OUTPUT_DIR}" && zip -j "${zipPath}" game-data.json`, { stdio: "inherit" })

const zipSize = (fs.statSync(zipPath).size / 1024).toFixed(0)
console.log(`\nDone! Output: ${zipPath} (${zipSize} KB)`)
console.log(`  ${items.length} items, ${blueprints.length} blueprints, ${missions.length} missions`)
console.log(`  ${resources.length} resources, ${ships.length} ships, ${manufacturers.length} manufacturers, ${starmap.length} locations`)
