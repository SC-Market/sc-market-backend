/**
 * Unit tests for Attribute Models
 *
 * These tests verify that the attribute model interfaces are correctly
 * structured and compatible with the legacy response format.
 */

import { describe, it, expect } from "vitest"
import type {
  AttributeDefinition,
  CreateAttributeDefinitionPayload,
  UpdateAttributeDefinitionPayload,
  AttributeDefinitionsResponse,
  AttributeDefinitionResponse,
  DeleteAttributeDefinitionResponse,
  GameItemAttribute,
  GameItemAttributeWithDefinition,
  UpsertGameItemAttributePayload,
  GameItemAttributesResponse,
  GameItemAttributeResponse,
  DeleteGameItemAttributeResponse,
  AttributeImportResult,
  AttributeImportResponse,
  AttributeValueSearchResult,
  AttributeValueSearchResponse,
} from "./attributes.models.js"

describe("Attribute Models", () => {
  describe("AttributeDefinition", () => {
    it("should accept a valid attribute definition", () => {
      const definition: AttributeDefinition = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select",
        allowed_values: ["Anvil", "Crusader", "Drake"],
        applicable_item_types: ["ship", "vehicle"],
        display_order: 1,
        show_in_filters: true,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(definition.attribute_name).toBe("manufacturer")
      expect(definition.attribute_type).toBe("select")
      expect(definition.allowed_values).toHaveLength(3)
    })

    it("should accept null for allowed_values", () => {
      const definition: AttributeDefinition = {
        attribute_name: "description",
        display_name: "Description",
        attribute_type: "text",
        allowed_values: null,
        applicable_item_types: null,
        display_order: 10,
        show_in_filters: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(definition.allowed_values).toBeNull()
      expect(definition.applicable_item_types).toBeNull()
    })

    it("should accept all valid attribute types", () => {
      const types: Array<"select" | "multiselect" | "range" | "text"> = [
        "select",
        "multiselect",
        "range",
        "text",
      ]

      types.forEach((type) => {
        const definition: AttributeDefinition = {
          attribute_name: `test_${type}`,
          display_name: `Test ${type}`,
          attribute_type: type,
          allowed_values: null,
          applicable_item_types: null,
          display_order: 1,
          show_in_filters: true,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        }

        expect(definition.attribute_type).toBe(type)
      })
    })
  })

  describe("CreateAttributeDefinitionPayload", () => {
    it("should accept required fields only", () => {
      const payload: CreateAttributeDefinitionPayload = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select",
      }

      expect(payload.attribute_name).toBe("manufacturer")
      expect(payload.allowed_values).toBeUndefined()
      expect(payload.display_order).toBeUndefined()
    })

    it("should accept all optional fields", () => {
      const payload: CreateAttributeDefinitionPayload = {
        attribute_name: "manufacturer",
        display_name: "Manufacturer",
        attribute_type: "select",
        allowed_values: ["Anvil", "Crusader"],
        applicable_item_types: ["ship"],
        display_order: 5,
        show_in_filters: true,
      }

      expect(payload.allowed_values).toHaveLength(2)
      expect(payload.display_order).toBe(5)
      expect(payload.show_in_filters).toBe(true)
    })

    it("should accept null for optional array fields", () => {
      const payload: CreateAttributeDefinitionPayload = {
        attribute_name: "description",
        display_name: "Description",
        attribute_type: "text",
        allowed_values: null,
        applicable_item_types: null,
      }

      expect(payload.allowed_values).toBeNull()
      expect(payload.applicable_item_types).toBeNull()
    })
  })

  describe("UpdateAttributeDefinitionPayload", () => {
    it("should accept empty payload", () => {
      const payload: UpdateAttributeDefinitionPayload = {}

      expect(Object.keys(payload)).toHaveLength(0)
    })

    it("should accept partial updates", () => {
      const payload: UpdateAttributeDefinitionPayload = {
        display_name: "Updated Name",
        show_in_filters: false,
      }

      expect(payload.display_name).toBe("Updated Name")
      expect(payload.attribute_type).toBeUndefined()
    })

    it("should accept all fields", () => {
      const payload: UpdateAttributeDefinitionPayload = {
        display_name: "Updated Name",
        attribute_type: "multiselect",
        allowed_values: ["Value1", "Value2"],
        applicable_item_types: ["ship", "vehicle"],
        display_order: 10,
        show_in_filters: true,
      }

      expect(Object.keys(payload)).toHaveLength(6)
    })
  })

  describe("AttributeDefinitionsResponse", () => {
    it("should match legacy response format", () => {
      const response: AttributeDefinitionsResponse = {
        data: {
          definitions: [
            {
              attribute_name: "manufacturer",
              display_name: "Manufacturer",
              attribute_type: "select",
              allowed_values: ["Anvil"],
              applicable_item_types: ["ship"],
              display_order: 1,
              show_in_filters: true,
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      }

      expect(response.data).toBeDefined()
      expect(response.data.definitions).toBeInstanceOf(Array)
      expect(response.data.definitions).toHaveLength(1)
    })

    it("should accept empty definitions array", () => {
      const response: AttributeDefinitionsResponse = {
        data: {
          definitions: [],
        },
      }

      expect(response.data.definitions).toHaveLength(0)
    })
  })

  describe("AttributeDefinitionResponse", () => {
    it("should match legacy response format", () => {
      const response: AttributeDefinitionResponse = {
        data: {
          definition: {
            attribute_name: "manufacturer",
            display_name: "Manufacturer",
            attribute_type: "select",
            allowed_values: ["Anvil"],
            applicable_item_types: ["ship"],
            display_order: 1,
            show_in_filters: true,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
          },
        },
      }

      expect(response.data).toBeDefined()
      expect(response.data.definition).toBeDefined()
      expect(response.data.definition.attribute_name).toBe("manufacturer")
    })
  })

  describe("DeleteAttributeDefinitionResponse", () => {
    it("should match legacy response format", () => {
      const response: DeleteAttributeDefinitionResponse = {
        data: {
          message: "Attribute definition 'manufacturer' deleted successfully",
          cascade: true,
        },
      }

      expect(response.data.message).toContain("deleted successfully")
      expect(response.data.cascade).toBe(true)
    })

    it("should accept cascade false", () => {
      const response: DeleteAttributeDefinitionResponse = {
        data: {
          message: "Deleted",
          cascade: false,
        },
      }

      expect(response.data.cascade).toBe(false)
    })
  })

  describe("GameItemAttribute", () => {
    it("should accept a valid game item attribute", () => {
      const attribute: GameItemAttribute = {
        game_item_id: "aegis-avenger-titan",
        attribute_name: "manufacturer",
        attribute_value: "Aegis",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(attribute.game_item_id).toBe("aegis-avenger-titan")
      expect(attribute.attribute_name).toBe("manufacturer")
      expect(attribute.attribute_value).toBe("Aegis")
    })
  })

  describe("GameItemAttributeWithDefinition", () => {
    it("should extend GameItemAttribute with definition fields", () => {
      const attribute: GameItemAttributeWithDefinition = {
        game_item_id: "aegis-avenger-titan",
        attribute_name: "manufacturer",
        attribute_value: "Aegis",
        display_name: "Manufacturer",
        attribute_type: "select",
        allowed_values: ["Aegis", "Anvil"],
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(attribute.display_name).toBe("Manufacturer")
      expect(attribute.attribute_type).toBe("select")
      expect(attribute.allowed_values).toHaveLength(2)
    })
  })

  describe("UpsertGameItemAttributePayload", () => {
    it("should accept required fields", () => {
      const payload: UpsertGameItemAttributePayload = {
        attribute_name: "manufacturer",
        attribute_value: "Aegis",
      }

      expect(payload.attribute_name).toBe("manufacturer")
      expect(payload.attribute_value).toBe("Aegis")
    })
  })

  describe("GameItemAttributesResponse", () => {
    it("should match legacy response format", () => {
      const response: GameItemAttributesResponse = {
        data: {
          attributes: [
            {
              game_item_id: "aegis-avenger-titan",
              attribute_name: "manufacturer",
              attribute_value: "Aegis",
              display_name: "Manufacturer",
              attribute_type: "select",
              allowed_values: ["Aegis"],
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      }

      expect(response.data.attributes).toBeInstanceOf(Array)
      expect(response.data.attributes).toHaveLength(1)
    })

    it("should accept empty attributes array", () => {
      const response: GameItemAttributesResponse = {
        data: {
          attributes: [],
        },
      }

      expect(response.data.attributes).toHaveLength(0)
    })
  })

  describe("GameItemAttributeResponse", () => {
    it("should match legacy response format", () => {
      const response: GameItemAttributeResponse = {
        data: {
          attribute: {
            game_item_id: "aegis-avenger-titan",
            attribute_name: "manufacturer",
            attribute_value: "Aegis",
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
          },
        },
      }

      expect(response.data.attribute).toBeDefined()
      expect(response.data.attribute.game_item_id).toBe("aegis-avenger-titan")
    })
  })

  describe("DeleteGameItemAttributeResponse", () => {
    it("should match legacy response format", () => {
      const response: DeleteGameItemAttributeResponse = {
        data: {
          message:
            "Attribute 'manufacturer' deleted from game item 'aegis-avenger-titan'",
        },
      }

      expect(response.data.message).toContain("deleted")
    })
  })

  describe("AttributeImportResult", () => {
    it("should accept successful import result", () => {
      const result: AttributeImportResult = {
        gameItemId: "aegis-avenger-titan",
        success: true,
        attributesImported: 5,
        errors: [],
      }

      expect(result.success).toBe(true)
      expect(result.attributesImported).toBe(5)
      expect(result.errors).toHaveLength(0)
    })

    it("should accept failed import result with errors", () => {
      const result: AttributeImportResult = {
        gameItemId: "aegis-avenger-titan",
        success: false,
        attributesImported: 2,
        errors: ["Failed to import attribute X", "Failed to import attribute Y"],
      }

      expect(result.success).toBe(false)
      expect(result.attributesImported).toBe(2)
      expect(result.errors).toHaveLength(2)
    })
  })

  describe("AttributeImportResponse", () => {
    it("should match legacy response format", () => {
      const response: AttributeImportResponse = {
        data: {
          gameItemId: "aegis-avenger-titan",
          success: true,
          attributesImported: 5,
          errors: [],
          message: "Successfully imported 5 attributes",
        },
      }

      expect(response.data.success).toBe(true)
      expect(response.data.message).toContain("Successfully imported")
    })

    it("should accept partial success response", () => {
      const response: AttributeImportResponse = {
        data: {
          gameItemId: "aegis-avenger-titan",
          success: false,
          attributesImported: 3,
          errors: ["Error 1", "Error 2"],
          message: "Import completed with errors. Imported 3 attributes",
        },
      }

      expect(response.data.success).toBe(false)
      expect(response.data.errors).toHaveLength(2)
    })
  })

  describe("AttributeValueSearchResult", () => {
    it("should accept valid search result", () => {
      const result: AttributeValueSearchResult = {
        value: "Aegis",
        count: 15,
      }

      expect(result.value).toBe("Aegis")
      expect(result.count).toBe(15)
    })

    it("should accept zero count", () => {
      const result: AttributeValueSearchResult = {
        value: "Unknown",
        count: 0,
      }

      expect(result.count).toBe(0)
    })
  })

  describe("AttributeValueSearchResponse", () => {
    it("should match legacy response format", () => {
      const response: AttributeValueSearchResponse = {
        data: {
          values: [
            { value: "Aegis", count: 15 },
            { value: "Anvil", count: 12 },
          ],
        },
      }

      expect(response.data.values).toBeInstanceOf(Array)
      expect(response.data.values).toHaveLength(2)
    })

    it("should accept empty values array", () => {
      const response: AttributeValueSearchResponse = {
        data: {
          values: [],
        },
      }

      expect(response.data.values).toHaveLength(0)
    })
  })

  describe("Response Format Consistency", () => {
    it("should wrap all responses in data property", () => {
      const responses = [
        { data: { definitions: [] } } as AttributeDefinitionsResponse,
        {
          data: {
            definition: {
              attribute_name: "test",
              display_name: "Test",
              attribute_type: "text" as const,
              allowed_values: null,
              applicable_item_types: null,
              display_order: 1,
              show_in_filters: true,
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          },
        } as AttributeDefinitionResponse,
        { data: { attributes: [] } } as GameItemAttributesResponse,
        { data: { values: [] } } as AttributeValueSearchResponse,
      ]

      responses.forEach((response) => {
        expect(response).toHaveProperty("data")
        expect(response.data).toBeDefined()
      })
    })
  })

  describe("Timestamp Format", () => {
    it("should use ISO 8601 format for timestamps", () => {
      const definition: AttributeDefinition = {
        attribute_name: "test",
        display_name: "Test",
        attribute_type: "text",
        allowed_values: null,
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(definition.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(definition.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty strings in attribute values", () => {
      const attribute: GameItemAttribute = {
        game_item_id: "",
        attribute_name: "",
        attribute_value: "",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(attribute.game_item_id).toBe("")
      expect(attribute.attribute_name).toBe("")
      expect(attribute.attribute_value).toBe("")
    })

    it("should handle large arrays in allowed_values", () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => `Value${i}`)
      const definition: AttributeDefinition = {
        attribute_name: "test",
        display_name: "Test",
        attribute_type: "select",
        allowed_values: largeArray,
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(definition.allowed_values).toHaveLength(100)
    })

    it("should handle special characters in attribute names", () => {
      const definition: AttributeDefinition = {
        attribute_name: "test_attribute-name.v2",
        display_name: "Test Attribute (v2)",
        attribute_type: "text",
        allowed_values: null,
        applicable_item_types: null,
        display_order: 1,
        show_in_filters: true,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(definition.attribute_name).toContain("-")
      expect(definition.attribute_name).toContain(".")
      expect(definition.display_name).toContain("(")
    })
  })
})
