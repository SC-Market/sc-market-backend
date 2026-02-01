import { OpenAPIV3_1 } from "openapi-types"
import { oapi } from "../openapi.js"

const AttributeDefinitionSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  properties: {
    attribute_name: {
      type: "string",
      description: "Unique identifier for the attribute",
      example: "size",
    },
    display_name: {
      type: "string",
      description: "Human-readable name shown in UI",
      example: "Component Size",
    },
    attribute_type: {
      type: "string",
      enum: ["select", "multiselect", "range", "text"],
      description: "UI control type",
      example: "select",
    },
    allowed_values: {
      oneOf: [
        {
          type: "array",
          items: { type: "string" },
        },
        {
          type: "null",
        },
      ],
      description:
        "Array of valid values for enum-type attributes, null for free-form",
      example: ["0", "1", "2", "3", "4"],
    },
    applicable_item_types: {
      oneOf: [
        {
          type: "array",
          items: { type: "string" },
        },
        {
          type: "null",
        },
      ],
      description: "Array of game item types this attribute applies to",
      example: ["Quantum Drive", "Cooler", "Power Plant"],
    },
    display_order: {
      type: "integer",
      description: "Order in which to display this attribute in the UI",
      example: 10,
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the definition was created",
    },
    updated_at: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the definition was last updated",
    },
  },
  required: [
    "attribute_name",
    "display_name",
    "attribute_type",
    "display_order",
    "created_at",
    "updated_at",
  ],
}

export const attributes_get_definitions_spec: OpenAPIV3_1.OperationObject = {
  summary: "Get attribute definitions",
  description:
    "Retrieve all attribute definitions, optionally filtered by applicable item types",
  tags: ["Attributes"],
  parameters: [
    {
      name: "applicable_item_types",
      in: "query",
      description: "Filter by applicable item types (can be repeated)",
      required: false,
      schema: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
      example: "Quantum Drive",
    },
  ],
  responses: {
    "200": {
      description: "Attribute definitions retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  definitions: {
                    type: "array",
                    items: AttributeDefinitionSchema,
                  },
                },
              },
            },
          },
        },
      },
    },
    "500": {
      description: "Internal server error",
    },
  },
}

export const attributes_post_definitions_spec: OpenAPIV3_1.OperationObject = {
  summary: "Create attribute definition",
  description: "Create a new attribute definition (admin only)",
  tags: ["Attributes"],
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            attribute_name: {
              type: "string",
              description: "Unique identifier for the attribute",
              example: "size",
            },
            display_name: {
              type: "string",
              description: "Human-readable name shown in UI",
              example: "Component Size",
            },
            attribute_type: {
              type: "string",
              enum: ["select", "multiselect", "range", "text"],
              description: "UI control type",
              example: "select",
            },
            allowed_values: {
              oneOf: [
                {
                  type: "array",
                  items: { type: "string" },
                },
                {
                  type: "null",
                },
              ],
              description: "Array of valid values for enum-type attributes",
              example: ["0", "1", "2", "3", "4"],
            },
            applicable_item_types: {
              oneOf: [
                {
                  type: "array",
                  items: { type: "string" },
                },
                {
                  type: "null",
                },
              ],
              description: "Array of game item types this attribute applies to",
              example: ["Quantum Drive", "Cooler"],
            },
            display_order: {
              type: "integer",
              description: "Order in which to display this attribute",
              example: 10,
            },
          },
          required: ["attribute_name", "display_name", "attribute_type"],
        },
      },
    },
  },
  responses: {
    "201": {
      description: "Attribute definition created successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  definition: AttributeDefinitionSchema,
                },
              },
            },
          },
        },
      },
    },
    "400": {
      description: "Validation error",
    },
    "401": {
      description: "Unauthorized",
    },
    "403": {
      description: "Forbidden - admin access required",
    },
    "409": {
      description: "Conflict - attribute name already exists",
    },
    "500": {
      description: "Internal server error",
    },
  },
}

