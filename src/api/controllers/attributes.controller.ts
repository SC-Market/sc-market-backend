/**
 * Attributes Controller
 *
 * TSOA controller for attribute-related endpoints.
 * This controller handles attribute definitions and game item attributes.
 *
 * Migration Status: Phase 2 - Write endpoints added
 * - GET /api/v1/attributes/definitions
 * - GET /api/v1/attributes/values/search
 * - POST /api/v1/attributes/definitions (admin only)
 * - PUT /api/v1/attributes/definitions/:attribute_name (admin only)
 * - DELETE /api/v1/attributes/definitions/:attribute_name (admin only)
 * - PUT /api/v1/game-items/:game_item_id/attributes/:attribute_name (admin only)
 * - DELETE /api/v1/game-items/:game_item_id/attributes/:attribute_name (admin only)
 *
 * @tags Attributes
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Path,
  Body,
  Route,
  Response,
  Tags,
  Request,
  Middlewares,
  Security,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController, NotFoundError, ValidationErrorClass, ConflictError } from "./base.controller.js"
import {
  AttributeDefinitionsResponse,
  AttributeValueSearchResponse,
  AttributeDefinitionResponse,
  CreateAttributeDefinitionPayload,
  UpdateAttributeDefinitionPayload,
  DeleteAttributeDefinitionResponse,
  GameItemAttributeResponse,
  DeleteGameItemAttributeResponse,
  UpsertGameItemAttributePayload,
} from "../models/attributes.models.js"
import { ErrorResponse, Unauthorized, Forbidden, NotFound, Conflict } from "../models/common.models.js"
import { cachedDb } from "../routes/v1/attributes/cache.js"
import * as attributeDb from "../routes/v1/attributes/database.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"

/**
 * Controller for managing attribute definitions and game item attributes
 */
@Route("api/v1/attributes")
@Tags("Attributes")
export class AttributesController extends BaseController {
  /**
   * Get all attribute definitions
   *
   * Retrieves all attribute definitions, optionally filtered by applicable item types.
   * Attribute definitions define the schema for attributes that can be applied to game items.
   *
   * @summary Get attribute definitions
   * @param applicable_item_types Filter by applicable item types (e.g., "ship", "vehicle")
   * @param include_hidden Include hidden attribute definitions (defaults to false)
   * @returns List of attribute definitions
   *
   * @example applicable_item_types "ship"
   * @example include_hidden "true"
   */
  @Get("definitions")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getDefinitions(
    @Request() request: ExpressRequest,
    @Query() applicable_item_types?: string,
    @Query() include_hidden?: string,
  ): Promise<AttributeDefinitionsResponse> {
    try {
      // Parse applicable_item_types into array
      const itemTypesArray = this.parseArrayParam(applicable_item_types)

      // Parse include_hidden boolean
      const includeHidden = this.parseBooleanParam(include_hidden)

      this.logInfo(
        "getDefinitions",
        "Fetching attribute definitions",
        {
          itemTypes: itemTypesArray,
          includeHidden,
        },
      )

      // Fetch definitions from cached database
      const definitions = await cachedDb.getAttributeDefinitions(
        itemTypesArray,
        includeHidden,
      )

      // Transform Date objects to ISO strings for API response
      const transformedDefinitions = definitions.map(def => ({
        ...def,
        created_at: def.created_at.toISOString(),
        updated_at: def.updated_at.toISOString(),
      }))

      return this.success({ definitions: transformedDefinitions })
    } catch (error) {
      this.logError("getDefinitions", error, {
        applicable_item_types,
        include_hidden,
      })
      this.handleError(error, "getDefinitions")
    }
  }

