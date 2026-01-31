/**
 * Game Item Import Service Tests
 * Tests for parsing component attributes from external data sources
 */

import { describe, it, expect } from "vitest"
import { parseCStoneDescription } from "./game-item-import.service.js"

describe("parseCStoneDescription", () => {
  it("should parse size from description", () => {
    const result = parseCStoneDescription("Size 3 Quantum Drive")
    expect(result.size).toBe(3)
  })

  it("should parse size class from description", () => {
    const result = parseCStoneDescription("size class 2 Shield Generator")
    expect(result.size).toBe(2)
  })

  it("should parse grade from description", () => {
    const result = parseCStoneDescription("Grade A Quantum Drive")
    expect(result.grade).toBe("A")
  })

  it("should parse class as grade from description", () => {
    const result = parseCStoneDescription("Class B Shield Generator")
    expect(result.grade).toBe("B")
  })

  it("should parse component class from description", () => {
    const result = parseCStoneDescription("Military Quantum Drive")
    expect(result.componentClass).toBe("Military")
  })

  it("should parse manufacturer with 'by' pattern", () => {
    const result = parseCStoneDescription(
      "Quantum Drive by Crusader Industries",
    )
    expect(result.manufacturer).toBe("Crusader Industries")
  })

  it("should parse manufacturer with label pattern", () => {
    const result = parseCStoneDescription(
      "GENERAL\n\nNAME\nQuantum Drive\n\nManufacturer: Anvil Aerospace",
    )
    expect(result.manufacturer).toBe("Anvil Aerospace")
  })

  it("should parse component type from description", () => {
    const result = parseCStoneDescription("Size 3 Quantum Drive")
    expect(result.type).toBe("Quantum Drive")
  })

  it("should parse multiple attributes from complex description", () => {
    const result = parseCStoneDescription(
      "Size 3 Grade A Military Quantum Drive by Crusader Industries",
    )
    expect(result.size).toBe(3)
    expect(result.grade).toBe("A")
    expect(result.componentClass).toBe("Military")
    expect(result.manufacturer).toBe("Crusader Industries")
    expect(result.type).toBe("Quantum Drive")
  })

  it("should parse from real CStone description format", () => {
    const description = `GENERAL

NAME
Frontline

MANUFACTURER

CLASS

VOLUME
2100000 μSCU

STATS

DURABILITY
8200 hp

POWER DRAW IDLE
11

POWER DRAW IN TRAVEL
11

COOLANT DRAW IDLE
11

COOLANT DRAW IN TRAVEL
11

SIZE
4

GRADE
A

SPOOL UP TIME
9 s

COOLDOWN
92.07 s

DISCONNECT RANGE
73206 km

SPEED
718000 km/s

STAGE ONE ACCELERATION
626000 m/s²

STAGE TWO ACCELERATION
12700000 m/s²

QUANTUM FUEL REQUIREMENT
75 μQF/Gm`

    const result = parseCStoneDescription(description)
    expect(result.size).toBe(4)
    expect(result.grade).toBe("A")
  })

  it("should handle empty description", () => {
    const result = parseCStoneDescription("")
    expect(result).toEqual({})
  })

  it("should handle description with no component attributes", () => {
    const result = parseCStoneDescription("Just a regular item description")
    expect(result).toEqual({})
  })

  it("should parse Stealth component class", () => {
    const result = parseCStoneDescription("Size 2 Stealth Shield Generator")
    expect(result.componentClass).toBe("Stealth")
  })

  it("should parse Industrial component class", () => {
    const result = parseCStoneDescription("Size 1 Industrial Cooler")
    expect(result.componentClass).toBe("Industrial")
  })

  it("should parse Shield as component type", () => {
    const result = parseCStoneDescription("Size 2 Shield")
    expect(result.type).toBe("Shield")
  })

  it("should parse Ship Weapon as component type", () => {
    const result = parseCStoneDescription("Size 5 Ship Weapon")
    expect(result.type).toBe("Ship Weapon")
  })

  it("should reject invalid size values", () => {
    const result = parseCStoneDescription("Size 99 Quantum Drive")
    expect(result.size).toBeUndefined()
  })

  it("should only accept valid grades A-D", () => {
    const result = parseCStoneDescription("Grade E Quantum Drive")
    expect(result.grade).toBeUndefined()
  })

  it("should be case insensitive for size parsing", () => {
    const result = parseCStoneDescription("SIZE 3 quantum drive")
    expect(result.size).toBe(3)
  })

  it("should be case insensitive for grade parsing", () => {
    const result = parseCStoneDescription("grade a quantum drive")
    expect(result.grade).toBe("A")
  })
})
