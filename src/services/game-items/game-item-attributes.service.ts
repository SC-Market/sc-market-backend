/**
 * GameItemAttributesService - Service for managing game item attributes
 *
 * This service handles:
 * - Setting single or multiple attributes for game items
 * - Retrieving attributes for game items
 * - Finding items by attribute values
 * - Deleting attributes
 *
 * Attributes are stored in the game_item_attributes table as key-value pairs,
 * providing flexible storage without requiring schema changes.
 */

import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import type { Knex } from "knex"

export interface GameItemAttributesService {
  setAttribute(
    gameItemId: number,
    key: string,
    value: string,
    trx?: any,
  ): Promise<void>
  setAttributes(
    gameItemId: number,
    attributes: Record<string, string>,
    trx?: any,
  ): Promise<void>
  getAttributes(gameItemId: number, trx?: any): Promise<Record<string, string>>
  getItemsByAttribute(key: string, value: string, trx?: any): Promise<number[]>
  deleteAttribute(gameItemId: number, key: string, trx?: any): Promise<void>
}

class DatabaseGameItemAttributesService implements GameItemAttributesService {
  private db: Knex

  constructor(db?: Knex) {
    this.db = db || getKnex()
  }
  /**
   * Set a single attribute for a game item
   * Uses upsert logic to update existing attributes or insert new ones
   */
  async setAttribute(
    gameItemId: number,
    key: string,
    value: string,
    trx?: any,
  ): Promise<void> {
    try {
      const query = trx
        ? trx("game_item_attributes")
        : this.db("game_item_attributes")

      await query
        .insert({
          game_item_id: gameItemId,
          attribute_key: key,
          attribute_value: value,
          updated_at: new Date(),
        })
        .onConflict(["game_item_id", "attribute_key"])
        .merge(["attribute_value", "updated_at"])

      logger.debug("Game item attribute set", {
        gameItemId,
        key,
        value,
      })
    } catch (error) {
      logger.error("Failed to set game item attribute", {
        error,
        gameItemId,
        key,
        value,
      })
      throw error
    }
  }

  /**
   * Set multiple attributes for a game item
   * Uses upsert logic to update existing attributes or insert new ones
   */
  async setAttributes(
    gameItemId: number,
    attributes: Record<string, string>,
    trx?: any,
  ): Promise<void> {
    try {
      const rows = Object.entries(attributes).map(([key, value]) => ({
        game_item_id: gameItemId,
        attribute_key: key,
        attribute_value: value,
        updated_at: new Date(),
      }))

      if (rows.length === 0) {
        logger.debug("No attributes to set", { gameItemId })
        return
      }

      const query = trx
        ? trx("game_item_attributes")
        : this.db("game_item_attributes")

      await query
        .insert(rows)
        .onConflict(["game_item_id", "attribute_key"])
        .merge(["attribute_value", "updated_at"])

      logger.debug("Game item attributes set", {
        gameItemId,
        attributeCount: rows.length,
      })
    } catch (error) {
      logger.error("Failed to set game item attributes", {
        error,
        gameItemId,
        attributeCount: Object.keys(attributes).length,
      })
      throw error
    }
  }

  /**
   * Get all attributes for a game item
   * Returns a key-value object with all attributes
   */
  async getAttributes(
    gameItemId: number,
    trx?: any,
  ): Promise<Record<string, string>> {
    try {
      const query = trx
        ? trx("game_item_attributes")
        : this.db("game_item_attributes")

      const rows = await query
        .where({ game_item_id: gameItemId })
        .select("attribute_key", "attribute_value")

      const attributes = rows.reduce(
        (acc: Record<string, string>, row: any) => {
          acc[row.attribute_key] = row.attribute_value
          return acc
        },
        {} as Record<string, string>,
      )

      logger.debug("Game item attributes retrieved", {
        gameItemId,
        attributeCount: rows.length,
      })

      return attributes
    } catch (error) {
      logger.error("Failed to get game item attributes", {
        error,
        gameItemId,
      })
      throw error
    }
  }

  /**
   * Get items by attribute
   * Returns an array of game item IDs that have the specified attribute key-value pair
   */
  async getItemsByAttribute(
    key: string,
    value: string,
    trx?: any,
  ): Promise<number[]> {
    try {
      const query = trx
        ? trx("game_item_attributes")
        : this.db("game_item_attributes")

      const rows = await query
        .where({ attribute_key: key, attribute_value: value })
        .select("game_item_id")

      const itemIds = rows.map((r: any) => r.game_item_id)

      logger.debug("Items retrieved by attribute", {
        key,
        value,
        itemCount: itemIds.length,
      })

      return itemIds
    } catch (error) {
      logger.error("Failed to get items by attribute", {
        error,
        key,
        value,
      })
      throw error
    }
  }

  /**
   * Delete an attribute
   * Removes a specific attribute key from a game item
   */
  async deleteAttribute(
    gameItemId: number,
    key: string,
    trx?: any,
  ): Promise<void> {
    try {
      const query = trx
        ? trx("game_item_attributes")
        : this.db("game_item_attributes")

      await query.where({ game_item_id: gameItemId, attribute_key: key }).delete()

      logger.debug("Game item attribute deleted", {
        gameItemId,
        key,
      })
    } catch (error) {
      logger.error("Failed to delete game item attribute", {
        error,
        gameItemId,
        key,
      })
      throw error
    }
  }
}

// Export singleton instance
export const gameItemAttributesService: GameItemAttributesService =
  new DatabaseGameItemAttributesService()

// Export class for testing
export { DatabaseGameItemAttributesService }
