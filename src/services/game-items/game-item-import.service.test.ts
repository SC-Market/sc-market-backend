/**
 * Tests for GameItemImportService
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { DatabaseGameItemImportService } from "./game-item-import.service.js"
import type { Knex } from "knex"

describe("GameItemImportService", () => {
  let service: DatabaseGameItemImportService
  let mockDb: any

  beforeEach(() => {
    // Create a mock database
    mockDb = vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      first: vi.fn(),
      select: vi.fn().mockReturnThis(),
    }))

    service = new DatabaseGameItemImportService(mockDb as unknown as Knex)
  })

  describe("parseCStoneDescription", () => {
    it("should extract size from description", () => {
      const result = (service as any).parseCStoneDescription(
        "Size 3 Quantum Drive",
        "Atlas",
      )
      expect(result.size).toBe(3)
    })

    it("should extract grade from description", () => {
      const result = (service as any).parseCStoneDescription(
        "Grade A Component",
        "Test Item",
      )
      expect(result.grade).toBe("A")
    })

    it("should extract component class from description", () => {
      const result = (service as any).parseCStoneDescription(
        "Military Grade Shield",
        "Test Shield",
      )
      expect(result.componentClass).toBe("Military")
    })

    it("should extract armor class from description", () => {
      const result = (service as any).parseCStoneDescription(
        "Heavy Armor Chest Piece",
        "DCP Armor",
      )
      expect(result.armorClass).toBe("Heavy")
    })

    it("should extract color from description", () => {
      const result = (service as any).parseCStoneDescription(
        "Red Paint Livery",
        "Vanguard",
      )
      expect(result.color).toBe("Red")
    })

    it("should extract manufacturer from description", () => {
      const result = (service as any).parseCStoneDescription(
        "Manufactured by Crusader Industries",
        "Quantum Drive",
      )
      expect(result.manufacturer).toBe("Crusader Industries")
    })

    it("should extract component type from description", () => {
      const result = (service as any).parseCStoneDescription(
        "Size 2 Quantum Drive for fast travel",
        "Atlas",
      )
      expect(result.type).toBe("Quantum Drive")
    })

    it("should extract custom attributes like weight", () => {
      const result = (service as any).parseCStoneDescription(
        "Weight: 50kg Durability: 1000",
        "Test Item",
      )
      expect(result.customAttributes?.weight).toBe("50")
      expect(result.customAttributes?.durability).toBe("1000")
    })

    it("should handle multiple attributes in one description", () => {
      const result = (service as any).parseCStoneDescription(
        "Size 3 Grade A Military Quantum Drive by Crusader Industries",
        "Atlas",
      )
      expect(result.size).toBe(3)
      expect(result.grade).toBe("A")
      expect(result.componentClass).toBe("Military")
      expect(result.type).toBe("Quantum Drive")
      expect(result.manufacturer).toBe("Crusader Industries")
    })

    it("should handle empty description gracefully", () => {
      const result = (service as any).parseCStoneDescription("", "Test Item")
      expect(result).toBeDefined()
      expect(result.customAttributes).toBeDefined()
    })

    it("should extract size from name if not in description", () => {
      const result = (service as any).parseCStoneDescription(
        "Quantum Drive",
        "S3 Atlas",
      )
      expect(result.size).toBe(3)
    })

    it("should prioritize first match for component class", () => {
      const result = (service as any).parseCStoneDescription(
        "Military Stealth Component",
        "Test",
      )
      expect(result.componentClass).toBe("Military")
    })
  })

  describe("normalizeComponentType", () => {
    it("should normalize quantum_drive to Quantum Drive", () => {
      const result = (service as any).normalizeComponentType("quantum_drive")
      expect(result).toBe("Quantum Drive")
    })

    it("should normalize shield to Shield Generator", () => {
      const result = (service as any).normalizeComponentType("shield")
      expect(result).toBe("Shield Generator")
    })

    it("should normalize power_plant to Power Plant", () => {
      const result = (service as any).normalizeComponentType("power_plant")
      expect(result).toBe("Power Plant")
    })

    it("should handle case insensitivity", () => {
      const result = (service as any).normalizeComponentType("QUANTUM_DRIVE")
      expect(result).toBe("Quantum Drive")
    })

    it("should handle spaces in input", () => {
      const result = (service as any).normalizeComponentType("Quantum Drive")
      expect(result).toBe("Quantum Drive")
    })

    it("should return original value if no mapping exists", () => {
      const result = (service as any).normalizeComponentType("Unknown Type")
      expect(result).toBe("Unknown Type")
    })
  })
})
