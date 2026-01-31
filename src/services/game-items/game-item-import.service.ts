/**
 * Game Item Import Service
 * Handles importing component attribute data from external sources
 * @see https://cstone.space
 * @see https://api.uexcorp.uk
 */

import logger from "../../logger/logger.js"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  CStoneItem,
  UEXItem,
  ComponentAttributes,
  ImportStats,
} from "./game-item-import.service.types.js"

const CSTONE_BASE_URL = "https://cstone.space"
const CSTONE_API_ENDPOINT = `${CSTONE_BASE_URL}/api/items` // Placeholder - actual endpoint may vary
const UEX_BASE_URL = "https://api.uexcorp.uk/2.0"
const UEX_ITEMS_ENDPOINT = `${UEX_BASE_URL}/items` // Placeholder - actual endpoint may vary

/**
 * Parses component attributes from CStone description text
 * Extracts size, grade, component class, manufacturer, and type from descriptions
 * 
 * Example patterns:
 * - "Size 3 Grade A Military Quantum Drive by Crusader Industries"
 * - "Class B Size 2 Stealth Shield Generator"
 * - "Size 1 Industrial Cooler"
 * 
 * @param description - The description text from CStone
 * @returns Parsed component attributes
 */
export function parseCStoneDescription(
  description: string,
): ComponentAttributes {
  const result: ComponentAttributes = {}

  if (!description) {
    return result
  }

  // Extract size (e.g., "Size 3", "size class 2")
  const sizeMatch = description.match(/\bsize\s+(?:class\s+)?(\d+)\b/i)
  if (sizeMatch) {
    const size = parseInt(sizeMatch[1], 10)
    if (!isNaN(size) && size >= 0 && size <= 12) {
      result.size = size
    }
  }

  // Extract grade (e.g., "Grade A", "Class B")
  const gradeMatch = description.match(/\b(?:grade|class)\s+([A-D])\b/i)
  if (gradeMatch) {
    result.grade = gradeMatch[1].toUpperCase()
  }

  // Extract component class (Military, Stealth, Industrial, Civilian, Competition, Racing)
  const classPatterns = [
    "Military",
    "Stealth",
    "Industrial",
    "Civilian",
    "Competition",
    "Racing",
  ]

  for (const classType of classPatterns) {
    if (description.match(new RegExp(`\\b${classType}\\b`, "i"))) {
      result.componentClass = classType
      break
    }
  }

  // Extract manufacturer (e.g., "by Crusader Industries", "Manufacturer: Anvil")
  const mfgByMatch = description.match(/\bby\s+([A-Z][a-zA-Z\s&]+?)(?:\s*\n|$)/i)
  const mfgLabelMatch = description.match(
    /\bmanufacturer[:\s]+([A-Z][a-zA-Z\s&]+?)(?:\s*\n|$)/i,
  )

  if (mfgByMatch) {
    result.manufacturer = mfgByMatch[1].trim()
  } else if (mfgLabelMatch) {
    result.manufacturer = mfgLabelMatch[1].trim()
  }

  // Extract component type
  const typePatterns = [
    "Quantum Drive",
    "Shield Generator",
    "Shield",
    "Power Plant",
    "Cooler",
    "Ship Weapon",
    "Weapon",
    "Missile",
    "Torpedo",
  ]

  for (const type of typePatterns) {
    if (description.match(new RegExp(`\\b${type}\\b`, "i"))) {
      result.type = type
      break
    }
  }

  return result
}

/**
 * Fetches items from CStone API
 * @returns Array of CStone items
 * @throws Error if the API request fails
 */
