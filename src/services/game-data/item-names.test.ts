import { describe, expect, it } from "vitest"
import {
  ITEM_NAME_MAX,
  isKeyDerivedName,
  planItemRenames,
  type ImportedItemName,
} from "./item-names.js"

const KEY = "@item_Nameksar_lmg_energy_01_tint02"
const KEY_NAME = "Ksar Lmg Energy 01 Tint02"

function item(overrides: Partial<ImportedItemName> & { dbId: string }): ImportedItemName {
  return { stored: KEY_NAME, exported: KEY_NAME, nameKey: KEY, ...overrides }
}

function taken(...rows: [string, string][]): Map<string, string> {
  return new Map(rows)
}

describe("isKeyDerivedName", () => {
  it("recognizes the name made from the localization key", () => {
    expect(isKeyDerivedName(KEY_NAME, KEY)).toBe(true)
    expect(isKeyDerivedName("ksar_lmg_energy_01_tint02", KEY)).toBe(true)
    expect(isKeyDerivedName("Foo Bar", "@foo_bar")).toBe(true)
  })

  it("is false for a real name or a missing key", () => {
    expect(isKeyDerivedName("Verdict LMG Ember", KEY)).toBe(false)
    expect(isKeyDerivedName(KEY_NAME, null)).toBe(false)
    expect(isKeyDerivedName(KEY_NAME, "@")).toBe(false)
  })
})

describe("planItemRenames", () => {
  it("gives an already-imported row the real name a later patch adds", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", exported: "Verdict LMG Ember" })],
      taken([KEY_NAME, "a"]),
    )
    expect(plan.renames).toEqual([
      { dbId: "a", oldName: KEY_NAME, newName: "Verdict LMG Ember" },
    ])
    expect(plan.conflicts).toEqual([])
  })

  it("takes a changed real name too, and a case-only fix", () => {
    const plan = planItemRenames(
      [
        item({ dbId: "a", stored: "Arrowhead Sniper", exported: "Arrowhead Sniper Rifle", nameKey: "@item_NameKlwe_sniper" }),
        item({ dbId: "b", stored: "p4-ar rifle", exported: "P4-AR Rifle", nameKey: "@item_NameBehr_rifle" }),
      ],
      taken(["Arrowhead Sniper", "a"], ["p4-ar rifle", "b"]),
    )
    expect(plan.renames.map((r) => [r.dbId, r.newName])).toEqual([
      ["a", "Arrowhead Sniper Rifle"],
      ["b", "P4-AR Rifle"],
    ])
  })

  it("leaves a row alone when its name is unchanged", () => {
    const plan = planItemRenames([item({ dbId: "a" })], taken([KEY_NAME, "a"]))
    expect(plan).toEqual({ renames: [], conflicts: [] })
  })

  it("never replaces a real name with the key-derived one", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", stored: "Verdict LMG Ember", exported: KEY_NAME })],
      taken(["Verdict LMG Ember", "a"]),
    )
    expect(plan).toEqual({ renames: [], conflicts: [] })
  })

  it("reports a name another row already has instead of taking it", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", exported: "Verdict LMG Ember" })],
      taken([KEY_NAME, "a"], ["verdict lmg ember", "legacy"]),
    )
    expect(plan.renames).toEqual([])
    expect(plan.conflicts).toEqual([
      { dbId: "a", oldName: KEY_NAME, newName: "Verdict LMG Ember" },
    ])
  })

  it("does not take a name another row is only renaming away from this import", () => {
    // b gives up "Old B" this import; a may take it on the next one.
    const plan = planItemRenames(
      [
        item({ dbId: "a", stored: "Old A", exported: "Old B", nameKey: null }),
        item({ dbId: "b", stored: "Old B", exported: "New B", nameKey: null }),
      ],
      taken(["Old A", "a"], ["Old B", "b"]),
    )
    expect(plan.renames.map((r) => r.dbId)).toEqual(["b"])
    expect(plan.conflicts.map((r) => r.dbId)).toEqual(["a"])
  })

  it("truncates to the column length, like the insert", () => {
    const long = "X".repeat(ITEM_NAME_MAX + 20)
    const plan = planItemRenames(
      [item({ dbId: "a", exported: long })],
      taken([KEY_NAME, "a"]),
    )
    expect(plan.renames[0].newName).toBe("X".repeat(ITEM_NAME_MAX))

    const unchanged = planItemRenames(
      [item({ dbId: "a", stored: "X".repeat(ITEM_NAME_MAX), exported: long })],
      taken(["X".repeat(ITEM_NAME_MAX), "a"]),
    )
    expect(unchanged.renames).toEqual([])
  })
})
