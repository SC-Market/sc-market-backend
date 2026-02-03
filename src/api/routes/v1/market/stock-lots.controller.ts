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

const stockLotService = new StockLotService()
const locationService = new LocationService()
const allocationService = new AllocationService()

/**
 * PUT /api/v1/market/listings/:listingId/stock
 * Simple stock management endpoint
 * Requirements: 1.1, 1.5, 5.1
 */
export const updateSimpleStock: RequestHandler = async (req, res) => {
  try {
    const { listing_id } = req.params
    const { quantity } = req.body as { quantity: number }

    // Validate input
    if (typeof quantity !== "number" || quantity < 0) {
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
    const { user_id, contractor_id, location_id, listed, page_size = 100, offset = 0 } = req.query

    // Build filters
    const filters: any = {}
    
    if (user_id) filters.owner_id = user_id as string
    if (location_id) filters.location_id = location_id as string
    if (listed !== undefined) filters.listed = listed === "true"

    // Get lots
    let lots = await stockLotService.getLots(filters)

    // Filter by contractor if provided
    if (contractor_id) {
      const listingIds = lots.map(l => l.listing_id)
      // Get listings to check ownership
      const listings = await marketDb.getMarketUniqueListingsComplete({
        listing_id: listingIds,
      })
      const contractorListingIds = new Set(
        listings
          .filter((l: any) => l.contractor_seller_id === contractor_id)
          .map((l: any) => l.listing_id)
      )
      lots = lots.filter((l: any) => contractorListingIds.has(l.listing_id))
    }

    // Paginate
    const total = lots.length
    const paginatedLots = lots.slice(Number(offset), Number(offset) + Number(page_size))

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

    // Build filters
    const filters: any = {
      listing_id,
    }
    if (location_id) filters.location_id = location_id as string
    if (owner_id) filters.owner_id = owner_id as string
    if (listed !== undefined) filters.listed = listed === "true"

    // Get lots
    const lots = await stockLotService.getLots(filters)

    // Get aggregates
    const total = await stockLotService.getTotalStock(listing_id)
    const available = await stockLotService.getAvailableStock(listing_id)
    const reserved = await stockLotService.getReservedStock(listing_id)

    res.json(
      createResponse({
        lots,
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
    const { quantity, location_id, owner_username, listed, notes } = req.body

    // Validate required fields
    if (typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Quantity must be a positive number",
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

    // Validate quantity if provided
    if (updates.quantity !== undefined) {
      if (typeof updates.quantity !== "number" || updates.quantity < 0) {
        res.status(400).json(
          createErrorResponse({
            message: "Quantity must be a non-negative number",
          }),
        )
        return
      }
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

    // Update lot
    const lot = await stockLotService.updateLot(lot_id, updates)

    res.json(createResponse({ lot }))
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
    const { destination_location_id, quantity } = req.body

    // Validate inputs
    if (!destination_location_id) {
      res.status(400).json(
        createErrorResponse({
          message: "destination_location_id is required",
        }),
      )
      return
    }

    if (typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json(
        createErrorResponse({
          message: "Quantity must be a positive number",
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
export const getOrderAllocations: RequestHandler = async (req, res) => {
  try {
    const { order_id } = req.params

    // Get allocations with lot details
    const allocations = await allocationService.getAllocations(order_id)

    // Calculate total allocated
    const totalAllocated = allocations.reduce(
      (sum, alloc) => sum + alloc.quantity,
      0,
    )

    res.json(
      createResponse({
        allocations,
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
      if (
        !alloc.lot_id ||
        typeof alloc.quantity !== "number" ||
        alloc.quantity <= 0
      ) {
        res.status(400).json(
          createErrorResponse({
            message:
              "Each allocation must have a valid lot_id and positive quantity",
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
