/**
 * Tests for GameItemAttributesService
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { DatabaseGameItemAttributesService } from "./game-item-attributes.service.js"
import type { Knex } from "knex"

describe("GameItemAttributesService", () => {
  let service: DatabaseGameItemAttributesService
  let mockDb: any

  beforeEach(() => {
    // Create a mock database with chainable query builder
    const chainableMock: any = {
      insert: vi.fn(),
      onConflict: vi.fn(),
      merge: vi.fn(),
      where: vi.fn(),
      select: vi.fn(),
      delete: vi.fn(),
    }
    
    // Make all methods return the chainable mock for chaining
    chainableMock.insert.mockReturnValue(chainableMock)
    chainableMock.onConflict.mockReturnValue(chainableMock)
    chainableMock.merge.mockReturnValue(chainableMock)
    chainableMock.where.mockReturnValue(chainableMock)
    chainableMock.select.mockReturnValue(chainableMock)
    chainableMock.delete.mockReturnValue(chainableMock)
    
    mockDb = vi.fn(() => chainableMock)
    Object.assign(mockDb, chainableMock)

    // Create service with mock database
    service = new DatabaseGameItemAttributesService(mockDb as unknown as Knex)
  })

  describe("setAttribute", () => {
    it("should set a single attribute for a game item", async () => {
      mockDb.merge.mockResolvedValue(undefined)

      await service.setAttribute(1, "component_size", "3")

      expect(mockDb).toHaveBeenCalledWith("game_item_attributes")
      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          game_item_id: 1,
          attribute_key: "component_size",
          attribute_value: "3",
        }),
      )
      expect(mockDb.onConflict).toHaveBeenCalledWith([
        "game_item_id",
        "attribute_key",
      ])
      expect(mockDb.merge).toHaveBeenCalledWith(["attribute_value", "updated_at"])
    })

    it("should use transaction when provided", async () => {
      const mockTrx: any = vi.fn(() => mockTrx)
      mockTrx.insert = vi.fn(() => mockTrx)
      mockTrx.onConflict = vi.fn(() => mockTrx)
      mockTrx.merge = vi.fn(() => mockTrx)
      mockTrx.merge.mockResolvedValue(undefined)

      await service.setAttribute(1, "component_size", "3", mockTrx)

      expect(mockTrx).toHaveBeenCalledWith("game_item_attributes")
      expect(mockTrx.insert).toHaveBeenCalled()
      expect(mockDb).not.toHaveBeenCalled()
    })
  })

  describe("setAttributes", () => {
    it("should set multiple attributes at once", async () => {
      mockDb.merge.mockResolvedValue(undefined)

      await service.setAttributes(1, {
        component_size: "3",
        component_grade: "A",
        manufacturer: "Crusader Industries",
      })

      expect(mockDb).toHaveBeenCalledWith("game_item_attributes")
      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            game_item_id: 1,
            attribute_key: "component_size",
            attribute_value: "3",
          }),
          expect.objectContaining({
            game_item_id: 1,
            attribute_key: "component_grade",
            attribute_value: "A",
          }),
          expect.objectContaining({
            game_item_id: 1,
            attribute_key: "manufacturer",
            attribute_value: "Crusader Industries",
          }),
        ]),
      )
      expect(mockDb.onConflict).toHaveBeenCalledWith([
        "game_item_id",
        "attribute_key",
      ])
      expect(mockDb.merge).toHaveBeenCalledWith(["attribute_value", "updated_at"])
    })

    it("should handle empty attributes object", async () => {
      await service.setAttributes(1, {})

      expect(mockDb).not.toHaveBeenCalled()
    })
  })

  describe("getAttributes", () => {
    it("should return empty object when no attributes exist", async () => {
      mockDb.select.mockResolvedValue([])

      const attributes = await service.getAttributes(1)

      expect(attributes).toEqual({})
      expect(mockDb).toHaveBeenCalledWith("game_item_attributes")
      expect(mockDb.where).toHaveBeenCalledWith({ game_item_id: 1 })
      expect(mockDb.select).toHaveBeenCalledWith(
        "attribute_key",
        "attribute_value",
      )
    })

    it("should return all attributes for a game item", async () => {
      mockDb.select.mockResolvedValue([
        { attribute_key: "component_size", attribute_value: "3" },
        { attribute_key: "component_grade", attribute_value: "A" },
        {
          attribute_key: "manufacturer",
          attribute_value: "Crusader Industries",
        },
      ])

      const attributes = await service.getAttributes(1)

      expect(attributes).toEqual({
        component_size: "3",
        component_grade: "A",
        manufacturer: "Crusader Industries",
      })
    })
  })

  describe("getItemsByAttribute", () => {
    it("should return empty array when no items have the attribute", async () => {
      mockDb.select.mockResolvedValue([])

      const items = await service.getItemsByAttribute("component_size", "3")

      expect(items).toEqual([])
      expect(mockDb).toHaveBeenCalledWith("game_item_attributes")
      expect(mockDb.where).toHaveBeenCalledWith({
        attribute_key: "component_size",
        attribute_value: "3",
      })
      expect(mockDb.select).toHaveBeenCalledWith("game_item_id")
    })

    it("should return items with matching attribute", async () => {
      mockDb.select.mockResolvedValue([
        { game_item_id: 1 },
        { game_item_id: 2 },
        { game_item_id: 5 },
      ])

      const items = await service.getItemsByAttribute("component_size", "3")

      expect(items).toEqual([1, 2, 5])
    })
  })

  describe("deleteAttribute", () => {
    it("should delete a specific attribute", async () => {
      mockDb.delete.mockResolvedValue(1)

      await service.deleteAttribute(1, "component_grade")

      expect(mockDb).toHaveBeenCalledWith("game_item_attributes")
      expect(mockDb.where).toHaveBeenCalledWith({
        game_item_id: 1,
        attribute_key: "component_grade",
      })
      expect(mockDb.delete).toHaveBeenCalled()
    })

    it("should use transaction when provided", async () => {
      const mockTrx: any = vi.fn(() => mockTrx)
      mockTrx.where = vi.fn(() => mockTrx)
      mockTrx.delete = vi.fn(() => mockTrx)
      mockTrx.delete.mockResolvedValue(0)

      await service.deleteAttribute(1, "component_grade", mockTrx)

      expect(mockTrx).toHaveBeenCalledWith("game_item_attributes")
      expect(mockTrx.where).toHaveBeenCalled()
      expect(mockTrx.delete).toHaveBeenCalled()
      expect(mockDb).not.toHaveBeenCalled()
    })
  })
})
