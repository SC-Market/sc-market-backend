/**
 * Ship import record building, against real records from the 4.10-LIVE
 * export (2026-11-14 Data.p4k). Descriptions are shortened.
 */
import { describe, it, expect } from "vitest"
import knexLib from "knex"
import type { P4KShip } from "./import.service.js"
import {
  buildShipRecords,
  cleanShipName,
  shipGameItemInsert,
  wikiShipUpsert,
  SHIP_GAME_ITEM_TYPE,
} from "./ship-records.js"

const VERSION = "00000000-0000-0000-0000-000000000001"
const aliases = new Map<string, string>([["vncl", "vncl"]])

const sabreRavenEx: P4KShip = {
  id: "0e614cd8-a509-4721-a629-b89e6e83569e",
  name: "Aegis Sabre Raven EX",
  nameKey: "@vehicle_NameAEGS_Sabre_Raven_EX",
  focus: "Interceptor",
  manufacturer: "aegs",
  size: 2,
  crewSize: 1,
  career: "combat",
  role: "mediumfighter",
  maxBoundingBoxSize: { x: 24.5, y: 24.5, z: 5 },
  movementClass: "Spaceship",
  description: "Manufacturer: Aegis Dynamics \\nFocus: Interdiction",
  file: "aegs_sabre_raven_ex",
}

const galaxy: P4KShip = {
  id: "01051d26-084e-4b4f-9566-ebd2251db0aa",
  name: "RSI Galaxy",
  nameKey: "@vehicle_NameRSI_Galaxy",
  focus: "@LOC_PLACEHOLDER",
  manufacturer: "rsi",
  size: 5,
  crewSize: 6,
  career: "multirole",
  role: "modular",
  maxBoundingBoxSize: { x: 60, y: 110, z: 25 },
  movementClass: "Spaceship",
  description: "Manufacturer: RSI\\nFocus: Modular",
  file: "rsi_galaxy",
}

// The game data points Salvation's focus at its description string.
const salvationFocus =
  "Manufacturer: Roberts Space Industries\\nFocus: Salvage\\n \\nFor centuries, Roberts Space Industries' has prided itself on crafting vehicles that not only meets the pilots needs but exceeds expectations. While the RSI Salvation may seem like a simple salvaging craft at first glance, every detail from the salvaging arm, the onboard processing plant, to the convenient external storage has been refined and optimized to make even an amateur feel like an expert."
const salvation: P4KShip = {
  id: "83318d44-b6c1-42d8-bcd1-284318718b42",
  name: "RSI Salvation",
  nameKey: "@vehicle_NameRSI_Salvation",
  focus: salvationFocus,
  manufacturer: "rsi",
  size: 2,
  crewSize: 1,
  career: "industrial",
  role: "startersalvage",
  maxBoundingBoxSize: { x: 8.5, y: 14.5, z: 4 },
  movementClass: "Spaceship",
  description: salvationFocus,
  file: "rsi_salvation",
}

const gladiusTemplate: P4KShip = {
  ...sabreRavenEx,
  id: "9df7d907-2ed4-4d01-913e-dcfcad1e98e2",
  name: "@LOC_PLACEHOLDER",
  nameKey: "@LOC_PLACEHOLDER",
  file: "aegs_gladius_template",
}

