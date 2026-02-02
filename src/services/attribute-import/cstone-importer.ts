/**
 * CStone Importer
 * Imports game item attributes from finder.cstone.space
 */

import logger from "../../logger/logger.js"
import {
  AttributeImporter,
  AttributeRecord,
  ItemAttributes,
} from "./attribute-import.types.js"

const CSTONE_BASE_URL = "https://finder.cstone.space"

/**
 * Importer for finder.cstone.space data source
 * Fetches component specifications and maps them to internal attribute schema
 */
export class CStoneImporter implements AttributeImporter {
  source = "cstone" as const

  /**
   * Fetches item attributes from finder.cstone.space
   * Currently returns empty attributes as the CStone API endpoint structure
   * needs to be determined. The mapping logic is ready for when data is available.
   */
  async fetchItemAttributes(itemId: string): Promise<ItemAttributes> {
    logger.debug("Fetching item attributes from CStone", {
      itemId,
      source: this.source,
    })

    try {
      // CStone API implementation pending - need to determine:
      // 1. Whether cstone.space provides a public API
      // 2. API endpoint structure and authentication requirements
      // 3. Rate limiting considerations

      // Once API details are known, implement:
      // const response = await fetch(`${CSTONE_BASE_URL}/api/items/${itemId}`)
      // if (!response.ok) {
      //   throw new Error(`CStone API error: ${response.status}`)
      // }
      // const data = await response.json()
      // return data

      logger.debug("CStone importer returning empty attributes", {
        itemId,
        message: "API integration pending",
      })

      return {}
    } catch (error) {
      logger.error("Failed to fetch attributes from CStone", {
        itemId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Maps CStone data format to internal attribute schema
   * Handles component-specific attributes: size, class, grade, manufacturer
   */
  mapToInternalSchema(externalData: ItemAttributes): AttributeRecord[] {
    const records: AttributeRecord[] = []

    // Map size attribute
    if (externalData.size !== undefined && externalData.size !== null) {
      records.push({
        game_item_id: "", // Will be set by the import service
        attribute_name: "size",
        attribute_value: String(externalData.size),
      })
    }

    // Map class attribute (Military, Stealth, Industrial, Civilian)
    if (externalData.class !== undefined && externalData.class !== null) {
      records.push({
        game_item_id: "",
        attribute_name: "class",
        attribute_value: String(externalData.class),
      })
    }

    // Map grade attribute (A, B, C, D)
    if (externalData.grade !== undefined && externalData.grade !== null) {
      records.push({
        game_item_id: "",
        attribute_name: "grade",
        attribute_value: String(externalData.grade),
      })
    }

    // Map manufacturer attribute
    if (
      externalData.manufacturer !== undefined &&
      externalData.manufacturer !== null
    ) {
      records.push({
        game_item_id: "",
        attribute_name: "manufacturer",
        attribute_value: String(externalData.manufacturer),
      })
    }

    // Map component_type if available
    if (
      externalData.component_type !== undefined &&
      externalData.component_type !== null
    ) {
      records.push({
        game_item_id: "",
        attribute_name: "component_type",
        attribute_value: String(externalData.component_type),
      })
    }

    logger.debug("Mapped CStone data to internal schema", {
      inputKeys: Object.keys(externalData),
      outputRecordCount: records.length,
      attributes: records.map((r) => r.attribute_name),
    })

    return records
  }
}
