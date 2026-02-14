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
  InsufficientStockError,
  InvalidQuantityError,
  OverAllocationError,
  CharacterLimitError,
  ConcurrentModificationError,
} from "../../../../services/stock-lot/errors.js"
import logger from "../../../../logger/logger.js"
import * as marketDb from "./database.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { formatUniqueListingComplete } from "../util/formatting.js"
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
 * PUT /api/v1/market/listings/:listingId/stock
 * Simple stock management endpoint
 * Requirements: 1.1, 1.5, 5.1
 */
export const updateSimpleStock: RequestHandler = async (req, res) => {
  try {
    const { listing_id } = req.params
    const { quantity: rawQuantity } = req.body as { quantity: number | string }

    // Coerce to number and validate
    const quantity = Number(rawQuantity)
    if (isNaN(quantity) || quantity < 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Quantity must be a non-negative number",
        }),
      )
      return
    }

    // Update stock using simple interface
    await stockLotService.updateSimpleStock(listing_id, quantity)

    // Get aggregated stock info
    const available = await stockLotService.getAvailableStock(listing_id)
    const reserved = await stockLotService.getReservedStock(listing_id)

    res.json(
      createResponse({
        quantity_available: available,
        quantity_reserved: reserved,
      }),
    )
  } catch (error) {
    logger.error("Error updating simple stock", { error })

    if (error instanceof InvalidQuantityError) {
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
        message: "Failed to update stock",
      }),
    )
  }
}

/**
 * GET /api/market/lots
 * Search all lots with filters and pagination
 */
