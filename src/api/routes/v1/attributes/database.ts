import { database } from "../../../../clients/database/knex-db.js"
import {
  AttributeDefinition,
  CreateAttributeDefinitionPayload,
  UpdateAttributeDefinitionPayload,
  GameItemAttribute,
  GameItemAttributeWithDefinition,
  UpsertGameItemAttributePayload,
} from "./types.js"

/**
 * Get all attribute definitions, optionally filtered by applicable item types
 * Only returns attributes with show_in_filters=true unless includeHidden is true
 */
export async function getAttributeDefinitions(
  applicableItemTypes?: string[],
  includeHidden?: boolean,
): Promise<AttributeDefinition[]> {
  let query = database.knex("attribute_definitions").select("*")

  // Only filter by show_in_filters if not including hidden
  if (!includeHidden) {
    query = query.where("show_in_filters", true)
  }

  if (applicableItemTypes && applicableItemTypes.length > 0) {
    // Filter by applicable_item_types using array overlap operator
    query = query.whereRaw("applicable_item_types && ?::varchar[]", [
      applicableItemTypes,
    ])
  }

  const results = await query.orderBy("display_order", "asc")
  return results
}

/**
 * Get a single attribute definition by name
 */
export async function getAttributeDefinition(
  attributeName: string,
): Promise<AttributeDefinition | null> {
  const result = await database
    .knex("attribute_definitions")
    .where({ attribute_name: attributeName })
    .first()

  return result || null
}

/**
 * Create a new attribute definition
 */
export async function createAttributeDefinition(
  payload: CreateAttributeDefinitionPayload,
): Promise<AttributeDefinition> {
  const [result] = await database
    .knex("attribute_definitions")
    .insert({
      attribute_name: payload.attribute_name,
      display_name: payload.display_name,
      attribute_type: payload.attribute_type,
      allowed_values: payload.allowed_values || null,
      applicable_item_types: payload.applicable_item_types || null,
      display_order: payload.display_order ?? 0,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*")

  return result
}

/**
 * Update an existing attribute definition
 */
export async function updateAttributeDefinition(
  attributeName: string,
  payload: UpdateAttributeDefinitionPayload,
): Promise<AttributeDefinition | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date(),
  }

  if (payload.display_name !== undefined) {
    updateData.display_name = payload.display_name
  }
  if (payload.attribute_type !== undefined) {
    updateData.attribute_type = payload.attribute_type
  }
  if (payload.allowed_values !== undefined) {
    updateData.allowed_values = payload.allowed_values
  }
  if (payload.applicable_item_types !== undefined) {
    updateData.applicable_item_types = payload.applicable_item_types
  }
  if (payload.display_order !== undefined) {
    updateData.display_order = payload.display_order
  }

  const [result] = await database
    .knex("attribute_definitions")
    .where({ attribute_name: attributeName })
    .update(updateData)
    .returning("*")

  return result || null
}

/**
 * Delete an attribute definition
 */
export async function deleteAttributeDefinition(
  attributeName: string,
  cascadeDelete: boolean = false,
): Promise<boolean> {
  // If cascade delete is requested, delete all game_item_attributes with this name first
  if (cascadeDelete) {
    await database
      .knex("game_item_attributes")
      .where({ attribute_name: attributeName })
      .delete()
  }

  const deletedCount = await database
    .knex("attribute_definitions")
    .where({ attribute_name: attributeName })
    .delete()

  return deletedCount > 0
}

/**
 * Get all attributes for a game item with their definitions
 */
export async function getGameItemAttributes(
  gameItemId: string,
): Promise<GameItemAttributeWithDefinition[]> {
  const results = await database
    .knex("game_item_attributes")
    .select(
      "game_item_attributes.*",
      "attribute_definitions.display_name",
      "attribute_definitions.attribute_type",
      "attribute_definitions.allowed_values",
    )
    .leftJoin(
      "attribute_definitions",
      "game_item_attributes.attribute_name",
      "attribute_definitions.attribute_name",
    )
    .where({ game_item_id: gameItemId })
    .orderBy("attribute_definitions.display_order", "asc")

  return results
}

/**
 * Upsert (insert or update) an attribute for a game item
 */
export async function upsertGameItemAttribute(
  gameItemId: string,
  payload: UpsertGameItemAttributePayload,
): Promise<GameItemAttribute> {
  const now = new Date()

  const [result] = await database
    .knex("game_item_attributes")
    .insert({
      game_item_id: gameItemId,
      attribute_name: payload.attribute_name,
      attribute_value: payload.attribute_value,
      created_at: now,
      updated_at: now,
    })
    .onConflict(["game_item_id", "attribute_name"])
    .merge({
      attribute_value: payload.attribute_value,
      updated_at: now,
    })
    .returning("*")

  return result
}

/**
 * Delete a specific attribute from a game item
 */
export async function deleteGameItemAttribute(
  gameItemId: string,
  attributeName: string,
): Promise<boolean> {
  const deletedCount = await database
    .knex("game_item_attributes")
    .where({
      game_item_id: gameItemId,
      attribute_name: attributeName,
    })
    .delete()

  return deletedCount > 0
}

/**
 * Search for distinct attribute values matching a query
 */
export async function searchAttributeValues(
  attributeName: string,
  searchQuery: string,
  itemType?: string,
  limit: number = 20,
): Promise<string[]> {
  let query = database
    .knex("game_item_attributes")
    .distinct("attribute_value")
    .where("attribute_name", attributeName)
    .whereRaw("LOWER(attribute_value) LIKE LOWER(?)", [`%${searchQuery}%`])

  // Filter by item type if provided
  if (itemType) {
    query = query
      .join("game_items", "game_item_attributes.game_item_id", "game_items.id")
      .where("game_items.type", itemType)
  }

  const results = await query.orderBy("attribute_value", "asc").limit(limit)

  return results.map((r) => r.attribute_value)
}