describe("buildShipRecords", () => {
  it("builds the game_items and wiki_ships rows for a ship", () => {
    const { records, errors, unnamed } = buildShipRecords(
      [sabreRavenEx],
      aliases,
      VERSION,
    )
    expect(errors).toEqual([])
    expect(unnamed).toBe(0)
    expect(records).toHaveLength(1)
    expect(records[0].gameItem).toEqual({
      name: "Aegis Sabre Raven EX",
      type: SHIP_GAME_ITEM_TYPE,
      p4k_id: sabreRavenEx.id,
      manufacturer: "aegs",
    })
    expect(records[0].wikiShip).toMatchObject({
      version_id: VERSION,
      ship_code: "aegs_sabre_raven_ex",
      name: "Aegis Sabre Raven EX",
      focus: "Interceptor",
      size: 2,
      crew_size: 1,
      length_m: 24.5,
      width_m: 24.5,
      height_m: 5,
    })
  })

  it("keeps RSI Salvation but drops its over-long focus and reports it", () => {
    const { records, errors } = buildShipRecords([salvation], aliases, VERSION)
    expect(records).toHaveLength(1)
    expect(records[0].wikiShip.focus).toBeNull()
    expect(records[0].wikiShip.description).toBe(salvationFocus)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(
      "RSI Salvation (rsi_salvation): focus dropped, 459 chars (max 100)",
    )
  })

  it("stores no focus for an unresolved localization key", () => {
    const { records, errors } = buildShipRecords([galaxy], aliases, VERSION)
    expect(errors).toEqual([])
    expect(records[0].wikiShip.focus).toBeNull()
  })

  it("counts unnamed (unlocalized) records without importing or reporting them", () => {
    const { records, errors, unnamed } = buildShipRecords(
      [gladiusTemplate, galaxy],
      aliases,
      VERSION,
    )
    expect(unnamed).toBe(1)
    expect(errors).toEqual([])
    expect(records.map((r) => r.wikiShip.ship_code)).toEqual(["rsi_galaxy"])
  })

  it("rejects a record that cannot fit the columns and keeps the others", () => {
    const longName = {
      ...sabreRavenEx,
      id: "x",
      file: "long",
      name: "N".repeat(101),
    }
    const { records, errors } = buildShipRecords(
      [longName, galaxy],
      aliases,
      VERSION,
    )
    expect(records.map((r) => r.wikiShip.ship_code)).toEqual(["rsi_galaxy"])
    expect(errors).toEqual([
      `Ship ${"N".repeat(101)} (long) not imported: name is 101 chars (max 100)`,
    ])
  })

  it("rejects records without a file or with a non-integer size", () => {
    const noFile = { ...sabreRavenEx, file: "" }
    const badSize = { ...galaxy, size: 2.5 }
    const { records, errors } = buildShipRecords(
      [noFile, badSize],
      aliases,
      VERSION,
    )
    expect(records).toEqual([])
    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain("missing file (ship_code)")
    expect(errors[1]).toContain("size 2.5 is not an integer")
  })

  it("strips a trailing literal \\n from names (Argo CSV-SM)", () => {
    expect(cleanShipName("Argo CSV-SM\\n")).toBe("Argo CSV-SM")
    expect(cleanShipName("Aegis Sabre Raven EX")).toBe("Aegis Sabre Raven EX")
    const { records } = buildShipRecords(
      [{ ...galaxy, name: "Argo CSV-SM\\n", file: "argo_csv_sm" }],
      aliases,
      VERSION,
    )
    expect(records[0].gameItem.name).toBe("Argo CSV-SM")
    expect(records[0].wikiShip.name).toBe("Argo CSV-SM")
  })
})

describe("ship write queries", () => {
  const knex = knexLib({ client: "pg" })

  it("game_items insert targets the partial p4k_id index with its predicate", () => {
    const [record] = buildShipRecords([sabreRavenEx], aliases, VERSION).records
    const sql = shipGameItemInsert(knex, record.gameItem).toString()
    // A bare `on conflict ("p4k_id")` does not match the partial unique
    // index idx_game_items_p4k_id, and Postgres rejects the insert.
    expect(sql).toMatch(
      /on conflict \(p4k_id\) WHERE p4k_id IS NOT NULL do nothing$/,
    )
  })

  it("wiki_ships upsert refreshes every data column, size included", () => {
    const [record] = buildShipRecords([sabreRavenEx], aliases, VERSION).records
    const sql = wikiShipUpsert(knex, record.wikiShip).toString()
    expect(sql).toContain(
      'on conflict ("version_id", "ship_code") do update set',
    )
    expect(sql).toContain('"size" = excluded."size"')
    expect(sql).not.toContain('"version_id" = excluded')
  })
})
