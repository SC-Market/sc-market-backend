import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  ITEM_NAME_MAX,
  countRenamesBySource,
  deriveVariantName,
  importItemName,
  indexNamedSiblings,
  inferNameSource,
  isKeyDerivedName,
  isPlaceholderName,
  keyDerivedName,
  planDerivedNames,
  planItemRenames,
  type ImportedItemName,
  type ItemRename,
} from "./item-names.js"

const KEY = "@item_Nameksar_lmg_energy_01_tint02"
const KEY_NAME = "Ksar Lmg Energy 01 Tint02"

/** An already-imported row; sources default to what the names say. */
function item(overrides: Partial<ImportedItemName> & { dbId: string }): ImportedItemName {
  const base = { stored: KEY_NAME, exported: KEY_NAME, nameKey: KEY, file: null, ...overrides }
  return {
    storedSource: inferNameSource(base.stored, base.nameKey, base.file),
    exportedSource: inferNameSource(base.exported, base.nameKey, base.file),
    ...base,
  }
}

function brief(renames: ItemRename[]) {
  return renames.map(({ dbId, oldName, newName }) => ({ dbId, oldName, newName }))
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
    expect(brief(plan.renames)).toEqual([
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
    expect(plan).toEqual({ renames: [], conflicts: [], sourceChanges: [] })
  })

  it("never replaces a real name with the key-derived one", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", stored: "Verdict LMG Ember", exported: KEY_NAME })],
      taken(["Verdict LMG Ember", "a"]),
    )
    expect(plan).toEqual({ renames: [], conflicts: [], sourceChanges: [] })
  })

  it("reports a name another row already has instead of taking it", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", exported: "Verdict LMG Ember" })],
      taken([KEY_NAME, "a"], ["verdict lmg ember", "legacy"]),
    )
    expect(brief(plan.renames)).toEqual([])
    expect(brief(plan.conflicts)).toEqual([
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
    expect(plan).toEqual({ renames: [], conflicts: [], sourceChanges: [] })
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
    expect(brief(plan.renames)).toEqual([
      { dbId: "a", oldName: "PH - hdh_boots_01_01_13", newName: "Hdh Boots 01 01 13" },
      { dbId: "b", oldName: "DYL - jacket - name", newName: "Dyl Jacket 02 01 01" },
      { dbId: "c", oldName: "PH", newName: "Venture Helmet Rust Society" },
    ])
    expect(plan.conflicts).toEqual([])
  })
})

describe("inferNameSource", () => {
  it("tells CIG, key-derived and placeholder names apart", () => {
    expect(inferNameSource("Verdict \"Derivation\" LMG", "@item_Nameksar_lmg_energy_01_store01", "ksar_lmg_energy_01_store01")).toBe("cig")
    expect(inferNameSource(KEY_NAME, KEY, "ksar_lmg_energy_01_tint02")).toBe("key_derived")
    // key not an item name key: the export names it from the record file
    expect(inferNameSource("Volt Sniper Energy 01", "@LOC_PLACEHOLDER", "volt_sniper_energy_01")).toBe("key_derived")
    expect(inferNameSource("@item_Name_dmc_gloves_01_01_02", null, null)).toBe("key_derived")
    expect(inferNameSource("PH - hdh_boots_01_01_13", "@item_Name_hdh_boots_01_01_13", "hdh_boots_01_01_13")).toBe("placeholder")
  })
})

/**
 * The 26 names of derived-item-names-proposal.md (owner-approved), plus
 * volt_sniper_energy_01, which the proposal's sweep left out (its key is
 * @LOC_PLACEHOLDER, so it is named from its file) and R2 names the same way.
 */