export const searchLots: RequestHandler = async (req, res) => {
  try {
    const {
      username,
      contractor_spectrum_id,
      location_id,
      listed,
      search,
      status,
      min_quantity,
      max_quantity,
      page_size = 100,
      offset = 0,
    } = req.query

    const user = req.user as User

    // Build filters
    const filters: any = {}

    // Handle username parameter
    if (username) {
      const account = await knex("accounts")
        .where("username", username as string)
        .first("user_id")
      
      if (account) {
        filters.owner_id = account.user_id
      } else {
        res.status(404).json(
          createErrorResponse({
            message: "User not found",
          }),
        )
        return
      }
    } else if (!contractor_spectrum_id) {
      // Default to current user if no username or contractor specified
      filters.owner_id = user.user_id
    }

    if (location_id) filters.location_id = location_id as string
    if (listed !== undefined) filters.listed = listed === "true"

    // Get lots
    let lots = await stockLotService.getLots(filters)

    // Filter by contractor if provided
    if (
      contractor_spectrum_id &&
      req.contractors?.has("contractor_spectrum_id")
    ) {
      const contractor = req.contractors.get("contractor_spectrum_id")!
      if (lots.length > 0) {
        // Get all contractor listings
        const listings = await knex("market_listings")
          .where("contractor_seller_id", contractor.contractor_id)
          .select("listing_id")

        const contractorListingIds = new Set(
          listings.map((l: { listing_id: string }) => l.listing_id),
        )
        lots = lots.filter((lot) => contractorListingIds.has(lot.listing_id))
      }
    }

    // Apply quantity filters
    if (min_quantity) {
      const minQty = parseInt(min_quantity as string, 10)
      if (!isNaN(minQty)) {
        lots = lots.filter((lot) => lot.quantity_total >= minQty)
      }
    }
    if (max_quantity) {
      const maxQty = parseInt(max_quantity as string, 10)
      if (!isNaN(maxQty)) {
        lots = lots.filter((lot) => lot.quantity_total <= maxQty)
      }
    }

    // Enrich with allocation info and owner details
    const lotsWithAllocations = await Promise.all(
      lots.map(async (lot) => {
        const allocations = await knex("stock_allocations")
          .where({ lot_id: lot.lot_id, status: "active" })
          .select("allocation_id", "order_id", "quantity")

        const totalAllocated = allocations.reduce(
          (sum, a) => sum + a.quantity,
          0,
        )

        // Get owner details
        let owner = null
        if (lot.owner_id) {
          const ownerData = await knex("accounts")
            .where({ user_id: lot.owner_id })
            .select("user_id", "username", "display_name", "avatar")
            .first()
          if (ownerData) {
            owner = await formatOwnerDetails(ownerData)
          }
        }

        return {
          lot_id: lot.lot_id,
          listing_id: lot.listing_id,
          location_id: lot.location_id,
          quantity_total: lot.quantity_total,
          listed: lot.listed,
          notes: lot.notes,
          created_at: lot.created_at,
          updated_at: lot.updated_at,
          owner,
          is_allocated: allocations.length > 0,
          allocated_quantity: totalAllocated,
          allocations: allocations.map((a) => ({
            allocation_id: a.allocation_id,
            order_id: a.order_id,
            quantity: a.quantity,
          })),
        }
      }),
    )

    // Apply status filter
    let filteredLots = lotsWithAllocations
    if (status === "available") {
      filteredLots = lotsWithAllocations.filter((l) => !l.is_allocated)
    } else if (status === "allocated") {
      filteredLots = lotsWithAllocations.filter((l) => l.is_allocated)
    }

    // Apply search filter (notes, listing names, and usernames)
    if (search) {
      const searchLower = (search as string).toLowerCase()

      // Get listing titles for search
      const listingIds = [...new Set(filteredLots.map((l) => l.listing_id))]
      const listingTitles = await knex("market_listings")
        .join(
          "market_unique_listings",
          "market_listings.listing_id",
          "market_unique_listings.listing_id",
        )
        .join(
          "market_listing_details",
          "market_unique_listings.details_id",
          "market_listing_details.details_id",
        )
        .whereIn("market_listings.listing_id", listingIds)
        .select("market_listings.listing_id", "market_listing_details.title")

      const titleMap = new Map(
        listingTitles.map((l: { listing_id: string; title: string }) => [
          l.listing_id,
          l.title,
        ]),
      )

      filteredLots = filteredLots.filter((lot) => {
        const notesMatch = lot.notes?.toLowerCase().includes(searchLower)
        const titleMatch = titleMap
          .get(lot.listing_id)
          ?.toLowerCase()
          .includes(searchLower)
        const usernameMatch =
          lot.owner?.username?.toLowerCase().includes(searchLower)
        return notesMatch || titleMatch || usernameMatch
      })
    }

    // Paginate
    const total = filteredLots.length
    const paginatedLots = filteredLots.slice(
      Number(offset),
      Number(offset) + Number(page_size),
    )

    res.json(
      createResponse({
        lots: paginatedLots,
        total,
      }),
    )
  } catch (error) {
    logger.error("Error searching lots", { error })
    res.status(500).json(
      createErrorResponse({
        message: "Failed to search lots",
      }),
    )
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

    // Build base query with owner and location joins
    let query = knex("stock_lots as sl")
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

    const lotsWithOwner = await query.orderBy("sl.created_at", "asc")

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
          allocations: allocations.map((a) => ({
            allocation_id: a.allocation_id,
            order_id: a.order_id,
            quantity: a.quantity,
          })),
        }
      }),
    )

    // Enrich with listing data
    const listingComplete = await marketDb.getMarketUniqueListingComplete(
      listing_id,
    )
    const listing = await formatUniqueListingComplete(listingComplete)

    // Get aggregates
    const total = await stockLotService.getTotalStock(listing_id)
    const available = await stockLotService.getAvailableStock(listing_id)
    const reserved = await stockLotService.getReservedStock(listing_id)

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
 * POST /api/v1/market/listings/:listingId/lots
 * Create a new stock lot
 * Requirements: 2.2, 2.4, 3.1, 4.1, 8.1, 8.2
 */
