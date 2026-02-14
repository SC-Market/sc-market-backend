import AsyncLock from "async-lock"
import { NextFunction, Request, Response } from "express"
import {
  createErrorResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { User } from "../api-models.js"
import {
  DBAggregateListingComplete,
  DBContractor,
  DBMarketListing,
  DBMultipleListingCompositeComplete,
  DBUniqueListingComplete,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import * as contractorDb from "../contractors/database.js"
import * as marketDb from "./database.js"
import * as profileDb from "../profiles/database.js"
import { formatListingComplete } from "../util/formatting.js"
import {
  MarketSearchQuery,
  MarketSearchQueryArguments,
  AttributeFilter,
  sortingMethods,
} from "./types.js"
import { has_permission } from "../util/permissions.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import logger from "../../../../logger/logger.js"

const userListingLock = new AsyncLock()
const contractorListingLock = new AsyncLock()

export async function lockUserMarket(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user as User
  await userListingLock.acquire(user.user_id, next)
}

export async function lockContractorMarket(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const spectrum_id = req.params["spectrum_id"]
  await contractorListingLock.acquire(spectrum_id, next)
}

export function sameSeller(listings: DBMarketListing[]) {
  if (!listings.length) {
    return true
  }
  const user_seller = listings[0].user_seller_id
  const contractor_seller = listings[0].contractor_seller_id

  for (const listing of listings) {
    if (user_seller && listing.user_seller_id !== user_seller) {
      return false
    }
    if (
      contractor_seller &&
      listing.contractor_seller_id !== contractor_seller
    ) {
      return false
    }
  }

  return true
}

export async function verify_listings(
  res: Response,
  items: { listing_id: string; quantity: number }[],
  user: User,
) {
  const listings: {
    listing:
      | DBAggregateListingComplete
      | DBUniqueListingComplete
      | DBMultipleListingCompositeComplete
    quantity: number
  }[] = []
  const contractorCache = new Map<string, DBContractor>()

  for (const { listing_id, quantity } of items) {
    let listing
    try {
      listing = await marketDb.getMarketListingComplete(listing_id)
    } catch {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid listing"),
        )
      return
    }

    if (!listing) {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid listing"),
        )
      return
    }

    if (listing.listing.status !== "active") {
      res
        .status(404)
        .json(createErrorResponse(ErrorCode.NOT_FOUND, "Invalid listing"))
      return
    }

    if (listing.listing.quantity_available < quantity || quantity < 1) {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid quantity"),
        )
      return
    }

    if (listing.listing.user_seller_id === user.user_id) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "You cannot buy your own item!",
          ),
        )
      return
    }

    if (listing.listing.contractor_seller_id) {
      const contractorId = listing.listing.contractor_seller_id
      let contractor = contractorCache.get(contractorId)
      if (!contractor) {
        const fetchedContractor = await contractorDb.getContractor({
          contractor_id: contractorId,
        })
        if (fetchedContractor) {
          contractor = fetchedContractor
          contractorCache.set(contractorId, contractor)
        } else {
          return null
        }
      }

      if (contractor && contractor.archived) {
        res
          .status(409)
          .json(
            createErrorResponse(
              ErrorCode.CONFLICT,
              "Cannot purchase from an archived organization",
            ),
          )
        return
      }
    }

    listings.push({ quantity, listing })
  }

  if (!sameSeller(listings.map((u) => u.listing.listing))) {
    res
      .status(400)
      .json(
        createErrorResponse({ message: "All items must be from same seller" }),
      )
    return
  }

  return listings
}

export async function get_my_listings(user: User) {
  const listings = await marketDb.getMarketUniqueListingsComplete({
    user_seller_id: user.user_id,
  })
  const multiples = await marketDb.getMarketMultiplesComplete(
    {
      "market_multiples.user_seller_id": user.user_id,
    },
    {},
  )

  const multiple_listings = await marketDb.getMarketMultipleListingsComplete({
    "market_multiples.user_seller_id": user.user_id,
  })

  return await Promise.all(
    [...listings, ...multiples, ...multiple_listings].map((l) =>
      formatListingComplete(l, true),
    ),
  )
}