const PROPOSED: Record<string, string> = {
  apar_hmg_ballistic_01_lr01: "Vendetta HMG (LR 01)",
  behr_lmg_ballistic_01_lr01: "FS-9 LMG (LR 01)",
  behr_pistol_ballistic_01_lr01: "S-38 Pistol (LR 01)",
  behr_rifle_ballistic_01_lr01: "P4-AR Rifle (LR 01)",
  behr_rifle_ballistic_02_civilian_lr01: "P8-AR Rifle (LR 01)",
  behr_rifle_ballistic_03_lr01: "CQ7 Rifle (LR 01)",
  behr_rifle_ballistic_03_mr01: "CQ7 Rifle (MR 01)",
  behr_shotgun_ballistic_01_lr01: "BR-2 Shotgun (LR 01)",
  behr_smg_ballistic_01_lr01: "P8-SC SMG (LR 01)",
  behr_sniper_ballistic_01_lr01: "P6-LR Sniper Rifle (LR 01)",
  cbd_hat_03_01_cfp_var2: "CFP Hat (Var 2)",
  hdgw_rifle_ballistic_01_lr01: "Arlington Rifle (LR 01)",
  hdgw_rifle_ballistic_01_sf01: "Arlington Rifle (SF 01)",
  klwe_lmg_energy_01_lr01: "Demeco LMG (LR 01)",
  klwe_pistol_energy_01_lr01: "Arclight Pistol (LR 01)",
  klwe_rifle_energy_01_lr01: "Gallant Rifle (LR 01)",
  klwe_smg_energy_01_lr01: "Lumin V SMG (LR 01)",
  klwe_sniper_energy_01_lr01: "Arrowhead Sniper Rifle (LR 01)",
  ksar_lmg_energy_01: "Verdict LMG",
  ksar_lmg_energy_01_tint01: "Verdict LMG (Tint 01)",
  ksar_lmg_energy_01_tint02: "Verdict LMG (Tint 02)",
  ksar_lmg_energy_01_tint03: "Verdict LMG (Tint 03)",
  ksar_optics_tsco_x8_s3_sf01: "Black Prism (8x Telescopic) (SF 01)",
  ksar_sniper_ballistic_01_sf01: "Scalpel Sniper Rifle (SF 01)",
  none_lmg_ballistic_01_collector01: "Pulverizer LMG (Collector 01)",
  utfl_crossbow_ballistic_01_lr01: "Novian Crossbow (LR 01)",
}
const NOT_IN_PROPOSAL = { volt_sniper_energy_01: "Zenith Laser Sniper Rifle" }

interface FixtureItem {
  id: string
  file: string
  nameKey: string | null
  name: string
}

const fixture: FixtureItem[] = (
  JSON.parse(
    readFileSync(new URL("./__fixtures__/derived-item-names.json", import.meta.url), "utf8"),
  ) as { items: FixtureItem[] }
).items.map((i) => ({ ...i, name: importItemName(i) }))

describe("deriveVariantName / planDerivedNames (2026-11-16 export)", () => {
  it("gives exactly the proposal's names, and none to anything else", () => {
    const plan = planDerivedNames(fixture)
    const byFile = Object.fromEntries(
      fixture.filter((i) => plan.names.has(i.id)).map((i) => [i.file, plan.names.get(i.id)]),
    )
    expect(byFile).toEqual({ ...PROPOSED, ...NOT_IN_PROPOSAL })
    expect(Object.keys(PROPOSED)).toHaveLength(26)
    expect(plan.conflicts).toEqual([])
  })

  it("names no CIG-named item, and none the rules leave out", () => {
    const siblings = indexNamedSiblings(fixture)
    for (const file of [
      "asad_rifle_energy_01_tint01", // no named sibling
      "ksar_pistol_energy_01_tint01",
      "volt_optics_tsco_x8_s3_store01",
      "glsn_shotgun_ballistic_01_mag", // magazine: no variant token
      "dmc_frontier_gloves_01_02_11", // clothing colour: no variant token
      "paint_perseus_black_grey_grey", // livery
      "hdh_boots_01_01_13", // CIG placeholder, no named sibling
      "cbd_hat_03_01_fleetweek2022", // base class not in the export
    ]) {
      expect(deriveVariantName({ file }, siblings), file).toBeNull()
    }
  })
})