async function fetchCStoneItems(): Promise<CStoneItem[]> {
  logger.debug("Starting item fetch from CStone API", {
    endpoint: CSTONE_API_ENDPOINT,
    timestamp: new Date().toISOString(),
  })

  let response: Response
  try {
    response = await fetch(CSTONE_API_ENDPOINT, {
      headers: {
        accept: "application/json",
      },
    })
  } catch (error) {
    logger.error("Network error during CStone item fetch", {
      endpoint: CSTONE_API_ENDPOINT,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  if (!response.ok) {
    const errorDetails = {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    }

    logger.error("CStone API HTTP error", errorDetails)
    throw new Error(
      `CStone API error! status: ${response.status} - ${response.statusText}`,
    )
  }

  let data: CStoneItem[]
  try {
    data = (await response.json()) as CStoneItem[]
    logger.debug("CStone API response parsed successfully", {
      itemCount: data.length,
    })
  } catch (error) {
    logger.error("Failed to parse CStone API JSON response", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    throw error
  }

  return data
}

/**
 * Fetches items from UEX Corp Space API
 * @returns Array of UEX items
 * @throws Error if the API request fails
 */
async function fetchUEXItems(): Promise<UEXItem[]> {
  logger.debug("Starting item fetch from UEX API", {
    endpoint: UEX_ITEMS_ENDPOINT,
    timestamp: new Date().toISOString(),
  })

  let response: Response
  try {
    response = await fetch(UEX_ITEMS_ENDPOINT, {
      headers: {
        accept: "application/json",
      },
    })
  } catch (error) {
    logger.error("Network error during UEX item fetch", {
      endpoint: UEX_ITEMS_ENDPOINT,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  if (!response.ok) {
    const errorDetails = {
      status: response.status,
      statusText: response.statusText,
      url: response.url,
    }

    logger.error("UEX API HTTP error", errorDetails)
    throw new Error(
      `UEX API error! status: ${response.status} - ${response.statusText}`,
    )
  }

  let data: UEXItem[]
  try {
    const responseData = await response.json()
    // Handle both direct array and wrapped response formats
    data = Array.isArray(responseData) ? responseData : responseData.data || []
    logger.debug("UEX API response parsed successfully", {
      itemCount: data.length,
    })
  } catch (error) {
    logger.error("Failed to parse UEX API JSON response", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    throw error
  }

  return data
}

/**
 * Imports component attributes from CStone API
 * Updates game_items records using cstone_uuid as the matching key
 * 
 * @returns Import statistics
 */
export async function importFromCStone(): Promise<ImportStats> {
  const stats: ImportStats = {
    totalProcessed: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    skipped: 0,
    errors: [],
  }

  logger.info("Starting CStone import")

  try {
    const items = await fetchCStoneItems()
    stats.totalProcessed = items.length

    const knex = getKnex()

    for (const item of items) {
      try {
        // Skip items without cstone_uuid
        if (!item.uuid) {
          stats.skipped++
          continue
        }

        // Parse component attributes from description
        const attributes = parseCStoneDescription(item.description || "")

        // Only update if we found at least one attribute
        if (
          !attributes.size &&
          !attributes.grade &&
          !attributes.componentClass &&
          !attributes.manufacturer &&
          !attributes.type
        ) {
          stats.skipped++
          continue
        }

        // Update game_items record
        const updateCount = await knex("game_items")
          .where({ cstone_uuid: item.uuid })
          .update({
            component_size: attributes.size,
            component_grade: attributes.grade,
            component_class: attributes.componentClass,
            manufacturer: attributes.manufacturer,
            component_type: attributes.type,
          })

        if (updateCount > 0) {
          stats.successfulUpdates++
          logger.debug("Updated game item from CStone", {
            name: item.name,
            uuid: item.uuid,
            attributes,
          })
        } else {
          stats.skipped++
          logger.debug("No matching game item found for CStone UUID", {
            name: item.name,
            uuid: item.uuid,
          })
        }
      } catch (error) {
        stats.failedUpdates++
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error"
        stats.errors.push({
          itemName: item.name,
          error: errorMessage,
        })
        logger.error("Failed to update game item from CStone", {
          name: item.name,
          uuid: item.uuid,
          error: errorMessage,
        })
      }
    }

    logger.info("CStone import completed", stats)
  } catch (error) {
    logger.error("CStone import failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  return stats
}

/**
 * Imports component attributes from UEX Corp Space API
 * Updates game_items records by matching item names
 * 
 * @returns Import statistics
 */
export async function importFromUEX(): Promise<ImportStats> {
  const stats: ImportStats = {
    totalProcessed: 0,
    successfulUpdates: 0,
    failedUpdates: 0,
    skipped: 0,
    errors: [],
  }

  logger.info("Starting UEX import")

  try {
    const items = await fetchUEXItems()
    stats.totalProcessed = items.length

    const knex = getKnex()

    for (const item of items) {
      try {
        // Build update object with available attributes
        const updateData: Partial<{
          component_size: number
          manufacturer: string
          component_type: string
        }> = {}

        if (item.size !== undefined && item.size !== null) {
          updateData.component_size = item.size
        }

        if (item.company_name || item.manufacturer) {
          updateData.manufacturer = item.company_name || item.manufacturer
        }

        if (item.category || item.type) {
          updateData.component_type = item.category || item.type
        }

        // Only update if we have at least one attribute
        if (Object.keys(updateData).length === 0) {
          stats.skipped++
          continue
        }

        // Update game_items record by name
        const updateCount = await knex("game_items")
          .where({ name: item.name })
          .update(updateData)

        if (updateCount > 0) {
          stats.successfulUpdates++
          logger.debug("Updated game item from UEX", {
            name: item.name,
            attributes: updateData,
          })
        } else {
          stats.skipped++
          logger.debug("No matching game item found for UEX item", {
            name: item.name,
          })
        }
      } catch (error) {
        stats.failedUpdates++
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error"
        stats.errors.push({
          itemName: item.name,
          error: errorMessage,
        })
        logger.error("Failed to update game item from UEX", {
          name: item.name,
          error: errorMessage,
        })
      }
    }

    logger.info("UEX import completed", stats)
  } catch (error) {
    logger.error("UEX import failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  return stats
}
