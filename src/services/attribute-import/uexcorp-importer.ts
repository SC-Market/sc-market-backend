/**
 * UEXCorp Importer
 * Imports game item attributes from UEXCorp.space API
 */

import logger from "../../logger/logger.js"
import {
  AttributeImporter,
  AttributeRecord,
  ItemAttributes,
} from "./attribute-import.types.js"

const UEXCORP_BASE_URL = "https://api.uexcorp.uk/2.0"

/**
 * Importer for UEXCorp.space API
 * Fetches item specifications and maps them to internal attribute schema
 */
export class UEXCorpImporter implements AttributeImporter {
  source = "uexcorp" as const

  /**
   * Fetches item attributes from UEXCorp API
   * Note: The UEXCorp API primarily provides commodity data.
   * This implementation assumes there might be item-specific endpoints
   * or that we can derive attributes from commodity data.
   */
  async fetchItemAttributes(itemId: string): Promise<ItemAttributes> {
    logger.debug("Fetching item attributes from UEXCorp", {
      itemId,
      source: this.source,
    })

    try {
      // TODO: Implement actual UEXCorp API call for item-specific data
      // The current UEX API focuses on commodities, so this might need
      // to be adapted based on available endpoints
      
      // Example structure (if item endpoint exists):
      // const response = await fetch(`${UEXCORP_BASE_URL}/items/${itemId}`, {
      //   headers: {
      //     accept: "application/json",
      //   },
      // })
      // 
      // if (!response.ok) {
      //   throw new Error(`UEXCorp API error: ${response.status}`)
      // }
      // 
      // const data = await response.json()
      // return this.extractAttributes(data)

      // For now, return empty attributes
      logger.warn("UEXCorp importer not fully implemented", {
        itemId,
        message: "Returning empty attributes - implementation needed",
      })

      return {}
    } catch (error) {
      logger.error("Failed to fetch attributes from UEXCorp", {
        itemId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Maps UEXCorp API response to internal attribute schema
   * Handles various item types and their specific attributes
   */
  mapToInternalSchema(externalData: ItemAttributes): AttributeRecord[] {
    const records: AttributeRecord[] = []

    // Map commodity-related attributes if available
    if (externalData.kind !== undefined && externalData.kind !== null) {
      records.push({
        game_item_id: "",
        attribute_name: "commodity_kind",
        attribute_value: String(externalData.kind),
      })
    }

    // Map mineral/material properties
    if (externalData.is_mineral === 1) {
      records.push({
        game_item_id: "",
        attribute_name: "is_mineral",
        attribute_value: "true",
      })
    }

    if (externalData.is_refined === 1) {
      records.push({
        game_item_id: "",
        attribute_name: "is_refined",
        attribute_value: "true",
      })
    }

    if (externalData.is_raw === 1) {
      records.push({
        game_item_id: "",
        attribute_name: "is_raw",
        attribute_value: "true",
      })
    }

    // Map hazard properties
    if (externalData.is_illegal === 1) {
      records.push({
        game_item_id: "",
        attribute_name: "is_illegal",
        attribute_value: "true",
      })
    }

    if (externalData.is_volatile_qt === 1) {
      records.push({
        game_item_id: "",
        attribute_name: "is_volatile_qt",
        attribute_value: "true",
      })
    }

    if (externalData.is_explosive === 1) {
      records.push({
        game_item_id: "",
        attribute_name: "is_explosive",
        attribute_value: "true",
      })
    }

    // Map weight if available
    if (
      externalData.weight_scu !== undefined &&
      externalData.weight_scu !== null
    ) {
      records.push({
        game_item_id: "",
        attribute_name: "weight_scu",
        attribute_value: String(externalData.weight_scu),
      })
    }

    logger.debug("Mapped UEXCorp data to internal schema", {
      inputKeys: Object.keys(externalData),
      outputRecordCount: records.length,
      attributes: records.map((r) => r.attribute_name),
    })

    return records
  }
}
