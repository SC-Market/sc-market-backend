/**
 * Comparison tables of the wiki (GET /game-data/wiki/compare/{category}):
 * which game items each category holds and which of their stats it shows.
 *
 * Only stats our game data actually has. Inventory of game_item_attributes
 * per type (2026-11, live data), which these lists follow:
 *
 * - From the game files (scripts/extract-game-data.ts, camelCase names):
 *   health, distortion, shield, weapon/ammo, armour resistance, clothing
 *   temperature/radiation, inventory capacity. The extractor also tries
 *   power output, cooling rate and quantum drive speed/spool, but the game
 *   files have none of them for current items, so none are listed here.
 * - From the item catalogue import (lower case with spaces): class, grade,
 *   quantum drive maximum speed, FPS magazine size and range, mining laser
 *   stats. Partial: a stat a row lacks shows as empty.
 *
 * A stat lists its source attributes in order; the first one an item has
 * wins (the game files first). Columns no item of the category has, or with
 * the same value for every item, are dropped by the service, so a table
 * never shows an empty or uninformative column.
 */

import type {
  WikiCompareCategory,
  WikiCompareColumn,
} from "../../api/routes/v2/game-data/wiki/wiki.types.js"

/** Group of the comparison hub: ship components, or FPS weapons and armour. */
export type CompareGroup = "ship" | "fps"

/** Display unit of a stat (symbols, never translated). */
export type CompareUnit = NonNullable<WikiCompareColumn["unit"]>

export interface CompareStatDef {
  /** Column key (the frontend's label key) */
  key: string
  /** Source attribute names in game_item_attributes, first present wins */
  attrs: readonly string[]
  kind: "number" | "text"
  /** Which way is better, for the comparison highlight; null when neither */
  better: "higher" | "lower" | null
  unit: CompareUnit | null
  /**
   * "reductionPct": the game's damage multiplier (0.6 = takes 60%) shown as
   * the damage it stops, in percent (40).
   */
  transform?: "reductionPct"
}

export interface CompareCategoryDef {
  group: CompareGroup
  /** game_items.type values the category holds */
  types: readonly string[]
  /**
   * Attributes giving the row's class (Military, Ballistic Cannon, Heavy...),
   * first present wins; "armorClass" values are normalized (heavyarmor → Heavy).
   */
  classAttrs: readonly string[]
  /** Whether game_items.grade is the component grade (1-4 = A-D) */
  graded: boolean
  stats: readonly CompareStatDef[]
}

const num = (
  key: string,
  attrs: readonly string[],
  better: CompareStatDef["better"],
  unit: CompareUnit | null = null,
  transform?: CompareStatDef["transform"],
): CompareStatDef => ({ key, attrs, kind: "number", better, unit, transform })

const text = (key: string, attrs: readonly string[]): CompareStatDef => ({
  key,
  attrs,
  kind: "text",
  better: null,
  unit: null,
})

const HEALTH = num("health", ["healthMax", "health"], "higher")
const DISTORTION_MAX = num("distortionMax", ["distortionMax"], "higher")
const DISTORTION_DECAY = num(
  "distortionDecay",
  ["distortionDecayRate"],
  "higher",
)
const MASS = num("mass", ["mass"], "lower")

const ARMOR_STATS: readonly CompareStatDef[] = [
  num("physicalResist", ["damageReduction"], "higher", "%", "reductionPct"),
  num("energyResist", ["energyReduction"], "higher", "%", "reductionPct"),
  num(
    "distortionResist",
    ["distortionReduction"],
    "higher",
    "%",
    "reductionPct",
  ),
  num("thermalResist", ["thermalReduction"], "higher", "%", "reductionPct"),
  num("biochemResist", ["biochemReduction"], "higher", "%", "reductionPct"),
  num("stunResist", ["stunReduction"], "higher", "%", "reductionPct"),
  num("tempMin", ["tempMin", "min temperature"], "lower", "°C"),
  num("tempMax", ["tempMax", "max temperature"], "higher", "°C"),
  num("radiationCapacity", ["radiationCapacity"], "higher"),
  num("radiationScrub", ["radiationDissipation"], "higher"),
  num("storage", ["capacity"], "higher", "µSCU"),
]

const armor = (type: string): CompareCategoryDef => ({
  group: "fps",
  types: [type],
  classAttrs: ["armorClass", "class"],
  graded: false,
  stats: ARMOR_STATS,
})

