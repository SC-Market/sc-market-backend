/**
 * Stock Lot Routes
 *
 * Defines HTTP routes for stock lot management.
 *
 * Only the routes the current frontend still calls are mounted: listing lots
 * (order allocation view), locations (inventory page) and order allocations.
 * The other V1 lot routes (search, create/update/delete/transfer, simple
 * stock, org-wide allocations) had no caller and were removed; V2
 * /api/v2/stock-lots replaces them.
 */

import express from "express"
import {
  userAuthorized,
  requireMarketWrite,
  requireMarketRead,
} from "../../../middleware/auth.js"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { can_manage_market_listing } from "./middleware.js"
import {
  getListingLots,
  getLocations,
  createLocation,
  getOrderAllocations,
  manualAllocateOrder,
} from "./stock-lots.controller.js"

export const stockLotsRouter = express.Router()

// Lot listing and management
stockLotsRouter.get(
  "/listings/:listing_id/lots",
  userAuthorized,
  requireMarketRead,
  can_manage_market_listing,
  readRateLimit,
  getListingLots,
)

// Location management
stockLotsRouter.get(
  "/locations",
  userAuthorized,
  requireMarketRead,
  readRateLimit,
  getLocations,
)

stockLotsRouter.post(
  "/locations",
  userAuthorized,
  requireMarketWrite,
  writeRateLimit,
  createLocation,
)

// Order allocation management (these will be mounted under /orders)
export const allocationRouter = express.Router()

allocationRouter.get(
  "/:order_id/allocations",
  userAuthorized,
  requireMarketRead,
  readRateLimit,
  getOrderAllocations,
)

allocationRouter.post(
  "/:order_id/allocations/manual",
  userAuthorized,
  requireMarketWrite,
  writeRateLimit,
  manualAllocateOrder,
)