export const createLot: RequestHandler = async (req, res) => {
  try {
    const { listing_id } = req.params
    const { quantity: rawQuantity, location_id, owner_username, listed, notes } = req.body

    // Coerce to number and validate
    const quantity = Number(rawQuantity)
    if (isNaN(quantity) || quantity < 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Quantity must be 0 or greater",
        }),
      )
      return
    }

    // Convert owner_username to owner_id if provided
    let owner_id = null
    if (owner_username && req.users?.has("owner_username")) {
      owner_id = req.users.get("owner_username")!.user_id
    }

    // Validate notes length
    if (notes && notes.length > 1000) {
      res.status(400).json(
        createErrorResponse({
          message: "Notes must be 1000 characters or less",
        }),
      )
      return
    }

    // Create lot
    const lot = await stockLotService.createLot({
      listing_id,
      quantity,
      location_id: location_id || null,
      owner_id: owner_id || null,
      listed: listed !== undefined ? listed : true,
      notes: notes || null,
    })

    res.status(201).json(createResponse({ lot }))
  } catch (error) {
    logger.error("Error creating lot", { error })

    if (error instanceof InvalidQuantityError) {
      res.status(400).json(
        createErrorResponse({
          message: error.message,
          code: error.code,
          details: error.toJSON(),
        }),
      )
      return
    }

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
        message: "Failed to create lot",
      }),
    )
  }
}

/**
 * PATCH /api/v1/market/lots/:lotId
 * Update an existing stock lot
 * Requirements: 2.4, 4.1, 8.5, 13.4
 */
export const updateLot: RequestHandler = async (req, res) => {
  try {
    const { lot_id } = req.params
    const updates = req.body

    // Validate and coerce quantity if provided
    if (updates.quantity !== undefined) {
      const quantity = Number(updates.quantity)
      if (isNaN(quantity) || quantity < 0) {
        res.status(400).json(
          createErrorResponse({
            message: "Quantity must be a non-negative number",
          }),
        )
        return
      }
      updates.quantity = quantity
    }

    // Validate notes length if provided
    if (updates.notes && updates.notes.length > 1000) {
      res.status(400).json(
        createErrorResponse({
          message: "Notes must be 1000 characters or less",
        }),
      )
      return
    }

    // Convert owner_username to owner_id if provided
    if (updates.owner_username !== undefined) {
      if (updates.owner_username === null) {
        updates.owner_id = null
      } else {
        const account = await knex("accounts")
          .where("username", updates.owner_username)
          .first("user_id")

        if (account) {
          updates.owner_id = account.user_id
        } else {
          res.status(400).json(
            createErrorResponse({
              message: "User not found",
            }),
          )
          return
        }
      }
      delete updates.owner_username
    }

    // Validate listing ownership if changing listing
    if (updates.listing_id) {
      const currentLot = await knex("stock_lots")
        .where({ lot_id })
        .first("listing_id")
      
      if (currentLot) {
        const currentListing = await knex("market_listings")
          .where({ listing_id: currentLot.listing_id })
          .first("user_seller_id", "contractor_seller_id")
        
        const newListing = await knex("market_listings")
          .where({ listing_id: updates.listing_id })
          .first("user_seller_id", "contractor_seller_id")
        
        if (!newListing) {
          res.status(404).json(
            createErrorResponse({
              message: "New listing not found",
            }),
          )
          return
        }

        // Check if ownership matches
        const sameOwner = 
          currentListing.user_seller_id === newListing.user_seller_id &&
          currentListing.contractor_seller_id === newListing.contractor_seller_id

        if (!sameOwner) {
          res.status(403).json(
            createErrorResponse({
              message: "Cannot change listing to one with a different owner",
            }),
          )
          return
        }
      }
    }

    // Update lot
    const lot = await stockLotService.updateLot(lot_id, updates)

    // Enrich with owner details
    let owner = null
    if (lot.owner_id) {
      const ownerData = await knex("accounts")
        .where({ user_id: lot.owner_id })
        .select("user_id", "username", "display_name", "avatar")
        .first()
      if (ownerData) {
        owner = await formatOwnerDetails(ownerData)
      }
    }

    res.json(
      createResponse({
        lot: {
          lot_id: lot.lot_id,
          listing_id: lot.listing_id,
          location_id: lot.location_id,
          quantity_total: lot.quantity_total,
          listed: lot.listed,
          notes: lot.notes,
          created_at: lot.created_at,
          updated_at: lot.updated_at,
          owner,
        },
      }),
    )
  } catch (error) {
    logger.error("Error updating lot", { error })

    if (error instanceof InvalidQuantityError) {
      res.status(400).json(
        createErrorResponse({
          message: error.message,
          code: error.code,
          details: error.toJSON(),
        }),
      )
      return
    }

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

    if (error instanceof ConcurrentModificationError) {
      res.status(409).json(
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
        message: "Failed to update lot",
      }),
    )
  }
}