export const COMPARE_CATEGORIES = {
  "quantum-drive": {
    group: "ship",
    types: ["Quantum Drive"],
    classAttrs: ["class"],
    graded: true,
    stats: [
      num("maxSpeed", ["maximum speed"], "higher"),
      num("fuelRate", ["qdFuelRate"], "lower"),
      HEALTH,
      DISTORTION_MAX,
      DISTORTION_DECAY,
    ],
  },
  shield: {
    group: "ship",
    types: ["Shield"],
    classAttrs: ["class"],
    graded: true,
    stats: [
      num("shieldHp", ["shieldMaxHP"], "higher"),
      num("shieldRegen", ["shieldRegen"], "higher"),
      num("downedRegenDelay", ["shieldDownedDelay"], "lower", "s"),
      num("damagedRegenDelay", ["shieldDownedRegen"], "lower", "s"),
      HEALTH,
      DISTORTION_MAX,
      DISTORTION_DECAY,
    ],
  },
  "power-plant": {
    group: "ship",
    types: ["Power Plant"],
    classAttrs: ["class"],
    graded: true,
    stats: [HEALTH, DISTORTION_MAX, DISTORTION_DECAY, MASS],
  },
  cooler: {
    group: "ship",
    types: ["Cooler"],
    classAttrs: ["class"],
    graded: true,
    stats: [HEALTH, DISTORTION_MAX, DISTORTION_DECAY, MASS],
  },
  radar: {
    group: "ship",
    types: ["Radar"],
    classAttrs: ["class"],
    graded: true,
    stats: [HEALTH, DISTORTION_MAX, DISTORTION_DECAY],
  },
  "jump-drive": {
    group: "ship",
    types: ["Jump Drive"],
    classAttrs: ["class"],
    graded: true,
    stats: [HEALTH, DISTORTION_MAX, DISTORTION_DECAY],
  },
  "ship-weapon": {
    group: "ship",
    types: ["Ship Weapon"],
    classAttrs: ["component_type"],
    graded: false,
    stats: [
      num("dps", ["dps"], "higher"),
      num("alphaDamage", ["alphaDamage"], "higher"),
      num("damagePhysical", ["damagePhysical"], "higher"),
      num("damageEnergy", ["damageEnergy"], "higher"),
      num("damageDistortion", ["damageDistortion"], "higher"),
      num("fireRate", ["fireRate"], "higher", "rpm"),
      num("projectileSpeed", ["ammoSpeed"], "higher", "m/s"),
      num("range", ["effectiveRange"], "higher", "m"),
      num("magazine", ["magazineSize"], "higher"),
      HEALTH,
      MASS,
    ],
  },
  missile: {
    group: "ship",
    types: ["Missile"],
    classAttrs: ["tracking signal"],
    graded: false,
    stats: [HEALTH],
  },
  countermeasure: {
    group: "ship",
    types: ["Countermeasure"],
    classAttrs: [],
    graded: false,
    stats: [
      num("magazine", ["magazineSize"], "higher"),
      num("fireRate", ["fireRate"], "higher", "rpm"),
      num("projectileSpeed", ["ammoSpeed"], "higher", "m/s"),
      num("lifetime", ["ammoLifetime"], "higher", "s"),
      num("range", ["effectiveRange"], "higher", "m"),
      text("fireModes", ["fireModes"]),
    ],
  },
  "mining-head": {
    group: "ship",
    types: ["Mining Head"],
    classAttrs: [],
    graded: false,
    stats: [
      text("miningPower", ["mining laser power"]),
      num("extractionPower", ["extraction laser power"], "higher"),
      num("optimalRange", ["optimal range"], "higher", "m"),
      num("maxRange", ["maximum range"], "higher", "m"),
      num("moduleSlots", ["module slots"], "higher"),
      num("resistance", ["resistance", "resistanceModifier"], "lower", "%"),
      num(
        "instability",
        ["laser instability", "laserInstability"],
        "lower",
        "%",
      ),
      num(
        "chargeWindow",
        ["optimal charge window size", "optimalChargeWindowSize"],
        "higher",
        "%",
      ),
      num(
        "chargeRate",
        ["optimal charge window rate", "optimalChargeRate"],
        "higher",
        "%",
      ),
      num("inertMaterials", ["inert material level"], "lower", "%"),
    ],
  },
  "fps-weapon": {
    group: "fps",
    types: ["Ranged Weapon"],
    classAttrs: ["class"],
    graded: false,
    stats: [
      num("fireRate", ["fireRate", "rate of fire"], "higher", "rpm"),
      num("magazine", ["magazineSize", "magazine size"], "higher"),
      num("range", ["effective range"], "higher", "m"),
      text("fireModes", ["fireModes"]),
      MASS,
    ],
  },
  helmet: armor("Helmet"),
  torso: armor("Torso"),
  arms: armor("Arms"),
  legs: armor("Legs"),
  undersuit: armor("Undersuit"),
  backpack: {
    group: "fps",
    types: ["Backpack"],
    classAttrs: ["component_type", "class"],
    graded: false,
    stats: [num("storage", ["capacity"], "higher", "µSCU")],
  },
} as const satisfies Record<WikiCompareCategory, CompareCategoryDef>

