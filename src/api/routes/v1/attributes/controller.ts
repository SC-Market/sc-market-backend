import { RequestHandler } from "express"
import logger from "../../../../logger/logger.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import * as attributeDb from "./database.js"
import { cachedDb } from "./cache.js"
import {
  CreateAttributeDefinitionPayload,
  UpdateAttributeDefinitionPayload,
} from "./types.js"

/**
 * GET /api/v1/attributes/definitions
 * Get all attribute definitions, optionally filtered by applicable_item_types
 */
export const attributes_get_definitions: RequestHandler = async function (
  req,
  res,
) {
  try {
    const applicableItemTypes = req.query.applicable_item_types as
      | string
      | string[]
      | undefined
    const includeHidden = req.query.include_hidden === "true"

    let itemTypesArray: string[] | undefined
    if (applicableItemTypes) {
      itemTypesArray = Array.isArray(applicableItemTypes)
        ? applicableItemTypes
        : [applicableItemTypes]
    }

    const definitions = await cachedDb.getAttributeDefinitions(
      itemTypesArray,
      includeHidden,
    )

    res.json(createResponse({ definitions }))
  } catch (error) {
    logger.error("Error in attributes_get_definitions", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to fetch attribute definitions",
        {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      ),
    )
  }
}

/**
 * POST /api/v1/attributes/definitions
 * Create a new attribute definition (admin only)
 */
export const attributes_post_definitions: RequestHandler = async function (
  req,
  res,
) {
  try {
    const payload = req.body as CreateAttributeDefinitionPayload

    // Validate required fields
    if (
      !payload.attribute_name ||
      !payload.display_name ||
      !payload.attribute_type
    ) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Missing required fields: attribute_name, display_name, attribute_type",
          ),
        )
    }

    // Validate attribute_type
    const validTypes = ["select", "multiselect", "range", "text"]
    if (!validTypes.includes(payload.attribute_type)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            `Invalid attribute_type. Must be one of: ${validTypes.join(", ")}`,
          ),
        )
    }

    // Check if attribute_name already exists
    const existing = await cachedDb.getAttributeDefinition(
      payload.attribute_name,
    )
    if (existing) {
      return res
        .status(409)
        .json(
          createErrorResponse(
            ErrorCode.CONFLICT,
            `Attribute definition with name '${payload.attribute_name}' already exists`,
          ),
        )
    }

    const definition = await cachedDb.createAttributeDefinition(payload)

    res.status(201).json(createResponse({ definition }))
  } catch (error) {
    logger.error("Error in attributes_post_definitions", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to create attribute definition",
        {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      ),
    )
  }
}

/**
 * PUT /api/v1/attributes/definitions/:name
 * Update an existing attribute definition (admin only)
 */
export const attributes_put_definitions_name: RequestHandler = async function (
  req,
  res,
) {
  try {
    const attributeName = req.params.name
    const payload = req.body as UpdateAttributeDefinitionPayload

    // Check if attribute definition exists
    const existing = await cachedDb.getAttributeDefinition(attributeName)
    if (!existing) {
      return res
        .status(404)
        .json(
          createErrorResponse(
            ErrorCode.NOT_FOUND,
            `Attribute definition '${attributeName}' not found`,
          ),
        )
    }

    // Validate attribute_type if provided
    if (payload.attribute_type) {
      const validTypes = ["select", "multiselect", "range", "text"]
      if (!validTypes.includes(payload.attribute_type)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              `Invalid attribute_type. Must be one of: ${validTypes.join(", ")}`,
            ),
          )
      }
    }

    // Validate allowed_values format if provided
    if (
      payload.allowed_values !== undefined &&
      payload.allowed_values !== null
    ) {
      if (!Array.isArray(payload.allowed_values)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "allowed_values must be an array or null",
            ),
          )
      }
    }

    const definition = await cachedDb.updateAttributeDefinition(
      attributeName,
      payload,
    )

    res.json(createResponse({ definition }))
  } catch (error) {
    logger.error("Error in attributes_put_definitions_name", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to update attribute definition",
        {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      ),
    )
  }
}

/**
 * DELETE /api/v1/attributes/definitions/:name
 * Delete an attribute definition (admin only)
 */