describe("deriveVariantName", () => {
  const siblings = indexNamedSiblings([
    { name: "P4-AR Rifle", nameKey: "@item_Namebehr_rifle_ballistic_01", file: "behr_rifle_ballistic_01" },
    { name: "Verdict \"Derivation\" LMG", nameKey: "@item_Nameksar_lmg_energy_01_store01", file: "ksar_lmg_energy_01_store01" },
    { name: "Verdict \"Ember\" LMG", nameKey: "@item_Nameksar_lmg_energy_01_store02", file: "ksar_lmg_energy_01_store02" },
    { name: "Quartz \"Hurston\" SMG", nameKey: "@item_Namex_smg_01_store01", file: "x_smg_01_store01" },
    { name: "Quartz \"Hurston\" Energy SMG", nameKey: "@item_Namex_smg_01_store02", file: "x_smg_01_store02" },
    { name: "Adroit Gloves Sage", nameKey: "@item_Namey_gloves_01_tint01", file: "y_gloves_01_tint01" },
  ])

  it("R1: the base class's CIG name with the key's own label", () => {
    expect(deriveVariantName({ file: "behr_rifle_ballistic_01_lr01" }, siblings)).toBe("P4-AR Rifle (LR 01)")
    expect(deriveVariantName({ file: "BEHR_rifle_ballistic_01_collector12" }, siblings)).toBe("P4-AR Rifle (Collector 12)")
  })

  it("R2: the variants' shared name without the quoted part", () => {
    expect(deriveVariantName({ file: "ksar_lmg_energy_01" }, siblings)).toBe("Verdict LMG")
    expect(deriveVariantName({ file: "ksar_lmg_energy_01_tint02" }, siblings)).toBe("Verdict LMG (Tint 02)")
  })

  it("gives no name when the variants disagree or have no quoted part", () => {
    expect(deriveVariantName({ file: "x_smg_01_tint01" }, siblings)).toBeNull()
    expect(deriveVariantName({ file: "y_gloves_01_tint02" }, siblings)).toBeNull()
    expect(deriveVariantName({ file: "z_unknown_01_tint01" }, siblings)).toBeNull()
    expect(deriveVariantName({ file: null }, siblings)).toBeNull()
  })

  it("strips one token only", () => {
    // base behr_rifle_ballistic_01_lr01 has no name; behr_rifle_ballistic_01 is not consulted
    expect(deriveVariantName({ file: "behr_rifle_ballistic_01_lr01_tint01" }, siblings)).toBeNull()
  })
})

describe("planDerivedNames", () => {
  const base = { name: "P4-AR Rifle", nameKey: "@item_Namebehr_rifle_ballistic_01", file: "behr_rifle_ballistic_01" }
  const variant = { name: "Behr Rifle Ballistic 01 Lr01", nameKey: "@item_Namebehr_rifle_ballistic_01_lr01", file: "behr_rifle_ballistic_01_lr01" }

  it("does not use a derived name another export item already has", () => {
    const plan = planDerivedNames([
      { id: "b", ...base },
      { id: "v", ...variant },
      { id: "other", name: "p4-ar rifle (lr 01)", nameKey: null, file: "other" },
    ])
    expect(plan.names.size).toBe(0)
    expect(plan.conflicts).toEqual([{ itemId: "v", name: "P4-AR Rifle (LR 01)", heldBy: "other" }])
  })

  it("does not use a name two items derive", () => {
    const plan = planDerivedNames([
      { id: "b", ...base },
      { id: "v1", ...variant },
      { id: "v2", ...variant, nameKey: "@item_Namebehr_rifle_ballistic_01_LR01_dup", file: "BEHR_rifle_ballistic_01_lr01" },
    ])
    expect(plan.names.size).toBe(0)
    expect(plan.conflicts.map((c) => c.itemId).sort()).toEqual(["v1", "v2"])
  })
})