export type CompareCategoryKey = WikiCompareCategory

export const COMPARE_CATEGORY_KEYS = Object.keys(
  COMPARE_CATEGORIES,
) as CompareCategoryKey[]

export function isCompareCategory(key: string): key is CompareCategoryKey {
  return Object.prototype.hasOwnProperty.call(COMPARE_CATEGORIES, key)
}

const PLAIN_NUMBER = /^([+-]?\d+(?:[.,]\d+)?)\s*(%|m|deg)?$/i

/**
 * A stored attribute value as a number when it is one ("1200", "+10",
 * "2,75", "30%", "55 m"), else null. Ranges ("1020-4080") and words stay text.
 */
export function parseStatNumber(raw: string): number | null {
  const m = raw.trim().match(PLAIN_NUMBER)
  if (!m) return null
  const n = Number(m[1].replace(",", "."))
  return Number.isFinite(n) ? n : null
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** One stat of one item: the first source attribute it has, converted. */
export function readStat(
  def: CompareStatDef,
  attributes: Readonly<Record<string, string>>,
): number | string | null {
  for (const name of def.attrs) {
    const raw = attributes[name]
    if (raw === undefined || raw.trim() === "") continue
    if (def.kind === "text") return raw.trim()
    const n = parseStatNumber(raw)
    if (n === null) return raw.trim()
    if (def.transform === "reductionPct") return round((1 - n) * 100, 1)
    return round(n, 4)
  }
  return null
}

const ARMOR_CLASS: Record<string, string> = {
  lightarmor: "Light",
  mediumarmor: "Medium",
  heavyarmor: "Heavy",
  superheavyarmor: "Super heavy",
  undersuitarmor: "Undersuit",
}

/** The row's class from its attributes (first present of classAttrs). */
export function readClass(
  def: Pick<CompareCategoryDef, "classAttrs">,
  attributes: Readonly<Record<string, string>>,
): string | null {
  for (const name of def.classAttrs) {
    const raw = attributes[name]?.trim()
    if (!raw) continue
    if (name === "armorClass") return ARMOR_CLASS[raw.toLowerCase()] ?? null
    return raw
  }
  return null
}

const GRADE_LETTERS = ["A", "B", "C", "D"] as const

/** Component grade letter: game_items.grade 1-4, else the catalogue's letter. */
export function readGrade(
  graded: boolean,
  gradeColumn: number | null,
  attributes: Readonly<Record<string, string>>,
): string | null {
  if (!graded) return null
  if (gradeColumn !== null && gradeColumn >= 1 && gradeColumn <= 4) {
    return GRADE_LETTERS[gradeColumn - 1]
  }
  const letter = attributes.grade?.trim().toUpperCase()
  return letter && (GRADE_LETTERS as readonly string[]).includes(letter)
    ? letter
    : null
}

/**
 * The columns worth showing: stats at least one item has, and that differ
 * between items (a stat every item shares compares nothing).
 */
export function informativeStats(
  stats: readonly CompareStatDef[],
  rows: readonly { stats: Readonly<Record<string, number | string>> }[],
): CompareStatDef[] {
  return stats.filter((def) => {
    const values = new Set<string>()
    for (const row of rows) {
      const v = row.stats[def.key]
      if (v !== undefined) values.add(String(v))
      if (values.size > 1) return true
    }
    return false
  })
}