export const attributes_delete_definitions_name: RequestHandler =
  async function (req, res) {
    try {
      const attributeName = req.params.name
      const cascadeDelete = req.query.cascade === "true"

      // Check if attribute definition exists
      const existing = await cachedDb.getAttributeDefinition(attributeName)
      if (!existing) {
        return res
          .status(404)
          .json(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Attribute definition '${attributeName}' not found`,
            ),
          )
      }

      const deleted = await cachedDb.deleteAttributeDefinition(
        attributeName,
        cascadeDelete,
      )

      if (deleted) {
        res.json(
          createResponse({
            message: `Attribute definition '${attributeName}' deleted successfully`,
            cascade: cascadeDelete,
          }),
        )
      } else {
        res
          .status(500)
          .json(
            createErrorResponse(
              ErrorCode.INTERNAL_SERVER_ERROR,
              "Failed to delete attribute definition",
            ),
          )
      }
    } catch (error) {
      logger.error("Error in attributes_delete_definitions_name", { error })
      res.status(500).json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to delete attribute definition",
          {
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          },
        ),
      )
    }
  }

/**
 * GET /api/v1/game-items/:id/attributes
 * Get all attributes for a game item
 */
export const game_items_get_attributes: RequestHandler = async function (
  req,
  res,
) {
  try {
    const gameItemId = req.params.id

    const attributes = await attributeDb.getGameItemAttributes(gameItemId)

    res.json(createResponse({ attributes }))
  } catch (error) {
    logger.error("Error in game_items_get_attributes", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to fetch game item attributes",
        {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      ),
    )
  }
}

/**
 * PUT /api/v1/game-items/:id/attributes
 * Upsert an attribute for a game item (admin only)
 */
export const game_items_put_attributes: RequestHandler = async function (
  req,
  res,
) {
  try {
    const gameItemId = req.params.id
    const payload = req.body as {
      attribute_name: string
      attribute_value: string
    }

    // Validate required fields
    if (!payload.attribute_name || !payload.attribute_value) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Missing required fields: attribute_name, attribute_value",
          ),
        )
    }

    // Validate that attribute_name exists in attribute_definitions
    const definition = await cachedDb.getAttributeDefinition(
      payload.attribute_name,
    )
    if (!definition) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            `Attribute '${payload.attribute_name}' is not defined in attribute_definitions`,
          ),
        )
    }

    // Validate attribute_value against allowed_values if defined
    if (definition.allowed_values && definition.allowed_values.length > 0) {
      if (!definition.allowed_values.includes(payload.attribute_value)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              `Invalid attribute_value '${payload.attribute_value}'. Must be one of: ${definition.allowed_values.join(", ")}`,
            ),
          )
      }
    }

    const attribute = await attributeDb.upsertGameItemAttribute(
      gameItemId,
      payload,
    )

    res.json(createResponse({ attribute }))
  } catch (error) {
    logger.error("Error in game_items_put_attributes", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to upsert game item attribute",
        {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      ),
    )
  }
}

/**
 * DELETE /api/v1/game-items/:id/attributes/:name
 * Delete a specific attribute from a game item (admin only)
 */
export const game_items_delete_attributes_name: RequestHandler =
  async function (req, res) {
    try {
      const gameItemId = req.params.id
      const attributeName = req.params.name

      const deleted = await attributeDb.deleteGameItemAttribute(
        gameItemId,
        attributeName,
      )

      if (deleted) {
        res.json(
          createResponse({
            message: `Attribute '${attributeName}' deleted from game item '${gameItemId}'`,
          }),
        )
      } else {
        res
          .status(404)
          .json(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Attribute '${attributeName}' not found for game item '${gameItemId}'`,
            ),
          )
      }
    } catch (error) {
      logger.error("Error in game_items_delete_attributes_name", { error })
      res.status(500).json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to delete game item attribute",
          {
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          },
        ),
      )
    }
  }

/**
 * POST /api/v1/attributes/import/:gameItemId
 * Trigger attribute import for a specific game item (admin only)
 */
export const attributes_post_import_game_item: RequestHandler = async function (
  req,
  res,
) {
  try {
    const gameItemId = req.params.gameItemId

    if (!gameItemId) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Game item ID is required",
          ),
        )
    }

    // Import the service dynamically to avoid circular dependencies
    const { AttributeImportService } =
      await import("../../../../services/attribute-import/attribute-import.service.js")

    const importService = new AttributeImportService()

    logger.info("Starting attribute import via API", {
      gameItemId,
      requestedBy: req.user?.username,
    })

    // Execute the import
    const result = await importService.importAttributesForItem(gameItemId)

    // Refresh materialized view if import was successful
    if (result.success && result.attributesImported > 0) {
      try {
        await importService.refreshMaterializedView()
      } catch (refreshError) {
        logger.error("Failed to refresh materialized view after import", {
          gameItemId,
          error:
            refreshError instanceof Error
              ? refreshError.message
              : "Unknown error",
        })
        // Don't fail the request if refresh fails
      }
    }

    const statusCode = result.success ? 200 : 207 // 207 Multi-Status for partial success

    res.status(statusCode).json(
      createResponse({
        gameItemId: result.gameItemId,
        success: result.success,
        attributesImported: result.attributesImported,
        errors: result.errors,
        message: result.success
          ? `Successfully imported ${result.attributesImported} attributes`
          : `Import completed with errors. Imported ${result.attributesImported} attributes`,
      }),
    )
  } catch (error) {
    logger.error("Error in attributes_post_import_game_item", {
      error,
      gameItemId: req.params.gameItemId,
    })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to import attributes",
        {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      ),
    )
  }
}

/**
 * GET /api/v1/attributes/values/search
 * Search for distinct attribute values
 */
export const attributes_get_values_search: RequestHandler = async function (
  req,
  res,
) {
  try {
    const { attribute_name, q, item_type, limit } = req.query

    if (!attribute_name || typeof attribute_name !== "string") {
      return res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "attribute_name query parameter is required",
          ),
        )
    }

    const searchQuery = typeof q === "string" ? q : ""
    const itemType = typeof item_type === "string" ? item_type : undefined
    const maxLimit = limit ? Math.min(parseInt(limit as string, 10), 50) : 20

    const values = await attributeDb.searchAttributeValues(
      attribute_name,
      searchQuery,
      itemType,
      maxLimit,
    )

    res.json(createResponse({ values }))
  } catch (error) {
    logger.error("Error in attributes_get_values_search", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to search attribute values",
        ),
      )
  }
}