export async function convertQuery(
  query: Partial<MarketSearchQueryArguments>,
): Promise<MarketSearchQuery> {
  let sorting = (query.sort || "timestamp").toLowerCase()
  if (sorting === "date-old") {
    sorting = "timestamp"
  }

  if (sorting === "date-new") {
    sorting = "timestamp-reverse"
  }

  if (sorting === "rating") {
    sorting = "total_rating"
  }

  if (sorting === "title") {
    sorting = "title-reverse"
  }

  if (sorting === "price-low") {
    sorting = "minimum_price-reverse"
  }

  if (sorting === "price-high") {
    sorting = "minimum_price"
  }

  if (sorting === "quantity-low") {
    sorting = "quantity_available-reverse"
  }

  if (sorting === "quantity-high") {
    sorting = "quantity_available"
  }

  if (sorting === "activity") {
    sorting = "expiration"
  }

  const reverseSort = sorting.endsWith("-reverse")
  if (reverseSort) {
    sorting = sorting.slice(0, sorting.length - "-reverse".length)
  }

  if (sortingMethods.indexOf(sorting) === -1) {
    sorting = "timestamp"
  }

  let user_seller_id = undefined
  let contractor_seller_id = undefined

  if (query.user_seller) {
    const user = await profileDb.getUser({ username: query.user_seller })
    user_seller_id = user.user_id
  }

  if (query.contractor_seller) {
    const contractor = await contractorDb.getContractor({
      spectrum_id: query.contractor_seller,
    })
    contractor_seller_id = contractor.contractor_id
  }

  const searchQuery = (query.query || "").toLowerCase()
  const seller_rating = +(query.seller_rating || 0)
  const page_size = Math.max(Math.min(+(query.page_size || 16), 96), 12)
  const language_codes = query.language_codes
    ? query.language_codes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null

  // Parse attribute filters from query string
  // Format: ?attr_size=4,5&attr_class=Military
  let attributes: AttributeFilter[] | null = null
  const attributeFilters: AttributeFilter[] = []

  console.log(
    "[CONVERT QUERY] Raw query params:",
    JSON.stringify(query, null, 2),
  )

  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("attr_") && typeof value === "string") {
      const attrName = key.substring(5) // Remove 'attr_' prefix
      const values = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)

      console.log(
        "[CONVERT QUERY] Found attr:",
        key,
        "=",
        value,
        "parsed:",
        values,
      )

      if (values.length > 0) {
        attributeFilters.push({
          name: attrName,
          values,
          operator: "in" as const,
        })
      }
    }
  }

  if (attributeFilters.length > 0) {
    attributes = attributeFilters
  }

  console.log(
    "[CONVERT QUERY] Final attributes:",
    JSON.stringify(attributes, null, 2),
  )

  return {
    sale_type: query.sale_type || null,
    maxCost: query.maxCost && query.maxCost !== "null" ? +query.maxCost : null,
    minCost: +(query.minCost || 0),
    quantityAvailable: +(query.quantityAvailable || 0),
    item_type: query.item_type || null,
    index: +(query.index || 0),
    rating: +(query.rating || 0),
    reverseSort,
    sort: sorting,
    query: searchQuery,
    seller_rating,
    page_size: page_size,
    user_seller_id,
    contractor_seller_id,
    listing_type: query.listing_type || null,
    statuses: query.statuses
      ? query.statuses.split(",").map((s) => s.trim())
      : ["active"], // Default to active only
    language_codes:
      language_codes && language_codes.length > 0 ? language_codes : null,
    attributes,
  }
}

export async function get_org_listings(contractor: DBContractor) {
  const listings = await marketDb.getMarketUniqueListingsComplete({
    contractor_seller_id: contractor.contractor_id,
  })
  const multiples = await marketDb.getMarketMultiplesComplete(
    {
      "market_multiples.contractor_seller_id": contractor.contractor_id,
    },
    {},
  )
  const multiple_listings = await marketDb.getMarketMultipleListingsComplete({
    "market_multiples.contractor_seller_id": contractor.contractor_id,
  })

  return await Promise.all(
    [...listings, ...multiples, ...multiple_listings].map((l) =>
      formatListingComplete(l, true),
    ),
  )
}

export function formatListingSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "")
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
 * Helper function to check if image is already associated with the listing
 * @param imageUrl - The image URL to check
 * @param listing - The market listing object
 * @returns Promise<boolean> - True if the image is already associated
 */
export const isImageAlreadyAssociated = async (
  imageUrl: string,
  listing: DBMarketListing,
): Promise<boolean> => {
  try {
    // Get all current images for this listing
    const currentImages =
      await marketDb.getMarketListingImagesByListingID(listing)

    // Check if any of the current images match this URL
    for (const image of currentImages) {
      const resolvedUrl = await cdn.getFileLinkResource(image.resource_id)
      if (resolvedUrl === imageUrl) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Validates photos for market listings, ensuring CDN images are already associated
 * @param photos - Array of photo URLs to validate
 * @param listing - The market listing object (for existing listings)
 * @returns Promise<{valid: boolean, error?: string}> - Validation result
 */
export const validateMarketListingPhotos = async (
  photos: string[],
  listing?: DBMarketListing,
): Promise<{ valid: boolean; error?: string }> => {
  for (const photo of photos) {
    // Check if this is a SC markets CDN URL
    if (isSCMarketsCDN(photo)) {
      // If we have a listing, check if the image is already associated
      if (listing) {
        const isAssociated = await isImageAlreadyAssociated(photo, listing)
        if (!isAssociated) {
          return {
            valid: false,
            error:
              "Cannot use image from SC markets CDN that is not already associated with this listing",
          }
        }
      } else {
        // For new listings, CDN images are not allowed
        return {
          valid: false,
          error:
            "Cannot use images from SC markets CDN when creating new listings",
        }
      }
    }
  }

  return { valid: true }
}