/**
 * DELETE /api/v1/market/lots/:lotId
 * Delete a stock lot
 * Requirements: 2.4
 */
export const deleteLot: RequestHandler = async (req, res) => {
  try {
    const { lot_id } = req.params

    // Check for active allocations
    const allocatedQuantity =
      await allocationService.getAllocatedQuantity(lot_id)
    if (allocatedQuantity > 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Cannot delete lot with active allocations",
        }),
      )
      return
    }

    // Delete lot
    await stockLotService.deleteLot(lot_id)

    res.json(createResponse({ success: true }))
  } catch (error) {
    logger.error("Error deleting lot", { error })
    res.status(500).json(
      createErrorResponse({
        message: "Failed to delete lot",
      }),
    )
  }
}

/**
 * POST /api/v1/market/lots/:lotId/transfer
 * Transfer stock between locations
 * Requirements: 11.1, 11.2, 11.3
 */
export const transferLot: RequestHandler = async (req, res) => {
  try {
    const { lot_id } = req.params
    const { destination_location_id, quantity: rawQuantity } = req.body

    // Validate inputs
    if (!destination_location_id) {
      res.status(400).json(
        createErrorResponse({
          message: "destination_location_id is required",
        }),
      )
      return
    }

    const quantity = Number(rawQuantity)
    if (isNaN(quantity) || quantity <= 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Transfer quantity must be greater than 0",
        }),
      )
      return
    }

    // Perform transfer
    const result = await stockLotService.transferLot({
      source_lot_id: lot_id,
      destination_location_id,
      quantity,
    })

    res.json(
      createResponse({
        source_lot: result.source_lot,
        destination_lot: result.destination_lot,
      }),
    )
  } catch (error) {
    logger.error("Error transferring lot", { error })

    if (error instanceof InsufficientStockError) {
      res.status(400).json(
        createErrorResponse({
          message: error.message,
          code: error.code,
          details: error.toJSON(),
        }),
      )
      return
    }

    if (error instanceof InvalidQuantityError) {
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
        message: "Failed to transfer lot",
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
/**
 * GET /api/contractors/:contractorId/allocations
 * Get all allocations for a contractor's listings
 */
export const getContractorAllocations: RequestHandler = async (req, res) => {
  try {
    const contractor = req.contractor
    if (!contractor) {
      return res.status(400).json(
        createErrorResponse({
          message: "Contractor not found",
        }),
      )
    }

    // Debug: Check each step
    const allAllocations = await getKnex()("stock_allocations as sa")
      .where("sa.status", "active")
      .select("*")
    logger.info("Step 1 - All active allocations:", { count: allAllocations.length })

    const withLots = await getKnex()("stock_allocations as sa")
      .join("stock_lots as sl", "sa.lot_id", "sl.lot_id")
      .where("sa.status", "active")
      .select("sa.*", "sl.listing_id")
    logger.info("Step 2 - After joining stock_lots:", { count: withLots.length })

    const withListings = await getKnex()("stock_allocations as sa")
      .join("stock_lots as sl", "sa.lot_id", "sl.lot_id")
      .join("market_listings as ml", "sl.listing_id", "ml.listing_id")
      .where("sa.status", "active")
      .where("ml.contractor_seller_id", contractor.contractor_id)
      .select("sa.*", "ml.listing_id")
    logger.info("Step 3 - After joining market_listings:", { count: withListings.length })

    const withDetails = await getKnex()("stock_allocations as sa")
      .join("stock_lots as sl", "sa.lot_id", "sl.lot_id")
      .join("market_listings as ml", "sl.listing_id", "ml.listing_id")
      .leftJoin("market_unique_listings as mul", "ml.listing_id", "mul.listing_id")
      .leftJoin(
        "market_listing_details as mld",
        "mul.details_id",
        "mld.details_id",
      )
      .where("sa.status", "active")
      .where("ml.contractor_seller_id", contractor.contractor_id)
      .select("sa.*", "mld.title")
    logger.info("Step 4 - After joining market_listing_details:", { count: withDetails.length })

    // Get all allocations for contractor's listings (only active orders)
    const allocations = await getKnex()("stock_allocations as sa")
      .join("stock_lots as sl", "sa.lot_id", "sl.lot_id")
      .join("market_listings as ml", "sl.listing_id", "ml.listing_id")
      .leftJoin("market_unique_listings as mul", "ml.listing_id", "mul.listing_id")
      .leftJoin(
        "market_listing_details as mld",
        "mul.details_id",
        "mld.details_id",
      )
      .leftJoin("market_orders as mo", "sa.order_id", "mo.order_id")
      .leftJoin("orders as o", "sa.order_id", "o.order_id")
      .leftJoin("locations as loc", "sl.location_id", "loc.location_id")
      .leftJoin("accounts as acc", "sl.owner_id", "acc.user_id")
      .where("ml.contractor_seller_id", contractor.contractor_id)
      .where("sa.status", "active")
      .where(function () {
        this.whereNull("o.status").orWhereNotIn("o.status", [
          "complete",
          "fulfilled",
          "cancelled",
        ])
      })
      .select(
        "sa.allocation_id",
        "sa.lot_id",
        "sa.order_id",
        "sa.quantity",
        "sa.status",
        "sa.created_at",
        "sl.listing_id",
        "sl.owner_id",
        "mul.details_id",
        "loc.location_id",
        "loc.name as location_name",
        "o.title as order_title",
        "mld.title as listing_title",
        "acc.user_id as owner_user_id",
        "acc.username as owner_username",
        "acc.display_name as owner_display_name",
        "acc.avatar as owner_avatar",
      )
      .orderBy("sa.created_at", "desc")

    logger.info("Final allocations:", { count: allocations.length })

    // Fetch photos for each listing
    const detailsIds = [...new Set(allocations.map((a) => a.details_id).filter(Boolean))]
    const photosMap = new Map<string, string[]>()
    
    for (const detailsId of detailsIds) {
      const photos = await marketDb.getMarketListingImagesResolved({
        details_id: detailsId,
      })
      photosMap.set(detailsId, photos)
    }

    // Format response
    const formattedAllocations = await Promise.all(
      allocations.map(async (alloc) => ({
      allocation_id: alloc.allocation_id,
      lot_id: alloc.lot_id,
      order_id: alloc.order_id,
      quantity: alloc.quantity,
      status: alloc.status,
      created_at: alloc.created_at,
      order_title: alloc.order_title,
      lot: {
        lot_id: alloc.lot_id,
        listing_id: alloc.listing_id,
        title: alloc.listing_title,
        photos: photosMap.get(alloc.details_id) || [],
        location: alloc.location_id
          ? {
              location_id: alloc.location_id,
              name: alloc.location_name,
            }
          : null,
        owner: alloc.owner_user_id
          ? await formatOwnerDetails({
              user_id: alloc.owner_user_id,
              username: alloc.owner_username,
              display_name: alloc.owner_display_name,
              avatar: alloc.owner_avatar,
            })
          : null,
      },
    })),
    )

    res.json(
      createResponse({
        allocations: formattedAllocations,
      }),
    )
  } catch (error) {
    logger.error("Error fetching contractor allocations", { error })
    res.status(500).json(
      createErrorResponse({
        message: "Failed to fetch allocations",
      }),
    )
  }
}

export const getOrderAllocations: RequestHandler = async (req, res) => {
  try {
    const { order_id } = req.params

    // Get order to check listing
    const order = await getKnex()("market_orders")
      .where({ order_id })
      .first()

    if (!order) {
      return res.status(404).json(
        createErrorResponse({
          message: "Order not found",
        }),
      )
    }

    const orderListingIds: string[] = [order.listing_id]

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
        const listingComplete = await marketDb.getMarketUniqueListingComplete(
          listing_id,
        )
        const listing = await formatUniqueListingComplete(listingComplete)

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
