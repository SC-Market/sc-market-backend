import { cdn } from "../../../../clients/cdn/cdn.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as serviceDb from "./database.js"
import { DBService } from "../../../../clients/database/db-models.js"
import logger from "../../../../logger/logger.js"

export async function createServicePhotos(
  service_id: string,
  photos: string[],
) {
  if (!photos || photos.length === 0) {
    return
  }

  for (const photo of photos) {
    if (!photo || typeof photo !== "string") {
      continue
    }

    try {
      const resource = await cdn.createExternalResource(
        photo,
        service_id + `_photo_${0}`,
      )

      await serviceDb.insertServiceImage({
        resource_id: resource.resource_id,
        service_id,
      })
    } catch (error) {
      logger.error(`Failed to create service photo for ${photo}`, {
        photo,
        error,
      })
      throw error
    }
  }
}

/**
 * Helper function to check if URL is from SC markets CDN
 * @param url - The URL to check
 * @returns boolean - True if the URL is from SC markets CDN
 */
export const isSCMarketsCDN = (url: string): boolean => {
  try {
    const urlObj = new URL(url)
    // Check if the URL matches the CDN pattern
    // This will need to be updated based on your actual CDN URL structure
    return (
      urlObj.hostname.includes("cdn") ||
      urlObj.hostname.includes("backblaze") ||
      urlObj.hostname.includes("b2") ||
      urlObj.hostname.includes("sc-market")
    )
  } catch {
    return false
  }
}

/**
 * Helper function to check if image is already associated with the service
 * @param imageUrl - The image URL to check
 * @param service - The service object
 * @returns Promise<boolean> - True if the image is already associated
 */
export const isImageAlreadyAssociated = async (
  imageUrl: string,
  service: DBService,
): Promise<boolean> => {
  try {
    // Get all images associated with this service
    const serviceImages = await serviceDb.getServiceListingImages({
      service_id: service.service_id,
    })

    // Check if any of the service images match the provided URL
    for (const image of serviceImages) {
      try {
        const resolvedUrl = await cdn.getFileLinkResource(image.resource_id)
        if (resolvedUrl === imageUrl) {
          return true
        }
      } catch {
        // Skip if we can't resolve the URL
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Validates photos for services, ensuring CDN images are already associated
 * @param photos - Array of photo URLs to validate
 * @param service - The service object (for existing services)
 * @returns Promise<{valid: boolean, error?: string}> - Validation result
 */
export const validateServicePhotos = async (
  photos: string[],
  service?: DBService,
): Promise<{ valid: boolean; error?: string }> => {
  for (const photo of photos) {
    // Check if this is a SC markets CDN URL
    if (isSCMarketsCDN(photo)) {
      // If we have a service, check if the image is already associated
      if (service) {
        const isAssociated = await isImageAlreadyAssociated(photo, service)
        if (!isAssociated) {
          return {
            valid: false,
            error:
              "Cannot use image from SC markets CDN that is not already associated with this service",
          }
        }
      } else {
        // For new services, CDN images are not allowed
        return {
          valid: false,
          error:
            "Cannot use images from SC markets CDN when creating new services",
        }
      }
    }
  }

  return { valid: true }
}
