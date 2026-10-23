/**
 * Tests for manufacturer display-name resolution used by wiki item/ship
 * responses (`manufacturer_name`).
 */

import { describe, it, expect } from "vitest"
import type { Knex } from "knex"
import {
  buildManufacturerNameLookup,
  lookupManufacturerName,
  loadManufacturerNameLookup,
} from "./manufacturer-names.js"

const ROWS = [
  { code: "AEGS", name: "Aegis Dynamics" },
  { code: "behr", name: "Behring Applied Technology" },
]

describe("buildManufacturerNameLookup / lookupManufacturerName", () => {
  const lookup = buildManufacturerNameLookup(ROWS)

  it("resolves a code case-insensitively", () => {
    expect(lookupManufacturerName(lookup, "aegs")).toBe("Aegis Dynamics")
    expect(lookupManufacturerName(lookup, "BEHR")).toBe("Behring Applied Technology")
  })

  it("resolves a value that is already the display name", () => {
    expect(lookupManufacturerName(lookup, "aegis dynamics")).toBe("Aegis Dynamics")
  })

  it("returns null for unknown or empty values", () => {
    expect(lookupManufacturerName(lookup, "klwe")).toBeNull()
    expect(lookupManufacturerName(lookup, null, undefined, "")).toBeNull()
  })

  it("uses the first value that resolves", () => {
    expect(lookupManufacturerName(lookup, "unknown", "behr", "aegs")).toBe(
      "Behring Applied Technology",
    )
  })
})

describe("loadManufacturerNameLookup", () => {
  function fakeKnex(rows: typeof ROWS) {
    const calls: { sql: string; bindings: unknown[] }[] = []
    const knex = ((table: string) => {
      expect(table).toBe("wiki_manufacturers")
      const builder = {
        whereRaw(sql: string, bindings: unknown[]) {
          calls.push({ sql, bindings })
          return builder
        },
        orWhereRaw(sql: string, bindings: unknown[]) {
          calls.push({ sql, bindings })
          return builder
        },
        select() {
          return Promise.resolve(rows)
        },
      }
      return builder
    }) as unknown as Knex
    return { knex, calls }
  }

  it("skips the query entirely when there is nothing to resolve", async () => {
    const { knex, calls } = fakeKnex(ROWS)
    const lookup = await loadManufacturerNameLookup(knex, [null, undefined, ""])
    expect(lookup.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("queries once with de-duplicated lowercase keys on code and name", async () => {
    const { knex, calls } = fakeKnex(ROWS)
    const lookup = await loadManufacturerNameLookup(knex, ["AEGS", "aegs", "behr", null])

    expect(calls).toEqual([
      { sql: "lower(code) IN (?, ?)", bindings: ["aegs", "behr"] },
      { sql: "lower(name) IN (?, ?)", bindings: ["aegs", "behr"] },
    ])
    expect(lookupManufacturerName(lookup, "aegs")).toBe("Aegis Dynamics")
  })
})
