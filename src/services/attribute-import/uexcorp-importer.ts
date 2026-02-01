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
   * Searches by item name since UUIDs don't match between systems
   */
  async fetchItemAttributes(itemId: string): Promise<ItemAttributes> {
    logger.debug("Fetching item attributes from UEXCorp", {
      itemId,
      source: this.source,
    })

    try {
      // Get item from our database
      const { database } = await import("../../clients/database/knex-db.js")
      const gameItem = await database
        .knex("game_items")
        .where("id", itemId)
        .first("name", "uex_uuid")

      if (!gameItem || !gameItem.name) {
        logger.debug("Game item not found in database", { itemId })
        return {}
      }

      const itemName = gameItem.name
      const uexUuid = gameItem.uex_uuid

      // If we have a UEX UUID, try to fetch directly first
      if (uexUuid) {
        try {
          const directResponse = await fetch(
            `${UEXCORP_BASE_URL}/items/${uexUuid}`,
            {
              headers: { accept: "application/json" },
            },
          )

          if (directResponse.ok) {
            const directData = await directResponse.json()
            if (directData.data) {
              logger.debug("Found item by UEX UUID", { itemId, uexUuid })
              return this.extractAttributes(directData.data)
            }
          }
        } catch (error) {
          logger.debug(
            "Failed to fetch by UEX UUID, falling back to name search",
            {
              itemId,
              uexUuid,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          )
        }
      }

      // Fall back to name-based search
      // Fetch categories
      const categoriesResponse = await fetch(`${UEXCORP_BASE_URL}/categories`, {
        headers: { accept: "application/json" },
      })

      if (!categoriesResponse.ok) {
        throw new Error(
          `UEXCorp categories API error: ${categoriesResponse.status}`,
        )
      }

      const categoriesData = await categoriesResponse.json()

      if (!categoriesData.data || !Array.isArray(categoriesData.data)) {
        logger.debug("No categories returned from UEXCorp")
        return {}
      }

      // Search for item across all categories
      let item: any = null

      for (const category of categoriesData.data) {
        const itemResponse = await fetch(
          `${UEXCORP_BASE_URL}/items?id_category=${category.id}`,
          {
            headers: { accept: "application/json" },
          },
        )

        if (!itemResponse.ok) continue

        const itemData = await itemResponse.json()

        if (itemData.data && Array.isArray(itemData.data)) {
          // Try exact match first
          item = itemData.data.find(
            (i: any) => i.name?.toLowerCase() === itemName.toLowerCase(),
          )

          // If no exact match, try fuzzy match (normalize special chars)
          if (!item) {
            item = itemData.data.find(
              (i: any) =>
                this.normalizeItemName(i.name) ===
                this.normalizeItemName(itemName),
            )
          }

          if (item) break
        }
      }

      if (!item) {
        logger.debug("No matching item in UEXCorp", { itemName })
        return {}
      }

      return this.extractAttributes(item)
    } catch (error) {
      logger.error("Error fetching item attributes from UEXCorp", {
        itemId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      })
      return {}
    }
  }

  /**
   * Extract attributes from UEX item data
   */
  private async extractAttributes(item: any): Promise<ItemAttributes> {
    const attributes: ItemAttributes = {}

    // Extract basic attributes
    if (item.size) attributes.size = item.size
    if (item.color) attributes.color = item.color
    if (item.quality) attributes.grade = this.mapQualityToGrade(item.quality)
    if (item.company_name) attributes.manufacturer = item.company_name

    // Fetch detailed attributes using UEX's item ID
    if (item.id) {
      const attrsResponse = await fetch(
        `${UEXCORP_BASE_URL}/items_attributes?id_item=${item.id}`,
        {
          headers: { accept: "application/json" },
        },
      )

      if (attrsResponse.ok) {
        const attrsData = await attrsResponse.json()

        if (attrsData.data && Array.isArray(attrsData.data)) {
          for (const attr of attrsData.data) {
            const attrName = attr.attribute_name?.toLowerCase()
            const value = attr.value

            if (!attrName || !value) continue

            if (attrName.includes("class")) {
              attributes.class = value
            } else if (attrName.includes("type")) {
              attributes.component_type = value
            } else if (attrName.includes("manufacturer")) {
              attributes.manufacturer = value
            } else {
              attributes[attrName] = value
            }
          }
        }
      }
    }

    return attributes
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

  /**
   * Normalize item name for fuzzy matching
   * Removes special characters, extra spaces, and normalizes case
   */
  private normalizeItemName(name: string | undefined): string {
    if (!name) return ""

    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // Remove special chars
      .replace(/\s+/g, " ") // Normalize spaces
      .trim()
  }
}
