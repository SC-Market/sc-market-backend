/**
 * Tests for manufacturer canonicalization and the wiki_manufacturers import.
 *
 * Fixture records are copied from the 2026-09-08 game-data export
 * (code / Localization.Name key / localized name as emitted by
 * scripts/extract-game-data.ts).
 */

import { describe, it, expect, vi } from "vitest"
import type { Knex } from "knex"
import type { P4KManufacturer } from "./import.service.js"
import {
  brandKeyOf,
  canonicalizeManufacturers,
  canonicalManufacturerCode,
} from "./manufacturers.js"
import { GameDataImportService } from "./import.service.js"

function mfr(
  code: string,
  nameKey: string | null,
  name: string,
  description: string | null = null,
): P4KManufacturer {
  return { id: `id-${code}`, code, nameKey, name, description }
}

// Export order matters for the regression: the long livery code sits before
// the brands it previously starved out.
const EXPORT_SAMPLE: P4KManufacturer[] = [
  mfr("crus", "@manufacturer_NameCRUS", "Crusader Industries", "Crusader lore"),
  mfr(
    "paint_avenger_fleetweek_grey_beige_tigerstripe_logo",
    "@manufacturer_NameAEGS",
    "Aegis Dynamics",
  ),
  mfr(
    "paint_arrow_lovestruck_pink_black_logo",
    "@manufacturer_NameANVL",
    "Anvil Aerospace",
  ),
  mfr(
    "paint_400i_grey_yellow_logo",
    "@manufacturer_NameOrigin",
    "Origin Jumpworks",
  ),
  mfr(
    "paint_merlin_racing_yellow_blue_white_logo",
    "@manufacturer_DescKRIG",
    "Kruger Intergalactic is a ".padEnd(220, "x"),
  ),
  mfr(
    "paint_hornet_f7a_mk1_blue_blue_red_logo",
    "@LOC_PLACEHOLDER",
    "paint_hornet_f7a_mk1_blue_blue_red_logo",
  ),
  mfr("microtech", "@item_NameShop_CasabaOutlet", "Casaba Outlet"),
  mfr("volt", "@LOC_PLACEHOLDER", "volt"),
  mfr("mxox", "@manufacturer_NameAEGS", "Aegis Dynamics", "Aegis lore"),
  mfr("fski", "@manufacturer_NameAEGS", "Aegis Dynamics", "Aegis lore"),
  mfr("asd", "@manufacturer_NameASAD", "PH Associated Science and Development"),
  mfr(
    "asd_lo",
    "@manufacturer_NameASAD",
    "PH Associated Science and Development",
  ),
  mfr("behr", "@manufacturer_NameBEHR", "Behring", "Behring lore"),
  mfr("klwe", "@manufacturer_NameKLWE", "Klaus & Werner"),
  mfr("aegs", "@manufacturer_NameAEGS", "Aegis Dynamics", "Aegis lore"),
  mfr("anvl", "@manufacturer_NameANVL", "Anvil Aerospace"),
  mfr("krig", "@manufacturer_NameKRIG", "Kruger Intergalactic"),
  mfr("orig", "@manufacturer_NameOrigin", "Origin Jumpworks"),
  mfr("xian", "@manufacturer_NameXNAA", "Aopoa"),
  mfr("xnaa", "@manufacturer_NameXNAA", "Aopoa"),
  mfr("mrai_2025", "@manufacturer_NameMRAI", "Mirai"),
  mfr("mrai", "@manufacturer_NameMRAI", "Mirai"),
  mfr(
    "misc",
    "@manufacturer_NameMISC",
    "Musashi Industrial & Starflight Concern",
  ),
  mfr("scu", "@manufacturer_NameSCU", "SCU"),
]

describe("brandKeyOf", () => {
  it("extracts the brand suffix from manufacturer name keys", () => {
    expect(brandKeyOf("@manufacturer_NameAEGS")).toBe("aegs")
    expect(brandKeyOf("@manufacturer_NameOrigin")).toBe("origin")
    expect(brandKeyOf("@manufacturer_DescKRIG")).toBe("krig")
  })

  it("rejects keys that do not identify a brand", () => {
    expect(brandKeyOf("@LOC_PLACEHOLDER")).toBeNull()
    expect(brandKeyOf("@LOC_EMPTY")).toBeNull()
    expect(brandKeyOf("@item_NameShop_CasabaOutlet")).toBeNull()
    expect(brandKeyOf(null)).toBeNull()
  })
})