export const attributes_put_definitions_name_spec: OpenAPIV3_1.OperationObject =
  {
    summary: "Update attribute definition",
    description: "Update an existing attribute definition (admin only)",
    tags: ["Attributes"],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "name",
        in: "path",
        description: "Attribute name",
        required: true,
        schema: { type: "string" },
        example: "size",
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              display_name: {
                type: "string",
                description: "Human-readable name shown in UI",
                example: "Component Size",
              },
              attribute_type: {
                type: "string",
                enum: ["select", "multiselect", "range", "text"],
                description: "UI control type",
                example: "select",
              },
              allowed_values: {
                oneOf: [
                  {
                    type: "array",
                    items: { type: "string" },
                  },
                  {
                    type: "null",
                  },
                ],
                description: "Array of valid values for enum-type attributes",
                example: ["0", "1", "2", "3", "4"],
              },
              applicable_item_types: {
                oneOf: [
                  {
                    type: "array",
                    items: { type: "string" },
                  },
                  {
                    type: "null",
                  },
                ],
                description:
                  "Array of game item types this attribute applies to",
                example: ["Quantum Drive", "Cooler"],
              },
              display_order: {
                type: "integer",
                description: "Order in which to display this attribute",
                example: 10,
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Attribute definition updated successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    definition: AttributeDefinitionSchema,
                  },
                },
              },
            },
          },
        },
      },
      "400": {
        description: "Validation error",
      },
      "401": {
        description: "Unauthorized",
      },
      "403": {
        description: "Forbidden - admin access required",
      },
      "404": {
        description: "Attribute definition not found",
      },
      "500": {
        description: "Internal server error",
      },
    },
  }

export const attributes_delete_definitions_name_spec: OpenAPIV3_1.OperationObject =
  {
    summary: "Delete attribute definition",
    description: "Delete an attribute definition (admin only)",
    tags: ["Attributes"],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "name",
        in: "path",
        description: "Attribute name",
        required: true,
        schema: { type: "string" },
        example: "size",
      },
      {
        name: "cascade",
        in: "query",
        description:
          "If true, also delete all game_item_attributes with this name",
        required: false,
        schema: { type: "boolean" },
        example: false,
      },
    ],
    responses: {
      "200": {
        description: "Attribute definition deleted successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    cascade: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
      "401": {
        description: "Unauthorized",
      },
      "403": {
        description: "Forbidden - admin access required",
      },
      "404": {
        description: "Attribute definition not found",
      },
      "500": {
        description: "Internal server error",
      },
    },
  }

const GameItemAttributeSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  properties: {
    game_item_id: {
      type: "string",
      format: "uuid",
      description: "ID of the game item",
      example: "123e4567-e89b-12d3-a456-426614174000",
    },
    attribute_name: {
      type: "string",
      description: "Name of the attribute",
      example: "size",
    },
    attribute_value: {
      type: "string",
      description: "Value of the attribute",
      example: "4",
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the attribute was created",
    },
    updated_at: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the attribute was last updated",
    },
  },
  required: [
    "game_item_id",
    "attribute_name",
    "attribute_value",
    "created_at",
    "updated_at",
  ],
}

const GameItemAttributeWithDefinitionSchema: OpenAPIV3_1.SchemaObject = {
  allOf: [
    GameItemAttributeSchema,
    {
      type: "object",
      properties: {
        display_name: {
          type: "string",
          description: "Human-readable name from attribute definition",
          example: "Component Size",
        },
        attribute_type: {
          type: "string",
          enum: ["select", "multiselect", "range", "text"],
          description: "UI control type from attribute definition",
          example: "select",
        },
        allowed_values: {
          type: "array",
          items: { type: "string" },
          description: "Valid values from attribute definition",
          example: ["0", "1", "2", "3", "4"],
        },
      },
    },
  ],
}

export const game_items_get_attributes_spec: OpenAPIV3_1.OperationObject = {
  summary: "Get game item attributes",
  description: "Retrieve all attributes for a game item with their definitions",
  tags: ["Game Items"],
  parameters: [
    {
      name: "id",
      in: "path",
      description: "Game item ID",
      required: true,
      schema: { type: "string", format: "uuid" },
      example: "123e4567-e89b-12d3-a456-426614174000",
    },
  ],
  responses: {
    "200": {
      description: "Game item attributes retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  attributes: {
                    type: "array",
                    items: GameItemAttributeWithDefinitionSchema,
                  },
                },
              },
            },
          },
        },
      },
    },
    "500": {
      description: "Internal server error",
    },
  },
}

