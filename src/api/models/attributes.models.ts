/**
 * Attribute Models for TSOA Controllers
 *
 * These type definitions are used by TSOA controllers to define
 * request/response schemas for attribute-related endpoints in the OpenAPI spec.
 * They match the legacy response format for backward compatibility.
 *
 * NOTE: These are TypeScript type definitions for TSOA's OpenAPI
 * generation. The actual response creation still uses the utility
 * functions in src/api/routes/v1/util/response.ts (createResponse,
 * createErrorResponse, etc.). These types ensure TSOA generates
 * accurate OpenAPI documentation that matches the legacy format.
 */

import { ApiResponse } from "./common.models.js"

/**
 * Attribute definition entity
 * Represents a definition for an attribute that can be applied to game items
 *
 * @example
 * {
 *   "attribute_name": "manufacturer",
 *   "display_name": "Manufacturer",
 *   "attribute_type": "select",
 *   "allowed_values": ["Anvil", "Crusader", "Drake"],
 *   "applicable_item_types": ["ship", "vehicle"],
 *   "display_order": 1,
 *   "show_in_filters": true,
 *   "created_at": "2024-01-01T00:00:00.000Z",
 *   "updated_at": "2024-01-01T00:00:00.000Z"
 * }
 */
export interface AttributeDefinition {
  /** Unique identifier for the attribute (snake_case) */
  attribute_name: string
  /** Human-readable display name */
  display_name: string
  /** Type of attribute value */
  attribute_type: "select" | "multiselect" | "range" | "text"
  /** Allowed values for select/multiselect types (null for range/text) */
  allowed_values: string[] | null
  /** Item types this attribute applies to (null means all types) */
  applicable_item_types: string[] | null
  /** Display order in UI (lower numbers appear first) */
  display_order: number
  /** Whether to show this attribute in filter UI */
  show_in_filters: boolean
  /** ISO 8601 timestamp when created */
  created_at: string
  /** ISO 8601 timestamp when last updated */
  updated_at: string
}

/**
 * Payload for creating a new attribute definition
 * Admin-only operation
 *
 * @example
 * {
 *   "attribute_name": "manufacturer",
 *   "display_name": "Manufacturer",
 *   "attribute_type": "select",
 *   "allowed_values": ["Anvil", "Crusader", "Drake"],
 *   "applicable_item_types": ["ship", "vehicle"],
 *   "display_order": 1,
 *   "show_in_filters": true
 * }
 */
export interface CreateAttributeDefinitionPayload {
  /** Unique identifier for the attribute (snake_case) */
  attribute_name: string
  /** Human-readable display name */
  display_name: string
  /** Type of attribute value */
  attribute_type: "select" | "multiselect" | "range" | "text"
  /** Allowed values for select/multiselect types (optional) */
  allowed_values?: string[] | null
  /** Item types this attribute applies to (optional, null means all types) */
  applicable_item_types?: string[] | null
  /** Display order in UI (optional, defaults to 999) */
  display_order?: number
  /** Whether to show this attribute in filter UI (optional, defaults to true) */
  show_in_filters?: boolean
}

/**
 * Payload for updating an existing attribute definition
 * Admin-only operation
 * All fields are optional - only provided fields will be updated
 *
 * @example
 * {
 *   "display_name": "Ship Manufacturer",
 *   "allowed_values": ["Anvil", "Crusader", "Drake", "Origin"],
 *   "show_in_filters": true
 * }
 */
export interface UpdateAttributeDefinitionPayload {
  /** Human-readable display name */
  display_name?: string
  /** Type of attribute value */
  attribute_type?: "select" | "multiselect" | "range" | "text"
  /** Allowed values for select/multiselect types */
  allowed_values?: string[] | null
  /** Item types this attribute applies to */
  applicable_item_types?: string[] | null
  /** Display order in UI */
  display_order?: number
  /** Whether to show this attribute in filter UI */
  show_in_filters?: boolean
}

/**
 * Response containing multiple attribute definitions
 *
 * @example
 * {
 *   "data": {
 *     "definitions": [
 *       {
 *         "attribute_name": "manufacturer",
 *         "display_name": "Manufacturer",
 *         "attribute_type": "select",
 *         "allowed_values": ["Anvil", "Crusader", "Drake"],
 *         "applicable_item_types": ["ship", "vehicle"],
 *         "display_order": 1,
 *         "show_in_filters": true,
 *         "created_at": "2024-01-01T00:00:00.000Z",
 *         "updated_at": "2024-01-01T00:00:00.000Z"
 *       }
 *     ]
 *   }
 * }
 */
export interface AttributeDefinitionsResponse
  extends ApiResponse<{
    definitions: AttributeDefinition[]
  }> {}

/**
 * Response containing a single attribute definition
 *
 * @example
 * {
 *   "data": {
 *     "definition": {
 *       "attribute_name": "manufacturer",
 *       "display_name": "Manufacturer",
 *       "attribute_type": "select",
 *       "allowed_values": ["Anvil", "Crusader", "Drake"],
 *       "applicable_item_types": ["ship", "vehicle"],
 *       "display_order": 1,
 *       "show_in_filters": true,
 *       "created_at": "2024-01-01T00:00:00.000Z",
 *       "updated_at": "2024-01-01T00:00:00.000Z"
 *     }
 *   }
 * }
 */
export interface AttributeDefinitionResponse
  extends ApiResponse<{
    definition: AttributeDefinition
  }> {}

