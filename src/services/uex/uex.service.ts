/**
 * UEX Corp API Service
 * Handles all interactions with the UEX Corp API
 * @see https://api.uexcorp.uk/2.0/commodities
 */

import logger from "../../logger/logger.js"
import { UEXCommodity } from "./uex.service.types.js"

const UEX_BASE_URL = "https://api.uexcorp.uk/2.0"
const UEX_COMMODITIES_ENDPOINT = `${UEX_BASE_URL}/commodities`

/**
 * Fetches all commodities from the UEX API
 * @returns Array of UEX commodities
 * @throws Error if the API request fails or response is invalid
 */
export async function fetchCommodities(): Promise<UEXCommodity[]> {
  logger.debug("Starting commodity fetch from UEX API", {
    endpoint: UEX_COMMODITIES_ENDPOINT,
    timestamp: new Date().toISOString(),
  })

  let response: Response
  try {
    response = await fetch(UEX_COMMODITIES_ENDPOINT, {
      headers: {
        accept: "application/json",
      },
    })
  } catch (error) {
    logger.error("Network error during UEX commodity fetch", {
      endpoint: UEX_COMMODITIES_ENDPOINT,
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
      headers: Object.fromEntries(response.headers.entries()),
    }

    // Try to get response body for more details
    let responseBody: string | undefined
    try {
      responseBody = await response.text()
      logger.error("UEX API HTTP error response body", {
        ...errorDetails,
        responseBody: responseBody.substring(0, 1000), // Limit to first 1000 chars
      })
    } catch (bodyError) {
      logger.error("Failed to read UEX API error response body", {
        ...errorDetails,
        bodyError:
          bodyError instanceof Error ? bodyError.message : "Unknown error",
      })
    }

    throw new Error(
      `UEX API error! status: ${response.status} - ${response.statusText}`,
    )
  }

  let data: UEXCommodity[]
  try {
    const responseText = await response.text()
    logger.debug("UEX API response received", {
      contentLength: responseText.length,
      contentPreview: responseText.substring(0, 200), // First 200 chars for debugging
    })

    data = JSON.parse(responseText) as UEXCommodity[]
    logger.debug("UEX API JSON parsing successful", {
      dataLength: data?.length || 0,
      hasValidStructure: Array.isArray(data),
    })
  } catch (error) {
    logger.error("Failed to parse UEX API JSON response", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }

  // Validate the response structure
  if (!Array.isArray(data)) {
    logger.error("Invalid UEX API response structure", {
      dataType: typeof data,
      isArray: Array.isArray(data),
      responseKeys: data && typeof data === "object" ? Object.keys(data) : [],
    })
    throw new Error(
      "Invalid UEX API response structure: expected array of commodities",
    )
  }

  logger.debug("UEX commodity fetch completed successfully", {
    totalCommodities: data.length,
  })

  return data
}