describe("planItemRenames with name sources", () => {
  it("a derived name replaces a key-derived one", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", storedSource: "key_derived", exported: "Verdict LMG (Tint 02)", exportedSource: "derived" })],
      taken([KEY_NAME, "a"]),
    )
    expect(plan.renames).toEqual([
      { dbId: "a", oldName: KEY_NAME, newName: "Verdict LMG (Tint 02)", oldSource: "key_derived", newSource: "derived" },
    ])
  })

  it("a CIG name replaces a derived, key-derived or placeholder one", () => {
    const plan = planItemRenames(
      [
        item({ dbId: "a", stored: "Verdict LMG (Tint 02)", storedSource: "derived", exported: "Verdict \"Ash\" LMG", exportedSource: "cig" }),
        item({ dbId: "b", stored: "B Key", storedSource: "key_derived", exported: "B Real", exportedSource: "cig" }),
        item({ dbId: "c", stored: "PH - c", storedSource: "placeholder", exported: "C Real", exportedSource: "cig" }),
      ],
      taken(),
    )
    expect(plan.renames.map((r) => `${r.oldSource}->${r.newSource}`)).toEqual([
      "derived->cig",
      "key_derived->cig",
      "placeholder->cig",
    ])
  })

  it("a derived name never replaces a CIG or curated name", () => {
    const plan = planItemRenames(
      [
        item({ dbId: "a", stored: "Verdict LMG Ember", storedSource: "cig", exported: "Verdict LMG", exportedSource: "derived" }),
        item({ dbId: "b", stored: "Owner Name", storedSource: "override", exported: "Verdict LMG (Tint 01)", exportedSource: "derived" }),
      ],
      taken(),
    )
    expect(plan).toEqual({ renames: [], conflicts: [], sourceChanges: [] })
  })

  it("an override replaces a derived name, and a CIG name replaces an override", () => {
    const plan = planItemRenames(
      [
        item({ dbId: "a", stored: "Verdict LMG", storedSource: "derived", exported: "Verdict Heavy LMG", exportedSource: "override" }),
        item({ dbId: "b", stored: "Owner Name", storedSource: "override", exported: "CIG Name", exportedSource: "cig" }),
      ],
      taken(),
    )
    expect(plan.renames.map((r) => r.dbId)).toEqual(["a", "b"])
  })

  it("judges a row without a recorded source by its name, and records it", () => {
    const plan = planItemRenames(
      [
        item({ dbId: "a", storedSource: null, exported: "Verdict LMG (Tint 02)", exportedSource: "derived" }),
        item({ dbId: "b", stored: "Verdict LMG Ember", storedSource: null, exported: "Verdict LMG", exportedSource: "derived" }),
        item({ dbId: "c", stored: "Same", storedSource: null, exported: "Same", exportedSource: "cig" }),
      ],
      taken(),
    )
    expect(plan.renames.map((r) => [r.dbId, r.oldSource])).toEqual([["a", "key_derived"]])
    expect(plan.sourceChanges).toEqual([
      { dbId: "b", source: "cig" },
      { dbId: "c", source: "cig" },
    ])
  })

  it("reports a derived name another row has as a conflict, without numbering it", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", storedSource: "key_derived", exported: "Verdict LMG", exportedSource: "derived" })],
      taken([KEY_NAME, "a"], ["Verdict LMG", "cig-row"]),
    )
    expect(plan.renames).toEqual([])
    expect(brief(plan.conflicts)).toEqual([{ dbId: "a", oldName: KEY_NAME, newName: "Verdict LMG" }])
    expect(plan.sourceChanges).toEqual([])
  })

  it("records a changed source when the name stays", () => {
    const plan = planItemRenames(
      [item({ dbId: "a", stored: "Verdict LMG", storedSource: "derived", exported: "Verdict LMG", exportedSource: "cig" })],
      taken(),
    )
    expect(plan).toEqual({ renames: [], conflicts: [], sourceChanges: [{ dbId: "a", source: "cig" }] })
  })
})

describe("countRenamesBySource", () => {
  it("counts renames per source transition", () => {
    const r = (oldSource: ItemRename["oldSource"], newSource: ItemRename["newSource"]): ItemRename => ({
      dbId: "x", oldName: "o", newName: "n", oldSource, newSource,
    })
    expect(
      countRenamesBySource([r("key_derived", "derived"), r("key_derived", "derived"), r("key_derived", "cig")]),
    ).toEqual({ "key_derived->derived": 2, "key_derived->cig": 1 })
  })
})
