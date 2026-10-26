/**
 * Stock Lot API Controllers
 *
 * Handles HTTP requests for stock lot management endpoints
 */

import { RequestHandler } from "express"
import { createErrorResponse, createResponse } from "../util/response.js"
import { User } from "../api-models.js"
import { StockLotService } from "../../../../services/stock-lot/stock-lot.service.js"
import { LocationService } from "../../../../services/location/location.service.js"
import { AllocationService } from "../../../../services/allocation/allocation.service.js"
import {
  OverAllocationError,
  CharacterLimitError,
} from "../../../../services/stock-lot/errors.js"
import logger from "../../../../logger/logger.js"
import * as marketDb from "./database.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { formatUniqueListingComplete } from "../util/formatting.js"
import type { FormattedUniqueListing } from "../market/types.js"
import { cdn } from "../../../../clients/cdn/cdn.js"

const stockLotService = new StockLotService()
const locationService = new LocationService()
const allocationService = new AllocationService()
const knex = getKnex()

/**
 * Helper function to format owner details with avatar URL
 */
async function formatOwnerDetails(ownerData: {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
}) {
  return {
    user_id: ownerData.user_id,
    username: ownerData.username,
    display_name: ownerData.display_name,
    avatar: ownerData.avatar
      ? await cdn.getFileLinkResource(ownerData.avatar)
      : null,
  }
}

/**
 * GET /api/v1/market/listings/:listingId/lots
 * List all lots for a listing with optional filters
 * Requirements: 2.1, 3.3, 3.4, 4.4, 9.5
 */
export const getListingLots: RequestHandler = async (req, res) => {
  try {
    const { listing_id } = req.params
    const { location_id, owner_id, listed } = req.query
    const db = getKnex()

    // Try V1 stock_lots first
    let query = db("stock_lots as sl")
      .leftJoin("accounts as acc", "sl.owner_id", "acc.user_id")
      .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
      .where("sl.listing_id", listing_id)
      .select(
        "sl.*",
        "acc.user_id as owner_user_id",
        "acc.username as owner_username",
        "acc.display_name as owner_display_name",
        "acc.avatar as owner_avatar",
        "loc.location_id as location_location_id",
        "loc.name as location_name",
      )

    if (location_id) query = query.where("sl.location_id", location_id as string)
    if (owner_id) query = query.where("sl.owner_id", owner_id as string)
    if (listed !== undefined) query = query.where("sl.listed", listed === "true")

    let lotsWithOwner = await query.orderBy("sl.created_at", "asc")

    // If no V1 lots, try V2 listing_item_lots
    if (lotsWithOwner.length === 0) {
      let v2Query = db("listing_item_lots as sl")
        .join("listing_items as li", "sl.item_id", "li.item_id")
        .leftJoin("item_variants as iv", "sl.variant_id", "iv.variant_id")
        .leftJoin("accounts as acc", "sl.owner_id", "acc.user_id")
        .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
        .where("li.listing_id", listing_id)
        .select(
          "sl.lot_id",
          db.raw("? as listing_id", [listing_id]),
          "sl.location_id",
          "sl.owner_id",
          "sl.quantity_total",
          "sl.listed",
          "sl.created_at",
          "sl.updated_at",
          "sl.variant_id",
          "iv.attributes as variant_attributes",
          "iv.display_name as variant_display_name",
          "acc.user_id as owner_user_id",
          "acc.username as owner_username",
          "acc.display_name as owner_display_name",
          "acc.avatar as owner_avatar",
          "loc.location_id as location_location_id",
          "loc.name as location_name",
        )

      if (location_id) v2Query = v2Query.where("sl.location_id", location_id as string)
      if (owner_id) v2Query = v2Query.where("sl.owner_id", owner_id as string)
      if (listed !== undefined) v2Query = v2Query.where("sl.listed", listed === "true")

      lotsWithOwner = await v2Query.orderBy("sl.created_at", "asc")
    }

    // Enrich with allocation info
    const lotsWithAllocations = await Promise.all(
      lotsWithOwner.map(async (lot) => {
        const allocations = await knex("stock_allocations")
          .where({ lot_id: lot.lot_id, status: "active" })
          .select("allocation_id", "order_id", "quantity")

        const totalAllocated = allocations.reduce(
          (sum, a) => sum + a.quantity,
          0,
        )

        return {
          lot_id: lot.lot_id,
          listing_id: lot.listing_id,
          location_id: lot.location_id,
          owner_id: lot.owner_id,
          quantity_total: lot.quantity_total,
          listed: lot.listed,
          created_at: lot.created_at,
          updated_at: lot.updated_at,
          location: lot.location_location_id
            ? {
                location_id: lot.location_location_id,
                name: lot.location_name,
              }
            : null,
          owner: lot.owner_user_id
            ? await formatOwnerDetails({
                user_id: lot.owner_user_id,
                username: lot.owner_username,
                display_name: lot.owner_display_name,
                avatar: lot.owner_avatar,
              })
            : null,
          is_allocated: allocations.length > 0,
          allocated_quantity: totalAllocated,
          variant: lot.variant_id ? {
            variant_id: lot.variant_id,
            attributes: lot.variant_attributes || {},
            display_name: lot.variant_display_name || "Standard",
          } : null,
          allocations: allocations.map((a) => ({
            allocation_id: a.allocation_id,
            order_id: a.order_id,
            quantity: a.quantity,
          })),
        }
      }),
    )

    // Enrich with listing data — try V2 first, fall back to V1
    let listing: { title: string; listing_id: string; photos?: string[] } | FormattedUniqueListing | null = null
    const v2Listing = await getKnex()("listings").where({ listing_id }).first()
    if (v2Listing) {
      const photo = await getKnex()("listing_photos_v2 as lp")
        .join("image_resources as ir", "lp.resource_id", "ir.resource_id")
        .where("lp.listing_id", listing_id)
        .orderBy("lp.display_order", "asc")
        .select(getKnex().raw("COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) as url"))
        .first()
      listing = { title: v2Listing.title, listing_id, photos: photo ? [photo.url] : [] }
    } else {
      try {
        const listingComplete = await marketDb.getMarketUniqueListingComplete(listing_id)
        listing = await formatUniqueListingComplete(listingComplete)
      } catch { /* V1 listing not found */ }
    }

    // Get aggregates — try V1 stock_lots first, fall back to V2 listing_item_lots
    let total = await stockLotService.getTotalStock(listing_id)
    let available = await stockLotService.getAvailableStock(listing_id)
    let reserved = await stockLotService.getReservedStock(listing_id)

    if (total === 0 && lotsWithAllocations.length > 0) {
      // V2 lots — compute aggregates from the lots we already fetched
      total = lotsWithAllocations.reduce((s, l) => s + l.quantity_total, 0)
      const totalAllocated = lotsWithAllocations.reduce((s, l) => s + l.allocated_quantity, 0)
      available = total - totalAllocated
      reserved = totalAllocated
    }

    res.json(
      createResponse({
        lots: lotsWithAllocations,
        listing,
        aggregates: {
          total,
          available,
          reserved,
        },
      }),
    )
  } catch (error) {
    logger.error("Error fetching listing lots", { error })
    res.status(500).json(
      createErrorResponse({
        message: "Failed to fetch lots",
      }),
    )
  }
}