export const game_items_put_attributes_spec: OpenAPIV3_1.OperationObject = {
  summary: "Upsert game item attribute",
  description:
    "Create or update an attribute for a game item (admin only). Uses INSERT ... ON CONFLICT DO UPDATE.",
  tags: ["Game Items"],
  security: [{ bearerAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      description: "Game item ID",
      required: true,
      schema: { type: "string", format: "uuid" },
      example: "123e4567-e89b-12d3-a456-426614174000",
    },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            attribute_name: {
              type: "string",
              description:
                "Name of the attribute (must exist in attribute_definitions)",
              example: "size",
            },
            attribute_value: {
              type: "string",
              description:
                "Value of the attribute (must match allowed_values if defined)",
              example: "4",
            },
          },
          required: ["attribute_name", "attribute_value"],
        },
      },
    },
  },
  responses: {
    "200": {
      description: "Game item attribute upserted successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  attribute: GameItemAttributeSchema,
                },
              },
            },
          },
        },
      },
    },
    "400": {
      description: "Validation error",
    },
    "401": {
      description: "Unauthorized",
    },
    "403": {
      description: "Forbidden - admin access required",
    },
    "500": {
      description: "Internal server error",
    },
  },
}

export const game_items_delete_attributes_name_spec: OpenAPIV3_1.OperationObject =
  {
    summary: "Delete game item attribute",
    description: "Delete a specific attribute from a game item (admin only)",
    tags: ["Game Items"],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Game item ID",
        required: true,
        schema: { type: "string", format: "uuid" },
        example: "123e4567-e89b-12d3-a456-426614174000",
      },
      {
        name: "name",
        in: "path",
        description: "Attribute name",
        required: true,
        schema: { type: "string" },
        example: "size",
      },
    ],
    responses: {
      "200": {
        description: "Game item attribute deleted successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      "401": {
        description: "Unauthorized",
      },
      "403": {
        description: "Forbidden - admin access required",
      },
      "404": {
        description: "Attribute not found for this game item",
      },
      "500": {
        description: "Internal server error",
      },
    },
  }

/**
 * POST /api/v1/attributes/import/:gameItemId
 * Trigger attribute import for a specific game item
 */
export const attributes_post_import_game_item_spec = {
  summary: "Import attributes for a game item",
  description:
    "Triggers import of attributes from external data sources (CStone, UEXCorp) for a specific game item. Admin only.",
  tags: ["Attributes"],
  parameters: [
    {
      name: "gameItemId",
      in: "path",
      required: true,
      description: "UUID of the game item to import attributes for",
      schema: {
        type: "string",
        format: "uuid",
      },
      example: "550e8400-e29b-41d4-a716-446655440000",
    },
  ],
  responses: {
    200: {
      description: "Attributes imported successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  gameItemId: {
                    type: "string",
                    format: "uuid",
                    description: "UUID of the game item",
                  },
                  success: {
                    type: "boolean",
                    description: "Whether the import was successful",
                  },
                  attributesImported: {
                    type: "integer",
                    description: "Number of attributes successfully imported",
                  },
                  errors: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Array of error messages if any sources failed",
                  },
                  message: {
                    type: "string",
                    description: "Human-readable result message",
                  },
                },
              },
            },
          },
          example: {
            data: {
              gameItemId: "550e8400-e29b-41d4-a716-446655440000",
              success: true,
              attributesImported: 4,
              errors: [],
              message: "Successfully imported 4 attributes",
            },
          },
        },
      },
    },
    207: {
      description:
        "Partial success - some sources failed but some attributes were imported",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  gameItemId: { type: "string", format: "uuid" },
                  success: { type: "boolean" },
                  attributesImported: { type: "integer" },
                  errors: {
                    type: "array",
                    items: { type: "string" },
                  },
                  message: { type: "string" },
                },
              },
            },
          },
          example: {
            data: {
              gameItemId: "550e8400-e29b-41d4-a716-446655440000",
              success: false,
              attributesImported: 2,
              errors: ["Failed to import from cstone: Network timeout"],
              message: "Import completed with errors. Imported 2 attributes",
            },
          },
        },
      },
    },
    400: {
      description: "Invalid game item ID",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    401: {
      description: "Unauthorized - admin access required",
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                  details: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  },
}
