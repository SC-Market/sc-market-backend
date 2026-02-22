/**
 * Unit tests for AttributesController
 *
 * Tests the TSOA controller for attribute-related endpoints.
 * Focuses on GET endpoints for Phase 1 migration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AttributesController } from "./attributes.controller.js"
import { Request as ExpressRequest } from "express"
import { ValidationErrorClass } from "./base.controller.js"

// Mock the database modules
vi.mock("../routes/v1/attributes/cache.js", () => ({
  cachedDb: {
    getAttributeDefinitions: vi.fn(),
    getAttributeDefinition: vi.fn(),
    createAttributeDefinition: vi.fn(),
    updateAttributeDefinition: vi.fn(),
    deleteAttributeDefinition: vi.fn(),
  },
}))

vi.mock("../routes/v1/attributes/database.js", () => ({
  searchAttributeValues: vi.fn(),
  getGameItemAttributes: vi.fn(),
  upsertGameItemAttribute: vi.fn(),
  deleteGameItemAttribute: vi.fn(),
}))

// Mock the rate limiting middleware
vi.mock("../middleware/tsoa-ratelimit.js", () => ({
  tsoaReadRateLimit: vi.fn((req, res, next) => next()),
  tsoaWriteRateLimit: vi.fn((req, res, next) => next()),
  tsoaCriticalRateLimit: vi.fn((req, res, next) => next()),
}))

// Import after mocking
import { cachedDb } from "../routes/v1/attributes/cache.js"
import * as attributeDb from "../routes/v1/attributes/database.js"

describe("AttributesController", () => {
  let controller: AttributesController
  let mockRequest: Partial<ExpressRequest>

  beforeEach(() => {
    controller = new AttributesController()
    mockRequest = {
      query: {},
      user: {
        user_id: "test-user-id",
        username: "testuser",
        role: "user",
        rsi_confirmed: true,
        banned: false,
      } as any,
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getDefinitions", () => {
    it("should return all attribute definitions when no filters provided", async () => {
      // Arrange
      const mockDefinitions = [
        {
          attribute_name: "manufacturer",
          display_name: "Manufacturer",
          attribute_type: "select" as const,
          allowed_values: ["Anvil", "Crusader", "Drake"],
          applicable_item_types: ["ship", "vehicle"],
          display_order: 1,
          show_in_filters: true,
          created_at: new Date("2024-01-01T00:00:00.000Z"),
          updated_at: new Date("2024-01-01T00:00:00.000Z"),
        },
        {
          attribute_name: "size",
          display_name: "Size",
          attribute_type: "select" as const,
          allowed_values: ["Small", "Medium", "Large"],
          applicable_item_types: null,
          display_order: 2,
          show_in_filters: true,
          created_at: new Date("2024-01-01T00:00:00.000Z"),
          updated_at: new Date("2024-01-01T00:00:00.000Z"),
        },
      ]

      vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
        mockDefinitions,
      )

      // Act
      const result = await controller.getDefinitions(
        mockRequest as ExpressRequest,
      )

      // Assert
      expect(result).toEqual({
        data: {
          definitions: [
            {
              ...mockDefinitions[0],
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
            {
              ...mockDefinitions[1],
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      })
      expect(cachedDb.getAttributeDefinitions).toHaveBeenCalledWith(
        undefined,
        false,
      )
    })

    it("should filter by single applicable_item_type", async () => {
      // Arrange
      const mockDefinitions = [
        {
          attribute_name: "manufacturer",
          display_name: "Manufacturer",
          attribute_type: "select" as const,
          allowed_values: ["Anvil", "Crusader", "Drake"],
          applicable_item_types: ["ship"],
          display_order: 1,
          show_in_filters: true,
          created_at: new Date("2024-01-01T00:00:00.000Z"),
          updated_at: new Date("2024-01-01T00:00:00.000Z"),
        },
      ]

      vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
        mockDefinitions,
      )

      mockRequest.query = { applicable_item_types: "ship" }

      // Act
      const result = await controller.getDefinitions(
        mockRequest as ExpressRequest,
        "ship",
      )

      // Assert
      expect(result).toEqual({
        data: {
          definitions: [
            {
              ...mockDefinitions[0],
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      })
      expect(cachedDb.getAttributeDefinitions).toHaveBeenCalledWith(
        ["ship"],
        false,
      )
    })

    it("should filter by multiple applicable_item_types", async () => {
      // Arrange
      const mockDefinitions = [
        {
          attribute_name: "manufacturer",
          display_name: "Manufacturer",
          attribute_type: "select" as const,
          allowed_values: ["Anvil", "Crusader", "Drake"],
          applicable_item_types: ["ship", "vehicle"],
          display_order: 1,
          show_in_filters: true,
          created_at: new Date("2024-01-01T00:00:00.000Z"),
          updated_at: new Date("2024-01-01T00:00:00.000Z"),
        },
      ]

      vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
        mockDefinitions,
      )

      mockRequest.query = { applicable_item_types: ["ship", "vehicle"] }

      // Act
      const result = await controller.getDefinitions(
        mockRequest as ExpressRequest,
        ["ship", "vehicle"],
      )

      // Assert
      expect(result).toEqual({
        data: {
          definitions: [
            {
              ...mockDefinitions[0],
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      })
      expect(cachedDb.getAttributeDefinitions).toHaveBeenCalledWith(
        ["ship", "vehicle"],
        false,
      )
    })

    it("should include hidden definitions when include_hidden is true", async () => {
      // Arrange
      const mockDefinitions = [
        {
          attribute_name: "internal_id",
          display_name: "Internal ID",
          attribute_type: "text" as const,
          allowed_values: null,
          applicable_item_types: null,
          display_order: 999,
          show_in_filters: false,
          created_at: new Date("2024-01-01T00:00:00.000Z"),
          updated_at: new Date("2024-01-01T00:00:00.000Z"),
        },
      ]

      vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
        mockDefinitions,
      )

      mockRequest.query = { include_hidden: "true" }

      // Act
      const result = await controller.getDefinitions(
        mockRequest as ExpressRequest,
        undefined,
        "true",
      )

      // Assert
      expect(result).toEqual({
        data: {
          definitions: [
            {
              ...mockDefinitions[0],
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      })
      expect(cachedDb.getAttributeDefinitions).toHaveBeenCalledWith(
        undefined,
        true,
      )
    })

    it("should not include hidden definitions when include_hidden is false", async () => {
      // Arrange
      const mockDefinitions = [
        {
          attribute_name: "manufacturer",
          display_name: "Manufacturer",
          attribute_type: "select" as const,
          allowed_values: ["Anvil", "Crusader", "Drake"],
          applicable_item_types: ["ship"],
          display_order: 1,
          show_in_filters: true,
          created_at: new Date("2024-01-01T00:00:00.000Z"),
          updated_at: new Date("2024-01-01T00:00:00.000Z"),
        },
      ]

      vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
        mockDefinitions,
      )

      mockRequest.query = { include_hidden: "false" }

      // Act
      const result = await controller.getDefinitions(
        mockRequest as ExpressRequest,
        undefined,
        "false",
      )

      // Assert
      expect(result).toEqual({
        data: {
          definitions: [
            {
              ...mockDefinitions[0],
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      })
      expect(cachedDb.getAttributeDefinitions).toHaveBeenCalledWith(
        undefined,
        false,
      )
    })

    it("should handle database errors gracefully", async () => {
      // Arrange
      const dbError = new Error("Database connection failed")
      vi.mocked(cachedDb.getAttributeDefinitions).mockRejectedValue(dbError)

      // Act & Assert
      await expect(
        controller.getDefinitions(mockRequest as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should return empty array when no definitions exist", async () => {
      // Arrange
      vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue([])

      // Act
      const result = await controller.getDefinitions(
        mockRequest as ExpressRequest,
      )

      // Assert
      expect(result).toEqual({
        data: {
          definitions: [],
        },
      })
    })
  })

  describe("searchAttributeValues", () => {
    it("should search attribute values with all parameters", async () => {
      // Arrange
      const mockValues = ["Aegis", "Anvil"]

      vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
        mockValues,
      )

      mockRequest.query = {
        attribute_name: "manufacturer",
        q: "A",
        item_type: "ship",
        limit: "10",
      }

      // Act
      const result = await controller.searchAttributeValues(
        mockRequest as ExpressRequest,
        "manufacturer",
        "A",
        "ship",
        "10",
      )

      // Assert
      expect(result).toEqual({
        data: {
          values: [
            { value: "Aegis", count: 0 },
            { value: "Anvil", count: 0 },
          ],
        },
      })
      expect(attributeDb.searchAttributeValues).toHaveBeenCalledWith(
        "manufacturer",
        "A",
        "ship",
        10,
      )
    })

    it("should use default values when optional parameters not provided", async () => {
      // Arrange
      const mockValues = ["Aegis", "Anvil", "Crusader"]

      vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
        mockValues,
      )

      mockRequest.query = {
        attribute_name: "manufacturer",
      }

      // Act
      const result = await controller.searchAttributeValues(
        mockRequest as ExpressRequest,
        "manufacturer",
      )

      // Assert
      expect(result).toEqual({
        data: {
          values: [
            { value: "Aegis", count: 0 },
            { value: "Anvil", count: 0 },
            { value: "Crusader", count: 0 },
          ],
        },
      })
      expect(attributeDb.searchAttributeValues).toHaveBeenCalledWith(
        "manufacturer",
        "",
        undefined,
        20,
      )
    })

    it("should enforce maximum limit of 50", async () => {
      // Arrange
      const mockValues = Array.from({ length: 50 }, (_, i) => `Value${i}`)

      vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
        mockValues,
      )

      mockRequest.query = {
        attribute_name: "manufacturer",
        limit: "100", // Request more than max
      }

      // Act
      const result = await controller.searchAttributeValues(
        mockRequest as ExpressRequest,
        "manufacturer",
        undefined,
        undefined,
        "100",
      )

      // Assert
      expect(attributeDb.searchAttributeValues).toHaveBeenCalledWith(
        "manufacturer",
        "",
        undefined,
        50, // Should be capped at 50
      )
    })

    it("should throw ValidationError when attribute_name is missing", async () => {
      // Arrange
      mockRequest.query = {}

      // Act & Assert
      await expect(
        controller.searchAttributeValues(
          mockRequest as ExpressRequest,
          "" as any,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "attribute_name query parameter is required",
      })
    })

    it("should handle empty search results", async () => {
      // Arrange
      vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue([])

      mockRequest.query = {
        attribute_name: "manufacturer",
        q: "NonExistent",
      }

      // Act
      const result = await controller.searchAttributeValues(
        mockRequest as ExpressRequest,
        "manufacturer",
        "NonExistent",
      )

      // Assert
      expect(result).toEqual({
        data: {
          values: [],
        },
      })
    })

    it("should handle database errors gracefully", async () => {
      // Arrange
      const dbError = new Error("Database query failed")
      vi.mocked(attributeDb.searchAttributeValues).mockRejectedValue(dbError)

      mockRequest.query = {
        attribute_name: "manufacturer",
      }

      // Act & Assert
      await expect(
        controller.searchAttributeValues(
          mockRequest as ExpressRequest,
          "manufacturer",
        ),
      ).rejects.toThrow()
    })

    it("should filter by item_type when provided", async () => {
      // Arrange
      const mockValues = ["Aegis"]

      vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
        mockValues,
      )

      mockRequest.query = {
        attribute_name: "manufacturer",
        item_type: "vehicle",
      }

      // Act
      const result = await controller.searchAttributeValues(
        mockRequest as ExpressRequest,
        "manufacturer",
        undefined,
        "vehicle",
      )

      // Assert
      expect(result).toEqual({
        data: {
          values: [{ value: "Aegis", count: 0 }],
        },
      })
      expect(attributeDb.searchAttributeValues).toHaveBeenCalledWith(
        "manufacturer",
        "",
        "vehicle",
        20,
      )
    })

    it("should handle search query with special characters", async () => {
      // Arrange
      const mockValues = ["Aegis & Co."]

      vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
        mockValues,
      )

      const searchQuery = "Aegis & Co."
      mockRequest.query = {
        attribute_name: "manufacturer",
        q: searchQuery,
      }

      // Act
      const result = await controller.searchAttributeValues(
        mockRequest as ExpressRequest,
        "manufacturer",
        searchQuery,
      )

      // Assert
      expect(result).toEqual({
        data: {
          values: [{ value: "Aegis & Co.", count: 0 }],
        },
      })
      expect(attributeDb.searchAttributeValues).toHaveBeenCalledWith(
        "manufacturer",
        searchQuery,
        undefined,
        20,
      )
    })
  })

  describe("createDefinition", () => {
    beforeEach(() => {
      // Set user as admin for write operations
      mockRequest.user = {
        user_id: "admin-user-id",
        username: "admin",
        role: "admin",
        rsi_confirmed: true,
        banned: false,
      } as any
    })

    it("should create a new attribute definition", async () => {
      // Arrange
      const payload = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil", "Crusader", "Drake"],
        applicable_item_types: ["ship", "vehicle"],
        display_order: 1,
      }

      const mockCreatedDefinition = {
        ...payload,
        show_in_filters: true,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
        updated_at: new Date("2024-01-01T00:00:00.000Z"),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(null)
      vi.mocked(cachedDb.createAttributeDefinition).mockResolvedValue(
        mockCreatedDefinition,
      )

      // Act
      const result = await controller.createDefinition(
        mockRequest as ExpressRequest,
        payload,
      )

      // Assert
      expect(result).toEqual({
        data: {
          definition: {
            ...mockCreatedDefinition,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
          },
        },
      })
      expect(cachedDb.getAttributeDefinition).toHaveBeenCalledWith(
        "manufacturer",
      )
      expect(cachedDb.createAttributeDefinition).toHaveBeenCalledWith(payload)
    })

    it("should throw ValidationError when required fields are missing", async () => {
      // Arrange
      const payload = {
        attribute_name: "manufacturer",
        // Missing display_name and attribute_type
      } as any

      // Act & Assert
      await expect(
        controller.createDefinition(mockRequest as ExpressRequest, payload),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message:
          "Missing required fields: attribute_name, display_name, attribute_type",
      })
    })

    it("should throw ValidationError for invalid attribute_type", async () => {
      // Arrange
      const payload = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "invalid" as any,
      }

      // Act & Assert
      await expect(
        controller.createDefinition(mockRequest as ExpressRequest, payload),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Invalid attribute_type"),
      })
    })

    it("should throw ConflictError when attribute_name already exists", async () => {
      // Arrange
      const payload = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
      }

      const existingDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil"],
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(
        existingDefinition,
      )

      // Act & Assert
      await expect(
        controller.createDefinition(mockRequest as ExpressRequest, payload),
      ).rejects.toMatchObject({
        status: 409,
        code: "CONFLICT",
        message: expect.stringContaining("already exists"),
      })
    })
  })

  describe("updateDefinition", () => {
    beforeEach(() => {
      mockRequest.user = {
        user_id: "admin-user-id",
        username: "admin",
        role: "admin",
        rsi_confirmed: true,
        banned: false,
      } as any
    })

    it("should update an existing attribute definition", async () => {
      // Arrange
      const attributeName = "manufacturer"
      const payload = {
        display_name: "Ship Manufacturer",
        allowed_values: ["Anvil", "Crusader", "Drake", "Origin"],
      }

      const existingDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil", "Crusader", "Drake"],
        applicable_item_types: ["ship"],
        display_order: 1,
        show_in_filters: true,
        created_at: new Date("2024-01-01T00:00:00.000Z"),
        updated_at: new Date("2024-01-01T00:00:00.000Z"),
      }

      const updatedDefinition = {
        ...existingDefinition,
        ...payload,
        updated_at: new Date("2024-01-02T00:00:00.000Z"),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(
        existingDefinition,
      )
      vi.mocked(cachedDb.updateAttributeDefinition).mockResolvedValue(
        updatedDefinition,
      )

      // Act
      const result = await controller.updateDefinition(
        mockRequest as ExpressRequest,
        attributeName,
        payload,
      )

      // Assert
      expect(result).toEqual({
        data: {
          definition: {
            ...updatedDefinition,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-02T00:00:00.000Z",
          },
        },
      })
      expect(cachedDb.updateAttributeDefinition).toHaveBeenCalledWith(
        attributeName,
        payload,
      )
    })

    it("should throw NotFoundError when attribute does not exist", async () => {
      // Arrange
      const attributeName = "nonexistent"
      const payload = {
        display_name: "Updated Name",
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(null)

      // Act & Assert
      await expect(
        controller.updateDefinition(
          mockRequest as ExpressRequest,
          attributeName,
          payload,
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: expect.stringContaining("not found"),
      })
    })

    it("should throw ValidationError for invalid attribute_type", async () => {
      // Arrange
      const attributeName = "manufacturer"
      const payload = {
        attribute_type: "invalid" as any,
      }

      const existingDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil"],
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(
        existingDefinition,
      )

      // Act & Assert
      await expect(
        controller.updateDefinition(
          mockRequest as ExpressRequest,
          attributeName,
          payload,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Invalid attribute_type"),
      })
    })

    it("should throw ValidationError for invalid allowed_values format", async () => {
      // Arrange
      const attributeName = "manufacturer"
      const payload = {
        allowed_values: "not-an-array" as any,
      }

      const existingDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil"],
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(
        existingDefinition,
      )

      // Act & Assert
      await expect(
        controller.updateDefinition(
          mockRequest as ExpressRequest,
          attributeName,
          payload,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("allowed_values must be an array"),
      })
    })
  })

  describe("deleteDefinition", () => {
    beforeEach(() => {
      mockRequest.user = {
        user_id: "admin-user-id",
        username: "admin",
        role: "admin",
        rsi_confirmed: true,
        banned: false,
      } as any
    })

    it("should delete an attribute definition without cascade", async () => {
      // Arrange
      const attributeName = "manufacturer"

      const existingDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil"],
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(
        existingDefinition,
      )
      vi.mocked(cachedDb.deleteAttributeDefinition).mockResolvedValue(true)

      // Act
      const result = await controller.deleteDefinition(
        mockRequest as ExpressRequest,
        attributeName,
      )

      // Assert
      expect(result).toEqual({
        data: {
          message: `Attribute definition '${attributeName}' deleted successfully`,
          cascade: false,
        },
      })
      expect(cachedDb.deleteAttributeDefinition).toHaveBeenCalledWith(
        attributeName,
        false,
      )
    })

    it("should delete an attribute definition with cascade", async () => {
      // Arrange
      const attributeName = "manufacturer"

      const existingDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil"],
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(
        existingDefinition,
      )
      vi.mocked(cachedDb.deleteAttributeDefinition).mockResolvedValue(true)

      // Act
      const result = await controller.deleteDefinition(
        mockRequest as ExpressRequest,
        attributeName,
        "true",
      )

      // Assert
      expect(result).toEqual({
        data: {
          message: `Attribute definition '${attributeName}' deleted successfully`,
          cascade: true,
        },
      })
      expect(cachedDb.deleteAttributeDefinition).toHaveBeenCalledWith(
        attributeName,
        true,
      )
    })

    it("should throw NotFoundError when attribute does not exist", async () => {
      // Arrange
      const attributeName = "nonexistent"

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(null)

      // Act & Assert
      await expect(
        controller.deleteDefinition(
          mockRequest as ExpressRequest,
          attributeName,
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: expect.stringContaining("not found"),
      })
    })

    it("should throw error when deletion fails", async () => {
      // Arrange
      const attributeName = "manufacturer"

      const existingDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Anvil"],
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(
        existingDefinition,
      )
      vi.mocked(cachedDb.deleteAttributeDefinition).mockResolvedValue(false)

      // Act & Assert
      await expect(
        controller.deleteDefinition(
          mockRequest as ExpressRequest,
          attributeName,
        ),
      ).rejects.toThrow()
    })
  })

  describe("upsertGameItemAttribute", () => {
    beforeEach(() => {
      mockRequest.user = {
        user_id: "admin-user-id",
        username: "admin",
        role: "admin",
        rsi_confirmed: true,
        banned: false,
      } as any
    })

    it("should upsert a game item attribute", async () => {
      // Arrange
      const gameItemId = "aegis-avenger-titan"
      const attributeName = "manufacturer"
      const payload = {
        attribute_name: "manufacturer",
        attribute_value: "Aegis",
      }

      const definition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Aegis", "Anvil", "Crusader"],
        applicable_item_types: ["ship"],
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      const mockAttribute = {
        game_item_id: gameItemId,
        attribute_name: "manufacturer",
        attribute_value: "Aegis",
        created_at: new Date("2024-01-01T00:00:00.000Z"),
        updated_at: new Date("2024-01-01T00:00:00.000Z"),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(definition)
      vi.mocked(attributeDb.upsertGameItemAttribute).mockResolvedValue(
        mockAttribute,
      )

      // Act
      const result = await controller.upsertGameItemAttribute(
        mockRequest as ExpressRequest,
        gameItemId,
        attributeName,
        payload,
      )

      // Assert
      expect(result).toEqual({
        data: {
          attribute: {
            ...mockAttribute,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
          },
        },
      })
      expect(attributeDb.upsertGameItemAttribute).toHaveBeenCalledWith(
        gameItemId,
        payload,
      )
    })

    it("should throw ValidationError when required fields are missing", async () => {
      // Arrange
      const gameItemId = "aegis-avenger-titan"
      const attributeName = "manufacturer"
      const payload = {
        attribute_name: "manufacturer",
        // Missing attribute_value
      } as any

      // Act & Assert
      await expect(
        controller.upsertGameItemAttribute(
          mockRequest as ExpressRequest,
          gameItemId,
          attributeName,
          payload,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Missing required fields"),
      })
    })

    it("should throw ValidationError when path and body attribute_name mismatch", async () => {
      // Arrange
      const gameItemId = "aegis-avenger-titan"
      const attributeName = "manufacturer"
      const payload = {
        attribute_name: "size", // Different from path
        attribute_value: "Large",
      }

      // Act & Assert
      await expect(
        controller.upsertGameItemAttribute(
          mockRequest as ExpressRequest,
          gameItemId,
          attributeName,
          payload,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("must match"),
      })
    })

    it("should throw ValidationError when attribute is not defined", async () => {
      // Arrange
      const gameItemId = "aegis-avenger-titan"
      const attributeName = "nonexistent"
      const payload = {
        attribute_name: "nonexistent",
        attribute_value: "value",
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(null)

      // Act & Assert
      await expect(
        controller.upsertGameItemAttribute(
          mockRequest as ExpressRequest,
          gameItemId,
          attributeName,
          payload,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("is not defined"),
      })
    })

    it("should throw ValidationError when value not in allowed_values", async () => {
      // Arrange
      const gameItemId = "aegis-avenger-titan"
      const attributeName = "manufacturer"
      const payload = {
        attribute_name: "manufacturer",
        attribute_value: "InvalidManufacturer",
      }

      const definition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select" as const,
        allowed_values: ["Aegis", "Anvil", "Crusader"],
        applicable_item_types: ["ship"],
        display_order: 1,
        show_in_filters: true,
        created_at: new Date(),
        updated_at: new Date(),
      }

      vi.mocked(cachedDb.getAttributeDefinition).mockResolvedValue(definition)

      // Act & Assert
      await expect(
        controller.upsertGameItemAttribute(
          mockRequest as ExpressRequest,
          gameItemId,
          attributeName,
          payload,
        ),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("Invalid attribute_value"),
      })
    })
  })

  describe("deleteGameItemAttribute", () => {
    beforeEach(() => {
      mockRequest.user = {
        user_id: "admin-user-id",
        username: "admin",
        role: "admin",
        rsi_confirmed: true,
        banned: false,
      } as any
    })

    it("should delete a game item attribute", async () => {
      // Arrange
      const gameItemId = "aegis-avenger-titan"
      const attributeName = "manufacturer"

      vi.mocked(attributeDb.deleteGameItemAttribute).mockResolvedValue(true)

      // Act
      const result = await controller.deleteGameItemAttribute(
        mockRequest as ExpressRequest,
        gameItemId,
        attributeName,
      )

      // Assert
      expect(result).toEqual({
        data: {
          message: `Attribute '${attributeName}' deleted from game item '${gameItemId}'`,
        },
      })
      expect(attributeDb.deleteGameItemAttribute).toHaveBeenCalledWith(
        gameItemId,
        attributeName,
      )
    })

    it("should throw NotFoundError when attribute does not exist", async () => {
      // Arrange
      const gameItemId = "aegis-avenger-titan"
      const attributeName = "nonexistent"

      vi.mocked(attributeDb.deleteGameItemAttribute).mockResolvedValue(false)

      // Act & Assert
      await expect(
        controller.deleteGameItemAttribute(
          mockRequest as ExpressRequest,
          gameItemId,
          attributeName,
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: expect.stringContaining("not found"),
      })
    })
  })
})
