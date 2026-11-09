import { describe, expect, it } from "vitest"
import {
  COMPARE_CATEGORIES,
  COMPARE_CATEGORY_KEYS,
  informativeStats,
  isCompareCategory,
  parseStatNumber,
  readClass,
  readGrade,
  readStat,
  type CompareStatDef,
} from "./compare-categories.js"

const stat = (overrides: Partial<CompareStatDef>): CompareStatDef => ({
  key: "s",
  attrs: ["a"],
  kind: "number",
  better: "higher",
  unit: null,
  ...overrides,
})

describe("parseStatNumber", () => {
  it.each([
    ["1200", 1200],
    ["0.00588", 0.00588],
    ["+10", 10],
    ["-40", -40],
    ["2,75", 2.75],
    ["30%", 30],
    ["55 m", 55],
    ["80 deg", 80],
  ])("%s → %s", (raw, n) => expect(parseStatNumber(raw)).toBe(n))

  it.each(["1020-4080", "3-4", "Rapid", "", "4x-5,5x"])(
    "%s is not a number",
    (raw) => expect(parseStatNumber(raw)).toBeNull(),
  )
})

describe("readStat", () => {
  it("takes the first source attribute the item has (game files first)", () => {
    const def = stat({ attrs: ["magazineSize", "magazine size"] })
    expect(readStat(def, { "magazine size": "30" })).toBe(30)
    expect(readStat(def, { magazineSize: "45", "magazine size": "30" })).toBe(
      45,
    )
    expect(readStat(def, {})).toBeNull()
  })

  it("shows the damage multiplier as the damage stopped, in percent", () => {
    const def = stat({ transform: "reductionPct" })
    expect(readStat(def, { a: "0.6" })).toBe(40)
    expect(readStat(def, { a: "0.125" })).toBe(87.5)
  })

  it("keeps a non-numeric value of a number stat as text", () => {
    expect(readStat(stat({}), { a: "3-4" })).toBe("3-4")
  })

  it("text stats stay text; blank values are absent", () => {
    const def = stat({ kind: "text", better: null })
    expect(readStat(def, { a: "Rapid, Burst" })).toBe("Rapid, Burst")
    expect(readStat(def, { a: "  " })).toBeNull()
  })
})

describe("readClass / readGrade", () => {
  it("normalizes the armour class", () => {
    const def = { classAttrs: ["armorClass", "class"] }
    expect(readClass(def, { armorClass: "heavyarmor" })).toBe("Heavy")
    expect(readClass(def, { class: "Medium" })).toBe("Medium")
    expect(readClass({ classAttrs: [] }, { class: "Military" })).toBeNull()
  })

  it("maps grade 1-4 to A-D, only for graded categories", () => {
    expect(readGrade(true, 1, {})).toBe("A")
    expect(readGrade(true, 4, {})).toBe("D")
    expect(readGrade(true, null, { grade: "b" })).toBe("B")
    expect(readGrade(true, null, { grade: "Z" })).toBeNull()
    expect(readGrade(false, 1, { grade: "A" })).toBeNull()
  })
})

describe("informativeStats", () => {
  const defs = [
    stat({ key: "x" }),
    stat({ key: "same" }),
    stat({ key: "none" }),
  ]
  it("drops stats no item has and stats every item shares", () => {
    const rows = [
      { stats: { x: 1, same: 5 } },
      { stats: { x: 2, same: 5 } },
      { stats: {} },
    ]
    expect(informativeStats(defs, rows).map((d) => d.key)).toEqual(["x"])
  })
})

describe("COMPARE_CATEGORIES", () => {
  it("has unique stat keys per category and known keys only", () => {
    for (const key of COMPARE_CATEGORY_KEYS) {
      const keys = COMPARE_CATEGORIES[key].stats.map((s) => s.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(isCompareCategory(key)).toBe(true)
    }
    expect(isCompareCategory("toString")).toBe(false)
    expect(isCompareCategory("nope")).toBe(false)
  })

  it("covers ship components and FPS weapons and armour", () => {
    expect(COMPARE_CATEGORIES["quantum-drive"].group).toBe("ship")
    expect(COMPARE_CATEGORIES["ship-weapon"].group).toBe("ship")
    expect(COMPARE_CATEGORIES["fps-weapon"].group).toBe("fps")
    expect(COMPARE_CATEGORIES.helmet.group).toBe("fps")
  })
})
