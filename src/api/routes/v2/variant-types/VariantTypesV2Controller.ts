/**
 * Variant Types V2 Controller
 *
 * TSOA controller for variant type management in the V2 market system.
 * Provides endpoints to retrieve variant type definitions and validation rules.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

import { Controller, Get, Route, Tags, Path, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import {
  VariantType,
  VariantTypesResponse,
  VariantTypeResponse,
} from "../types/market-v2-types.js"
import { VariantTypeService } from "../../../../services/market-v2/variant-type.service.js"
import logger from "../../../../logger/logger.js"

@Route("variant-types")
@Tags("Variant Types V2")
export class VariantTypesV2Controller extends BaseController {
  private variantTypeService: VariantTypeService

  constructor(@Request() request?: ExpressRequest) {
    super(request as ExpressRequest)
    this.variantTypeService = new VariantTypeService()
  }

  /**
   * Get all variant types
   *
   * Returns a list of all available variant types with their validation rules.
   * Variant types define the attributes that can be used when creating item variants,
   * including quality_tier, quality_value, crafted_source, and blueprint_tier.
   *
   * Results are ordered by display_order for consistent UI presentation.
   *
   * @summary List all variant types
   * @returns List of variant types with validation rules
   */
  @Get()
  public async getAllVariantTypes(): Promise<VariantTypesResponse> {
    logger.info("Getting all variant types")

    try {
      const variantTypes = await this.variantTypeService.getAllVariantTypes()

      logger.info("Retrieved all variant types", {
        count: variantTypes.length,
      })

      return {
        variant_types: variantTypes,
      }
    } catch (error) {
      logger.error("Failed to get all variant types", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get variant type by ID
   *
   * Returns detailed information about a specific variant type including
   * validation rules (min_value, max_value, allowed_values) and display configuration.
   *
   * @summary Get variant type details
   * @param variant_type_id Variant type ID to retrieve
   * @returns Variant type details
   */
  @Get("{variant_type_id}")
  public async getVariantTypeById(
    @Path() variant_type_id: string,
  ): Promise<VariantTypeResponse> {
    logger.info("Getting variant type by ID", { variant_type_id })

    try {
      const variantType =
        await this.variantTypeService.getVariantTypeById(variant_type_id)

      logger.info("Retrieved variant type", {
        variant_type_id,
        name: variantType.name,
      })

      return {
        variant_type: variantType,
      }
    } catch (error) {
      logger.error("Failed to get variant type", {
        variant_type_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