/**
 * Response for successful deletion
 *
 * @example
 * {
 *   "data": {
 *     "message": "Attribute definition 'manufacturer' deleted successfully",
 *     "cascade": true
 *   }
 * }
 */
export interface DeleteAttributeDefinitionResponse
  extends ApiResponse<{
    message: string
    cascade: boolean
  }> {}

/**
 * Game item attribute entity
 * Represents an attribute value assigned to a specific game item
 *
 * @example
 * {
 *   "game_item_id": "aegis-avenger-titan",
 *   "attribute_name": "manufacturer",
 *   "attribute_value": "Aegis",
 *   "created_at": "2024-01-01T00:00:00.000Z",
 *   "updated_at": "2024-01-01T00:00:00.000Z"
 * }
 */
export interface GameItemAttribute {
  /** ID of the game item */
  game_item_id: string
  /** Name of the attribute */
  attribute_name: string
  /** Value of the attribute for this game item */
  attribute_value: string
  /** ISO 8601 timestamp when created */
  created_at: string
  /** ISO 8601 timestamp when last updated */
  updated_at: string
}

/**
 * Game item attribute with definition details
 * Includes both the attribute value and its definition metadata
 *
 * @example
 * {
 *   "game_item_id": "aegis-avenger-titan",
 *   "attribute_name": "manufacturer",
 *   "attribute_value": "Aegis",
 *   "display_name": "Manufacturer",
 *   "attribute_type": "select",
 *   "allowed_values": ["Anvil", "Crusader", "Drake", "Aegis"],
 *   "created_at": "2024-01-01T00:00:00.000Z",
 *   "updated_at": "2024-01-01T00:00:00.000Z"
 * }
 */
export interface GameItemAttributeWithDefinition extends GameItemAttribute {
  /** Human-readable display name from definition */
  display_name: string
  /** Type of attribute value from definition */
  attribute_type: "select" | "multiselect" | "range" | "text"
  /** Allowed values from definition */
  allowed_values: string[] | null
}

/**
 * Payload for upserting a game item attribute
 * Admin-only operation
 *
 * @example
 * {
 *   "attribute_name": "manufacturer",
 *   "attribute_value": "Aegis"
 * }
 */
export interface UpsertGameItemAttributePayload {
  /** Name of the attribute (must exist in attribute_definitions) */
  attribute_name: string
  /** Value to assign (must be in allowed_values if defined) */
  attribute_value: string
}

/**
 * Response containing game item attributes
 *
 * @example
 * {
 *   "data": {
 *     "attributes": [
 *       {
 *         "game_item_id": "aegis-avenger-titan",
 *         "attribute_name": "manufacturer",
 *         "attribute_value": "Aegis",
 *         "display_name": "Manufacturer",
 *         "attribute_type": "select",
 *         "allowed_values": ["Anvil", "Crusader", "Drake", "Aegis"],
 *         "created_at": "2024-01-01T00:00:00.000Z",
 *         "updated_at": "2024-01-01T00:00:00.000Z"
 *       }
 *     ]
 *   }
 * }
 */
export interface GameItemAttributesResponse
  extends ApiResponse<{
    attributes: GameItemAttributeWithDefinition[]
  }> {}

/**
 * Response containing a single game item attribute
 *
 * @example
 * {
 *   "data": {
 *     "attribute": {
 *       "game_item_id": "aegis-avenger-titan",
 *       "attribute_name": "manufacturer",
 *       "attribute_value": "Aegis",
 *       "created_at": "2024-01-01T00:00:00.000Z",
 *       "updated_at": "2024-01-01T00:00:00.000Z"
 *     }
 *   }
 * }
 */
export interface GameItemAttributeResponse
  extends ApiResponse<{
    attribute: GameItemAttribute
  }> {}

/**
 * Response for successful game item attribute deletion
 *
 * @example
 * {
 *   "data": {
 *     "message": "Attribute 'manufacturer' deleted from game item 'aegis-avenger-titan'"
 *   }
 * }
 */
export interface DeleteGameItemAttributeResponse
  extends ApiResponse<{
    message: string
  }> {}

/**
 * Result of attribute import operation
 *
 * @example
 * {
 *   "gameItemId": "aegis-avenger-titan",
 *   "success": true,
 *   "attributesImported": 5,
 *   "errors": []
 * }
 */
export interface AttributeImportResult {
  /** ID of the game item */
  gameItemId: string
  /** Whether the import was successful */
  success: boolean
  /** Number of attributes successfully imported */
  attributesImported: number
  /** Array of error messages if any occurred */
  errors: string[]
}

/**
 * Response for attribute import operation
 *
 * @example
 * {
 *   "data": {
 *     "gameItemId": "aegis-avenger-titan",
 *     "success": true,
 *     "attributesImported": 5,
 *     "errors": [],
 *     "message": "Successfully imported 5 attributes"
 *   }
 * }
 */
export interface AttributeImportResponse
  extends ApiResponse<
    AttributeImportResult & {
      message: string
    }
  > {}

/**
 * Attribute value search result
 *
 * @example
 * {
 *   "value": "Aegis",
 *   "count": 15
 * }
 */
export interface AttributeValueSearchResult {
  /** The attribute value */
  value: string
  /** Number of game items with this value */
  count: number
}

/**
 * Response for attribute value search
 *
 * @example
 * {
 *   "data": {
 *     "values": [
 *       { "value": "Aegis", "count": 15 },
 *       { "value": "Anvil", "count": 12 }
 *     ]
 *   }
 * }
 */
export interface AttributeValueSearchResponse
  extends ApiResponse<{
    values: AttributeValueSearchResult[]
  }> {}
