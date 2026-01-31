/**
 * GameItemImportService - Service for importing game item attributes from external sources
 *
 * This service handles:
 * - Importing from UEX Corp Space API (structured data - PRIMARY SOURCE)
 * - Importing from cstone.space (parsed data - SECONDARY SOURCE)
 * - Parsing component attributes from descriptions
 * - Storing all attributes in game_item_attributes table
 *
 * Import Strategy:
 * 1. UEX provides structured data: size, manufacturer, component_type
 * 2. CStone fills gaps and adds: grade, component_class, armor_class, color, custom attributes
 */

import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"
import { gameItemAttributesService } from "./game-item-attributes.service.js"
import type { Knex } from "knex"

const CSTONE_BASE_URL = "https://api.cstone.space"
const UEX_BASE_URL = "https://api.uexcorp.uk/2.0"

interface CStoneItem {
  uuid: string
  name: string
  description: string
  type?: string
  manufacturer?: string
}

interface UEXItem {
  id: string
  name: string
  size?: number
  manufacturer?: string
  company_name?: string
  category?: string
  type?: string
}

interface ComponentAttributes {
  size?: number
  grade?: string
  componentClass?: string
  armorClass?: string
  color?: string
  manufacturer?: string
  type?: string
  customAttributes?: Record<string, string>
}

export interface GameItemImportService {
  importFromCStone(): Promise<void>
  importFromUEX(): Promise<void>
  importAll(): Promise<void>
}

class DatabaseGameItemImportService implements GameItemImportService {
  private db: Knex

  constructor(db?: Knex) {
    this.db = db || getKnex()
  }

  /**
   * Import from UEX Corp Space API (structured data - PRIMARY SOURCE)
   * Provides: size, manufacturer, component_type
   * Does NOT provide: grade, component_class, armor_class, color
   */
  async importFromUEX(): Promise<void> {
    logger.info("Starting UEX import (structured data)")

    try {
      const items = await this.fetchUEXItems()
      logger.info("Fetched UEX items", { count: items.length })

      let processedCount = 0
      let skippedCount = 0
      let errorCount = 0

      for (const item of items) {
        try {
          // Find the game item by name
          const gameItem = await this.db("game_items")
            .where({ name: item.name })
            .first()

          if (!gameItem) {
            skippedCount++
            logger.debug("Game item not found for UEX item", {
              name: item.name,
            })
            continue
          }

          // Build attributes object
          const attributes: Record<string, string> = {}

          if (item.size !== undefined && item.size !== null) {
            attributes.component_size = String(item.size)
          }

          if (item.company_name || item.manufacturer) {
            attributes.manufacturer = item.company_name || item.manufacturer!
          }

          if (item.category) {
            attributes.component_type = this.normalizeComponentType(
              item.category,
            )
          } else if (item.type) {
            attributes.component_type = this.normalizeComponentType(item.type)
          }

          // Store attributes in game_item_attributes table
          if (Object.keys(attributes).length > 0) {
            await gameItemAttributesService.setAttributes(
              gameItem.id,
              attributes,
            )
            processedCount++
            logger.debug("Stored UEX attributes", {
              gameItemId: gameItem.id,
              name: item.name,
              attributeCount: Object.keys(attributes).length,
            })
          } else {
            skippedCount++
          }
        } catch (error) {
          errorCount++
          logger.error("Failed to process UEX item", {
            error,
            itemName: item.name,
          })
        }
      }

      logger.info("UEX import completed", {
        total: items.length,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount,
      })
    } catch (error) {
      logger.error("UEX import failed", { error })
      throw error
    }
  }

