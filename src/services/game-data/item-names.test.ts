import { describe, expect, it } from "vitest"
import {
  ITEM_NAME_MAX,
  importItemName,
  isKeyDerivedName,
  isPlaceholderName,
  keyDerivedName,
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

// Placeholder names as they appear in the 2026-11-16 export / global.ini.
const PLACEHOLDERS = [
  "PH - hdh_boots_01_01_13",
  "PH -hdh_boots_01_01_13",
  "PH-hdh_boots_01_01_13",
  "PH",
  "PH Associated Science and Development",
  "PH - DF80s Shoes",
  "[PH] Noodles v2",
  "[ph] HDH large pouch",
  "Placeholder - CBD Boots",
  "PLACEHOLDER - cbd_hat_03_01_CFP_var2",
  "Name - 987 Shoes 03 Red",
  "DYL - jacket - name",
]

describe("isPlaceholderName", () => {
  it.each(PLACEHOLDERS)("recognizes %j", (name) => {
    expect(isPlaceholderName(name)).toBe(true)
  })

  it.each([
    "Verdict LMG Ember",
    KEY_NAME,
    "Hdh Boots 01 01 13",
    "Phoenix Jacket",
    "PHOENIX",
    "Pouch - Large",
    "Ph Boots",
    "Nameless Helmet",
    "'Arrow' I Missile",
  ])("leaves %j alone", (name) => {
    expect(isPlaceholderName(name)).toBe(false)
  })
})

describe("keyDerivedName", () => {
  it("builds the name the export makes from the key", () => {
    expect(keyDerivedName("@item_Name_hdh_boots_01_01_13", "x")).toBe("Hdh Boots 01 01 13")
    expect(keyDerivedName(KEY, null)).toBe(KEY_NAME)
    expect(keyDerivedName("@item_Name_cbd_hat_03_01_CFP_var2", null)).toBe("Cbd Hat 03 01 CFP Var2")
  })

  it("falls back to the record file name when the key is not an item name key", () => {
    expect(keyDerivedName("@LOC_PLACEHOLDER", "bltr_consumable_hackingchip_01")).toBe(
      "Bltr Consumable Hackingchip 01",
    )
    expect(keyDerivedName(null, "dyl_jacket_02_01_01")).toBe("Dyl Jacket 02 01 01")
    expect(keyDerivedName("@item_Name", "")).toBeNull()
    expect(keyDerivedName(null, null)).toBeNull()
  })
})

describe("importItemName", () => {
  it("stores the key-derived name instead of a placeholder", () => {
    expect(
      importItemName({ name: "PH - hdh_boots_01_01_13", nameKey: "@item_Name_hdh_boots_01_01_13", file: "hdh_boots_01_01_13" }),
    ).toBe("Hdh Boots 01 01 13")
    expect(
      importItemName({ name: "PH", nameKey: "@item_Name_rrs_specialist_light_helmet_01_05_01", file: "rrs_specialist_light_helmet_01_05_01" }),
    ).toBe("Rrs Specialist Light Helmet 01 05 01")
    expect(
      importItemName({ name: "DYL - jacket - name", nameKey: "@item_Name_dyl_jacket_02_01_01", file: "dyl_jacket_02_01_01" }),
    ).toBe("Dyl Jacket 02 01 01")
  })

  it("keeps real and key-derived names as exported", () => {
    expect(importItemName({ name: "Verdict LMG Ember", nameKey: KEY, file: "f" })).toBe("Verdict LMG Ember")
    expect(importItemName({ name: KEY_NAME, nameKey: KEY, file: "f" })).toBe(KEY_NAME)
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
  it("never renames a row to a placeholder", () => {
    const PH_KEY = "@item_Name_hdh_boots_01_01_13"
    const plan = planItemRenames(
      [
        item({ dbId: "a", stored: "Hdh Boots 01 01 13", exported: "PH - hdh_boots_01_01_13", nameKey: PH_KEY }),
        item({ dbId: "b", stored: "Verdict LMG Ember", exported: "PH" }),
        item({ dbId: "c", stored: "PH - DF80s Shoes", exported: "[PH] DF80s Shoes", nameKey: null }),
      ],
      taken(["Hdh Boots 01 01 13", "a"], ["Verdict LMG Ember", "b"], ["PH - DF80s Shoes", "c"]),
    )
    expect(plan).toEqual({ renames: [], conflicts: [] })
  })

  it("renames a row stored under a placeholder to the key-derived or a real name", () => {
    const plan = planItemRenames(
      [
        item({ dbId: "a", stored: "PH - hdh_boots_01_01_13", exported: "Hdh Boots 01 01 13", nameKey: "@item_Name_hdh_boots_01_01_13" }),
        item({ dbId: "b", stored: "DYL - jacket - name", exported: "Dyl Jacket 02 01 01", nameKey: "@item_Name_dyl_jacket_02_01_01" }),
        item({ dbId: "c", stored: "PH", exported: "Venture Helmet Rust Society", nameKey: "@item_Name_rrs_specialist_light_helmet_01_05_01" }),
      ],
      taken(["PH - hdh_boots_01_01_13", "a"], ["DYL - jacket - name", "b"], ["PH", "c"]),
    )
    expect(plan.renames).toEqual([
      { dbId: "a", oldName: "PH - hdh_boots_01_01_13", newName: "Hdh Boots 01 01 13" },
      { dbId: "b", oldName: "DYL - jacket - name", newName: "Dyl Jacket 02 01 01" },
      { dbId: "c", oldName: "PH", newName: "Venture Helmet Rust Society" },
    ])
    expect(plan.conflicts).toEqual([])
  })
})
