import {
  getSpectrumUserId,
  fetchSpectrumMemberByHandle,
  SpectrumAPIError,
} from "../../../../clients/spectrum/index.js"
import logger from "../../../../logger/logger.js"

/**
 * Utility functions for working with the Spectrum API
 */

/**
 * Get a user's Spectrum ID from their RSI handle
 * This is the main function you requested - it fetches a user's Spectrum user ID by RSI handle
 *
 * @param handle - The RSI handle (nickname) to look up
 * @returns Promise<string | null> - The Spectrum user ID if found, null otherwise
 *
 * @example
 * ```typescript
 * const spectrumId = await getSpectrumUserIdByHandle("Khuzdul")
 * if (spectrumId) {
 *   console.log(`User found with Spectrum ID: ${spectrumId}`)
 * } else {
 *   console.log("User not found")
 * }
 * ```
 */
export async function getSpectrumUserIdByHandle(
  handle: string,
): Promise<string | null> {
  try {
    logger.debug(`Looking up Spectrum user ID for handle: ${handle}`)
    const spectrumId = await getSpectrumUserId(handle)

    if (spectrumId) {
      logger.debug(
        `Successfully found Spectrum user ID ${spectrumId} for handle ${handle}`,
      )
    } else {
      logger.debug(`No Spectrum user found for handle ${handle}`)
    }

    return spectrumId
  } catch (error) {
    if (error instanceof SpectrumAPIError) {
      logger.debug(
        `Spectrum API error looking up handle ${handle}: ${error.message}`,
      )
    } else {
      logger.debug(`Unexpected error looking up handle ${handle}: ${error}`)
    }
    return null
  }
}

/**
 * Get detailed member information from an RSI handle
 *
 * @param handle - The RSI handle (nickname) to look up
 * @returns Promise<object | null> - The member information if found, null otherwise
 */
export async function getSpectrumMemberInfo(
  handle: string,
): Promise<any | null> {
  try {
    logger.debug(`Fetching detailed member info for handle: ${handle}`)
    const memberInfo = await fetchSpectrumMemberByHandle(handle)

    if (memberInfo.success && memberInfo.data) {
      logger.debug(`Successfully fetched member info for handle ${handle}`)
      return memberInfo.data
    } else {
      logger.debug(`Failed to fetch member info for handle ${handle}`)
      return null
    }
  } catch (error) {
    if (error instanceof SpectrumAPIError) {
      logger.debug(
        `Spectrum API error fetching member info for handle ${handle}: ${error.message}`,
      )
    } else {
      logger.debug(
        `Unexpected error fetching member info for handle ${handle}: ${error}`,
      )
    }
    return null
  }
}

/**
 * Batch lookup multiple RSI handles to get their Spectrum IDs
 *
 * @param handles - Array of RSI handles to look up
 * @returns Promise<Record<string, string | null>> - Object mapping handles to Spectrum IDs
 *
 * @example
 * ```typescript
 * const results = await batchGetSpectrumUserIds(["Khuzdul", "Nobody", "TestUser"])
 * // Returns: { "Khuzdul": "12345", "Nobody": "67890", "TestUser": null }
 * ```
 */
export async function batchGetSpectrumUserIds(
  handles: string[],
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {}

  logger.debug(`Starting batch lookup for ${handles.length} handles`)

  // Process handles in parallel with a small delay to avoid overwhelming the API
  const promises = handles.map(async (handle, index) => {
    // Add a small delay between requests to be respectful to the API
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const spectrumId = await getSpectrumUserIdByHandle(handle)
    results[handle] = spectrumId
  })

  await Promise.all(promises)

  logger.debug(`Completed batch lookup for ${handles.length} handles`)
  return results
}

/**
 * Validate if an RSI handle exists in Spectrum
 *
 * @param handle - The RSI handle to validate
 * @returns Promise<boolean> - True if the handle exists, false otherwise
 */
export async function validateSpectrumHandle(handle: string): Promise<boolean> {
  try {
    const spectrumId = await getSpectrumUserId(handle)
    return spectrumId !== null
  } catch (error) {
    logger.debug(`Error validating handle ${handle}: ${error}`)
    return false
  }
}
