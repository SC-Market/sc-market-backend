/**
 * Variant Type Service
 *
 * Service for managing variant types and their validation rules.
 * Provides methods to retrieve variant type definitions used for variant attribute validation.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { MarketV2Repository } from "./repository.js"
import { VariantType } from "../../api/routes/v2/types/market-v2-types.js"
import { NotFoundError } from "../../api/routes/v1/util/errors.js"
import logger from "../../logger/logger.js"

export class VariantTypeService {
  private repository: MarketV2Repository
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
    this.repository = new MarketV2Repository(this.knex)
  }
  /**
   * Get all variant types ordered by display_order
   *
   * Returns all available variant types with their validation rules.
   * Used by frontend to display available attributes and by backend for validation.
   *
   * Requirements: 16.1, 16.2, 16.3
   *
   * @returns Array of variant types ordered by display_order
   */
  async getAllVariantTypes(): Promise<VariantType[]> {
    logger.info("Fetching all variant types")

    try {
      const result = await this.repository.getAllVariantTypes()

      logger.info("Fetched variant types", { count: result.length })

      // Convert DBVariantType to VariantType (handle null -> undefined)
      return result.map((vt) => ({
        variant_type_id: vt.variant_type_id,
        name: vt.name,
        display_name: vt.display_name,
        description: vt.description ?? undefined,
        affects_pricing: vt.affects_pricing,
        searchable: vt.searchable,
        filterable: vt.filterable,
        value_type: vt.value_type,
        min_value: vt.min_value ?? undefined,
        max_value: vt.max_value ?? undefined,
        allowed_values: vt.allowed_values ?? undefined,
        display_order: vt.display_order,
        icon: vt.icon ?? undefined,
        created_at: vt.created_at,
      }))
    } catch (error) {
      logger.error("Failed to fetch variant types", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Get a single variant type by ID
   *
   * Returns detailed information about a specific variant type including
   * all validation rules and display configuration.
   *
   * Requirements: 16.1
   *
   * @param variantTypeId The variant type ID to retrieve
   * @returns Variant type details
   * @throws NotFoundError if variant type doesn't exist
   */
  async getVariantTypeById(variantTypeId: string): Promise<VariantType> {
    logger.info("Fetching variant type by ID", { variantTypeId })

    try {
      const result = await this.knex("variant_types")
        .where("variant_type_id", variantTypeId)
        .first()

      if (!result) {
        logger.warn("Variant type not found", { variantTypeId })
        throw new NotFoundError("VariantType", variantTypeId)
      }

      logger.info("Fetched variant type", {
        variantTypeId,
        name: result.name,
      })

      // Convert DBVariantType to VariantType (handle null -> undefined)
      return {
        variant_type_id: result.variant_type_id,
        name: result.name,
        display_name: result.display_name,
        description: result.description ?? undefined,
        affects_pricing: result.affects_pricing,
        searchable: result.searchable,
        filterable: result.filterable,
        value_type: result.value_type,
        min_value: result.min_value ?? undefined,
        max_value: result.max_value ?? undefined,
        allowed_values: result.allowed_values ?? undefined,
        display_order: result.display_order,
        icon: result.icon ?? undefined,
        created_at: result.created_at,
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error
      }

      logger.error("Failed to fetch variant type", {
        variantTypeId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }
}
