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
   * Uses /items and /items_attributes endpoints
   */
  async fetchItemAttributes(itemId: string): Promise<ItemAttributes> {
    logger.debug("Fetching item attributes from UEXCorp", {
      itemId,
      source: this.source,
    })

    try {
      // Fetch item by UUID
      const itemResponse = await fetch(
        `${UEXCORP_BASE_URL}/items?uuid=${encodeURIComponent(itemId)}`,
        {
          headers: { accept: "application/json" },
        }
      )

      if (!itemResponse.ok) {
        throw new Error(`UEXCorp items API error: ${itemResponse.status}`)
      }

      const itemData = await itemResponse.json()
      
      if (!itemData.data || itemData.data.length === 0) {
        logger.debug("No item found in UEXCorp", { itemId })
        return {}
      }

      const item = itemData.data[0]
      const attributes: ItemAttributes = {}

      // Extract basic attributes
      if (item.size) attributes.size = item.size
      if (item.color) attributes.color = item.color
      if (item.quality) attributes.grade = this.mapQualityToGrade(item.quality)
      if (item.company_name) attributes.manufacturer = item.company_name

      // Fetch detailed attributes
      const attrsResponse = await fetch(
        `${UEXCORP_BASE_URL}/items_attributes?uuid=${encodeURIComponent(itemId)}`,
        {
          headers: { accept: "application/json" },
        }
      )

      if (attrsResponse.ok) {
        const attrsData = await attrsResponse.json()
        
        if (attrsData.data && Array.isArray(attrsData.data)) {
          for (const attr of attrsData.data) {
            const attrName = attr.attribute_name?.toLowerCase()
            const value = attr.value
            
            if (!attrName || !value) continue

            if (attrName.includes('class')) {
              attributes.class = value
            } else if (attrName.includes('type')) {
              attributes.component_type = value
            } else if (attrName.includes('manufacturer')) {
              attributes.manufacturer = value
            } else {
              attributes[attrName] = value
            }
          }
        }
      }

      logger.debug("Fetched attributes from UEXCorp", {
        itemId,
        attributeCount: Object.keys(attributes).length,
      })

      return attributes
    } catch (error) {
      logger.error("Failed to fetch attributes from UEXCorp", {
        itemId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      })
      return {}
    }
  }

  private mapQualityToGrade(quality: number): string {
    if (quality >= 5) return "A"
    if (quality >= 4) return "B"
    if (quality >= 3) return "C"
    return "D"
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