/**
 * GET /api/v1/market/locations
 * Search and list locations
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */
export const getLocations: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User | undefined
    const { search } = req.query

    let locations
    if (search) {
      // Search with user context if authenticated
      locations = await locationService.searchLocations(
        search as string,
        user?.user_id,
      )
    } else {
      // Get all preset locations + user's custom locations
      const presetLocations = await locationService.getPresetLocations()
      const userLocations = user
        ? await locationService.getUserLocations(user.user_id)
        : []

      locations = [...presetLocations, ...userLocations]
    }

    res.json(createResponse({ locations }))
  } catch (error) {
    logger.error("Error fetching locations", { error })
    res.status(500).json(
      createErrorResponse({
        message: "Failed to fetch locations",
      }),
    )
  }
}

/**
 * POST /api/v1/market/locations
 * Create a custom location
 * Requirements: 15.6
 */
export const createLocation: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const { name } = req.body

    // Validate name
    if (!name || typeof name !== "string") {
      res.status(400).json(
        createErrorResponse({
          message: "Name is required",
        }),
      )
      return
    }

    if (name.length > 255) {
      res.status(400).json(
        createErrorResponse({
          message: "Name must be 255 characters or less",
          code: "CHARACTER_LIMIT_EXCEEDED",
          details: {
            field: "name",
            currentLength: name.length,
            maxLength: 255,
          },
        }),
      )
      return
    }

    // Create custom location
    const location = await locationService.createCustomLocation(
      name,
      user.user_id,
    )

    res.status(201).json(createResponse({ location }))
  } catch (error) {
    logger.error("Error creating location", { error })

    if (error instanceof CharacterLimitError) {
      res.status(400).json(
        createErrorResponse({
          message: error.message,
          code: error.code,
          details: error.toJSON(),
        }),
      )
      return
    }

    res.status(500).json(
      createErrorResponse({
        message: "Failed to create location",
      }),
    )
  }
}

/**
 * GET /api/v1/orders/:orderId/allocations
 * Get allocations for an order
 * Requirements: 5.3, 7.1
 */
