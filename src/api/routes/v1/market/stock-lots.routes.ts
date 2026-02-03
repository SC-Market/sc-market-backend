/**
 * Stock Lot Routes
 *
 * Defines HTTP routes for stock lot management
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
import { can_manage_market_listing, can_manage_stock_lot } from "./middleware.js"
import { validate_optional_username_body } from "../profiles/middleware.js"
import {
  updateSimpleStock,
  getListingLots,
  createLot,
  updateLot,
  deleteLot,
  transferLot,
  getLocations,
  createLocation,
  getOrderAllocations,
  manualAllocateOrder,
  searchLots,
} from "./stock-lots.controller.js"

export const stockLotsRouter = express.Router()

// Search all lots
stockLotsRouter.get(
  "/lots",
  userAuthorized,
  requireMarketRead,
  readRateLimit,
  searchLots,
)

// Simple stock management
stockLotsRouter.put(
  "/listings/:listing_id/stock",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  writeRateLimit,
  updateSimpleStock,
)

// Lot listing and management
stockLotsRouter.get(
  "/listings/:listing_id/lots",
  userAuthorized,
  requireMarketRead,
  can_manage_market_listing,
  readRateLimit,
  getListingLots,
)

stockLotsRouter.post(
  "/listings/:listing_id/lots",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  validate_optional_username_body("owner_username"),
  writeRateLimit,
  createLot,
)

stockLotsRouter.patch(
  "/lots/:lot_id",
  userAuthorized,
  requireMarketWrite,
  can_manage_stock_lot,
  writeRateLimit,
  updateLot,
)

stockLotsRouter.delete(
  "/lots/:lot_id",
  userAuthorized,
  requireMarketWrite,
  can_manage_stock_lot,
  writeRateLimit,
  deleteLot,
)

// Lot transfer
stockLotsRouter.post(
  "/lots/:lot_id/transfer",
  userAuthorized,
  requireMarketWrite,
  can_manage_stock_lot,
  writeRateLimit,
  transferLot,
)

// Location management
stockLotsRouter.get("/locations", readRateLimit, getLocations)

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