  /**
   * Import from cstone.space (parsed data - SECONDARY SOURCE)
   * Provides: size, grade, manufacturer, component_type, component_class, armor_class, color
   * Used to fill gaps and add attributes not available in UEX
   */
  async importFromCStone(): Promise<void> {
    logger.info("Starting CStone import (parsed data + fill gaps)")

    try {
      const items = await this.fetchCStoneItems()
      logger.info("Fetched CStone items", { count: items.length })

      let processedCount = 0
      let skippedCount = 0
      let errorCount = 0

      for (const item of items) {
        try {
          const parsed = this.parseCStoneDescription(
            item.description,
            item.name,
          )

          // Find the game item by cstone_uuid
          const gameItem = await this.db("game_items")
            .where({ cstone_uuid: item.uuid })
            .first()

          if (!gameItem) {
            skippedCount++
            logger.debug("Game item not found for CStone item", {
              uuid: item.uuid,
              name: item.name,
            })
            continue
          }

          // Build attributes object - all attributes go into game_item_attributes
          const attributes: Record<string, string> = {}

          if (parsed.size !== undefined) {
            attributes.component_size = String(parsed.size)
          }

          if (parsed.grade) {
            attributes.component_grade = parsed.grade
          }

          if (parsed.manufacturer) {
            attributes.manufacturer = parsed.manufacturer
          }

          if (parsed.type) {
            attributes.component_type = parsed.type
          }

          if (parsed.componentClass) {
            attributes.component_class = parsed.componentClass
          }

          if (parsed.armorClass) {
            attributes.armor_class = parsed.armorClass
          }

          if (parsed.color) {
            attributes.color = parsed.color
          }

          // Add custom attributes
          if (parsed.customAttributes) {
            Object.assign(attributes, parsed.customAttributes)
          }

          // Store all attributes in game_item_attributes table
          if (Object.keys(attributes).length > 0) {
            await gameItemAttributesService.setAttributes(
              gameItem.id,
              attributes,
            )
            processedCount++
            logger.debug("Stored CStone attributes", {
              gameItemId: gameItem.id,
              name: item.name,
              attributeCount: Object.keys(attributes).length,
            })
          } else {
            skippedCount++
          }
        } catch (error) {
          errorCount++
          logger.error("Failed to process CStone item", {
            error,
            itemName: item.name,
            itemUuid: item.uuid,
          })
        }
      }

      logger.info("CStone import completed", {
        total: items.length,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount,
      })
    } catch (error) {
      logger.error("CStone import failed", { error })
      throw error
    }
  }

  /**
   * Combined import: UEX first (structured), then CStone (fill gaps)
   * This strategy ensures we use structured data when available,
   * and fall back to parsed data for attributes UEX doesn't provide
   */
  async importAll(): Promise<void> {
    logger.info("Starting combined import (UEX + CStone)")

    try {
      await this.importFromUEX()
      await this.importFromCStone()
      logger.info("Combined import completed successfully")
    } catch (error) {
      logger.error("Combined import failed", { error })
      throw error
    }
  }

