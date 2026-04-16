/**
 * Market V2 Repository
 *
 * Provides database access methods for V2 market tables.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { DBVariantType, DBItemVariant, VariantAttributes } from "./types.js"

export class MarketV2Repository {
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
  }

  /**
   * Get all variant types
   */
  async getAllVariantTypes(): Promise<DBVariantType[]> {
    const types = await this.knex<DBVariantType>("variant_types")
      .select("*")
      .orderBy("display_order", "asc")

    return types
  }

  /**
   * Get a variant type by name
   */
  async getVariantTypeByName(name: string): Promise<DBVariantType | null> {
    const type = await this.knex<DBVariantType>("variant_types")
      .where({ name })
      .first()

    return type || null
  }

  /**
   * Find an existing variant by game_item_id and attributes_hash
   */
  async findVariantByHash(
    gameItemId: string,
    attributesHash: string,
  ): Promise<DBItemVariant | null> {
    // Use raw query to compute hash the same way as the database
    const result = await this.knex.raw<{ rows: DBItemVariant[] }>(
      `
      SELECT *
      FROM item_variants
      WHERE game_item_id = ?::uuid
        AND encode(digest(?::text, 'sha256'), 'hex') = attributes_hash
      LIMIT 1
      `,
      [gameItemId, JSON.stringify(attributesHash)],
    )

    return result.rows[0] || null
  }

  /**
   * Create a new variant
   */
  async createVariant(
    gameItemId: string,
    attributes: VariantAttributes,
    displayName: string,
    shortName: string,
  ): Promise<DBItemVariant> {
    const [variant] = await this.knex<DBItemVariant>("item_variants")
      .insert({
        game_item_id: this.knex.raw("?::uuid", [gameItemId]),
        attributes: this.knex.raw("?::jsonb", [JSON.stringify(attributes)]),
        display_name: displayName,
        short_name: shortName,
      })
      .returning("*")

    return variant
  }

  /**
   * Get a variant by ID
   */
  async getVariantById(variantId: string): Promise<DBItemVariant | null> {
    const variant = await this.knex<DBItemVariant>("item_variants")
      .where({ variant_id: variantId })
      .first()

    return variant || null
  }

  /**
   * Get all variants for a game item
   */
  async getVariantsByGameItem(gameItemId: string): Promise<DBItemVariant[]> {
    const variants = await this.knex<DBItemVariant>("item_variants")
      .where({ game_item_id: gameItemId })
      .orderBy("created_at", "asc")

    return variants
  }
}
