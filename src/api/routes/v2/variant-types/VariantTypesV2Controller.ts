/**
 * Variant Types V2 Controller
 *
 * TSOA controller for variant types endpoints in the V2 market system.
 * Handles retrieval of variant type definitions with validation rules.
 *
 * Requirements: 4.4, 4.5
 */

import { Controller, Get, Route, Tags } from "tsoa"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  GetVariantTypesResponse,
  VariantType,
} from "../types/variant-types.types.js"
import logger from "../../../../logger/logger.js"

@Route("variant-types")
@Tags("Variant Types V2")
export class VariantTypesV2Controller extends BaseController {
  /**
   * Get all variant types with validation rules
   *
   * Returns all available variant type definitions including name, display_name,
   * value_type, min_value, max_value, and allowed_values. Also includes flags
   * for affects_pricing, searchable, and filterable. Results are ordered by
   * display_order for consistent UI presentation.
   *
   * Requirements:
   * - 4.4: GET /api/v2/variant-types endpoint
   * - 4.5: Return all variant types with validation rules
   * - 4.5: Include name, display_name, value_type, min_value, max_value, allowed_values
   * - 4.5: Include affects_pricing, searchable, filterable flags
   * - 4.5: Order by display_order
   *
   * @summary Get all variant types
   * @returns All variant type definitions with validation rules
   */
  @Get()
  public async getVariantTypes(): Promise<GetVariantTypesResponse> {
    const knex = getKnex()

    logger.info("Fetching all variant types")

    try {
      // Query variant_types table ordered by display_order
      // Using raw SQL due to test environment issues with query builder
      const result = await knex.raw(`
        SELECT * FROM variant_types ORDER BY display_order ASC
      `)
      const results = result.rows

      logger.info("Variant types fetched successfully", {
        count: results.length,
      })

      // Transform results to VariantType format
      const variant_types: VariantType[] = results.map((row: any) => ({
        variant_type_id: row.variant_type_id,
        name: row.name,
        display_name: row.display_name,
        description: row.description || undefined,
        affects_pricing: row.affects_pricing,
        searchable: row.searchable,
        filterable: row.filterable,
        value_type: row.value_type as 'integer' | 'decimal' | 'string' | 'enum',
        min_value: row.min_value !== null ? parseFloat(row.min_value) : undefined,
        max_value: row.max_value !== null ? parseFloat(row.max_value) : undefined,
        allowed_values: row.allowed_values || undefined,
        display_order: row.display_order,
        icon: row.icon || undefined,
        created_at: row.created_at.toISOString(),
      }))

      return {
        variant_types,
        total: variant_types.length,
      }
    } catch (error) {
      logger.error("Failed to fetch variant types", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