  /**
   * Fetch items from UEX Corp Space API
   */
  private async fetchUEXItems(): Promise<UEXItem[]> {
    logger.debug("Fetching items from UEX API", {
      endpoint: `${UEX_BASE_URL}/items`,
    })

    try {
      const response = await fetch(`${UEX_BASE_URL}/items`, {
        headers: {
          accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(
          `UEX API error! status: ${response.status} - ${response.statusText}`,
        )
      }

      const data = await response.json()

      // Handle both wrapped and direct array formats
      if (Array.isArray(data)) {
        return data as UEXItem[]
      } else if (data && typeof data === "object" && "data" in data) {
        return data.data as UEXItem[]
      }

      throw new Error("Invalid UEX API response structure")
    } catch (error) {
      logger.error("Failed to fetch UEX items", { error })
      throw error
    }
  }

  /**
   * Fetch items from cstone.space API
   */
  private async fetchCStoneItems(): Promise<CStoneItem[]> {
    logger.debug("Fetching items from CStone API", {
      endpoint: `${CSTONE_BASE_URL}/items`,
    })

    try {
      const response = await fetch(`${CSTONE_BASE_URL}/items`, {
        headers: {
          accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(
          `CStone API error! status: ${response.status} - ${response.statusText}`,
        )
      }

      const data = await response.json()

      if (Array.isArray(data)) {
        return data as CStoneItem[]
      } else if (data && typeof data === "object" && "data" in data) {
        return data.data as CStoneItem[]
      }

      throw new Error("Invalid CStone API response structure")
    } catch (error) {
      logger.error("Failed to fetch CStone items", { error })
      throw error
    }
  }

  /**
   * Parse component attributes from CStone description and name
   * Handles various formats and extracts all available attributes
   */
  private parseCStoneDescription(
    description: string,
    name: string,
  ): ComponentAttributes {
    const result: ComponentAttributes = {
      customAttributes: {},
    }
    const combinedText = `${name} ${description}`

    // Extract size (e.g., "Size 3", "S3", "Size Class 2")
    const sizeMatch = combinedText.match(
      /\b(?:size|s)[\s-]?(?:class[\s-]?)?(\d+)\b/i,
    )
    if (sizeMatch) {
      result.size = parseInt(sizeMatch[1], 10)
    }

    // Extract grade (e.g., "Grade A", "Class B", "A-Grade")
    const gradeMatch = combinedText.match(/\b(?:grade|class)[\s-]?([A-D])\b/i)
    if (gradeMatch) {
      result.grade = gradeMatch[1].toUpperCase()
    }

    // Extract component class (e.g., "Military", "Stealth", "Industrial")
    const classPatterns = [
      "Military",
      "Stealth",
      "Industrial",
      "Civilian",
      "Competition",
      "Racing",
    ]

    for (const classType of classPatterns) {
      if (combinedText.match(new RegExp(`\\b${classType}\\b`, "i"))) {
        result.componentClass = classType
        break
      }
    }

    // Extract armor class (e.g., "Light Armor", "Heavy", "Medium")
    const armorPatterns = ["Light", "Medium", "Heavy"]
    for (const armorType of armorPatterns) {
      if (
        combinedText.match(new RegExp(`\\b${armorType}(?:\\s+armor)?\\b`, "i"))
      ) {
        result.armorClass = armorType
        break
      }
    }

    // Extract color (e.g., "Red", "Blue Paint", "Black Camo")
    const colorPatterns = [
      "Red",
      "Blue",
      "Green",
      "Yellow",
      "Orange",
      "Purple",
      "Pink",
      "Black",
      "White",
      "Gray",
      "Grey",
      "Brown",
      "Tan",
      "Beige",
      "Gold",
      "Silver",
      "Bronze",
      "Copper",
      "Camo",
      "Camouflage",
      "Desert",
      "Urban",
      "Woodland",
    ]

    for (const colorType of colorPatterns) {
      if (
        combinedText.match(
          new RegExp(
            `\\b${colorType}(?:\\s+(?:paint|camo|camouflage))?\\b`,
            "i",
          ),
        )
      ) {
        result.color = colorType
        break
      }
    }

    // Extract manufacturer (e.g., "by Crusader Industries", "manufactured by RSI")
    const mfgMatch = combinedText.match(
      /\b(?:by|from|manufactured by|manufacturer[:\s]+)\s*([A-Z][a-zA-Z\s&]+?)(?:\s*(?:,|\.|;|$|VOLUME|STATS|GENERAL|NAME|MANUFACTURER|CLASS))/i,
    )
    if (mfgMatch) {
      result.manufacturer = mfgMatch[1].trim()
    }

    // Extract component type
    const typePatterns = [
      "Quantum Drive",
      "Shield Generator",
      "Power Plant",
      "Cooler",
      "Ship Weapon",
      "Missile Rack",
      "Turret",
    ]

    for (const type of typePatterns) {
      if (combinedText.match(new RegExp(`\\b${type}\\b`, "i"))) {
        result.type = type
        break
      }
    }

    // Extract custom attributes (weight, durability, etc.)
    // Weight (e.g., "Weight: 50kg", "50 kg")
    const weightMatch = combinedText.match(
      /\b(?:weight|mass):\s*(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\b/i,
    )
    if (weightMatch) {
      result.customAttributes!["weight"] = weightMatch[1]
    }

    // Durability (e.g., "Durability: 1000", "1000 HP")
    const durabilityMatch = combinedText.match(
      /\b(?:durability|health|hp):\s*(\d+)\b/i,
    )
    if (durabilityMatch) {
      result.customAttributes!["durability"] = durabilityMatch[1]
    }

    return result
  }

  /**
   * Normalize component type from UEX category to our standard types
   */
  private normalizeComponentType(category: string): string {
    const mapping: Record<string, string> = {
      quantum_drive: "Quantum Drive",
      shield: "Shield Generator",
      shield_generator: "Shield Generator",
      power_plant: "Power Plant",
      cooler: "Cooler",
      weapon: "Ship Weapon",
      ship_weapon: "Ship Weapon",
      missile_rack: "Missile Rack",
      turret: "Turret",
    }

    const normalized = category.toLowerCase().replace(/\s+/g, "_")
    return mapping[normalized] || category
  }
}

// Export singleton instance
export const gameItemImportService: GameItemImportService =
  new DatabaseGameItemImportService()

// Export class for testing
export { DatabaseGameItemImportService }
