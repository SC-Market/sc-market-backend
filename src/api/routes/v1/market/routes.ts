import express from "express"
import {
  adminAuthorized,
  userAuthorized,
  requireMarketRead,
  requireMarketWrite,
  requireMarketAdmin,
} from "../../../middleware/auth.js"
import {
  criticalRateLimit,
  writeRateLimit,
  readRateLimit,
  bulkRateLimit,
  listingUpdateRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import {
  can_manage_market_listing,
  valid_market_listing,
} from "./middleware.js"
import { org_permission, valid_contractor } from "../contractors/middleware.js"
import { stockLotsRouter } from "./stock-lots.routes.js"

import { multiplePhotoUpload } from "../util/upload.js"
import {
  update_listing,
  get_linked_orders,
  get_listing_bids,
  get_listing_details,
  get_listing_stats,
  get_order_stats,
  purchase_listings,
  refresh_listing,
  update_listing_quantity,
  create_listing,
  add_listing_photos,
  handle_listing_view,
  search_listings,
  get_active_listings_by_user,
  get_active_listings_by_org,
  get_buy_order_chart,
  get_aggregate_details,
  get_multiple_details,
  create_contractor_multiple,
  get_my_listings,
  get_buy_orders,
  get_aggregate_history,
  update_aggregate,
  create_multiple,
  update_multiple,
  create_buy_order,
  fulfill_buy_order,
  cancel_buy_order,
  export_Listings,
  get_category_details,
  get_categories,
  get_game_item,
  get_seller_analytics,
} from "./controller.js"

import {
  market_get_stats_spec,
  market_post_listings_stats_spec,
  market_put_listing_listing_id_spec,
  market_post_listing_listing_id_update_quantity_spec,
  market_post_listing_listing_id_refresh_spec,
  market_get_listings_listing_id_spec,
  market_get_listing_listing_id_orders_spec,
  market_post_purchase_spec,
  market_post_listings_listing_id_bids_spec,
  market_post_listings_spec,
  market_post_listing_listing_id_photos_spec,
  market_post_listings_listing_id_views_spec,
  market_get_mine_spec,
  market_get_listings_spec,
  market_get_user_username_spec,
  market_get_contractor_spectrum_id_spec,
  market_get_aggregates_buyorders_spec,
  market_get_aggregate_game_item_id_chart_spec,
  market_get_item_name_spec,
  market_get_seller_analytics_spec,
} from "./openapi.js"

export const marketRouter = express.Router()

// Mount stock lots routes
marketRouter.use("/", stockLotsRouter)

marketRouter.get(
  "/stats",
  market_get_stats_spec,
  readRateLimit,
  get_order_stats,
)

marketRouter.post(
  "/listings/stats",
  market_post_listings_stats_spec,
  userAuthorized,
  readRateLimit,
  get_listing_stats,
)

marketRouter.put(
  "/listing/:listing_id",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  market_put_listing_listing_id_spec,
  listingUpdateRateLimit,
  update_listing,
)

marketRouter.post(
  "/listing/:listing_id/update_quantity",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  market_post_listing_listing_id_update_quantity_spec,
  writeRateLimit,
  update_listing_quantity,
)

marketRouter.post(
  "/listing/:listing_id/refresh",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  market_post_listing_listing_id_refresh_spec,
  writeRateLimit,
  refresh_listing,
)

marketRouter.get(
  "/listings/:listing_id",
  valid_market_listing,
  market_get_listings_listing_id_spec,
  readRateLimit,
  get_listing_details,
)

// Schema for listing orders pagination response

marketRouter.get(
  "/listing/:listing_id/orders",
  can_manage_market_listing,
  market_get_listing_listing_id_orders_spec,
  readRateLimit,
  get_linked_orders,
)

marketRouter.post(
  "/purchase",
  userAuthorized,
  requireMarketWrite,
  criticalRateLimit,
  market_post_purchase_spec,
  purchase_listings,
)

marketRouter.post(
  "/listings/:listing_id/bids",
  userAuthorized,
  requireMarketWrite,
  valid_market_listing,
  criticalRateLimit,
  market_post_listings_listing_id_bids_spec,
  get_listing_bids,
)

marketRouter.post(
  "/listings",
  userAuthorized,
  requireMarketWrite,
  criticalRateLimit,
  market_post_listings_spec,
  create_listing,
)

// Upload photos for a market listing (multipart/form-data)
marketRouter.post(
  "/listing/:listing_id/photos",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  multiplePhotoUpload.array("photos", 5),
  market_post_listing_listing_id_photos_spec,
  writeRateLimit,
  add_listing_photos,
)

// Track a view on a market listing
marketRouter.post(
  "/listings/:listing_id/views",
  valid_market_listing,
  market_post_listings_listing_id_views_spec,
  writeRateLimit,
  handle_listing_view,
)

marketRouter.get(
  "/mine",
  userAuthorized,
  requireMarketRead,
  market_get_mine_spec,
  readRateLimit,
  get_my_listings,
)

marketRouter.get(
  "/listings",
  market_get_listings_spec,
  readRateLimit,
  search_listings,
)

marketRouter.get(
  "/user/:username",
  market_get_user_username_spec,
  readRateLimit,
  get_active_listings_by_user,
)

marketRouter.get(
  "/contractor/:spectrum_id",
  valid_contractor,
  market_get_contractor_spectrum_id_spec,
  readRateLimit,
  get_active_listings_by_org,
)

// First register the schema

// Then use it in the route
marketRouter.get(
  "/aggregates/buyorders",
  market_get_aggregates_buyorders_spec,
  readRateLimit,
  get_buy_orders,
)

// First register the schema for the chart data point

// Then use it in the route
marketRouter.get(
  "/aggregate/:game_item_id/chart",
  market_get_aggregate_game_item_id_chart_spec,
  readRateLimit,
  get_buy_order_chart,
)

marketRouter.get(
  "/aggregate/:game_item_id/history",
  readRateLimit,
  get_aggregate_history,
)

// TODO: Redo
marketRouter.post(
  "/aggregate/:game_item_id/update",
  adminAuthorized,
  requireMarketAdmin,
  bulkRateLimit,
  update_aggregate,
)

marketRouter.get(
  "/aggregate/:game_item_id",
  readRateLimit,
  get_aggregate_details,
)

marketRouter.get("/multiple/:multiple_id", readRateLimit, get_multiple_details)

marketRouter.post(
  "/multiple/contractor/:spectrum_id/create",
  userAuthorized,
  requireMarketWrite,
  org_permission("manage_market"),
  writeRateLimit,
  create_contractor_multiple,
)

marketRouter.post(
  "/multiple/create",
  userAuthorized,
  requireMarketWrite,
  writeRateLimit,
  create_multiple,
)

marketRouter.post(
  "/multiple/:multiple_id/update",
  userAuthorized,
  requireMarketWrite,
  writeRateLimit,
  update_multiple,
)

marketRouter.post(
  "/buyorder/create",
  userAuthorized,
  requireMarketWrite,
  criticalRateLimit,
  create_buy_order,
)

marketRouter.post(
  "/buyorder/:buy_order_id/fulfill",
  userAuthorized,
  requireMarketWrite,
  criticalRateLimit,
  fulfill_buy_order,
)

marketRouter.post(
  "/buyorder/:buy_order_id/cancel",
  userAuthorized,
  requireMarketWrite,
  criticalRateLimit,
  cancel_buy_order,
)

marketRouter.get(
  "/export",
  userAuthorized,
  requireMarketRead,
  bulkRateLimit,
  export_Listings,
)

marketRouter.get("/category/:category", readRateLimit, get_category_details)

marketRouter.get("/categories", readRateLimit, get_categories)

// First register the schema for game item description

marketRouter.get(
  "/item/:name",
  market_get_item_name_spec,
  readRateLimit,
  get_game_item,
)

// Get view analytics for a seller's listings
marketRouter.get(
  "/seller/analytics",
  userAuthorized,
  requireMarketRead,
  market_get_seller_analytics_spec,
  bulkRateLimit,
  get_seller_analytics,
)

// TODO: Create listing as part of multiple
//  ~~fetch a multiple~~
//  ~~convert a unique to a multiple~~
//  ~~convert a multiple back to unique~~
//  ~~user create multiple~~
//  ~~provide multiples in normal lookup endpoints~~
//  create helper func for finding kinds of listings complete
//  ~~Make multiples compatible with unique/aggregate listing lookup by ID~~
//  attach orders to aggregate composite, multiples, and multiple composites when fetched