  /**
   * Search for distinct attribute values
   *
   * Searches for distinct values of a specific attribute across all game items.
   * Useful for autocomplete and filter UI components.
   *
   * @summary Search attribute values
   * @param attribute_name Name of the attribute to search values for (required)
   * @param q Search query to filter values (optional)
   * @param item_type Filter by item type (optional)
   * @param limit Maximum number of results to return (default: 20, max: 50)
   * @returns List of distinct attribute values with counts
   *
   * @example attribute_name "manufacturer"
   * @example q "Aeg"
   * @example item_type "ship"
   * @example limit "10"
   */
  @Get("values/search")
  @Middlewares(tsoaReadRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async searchAttributeValues(
    @Request() request: ExpressRequest,
    @Query() attribute_name: string,
    @Query() q?: string,
    @Query() item_type?: string,
    @Query() limit?: string,
  ): Promise<AttributeValueSearchResponse> {
    try {
      // Validate required parameter
      if (!attribute_name) {
        throw new ValidationErrorClass(
          "attribute_name query parameter is required",
        )
      }

      // Parse and validate limit
      const searchQuery = q || ""
      const itemType = item_type
      const maxLimit = limit
        ? Math.min(parseInt(limit, 10), 50)
        : 20

      this.logInfo(
        "searchAttributeValues",
        "Searching attribute values",
        {
          attribute_name,
          searchQuery,
          itemType,
          maxLimit,
        },
      )

      // Search for attribute values
      const values = await attributeDb.searchAttributeValues(
        attribute_name,
        searchQuery,
        itemType,
        maxLimit,
      )

      // Transform string[] to AttributeValueSearchResult[]
      // Note: The database function returns simple strings without counts
      // For now, we'll set count to 0 as a placeholder
      // TODO: Update database function to return counts
      const results = values.map(value => ({
        value,
        count: 0
      }))

      return this.success({ values: results })
    } catch (error) {
      this.logError("searchAttributeValues", error, {
        attribute_name,
        q,
        item_type,
        limit,
      })
      this.handleError(error, "searchAttributeValues")
    }
  }

  /**
   * Create a new attribute definition
   *
   * Creates a new attribute definition that can be applied to game items.
   * Only administrators can create attribute definitions.
   *
   * @summary Create attribute definition (admin only)
   * @param payload Attribute definition data
   * @returns Created attribute definition
   *
   * @example payload {
   *   "attribute_name": "manufacturer",
   *   "display_name": "Manufacturer",
   *   "attribute_type": "select",
   *   "allowed_values": ["Anvil", "Crusader", "Drake"],
   *   "applicable_item_types": ["ship", "vehicle"],
   *   "display_order": 1
   * }
   */
  @Post("definitions")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(201, "Created")
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<Conflict>(409, "Conflict")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createDefinition(
    @Request() request: ExpressRequest,
    @Body() payload: CreateAttributeDefinitionPayload,
  ): Promise<AttributeDefinitionResponse> {
    try {
      // Validate required fields
      if (
        !payload.attribute_name ||
        !payload.display_name ||
        !payload.attribute_type
      ) {
        throw new ValidationErrorClass(
          "Missing required fields: attribute_name, display_name, attribute_type",
        )
      }

      // Validate attribute_type
      const validTypes = ["select", "multiselect", "range", "text"]
      if (!validTypes.includes(payload.attribute_type)) {
        throw new ValidationErrorClass(
          `Invalid attribute_type. Must be one of: ${validTypes.join(", ")}`,
        )
      }

      this.logInfo(
        "createDefinition",
        "Creating attribute definition",
        {
          attribute_name: payload.attribute_name,
          user: this.getUserId(request),
        },
      )

      // Check if attribute_name already exists
      const existing = await cachedDb.getAttributeDefinition(
        payload.attribute_name,
      )
      if (existing) {
        throw new ConflictError(
          `Attribute definition with name '${payload.attribute_name}' already exists`,
        )
      }

      const definition = await cachedDb.createAttributeDefinition(payload)

      // Transform Date objects to ISO strings for API response
      const transformedDefinition = {
        ...definition,
        created_at: definition.created_at.toISOString(),
        updated_at: definition.updated_at.toISOString(),
      }

      return this.success({ definition: transformedDefinition })
    } catch (error) {
      this.logError("createDefinition", error, { payload })
      this.handleError(error, "createDefinition")
    }
  }

  /**
   * Update an existing attribute definition
   *
   * Updates an existing attribute definition. All fields are optional.
   * Only administrators can update attribute definitions.
   *
   * @summary Update attribute definition (admin only)
   * @param attribute_name Name of the attribute to update
   * @param payload Updated attribute definition data
   * @returns Updated attribute definition
   *
   * @example payload {
   *   "display_name": "Ship Manufacturer",
   *   "allowed_values": ["Anvil", "Crusader", "Drake", "Origin"]
   * }
   */
  @Put("definitions/{attribute_name}")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateDefinition(
    @Request() request: ExpressRequest,
    @Path() attribute_name: string,
    @Body() payload: UpdateAttributeDefinitionPayload,
  ): Promise<AttributeDefinitionResponse> {
    try {
      this.logInfo(
        "updateDefinition",
        "Updating attribute definition",
        {
          attribute_name,
          user: this.getUserId(request),
        },
      )

      // Check if attribute definition exists
      const existing = await cachedDb.getAttributeDefinition(attribute_name)
      if (!existing) {
        throw new NotFoundError(
          `Attribute definition '${attribute_name}' not found`,
        )
      }

      // Validate attribute_type if provided
      if (payload.attribute_type) {
        const validTypes = ["select", "multiselect", "range", "text"]
        if (!validTypes.includes(payload.attribute_type)) {
          throw new ValidationErrorClass(
            `Invalid attribute_type. Must be one of: ${validTypes.join(", ")}`,
          )
        }
      }

      // Validate allowed_values format if provided
      if (
        payload.allowed_values !== undefined &&
        payload.allowed_values !== null
      ) {
        if (!Array.isArray(payload.allowed_values)) {
          throw new ValidationErrorClass(
            "allowed_values must be an array or null",
          )
        }
      }

      const definition = await cachedDb.updateAttributeDefinition(
        attribute_name,
        payload,
      )

      if (!definition) {
        throw new NotFoundError("Attribute definition not found")
      }

      // Transform Date objects to ISO strings for API response
      const transformedDefinition = {
        ...definition,
        created_at: definition.created_at.toISOString(),
        updated_at: definition.updated_at.toISOString(),
      }

      return this.success({ definition: transformedDefinition })
    } catch (error) {
      this.logError("updateDefinition", error, {
        attribute_name,
        payload,
      })
      this.handleError(error, "updateDefinition")
    }
  }

  /**
   * Delete an attribute definition
   *
   * Deletes an attribute definition. Optionally cascade delete all game item attributes.
   * Only administrators can delete attribute definitions.
   *
   * @summary Delete attribute definition (admin only)
   * @param attribute_name Name of the attribute to delete
   * @param cascade Whether to cascade delete all game item attributes (default: false)
   * @returns Deletion confirmation message
   *
   * @example cascade "true"
   */
  @Delete("definitions/{attribute_name}")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async deleteDefinition(
    @Request() request: ExpressRequest,
    @Path() attribute_name: string,
    @Query() cascade?: string,
  ): Promise<DeleteAttributeDefinitionResponse> {
    try {
      const cascadeDelete = this.parseBooleanParam(cascade)

      this.logInfo(
        "deleteDefinition",
        "Deleting attribute definition",
        {
          attribute_name,
          cascade: cascadeDelete,
          user: this.getUserId(request),
        },
      )

      // Check if attribute definition exists
      const existing = await cachedDb.getAttributeDefinition(attribute_name)
      if (!existing) {
        throw new NotFoundError(
          `Attribute definition '${attribute_name}' not found`,
        )
      }

      const deleted = await cachedDb.deleteAttributeDefinition(
        attribute_name,
        cascadeDelete,
      )

      if (!deleted) {
        throw new Error("Failed to delete attribute definition")
      }

      return this.success({
        message: `Attribute definition '${attribute_name}' deleted successfully`,
        cascade: cascadeDelete,
      })
    } catch (error) {
      this.logError("deleteDefinition", error, {
        attribute_name,
        cascade,
      })
      this.handleError(error, "deleteDefinition")
    }
  }

  /**
   * Upsert a game item attribute
   *
   * Creates or updates an attribute value for a specific game item.
   * Only administrators can modify game item attributes.
   *
   * @summary Upsert game item attribute (admin only)
   * @param game_item_id ID of the game item
   * @param attribute_name Name of the attribute
   * @param payload Attribute value data
   * @returns Created or updated game item attribute
   *
   * @example payload {
   *   "attribute_name": "manufacturer",
   *   "attribute_value": "Aegis"
   * }
   */
  @Put("game-items/{game_item_id}/attributes/{attribute_name}")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async upsertGameItemAttribute(
    @Request() request: ExpressRequest,
    @Path() game_item_id: string,
    @Path() attribute_name: string,
    @Body() payload: UpsertGameItemAttributePayload,
  ): Promise<GameItemAttributeResponse> {
    try {
      // Validate required fields
      if (!payload.attribute_name || !payload.attribute_value) {
        throw new ValidationErrorClass(
          "Missing required fields: attribute_name, attribute_value",
        )
      }

      // Ensure path parameter matches body parameter
      if (payload.attribute_name !== attribute_name) {
        throw new ValidationErrorClass(
          "attribute_name in path must match attribute_name in body",
        )
      }

      this.logInfo(
        "upsertGameItemAttribute",
        "Upserting game item attribute",
        {
          game_item_id,
          attribute_name,
          user: this.getUserId(request),
        },
      )

      // Validate that attribute_name exists in attribute_definitions
      const definition = await cachedDb.getAttributeDefinition(
        payload.attribute_name,
      )
      if (!definition) {
        throw new ValidationErrorClass(
          `Attribute '${payload.attribute_name}' is not defined in attribute_definitions`,
        )
      }

      // Validate attribute_value against allowed_values if defined
      if (definition.allowed_values && definition.allowed_values.length > 0) {
        if (!definition.allowed_values.includes(payload.attribute_value)) {
          throw new ValidationErrorClass(
            `Invalid attribute_value '${payload.attribute_value}'. Must be one of: ${definition.allowed_values.join(", ")}`,
          )
        }
      }

      const attribute = await attributeDb.upsertGameItemAttribute(
        game_item_id,
        payload,
      )

      // Transform Date objects to ISO strings for API response
      const transformedAttribute = {
        ...attribute,
        created_at: attribute.created_at.toISOString(),
        updated_at: attribute.updated_at.toISOString(),
      }

      return this.success({ attribute: transformedAttribute })
    } catch (error) {
      this.logError("upsertGameItemAttribute", error, {
        game_item_id,
        attribute_name,
        payload,
      })
      this.handleError(error, "upsertGameItemAttribute")
    }
  }

  /**
   * Delete a game item attribute
   *
   * Removes a specific attribute from a game item.
   * Only administrators can delete game item attributes.
   *
   * @summary Delete game item attribute (admin only)
   * @param game_item_id ID of the game item
   * @param attribute_name Name of the attribute to delete
   * @returns Deletion confirmation message
   */
  @Delete("game-items/{game_item_id}/attributes/{attribute_name}")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async deleteGameItemAttribute(
    @Request() request: ExpressRequest,
    @Path() game_item_id: string,
    @Path() attribute_name: string,
  ): Promise<DeleteGameItemAttributeResponse> {
    try {
      this.logInfo(
        "deleteGameItemAttribute",
        "Deleting game item attribute",
        {
          game_item_id,
          attribute_name,
          user: this.getUserId(request),
        },
      )

      const deleted = await attributeDb.deleteGameItemAttribute(
        game_item_id,
        attribute_name,
      )

      if (!deleted) {
        throw new NotFoundError(
          `Attribute '${attribute_name}' not found for game item '${game_item_id}'`,
        )
      }

      return this.success({
        message: `Attribute '${attribute_name}' deleted from game item '${game_item_id}'`,
      })
    } catch (error) {
      this.logError("deleteGameItemAttribute", error, {
        game_item_id,
        attribute_name,
      })
      this.handleError(error, "deleteGameItemAttribute")
    }
  }
}