describe("canonicalizeManufacturers", () => {
  const { brands, aliasToCanonical } = canonicalizeManufacturers(EXPORT_SAMPLE)
  const byCode = new Map(brands.map((b) => [b.code, b]))

  it("emits one row per brand, never livery/kiosk/placeholder records", () => {
    expect(brands.map((b) => b.code)).toEqual([
      "aegs",
      "anvl",
      "asd",
      "behr",
      "crus",
      "klwe",
      "krig",
      "misc",
      "mrai",
      "orig",
      "scu",
      "xnaa",
    ])
    expect(brands.some((b) => b.code.startsWith("paint_"))).toBe(false)
  })

  it("resolves the major codes to their display names", () => {
    expect(byCode.get("aegs")?.name).toBe("Aegis Dynamics")
    expect(byCode.get("anvl")?.name).toBe("Anvil Aerospace")
    expect(byCode.get("behr")?.name).toBe("Behring")
    expect(byCode.get("klwe")?.name).toBe("Klaus & Werner")
    expect(byCode.get("aegs")?.description).toBe("Aegis lore")
  })

  it("keeps the export name even when it equals the code", () => {
    expect(byCode.get("scu")?.name).toBe("SCU")
  })

  it("prefers the record whose code matches the key, else the shortest code", () => {
    expect(canonicalManufacturerCode(aliasToCanonical, "xian")).toBe("xnaa")
    expect(canonicalManufacturerCode(aliasToCanonical, "mrai_2025")).toBe(
      "mrai",
    )
    expect(canonicalManufacturerCode(aliasToCanonical, "asd_lo")).toBe("asd")
    expect(
      canonicalManufacturerCode(
        aliasToCanonical,
        "paint_400i_grey_yellow_logo",
      ),
    ).toBe("orig")
  })

  it("maps livery and legacy alias records onto their brand", () => {
    expect(canonicalManufacturerCode(aliasToCanonical, "mxox")).toBe("aegs")
    expect(canonicalManufacturerCode(aliasToCanonical, "fski")).toBe("aegs")
    expect(
      canonicalManufacturerCode(
        aliasToCanonical,
        "paint_avenger_fleetweek_grey_beige_tigerstripe_logo",
      ),
    ).toBe("aegs")
    expect(
      canonicalManufacturerCode(
        aliasToCanonical,
        "paint_arrow_lovestruck_pink_black_logo",
      ),
    ).toBe("anvl")
    expect(
      canonicalManufacturerCode(
        aliasToCanonical,
        "paint_merlin_racing_yellow_blue_white_logo",
      ),
    ).toBe("krig")
    expect(canonicalManufacturerCode(aliasToCanonical, "AEGS")).toBe("aegs")
  })

  it("leaves non-brand references unchanged", () => {
    expect(canonicalManufacturerCode(aliasToCanonical, "volt")).toBe("volt")
    expect(canonicalManufacturerCode(aliasToCanonical, "microtech")).toBe(
      "microtech",
    )
    expect(
      canonicalManufacturerCode(
        aliasToCanonical,
        "paint_hornet_f7a_mk1_blue_blue_red_logo",
      ),
    ).toBe("paint_hornet_f7a_mk1_blue_blue_red_logo")
    expect(canonicalManufacturerCode(aliasToCanonical, null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// importManufacturers — fake knex that enforces wiki_manufacturers' varchar
// widths the way Postgres does.
// ---------------------------------------------------------------------------

function fakeKnex() {
  const rows = new Map<string, Record<string, unknown>>([
    ["paint_arrow_lovestruck_pink_black_logo", { name: "Anvil Aerospace" }],
    ["mxox", { name: "Aegis Dynamics" }],
    ["crus", { name: "Crusader Industries" }],
  ])
  const pruneCalls: string[][] = []
  const knex = vi.fn((table: string) => {
    expect(table).toBe("wiki_manufacturers")
    return {
      insert: (row: Record<string, unknown>) => ({
        onConflict: () => ({
          merge: async (update: Record<string, unknown>) => {
            const code = row.code as string
            if (code.length > 50)
              throw new Error("value too long for type character varying(50)")
            if (code === "boom") throw new Error("connection reset")
            rows.set(code, { ...(rows.get(code) ?? row), ...update })
          },
        }),
      }),
      whereNotIn: (_col: string, keep: string[]) => ({
        delete: async () => {
          pruneCalls.push(keep)
          let n = 0
          for (const code of [...rows.keys()]) {
            if (!keep.includes(code)) {
              rows.delete(code)
              n++
            }
          }
          return n
        },
      }),
    }
  })
  return { knex: knex as unknown as Knex, rows, pruneCalls }
}

describe("GameDataImportService.importManufacturers", () => {
  const service = new GameDataImportService()

  it("imports every brand from the export and prunes livery/alias rows", async () => {
    const { knex, rows } = fakeKnex()
    const stats = { errors: [] as string[] }
    const { brands } = canonicalizeManufacturers(EXPORT_SAMPLE)

    const imported = await service.importManufacturers(knex, brands, stats)

    expect(imported).toBe(brands.length)
    expect(stats.errors).toEqual([])
    expect([...rows.keys()].sort()).toEqual(brands.map((b) => b.code).sort())
    expect(rows.get("aegs")).toMatchObject({
      name: "Aegis Dynamics",
      name_key: "@manufacturer_NameAEGS",
    })
    expect(rows.get("behr")).toMatchObject({ name: "Behring" })
  })

  it("keeps going past a row the database rejects or that cannot fit", async () => {
    const { knex, rows } = fakeKnex()
    const stats = { errors: [] as string[] }
    const brands = [
      { code: "boom", name: "Fails", nameKey: null, description: null },
      {
        code: "y".repeat(51),
        name: "Too Long",
        nameKey: null,
        description: null,
      },
      {
        code: "aegs",
        name: "Aegis Dynamics",
        nameKey: "@manufacturer_NameAEGS",
        description: null,
      },
    ]

    const imported = await service.importManufacturers(knex, brands, stats)

    expect(imported).toBe(1)
    expect(rows.get("aegs")).toMatchObject({ name: "Aegis Dynamics" })
    expect(stats.errors).toHaveLength(2)
  })

  it("does not prune when nothing was imported", async () => {
    const { knex, rows, pruneCalls } = fakeKnex()
    const stats = { errors: [] as string[] }

    const imported = await service.importManufacturers(knex, [], stats)

    expect(imported).toBe(0)
    expect(pruneCalls).toEqual([])
    expect(rows.size).toBe(3)
  })
})