export const getOrderAllocations: RequestHandler = async (req, res) => {
  try {
    const { order_id } = req.params

    // Get order
    const order = await getKnex()("orders")
      .where({ order_id })
      .first()

    if (!order) {
      return res.status(404).json(
        createErrorResponse({
          message: "Order not found",
        }),
      )
    }

    // Get listing IDs from V1 market_orders and V2 order_market_items_v2
    const v1MarketOrders = await getKnex()("market_orders").where({ order_id }).select("listing_id")
    const v2OrderItems = await getKnex()("order_market_items_v2").where({ order_id }).select("listing_id")
    const orderListingIds = [...new Set([
      ...v1MarketOrders.map((mo: { listing_id: string }) => mo.listing_id),
      ...v2OrderItems.map((oi: { listing_id: string }) => oi.listing_id),
    ])]

    // Get allocations
    const allocations = await allocationService.getAllocations(order_id)

    // Enrich with lot and location details
    const enrichedAllocations = await Promise.all(
      allocations.map(async (alloc) => {
        const lot = await stockLotService.getLotById(alloc.lot_id)
        let location = null
        if (lot?.location_id) {
          location = await locationService.getLocationById(lot.location_id)
        }
        
        // Get owner details if owner_id exists
        let owner = null
        if (lot?.owner_id) {
          const ownerData = await getKnex()("accounts")
            .where({ user_id: lot.owner_id })
            .select("user_id", "username", "display_name", "avatar")
            .first()
          if (ownerData) {
            owner = await formatOwnerDetails(ownerData)
          }
        }
        
        return {
          ...alloc,
          listing_id: lot?.listing_id || null,
          lot: lot
            ? {
                lot_id: lot.lot_id,
                listing_id: lot.listing_id,
                location_id: lot.location_id,
                quantity_total: lot.quantity_total,
                listed: lot.listed,
                created_at: lot.created_at,
                updated_at: lot.updated_at,
                location,
                owner,
              }
            : null,
        }
      }),
    )

    // Group by listing and fetch listing details
    const byListing = new Map<string, typeof enrichedAllocations>()
    enrichedAllocations.forEach((alloc) => {
      if (alloc.listing_id) {
        const existing = byListing.get(alloc.listing_id) || []
        byListing.set(alloc.listing_id, [...existing, alloc])
      }
    })

    // Fetch listing details for each group
    const groupedAllocations = await Promise.all(
      orderListingIds.map(async (listing_id) => {
        // Try V2 listing first, fall back to V1
        let listing: { title: string; listing_id: string; photos?: string[] } | FormattedUniqueListing | null = null
        const v2Listing = await getKnex()("listings").where({ listing_id }).first()
        if (v2Listing) {
          const photo = await getKnex()("listing_photos_v2 as lp")
            .join("image_resources as ir", "lp.resource_id", "ir.resource_id")
            .where("lp.listing_id", listing_id)
            .orderBy("lp.display_order", "asc")
            .select(getKnex().raw("COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) as url"))
            .first()
          listing = { title: v2Listing.title, listing_id, photos: photo ? [photo.url] : [] }
        } else {
          try {
            const listingComplete = await marketDb.getMarketUniqueListingComplete(listing_id)
            listing = await formatUniqueListingComplete(listingComplete)
          } catch { /* V1 listing not found */ }
        }

        // Get allocations for this listing
        const allocs = byListing.get(listing_id) || []

        // Combine allocations for the same lot
        const combinedByLot = new Map<string, typeof allocs[0]>()
        allocs.forEach((alloc) => {
          const existing = combinedByLot.get(alloc.lot_id)
          if (existing) {
            existing.quantity += alloc.quantity
          } else {
            combinedByLot.set(alloc.lot_id, { ...alloc })
          }
        })

        const combinedAllocs = Array.from(combinedByLot.values())
        const totalAllocated = combinedAllocs.reduce(
          (sum, a) => sum + a.quantity,
          0,
        )
        return {
          listing_id,
          listing,
          allocations: combinedAllocs,
          total_allocated: totalAllocated,
        }
      }),
    )

    // Calculate total allocated across all listings
    const totalAllocated = allocations.reduce(
      (sum, alloc) => sum + alloc.quantity,
      0,
    )

    res.json(
      createResponse({
        grouped_allocations: groupedAllocations,
        total_allocated: totalAllocated,
      }),
    )
  } catch (error) {
    logger.error("Error fetching order allocations", { error })
    res.status(500).json(
      createErrorResponse({
        message: "Failed to fetch allocations",
      }),
    )
  }
}

/**
 * POST /api/v1/orders/:orderId/allocations/manual
 * Manually allocate stock to an order
 * Requirements: 7.1, 7.2
 */
export const manualAllocateOrder: RequestHandler = async (req, res) => {
  try {
    const { order_id } = req.params
    const { allocations } = req.body as {
      allocations: Array<{ lot_id: string; quantity: number }>
    }

    // Validate input
    if (!Array.isArray(allocations) || allocations.length === 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Allocations array is required",
        }),
      )
      return
    }

    // Validate each allocation
    for (const alloc of allocations) {
      if (!alloc.lot_id || typeof alloc.quantity !== "number") {
        res.status(400).json(
          createErrorResponse({
            message: "Each allocation must have a valid lot_id and quantity",
          }),
        )
        return
      }
    }

    // Perform manual allocation
    const result = await allocationService.manualAllocate(order_id, allocations)

    res.json(createResponse({ allocations: result }))
  } catch (error) {
    logger.error("Error manually allocating order", { error })

    if (error instanceof Error) {
      if (
        error.message.includes("Insufficient") ||
        error.message.includes("available")
      ) {
        res.status(400).json(
          createErrorResponse({
            message: error.message,
          }),
        )
        return
      }
    }

    res.status(500).json(
      createErrorResponse({
        message: "Failed to allocate stock",
      }),
    )
  }
}
