import express, { Request } from "express"
import {
  adminAuthorized,
  userAuthorized,
  requireMarketRead,
  requireMarketWrite,
  requireMarketAdmin,
} from "../../../middleware/auth.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  DBContractor,
  DBMarketListing,
  DBMarketListingComplete,
  DBMultipleListingComplete,
  DBUniqueListing,
  DBUniqueListingComplete,
} from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import {
  formatBuyOrderChartDetails,
  formatListing,
  formatListingComplete,
  formatMarketAggregateComplete,
  formatMarketMultipleComplete,
  formatPriceHistory,
} from "../util/formatting.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { marketBidNotification } from "../util/notifications.js"
import { createOffer } from "../orders/helpers.js"
import { serializeOrderDetails } from "../orders/serializers.js"
import { has_permission, is_member } from "../util/permissions.js"
import {
  can_manage_market_listing,
  valid_market_listing,
} from "./middleware.js"
import {
  org_authorized,
  org_permission,
  valid_contractor,
} from "../contractors/middleware.js"
import moment from "moment"
import {
  convertQuery,
  get_my_listings,
  get_org_listings,
  handle_quantity_update,
  verify_listings,
  isSCMarketsCDN,
  isImageAlreadyAssociated,
  validateMarketListingPhotos,
} from "./helpers.js"
import { serializeListingStats } from "../util/formatting.js"
import { DEFAULT_PLACEHOLDER_PHOTO_URL } from "./constants.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
  Response500,
} from "../openapi.js"
import { createResponse, createErrorResponse } from "../util/response.js"
import { multiplePhotoUpload } from "../util/upload.js"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import logger from "../../../../logger/logger.js"
import {
  MarketSearchQueryArguments,
  MarketSearchQuery,
  UserListingsQuery,
  ContractorListingsQuery,
  FormattedListing,
} from "./types.js"
import { formatPrivateSearchResult } from "../util/formatting.js"

export const marketRouter = express.Router()

// ============================================================================
// REUSABLE BASE TYPES
// ============================================================================

// Common field types
oapi.schema("UUID", {
  type: "string",
  format: "uuid",
  description: "A universally unique identifier",
})

oapi.schema("Timestamp", {
  type: "string",
  format: "date-time",
  description: "ISO 8601 timestamp",
})

oapi.schema("Price", {
  type: "number",
  minimum: 0,
  description: "Price in the smallest currency unit (e.g., cents)",
})

oapi.schema("Quantity", {
  type: "integer",
  minimum: 0,
  description: "Available quantity",
})

oapi.schema("ListingTitle", {
  type: "string",
  minLength: 1,
  maxLength: 200,
  description: "Listing title",
})

oapi.schema("ListingDescription", {
  type: "string",
  minLength: 1,
  maxLength: 2000,
  description: "Listing description",
})

oapi.schema("ItemType", {
  type: "string",
  description: "Type of game item",
})

oapi.schema("GameItemId", {
  type: "string",
  nullable: true,
  description: "Game item identifier",
})

// Enums
oapi.schema("SaleType", {
  type: "string",
  enum: ["unique", "aggregate", "multiple", "auction"],
  description: "Type of sale",
})

oapi.schema("ListingStatus", {
  type: "string",
  enum: ["active", "inactive", "archived"],
  description: "Listing status",
})

oapi.schema("ListingType", {
  type: "string",
  enum: ["unique", "aggregate", "multiple"],
  description: "Type of listing",
})

// Rating information
oapi.schema("RatingInfo", {
  type: "object",
  properties: {
    total_rating: {
      type: "number",
      description: "Total rating points",
    },
    avg_rating: {
      type: "number",
      description: "Average rating",
    },
    rating_count: {
      type: "integer",
      nullable: true,
      description: "Number of ratings",
    },
    rating_streak: {
      type: "integer",
      nullable: true,
      description: "Current rating streak",
    },
  },
  required: ["total_rating", "avg_rating"],
})

// Seller information
oapi.schema("SellerInfo", {
  type: "object",
  properties: {
    user_seller: {
      type: "string",
      nullable: true,
      description: "Username of the user seller",
    },
    contractor_seller: {
      type: "string",
      nullable: true,
      description: "Spectrum ID of the contractor seller",
    },
  },
})

// Order statistics
oapi.schema("OrderStats", {
  type: "object",
  properties: {
    total_orders: {
      type: "number",
      description: "Total number of orders",
    },
    total_order_value: {
      type: "number",
      description: "Total value of all orders",
    },
  },
  required: ["total_orders", "total_order_value"],
})

// ============================================================================
// MARKET LISTING SCHEMAS
// ============================================================================

oapi.schema("MarketListing", {
  type: "object",
  description: "A market listing with complete information",
  properties: {
    listing_id: {
      $ref: "#/components/schemas/UUID",
      description: "Unique identifier for the listing",
    },
    sale_type: {
      $ref: "#/components/schemas/SaleType",
      description: "Type of sale for this listing",
    },
    price: {
      $ref: "#/components/schemas/Price",
      description: "Current price of the listing",
    },
    quantity_available: {
      $ref: "#/components/schemas/Quantity",
      description: "Number of items available for sale",
    },
    status: {
      $ref: "#/components/schemas/ListingStatus",
      description: "Current status of the listing",
    },
    internal: {
      type: "boolean",
      description:
        "Whether this is an internal listing (only visible to organization members)",
    },
    user_seller_id: {
      $ref: "#/components/schemas/UUID",
      nullable: true,
      description: "ID of the user seller (if sold by a user)",
    },
    contractor_seller_id: {
      $ref: "#/components/schemas/UUID",
      nullable: true,
      description: "ID of the contractor seller (if sold by a contractor)",
    },
    timestamp: {
      $ref: "#/components/schemas/Timestamp",
      description: "When the listing was created",
    },
    expiration: {
      $ref: "#/components/schemas/Timestamp",
      nullable: true,
      description: "When the listing expires",
    },
    title: {
      $ref: "#/components/schemas/ListingTitle",
      description: "Title of the listing",
    },
    description: {
      $ref: "#/components/schemas/ListingDescription",
      description: "Detailed description of the listing",
    },
    item_type: {
      $ref: "#/components/schemas/ItemType",
      description: "Type of game item being sold",
    },
    game_item_id: {
      $ref: "#/components/schemas/GameItemId",
      description: "Specific game item identifier",
    },
    photos: {
      type: "array",
      items: {
        type: "string",
        description: "URL to a photo",
      },
      maxItems: 10,
      description: "Array of photo URLs for the listing",
    },
  },
  required: [
    "listing_id",
    "sale_type",
    "price",
    "quantity_available",
    "status",
    "internal",
    "timestamp",
    "title",
    "description",
    "item_type",
  ],
  additionalProperties: false,
})

oapi.schema("CreateMarketListingRequest", {
  type: "object",
  description: "Request to create a new market listing",
  properties: {
    sale_type: {
      $ref: "#/components/schemas/SaleType",
      description: "Type of sale for the new listing",
    },
    price: {
      $ref: "#/components/schemas/Price",
      description: "Price for the listing",
    },
    quantity_available: {
      type: "integer",
      minimum: 1,
      description: "Number of items available for sale",
    },
    title: {
      $ref: "#/components/schemas/ListingTitle",
      description: "Title for the listing",
    },
    description: {
      $ref: "#/components/schemas/ListingDescription",
      description: "Detailed description of the listing",
    },
    item_type: {
      $ref: "#/components/schemas/ItemType",
      description: "Type of game item being sold",
    },
    game_item_id: {
      $ref: "#/components/schemas/GameItemId",
      description: "Specific game item identifier",
    },
    photos: {
      type: "array",
      items: {
        type: "string",
        description: "URL to a photo",
      },
      maxItems: 10,
      description: "Array of photo URLs for the listing",
    },
    expiration_days: {
      type: "integer",
      minimum: 1,
      maximum: 30,
      default: 7,
      description: "Number of days until the listing expires",
    },
  },
  required: [
    "sale_type",
    "price",
    "quantity_available",
    "title",
    "description",
    "item_type",
  ],
  additionalProperties: false,
})

oapi.schema("UpdateMarketListingRequest", {
  type: "object",
  description: "Request to update an existing market listing",
  properties: {
    price: {
      $ref: "#/components/schemas/Price",
      description: "New price for the listing",
    },
    quantity_available: {
      $ref: "#/components/schemas/Quantity",
      description: "New available quantity",
    },
    title: {
      $ref: "#/components/schemas/ListingTitle",
      description: "New title for the listing",
    },
    description: {
      $ref: "#/components/schemas/ListingDescription",
      description: "New description for the listing",
    },
    status: {
      $ref: "#/components/schemas/ListingStatus",
      description: "New status for the listing",
    },
    photos: {
      type: "array",
      items: {
        type: "string",
        description: "URL to a photo",
      },
      maxItems: 10,
      description: "New array of photo URLs for the listing",
    },
    item_type: {
      type: "string",
      description: "New item type for the listing",
    },
    item_name: {
      type: "string",
      nullable: true,
      description: "New item name for the listing",
    },
    minimum_bid_increment: {
      type: "number",
      minimum: 0,
      description: "New minimum bid increment for auction listings",
    },
    internal: {
      type: "boolean",
      description: "Whether the listing is internal (contractor only)",
    },
  },
  additionalProperties: false,
})

oapi.schema("MarketBid", {
  type: "object",
  title: "MarketBid",
  properties: {
    bid_id: {
      type: "string",
      format: "uuid",
      title: "MarketBid.bid_id",
    },
    listing_id: {
      type: "string",
      format: "uuid",
      title: "MarketBid.listing_id",
    },
    bidder: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          nullable: true,
        },
        contractor_id: {
          type: "string",
          nullable: true,
        },
        username: {
          type: "string",
        },
        display_name: {
          type: "string",
        },
      },
      title: "MarketBid.bidder",
    },
    bid_amount: {
      type: "number",
      minimum: 0,
      title: "MarketBid.bid_amount",
    },
    timestamp: {
      type: "string",
      format: "date-time",
      title: "MarketBid.timestamp",
    },
  },
  required: ["bid_id", "listing_id", "bidder", "bid_amount", "timestamp"],
  additionalProperties: false,
})

oapi.schema("CreateBidRequest", {
  type: "object",
  title: "CreateBidRequest",
  properties: {
    bid_amount: {
      type: "number",
      minimum: 0,
      title: "CreateBidRequest.bid_amount",
    },
  },
  required: ["bid_amount"],
  additionalProperties: false,
})

oapi.schema("MarketSearchParams", {
  type: "object",
  title: "MarketSearchParams",
  properties: {
    query: {
      type: "string",
      title: "MarketSearchParams.query",
    },
    statuses: {
      type: "string",
      title: "MarketSearchParams.statuses",
      description: "Comma-separated list of statuses (e.g., 'active,inactive')",
    },
    sale_type: {
      type: "string",
      enum: ["unique", "aggregate", "multiple", "auction"],
      title: "MarketSearchParams.sale_type",
    },
    item_type: {
      type: "string",
      title: "MarketSearchParams.item_type",
    },
    quantity_available: {
      type: "string",
      title: "MarketSearchParams.quantity_available",
    },
    min_price: {
      type: "number",
      minimum: 0,
      title: "MarketSearchParams.min_price",
    },
    max_price: {
      type: "number",
      minimum: 0,
      title: "MarketSearchParams.max_price",
    },
    user_seller_id: {
      type: "string",
      title: "MarketSearchParams.user_seller_id",
    },
    contractor_seller_id: {
      type: "string",
      title: "MarketSearchParams.contractor_seller_id",
    },
    page: {
      type: "integer",
      minimum: 0,
      default: 0,
      title: "MarketSearchParams.page",
    },
    pageSize: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 20,
      title: "MarketSearchParams.pageSize",
    },
  },
  additionalProperties: false,
})

marketRouter.get(
  "/stats",
  oapi.validPath({
    tags: ["Market"],
    summary: "Get market order statistics",
    description:
      "Returns statistics about orders including total count and value",
    responses: {
      "200": {
        description: "Successfully retrieved order statistics",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/OrderStats",
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    const order_stats = await database.getOrderStats()
    res.json(createResponse(order_stats))
    return
  },
)

marketRouter.post(
  "/listings/stats",
  oapi.validPath({
    tags: ["Market"],
    summary: "Get stats for multiple market listings",
    description:
      "Get statistics for multiple market listings. User must have permission to view stats for all requested listings.",
    operationId: "getMarketListingsStats",
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              listing_ids: {
                type: "array",
                items: { type: "string" },
                description: "Array of market listing IDs to get stats for",
              },
            },
            required: ["listing_ids"],
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved listing statistics",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                stats: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      listing_id: { type: "string" },
                      order_count: {
                        type: "number",
                        description: "Number of active orders for this listing",
                      },
                      offer_count: {
                        type: "number",
                        description: "Number of active offers for this listing",
                      },
                      view_count: {
                        type: "number",
                        description: "Number of views for this listing",
                      },
                    },
                    required: [
                      "listing_id",
                      "order_count",
                      "offer_count",
                      "view_count",
                    ],
                  },
                },
              },
              required: ["stats"],
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [{ bearerAuth: [] }],
  }),
  userAuthorized,
  async (req, res) => {
    try {
      const user = req.user as User
      const { listing_ids } = req.body as { listing_ids: string[] }

      if (
        !listing_ids ||
        !Array.isArray(listing_ids) ||
        listing_ids.length === 0
      ) {
        res.status(400).json(
          createErrorResponse({
            error: "listing_ids array is required and must not be empty",
          }),
        )
        return
      }

      if (listing_ids.length > 96) {
        res.status(400).json(
          createErrorResponse({
            error: "Maximum 96 listing IDs allowed per request",
          }),
        )
        return
      }

      const stats = []

      for (const listing_id of listing_ids) {
        try {
          // Get the listing
          const listing = await database.getMarketListing({ listing_id })

          if (!listing) {
            res.status(400).json(
              createErrorResponse({
                error: `Listing ${listing_id} not found`,
              }),
            )
            return
          }

          // Check permissions
          let hasPermission = false

          // Check if user owns the listing
          if (
            listing.user_seller_id &&
            listing.user_seller_id === user.user_id
          ) {
            hasPermission = true
          }

          // Check contractor permissions
          if (listing.contractor_seller_id) {
            const contractor = await database.getContractor({
              contractor_id: listing.contractor_seller_id,
            })
            if (
              contractor &&
              (await is_member(contractor.contractor_id, user.user_id))
            ) {
              hasPermission = true
            }
          }

          if (!hasPermission) {
            res.status(403).json(
              createErrorResponse({
                error: `You don't have permission to view stats for listing ${listing_id}`,
              }),
            )
            return
          }

          // Get stats for this listing
          const listingStats = await serializeListingStats(listing)
          stats.push({
            listing_id,
            ...listingStats,
          })
        } catch (error) {
          console.error(`Error processing listing ${listing_id}:`, error)
          res.status(500).json(
            createErrorResponse({
              error: `Error processing listing ${listing_id}`,
            }),
          )
          return
        }
      }

      res.json(createResponse({ stats }))
    } catch (error) {
      console.error("Error in /listings/stats:", error)
      res
        .status(500)
        .json(createErrorResponse({ error: "Internal server error" }))
    }
  },
)

oapi.schema("ListingUpdateRequest", {
  type: "object",
  title: "ListingUpdateRequest",
  properties: {
    status: {
      type: "string",
      enum: ["active", "inactive", "archived"],
      description: "New status for the listing",
    },
    title: {
      type: "string",
      description: "New title for the listing",
    },
    description: {
      type: "string",
      description: "New description for the listing",
    },
    item_type: {
      type: "string",
      description: "Type of the item",
    },
    item_name: {
      type: "string",
      description: "Name of the game item",
    },
    price: {
      type: "integer",
      description: "New price for the listing",
      minimum: 0,
    },
    quantity_available: {
      type: "integer",
      minimum: 0,
      description: "New quantity available",
    },
    photos: {
      type: "array",
      items: {
        type: "string",
      },
      description: "List of photo URLs",
    },
    minimum_bid_increment: {
      type: "integer",
      minimum: 1,
      description: "Minimum increment for auction bids",
    },
  },
})

oapi.schema("UpdateListingResponse", {
  type: "object",
  title: "UpdateListingResponse",
  properties: {
    result: {
      type: "string",
      enum: ["Success"],
    },
  },
  required: ["result"],
})

oapi.schema("ErrorResponse", {
  type: "object",
  title: "ErrorResponse",
  properties: {
    error: {
      type: "string",
    },
  },
  required: ["error"],
})

marketRouter.put(
  "/listing/:listing_id",
  can_manage_market_listing,
  oapi.validPath({
    summary: "Update a market listing",
    description: "Update various properties of a market listing",
    tags: ["Market", "Market Listing"],
    parameters: [
      {
        name: "listing_id",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
        description: "ID of the listing to update",
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ListingUpdateRequest",
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Listing updated successfully",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/UpdateListingResponse",
            },
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Invalid listing": {
                value: { error: "Invalid listing" },
              },
              "Missing fields": {
                value: { error: "Missing required fields" },
              },
              "Invalid status": {
                value: { error: "Invalid status" },
              },
              "Invalid quantity": {
                value: { error: "Invalid quantity" },
              },
              "Invalid bid increment": {
                value: { error: "Invalid bid increment!" },
              },
              "Invalid item": {
                value: { error: "Invalid item name" },
              },
              "Invalid photo": {
                value: { error: "Invalid photo!" },
              },
              "Archived listing": {
                value: { error: "Cannot update archived listing" },
              },
              "Auction update": {
                value: { error: "Cannot update auction listings" },
              },
              "Aggregate update": {
                value: { error: "Can't update details for aggregate listing" },
              },
              "Auction price": {
                value: { error: "Cannot edit price of auction" },
              },
              "Non-auction bid": {
                value: { error: "Cannot set bid increment for non auction" },
              },
            },
          },
        },
      },
      "403": {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Unauthorized contractor": {
                value: {
                  error:
                    "You are not authorized to update listings on behalf of this contractor!",
                },
              },
              "Unauthorized user": {
                value: {
                  error: "You are not authorized to update this listing!",
                },
              },
            },
          },
        },
      },
    },
  }),
  userAuthorized,
  async (req, res) => {
    const listing_id = req.params["listing_id"]
    const user = req.user as User
    const listing = req.market_listing!

    if (listing.status === "archived") {
      res.status(400).json({ error: "Cannot update archived listing" })
      return
    }

    if (listing.sale_type === "auction" && user.role !== "admin") {
      res.status(400).json({ error: "Cannot update auction listings" })
      return
    }

    const {
      status,
      title,
      description,
      item_type,
      item_name,
      price,
      quantity_available,
      photos,
      minimum_bid_increment,
      internal,
    }: {
      title?: string
      description?: string
      item_type?: string
      item_name?: string

      status?: string
      price?: number
      quantity_available?: number

      minimum_bid_increment?: number
      internal?: boolean

      photos?: string[]
    } = req.body

    if (
      (title || description || item_type) &&
      listing.sale_type === "aggregate"
    ) {
      res
        .status(400)
        .json({ error: "Can't update details for aggregate listing" })
      return
    }

    if (listing.sale_type === "auction" && price) {
      res.status(400).json({ error: "Cannot edit price of auction" })
      return
    }

    if (minimum_bid_increment && listing.sale_type !== "auction") {
      res
        .status(400)
        .json({ error: "Cannot set bid increment for non auction" })
      return
    }

    let game_item_id: string | null | undefined = undefined
    if (item_name !== undefined) {
      if (item_name === null) {
        game_item_id = null
      } else {
        const item = await database.getGameItem({ name: item_name })
        if (!item) {
          res.status(400).json({ error: "Invalid item name" })
          return
        }
        game_item_id = item.id
      }
    }

    if (
      status ||
      price !== undefined ||
      quantity_available !== undefined ||
      internal !== undefined
    ) {
      // Only allow internal=true for contractor listings
      // User listings must always be public (internal=false)
      if (internal === true && !listing.contractor_seller_id) {
        res.status(400).json({
          error:
            "Internal listings can only be created for contractor listings",
        })
        return
      }

      await database.updateMarketListing(listing_id, {
        status,
        price,
        quantity_available,
        internal,
      })
    }

    if (minimum_bid_increment) {
      await database.updateAuctionDetails(
        { listing_id },
        { minimum_bid_increment },
      )
    }

    if (title || description || item_type || item_name) {
      const unique = await database.getMarketUniqueListing({ listing_id })
      await database.updateListingDetails(
        { details_id: unique.details_id },
        { title, description, item_type, game_item_id },
      )
    }

    // Handle photo updates
    if (photos !== undefined) {
      const old_photos =
        await database.getMarketListingImagesByListingID(listing)

      // Validate photos using the helper function
      const photoValidation = await validateMarketListingPhotos(photos, listing)
      if (!photoValidation.valid) {
        res.status(400).json({ error: photoValidation.error })
        return
      }

      // Track which old photos should be preserved (CDN images that are still being used)
      const photosToPreserve = new Set<string>()

      // Process photos - CDN images that are already associated will be skipped
      for (const photo of photos) {
        // Check if this is a SC markets CDN URL
        if (isSCMarketsCDN(photo)) {
          // Check if the image is already associated with this listing
          const isAssociated = await isImageAlreadyAssociated(photo, listing)
          if (isAssociated) {
            // Find the corresponding old photo entry and mark it for preservation
            for (const oldPhoto of old_photos) {
              try {
                const resolvedUrl = await cdn.getFileLinkResource(
                  oldPhoto.resource_id,
                )
                if (resolvedUrl === photo) {
                  photosToPreserve.add(oldPhoto.resource_id)
                  break
                }
              } catch {
                // Skip if we can't resolve the URL
              }
            }
            // Skip this image as it's already associated
            continue
          }
          // If we reach here, the image is not associated, but validation should have caught this
          // This is a safety check
          res.status(400).json({
            error:
              "Cannot use image from SC markets CDN that is not already associated with this listing",
          })
          return
        }

        // For non-CDN images, proceed with normal processing
        try {
          const resource = await cdn.createExternalResource(
            photo,
            listing_id + `_photo_${0}`,
          )
          await database.insertMarketListingPhoto(listing, [
            { resource_id: resource.resource_id },
          ])
        } catch (e: any) {
          res.status(400).json({ error: "Invalid photo!" })
          return
        }
      }

      // Remove any old photos that are not being preserved
      for (const p of old_photos) {
        if (!photosToPreserve.has(p.resource_id)) {
          await database.deleteMarketListingImages(p)
          try {
            // Use CDN removeResource to ensure both database and CDN cleanup
            await cdn.removeResource(p.resource_id)
          } catch {}
        }
      }
    }

    res.json({ result: "Success" })
  },
)

oapi.schema("UpdateQuantityRequest", {
  type: "object",
  title: "UpdateQuantityRequest",
  properties: {
    quantity_available: {
      type: "number",
      minimum: 0,
      description: "New quantity available for the listing",
    },
  },
  required: ["quantity_available"],
})

oapi.schema("UpdateQuantityResponse", {
  type: "object",
  title: "UpdateQuantityResponse",
  properties: {
    result: {
      type: "string",
      enum: ["Success"],
    },
  },
  required: ["result"],
})

marketRouter.post(
  "/listing/:listing_id/update_quantity",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  oapi.validPath({
    summary: "Update listing quantity",
    description: "Update the available quantity of a market listing",
    tags: ["Market", "Market Listing"],
    parameters: [
      {
        name: "listing_id",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
        description: "ID of the listing to update",
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/UpdateQuantityRequest",
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Quantity updated successfully",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/UpdateQuantityResponse",
            },
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Invalid listing": {
                value: { error: "Invalid listing" },
              },
              "Missing fields": {
                value: { error: "Missing required fields" },
              },
              "Invalid quantity": {
                value: { error: "Invalid quantity" },
              },
              "Archived listing": {
                value: { error: "Cannot update archived listing" },
              },
            },
          },
        },
      },
      "403": {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Unauthorized contractor": {
                value: {
                  error:
                    "You are not authorized to update listings on behalf of this contractor!",
                },
              },
              "Unauthorized user": {
                value: {
                  error: "You are not authorized to update this listing!",
                },
              },
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    const user = req.user as User

    const {
      quantity_available,
    }: {
      quantity_available: number
    } = req.body

    const listing = req.market_listing!

    if (listing.status === "archived") {
      res
        .status(400)
        .json(createErrorResponse({ error: "Cannot update archived listing" }))
      return
    }

    await database.updateMarketListing(listing.listing_id, {
      quantity_available,
    })

    res.json(createResponse({ result: "Success" }))
  },
)

oapi.schema("RefreshListingResponse", {
  type: "object",
  title: "RefreshListingResponse",
  properties: {
    result: {
      type: "string",
      enum: ["Success"],
    },
  },
  required: ["result"],
})

marketRouter.post(
  "/listing/:listing_id/refresh",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  oapi.validPath({
    summary: "Refresh listing expiration",
    description:
      "Reset the expiration date of a market listing to the current date. Can only be done if the current expiration is within 3 days of being one month old.",
    tags: ["Market", "Market Listing"],
    parameters: [
      {
        name: "listing_id",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
        description: "ID of the listing to refresh",
      },
    ],
    responses: {
      "200": {
        description: "Listing expiration refreshed successfully",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/RefreshListingResponse",
            },
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Invalid listing": {
                value: { error: "Invalid listing" },
              },
              "Archived listing": {
                value: { error: "Cannot update archived listing" },
              },
              "Too soon": {
                value: { error: "Too soon to refresh" },
              },
            },
          },
        },
      },
      "403": {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Unauthorized contractor": {
                value: {
                  error:
                    "You are not authorized to update listings on behalf of this contractor!",
                },
              },
              "Unauthorized user": {
                value: {
                  error: "You are not authorized to update this listing!",
                },
              },
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    const listing_id = req.params["listing_id"]
    const user = req.user as User
    const listing = req.market_listing!

    if (listing.status === "archived") {
      res.status(400).json({ error: "Cannot update archived listing" })
      return
    }

    const expiration = moment(listing.expiration)
    if (expiration > moment().add(1, "months").subtract(3, "days")) {
      res.status(400).json({ error: "Too soon to refresh" })
      return
    } // If expiration is at least 1 month - 3 days in the future

    await database.updateMarketListing(listing_id, { expiration: new Date() })

    res.json({ result: "Success" })
  },
)

oapi.schema("MarketListingSeller", {
  type: "object",
  title: "MarketListingSeller",
  properties: {
    user: {
      $ref: "#/components/schemas/MinimalUser",
      nullable: true,
    },
    contractor: {
      $ref: "#/components/schemas/MinimalContractor",
      nullable: true,
    },
  },
})

oapi.schema("MarketListingBase", {
  type: "object",
  title: "MarketListingBase",
  properties: {
    listing_id: { type: "string" },
    sale_type: {
      type: "string",
      enum: ["unique", "multiple", "auction", "aggregate"],
    },
    price: { type: "number" },
    quantity_available: { type: "number" },
    status: {
      type: "string",
      enum: ["active", "inactive", "archived"],
    },
    timestamp: { type: "string", format: "date-time" },
    expiration: { type: "string", format: "date-time" },
    seller: { $ref: "#/components/schemas/MarketListingSeller" },
  },
  required: [
    "listing_id",
    "sale_type",
    "price",
    "quantity_available",
    "status",
    "timestamp",
    "expiration",
    "seller",
  ],
})

oapi.schema("UniqueListing", {
  type: "object",
  title: "UniqueListing",
  allOf: [
    { $ref: "#/components/schemas/MarketListingBase" },
    {
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        item_type: { type: "string" },
        photos: {
          type: "array",
          items: { type: "string" },
        },
        game_item: {
          type: "object",
          properties: {
            name: { type: "string" },
            icon_url: { type: "string" },
          },
          nullable: true,
        },
        view_count: {
          type: "number",
          description: "Total number of views for this listing",
          minimum: 0,
        },
      },
    },
  ],
})

oapi.schema("AggregateListingStats", {
  type: "object",
  title: "AggregateListingStats",
  properties: {
    minimum_price: { type: "number" },
    maximum_price: { type: "number" },
    average_price: { type: "number" },
    total_quantity: { type: "number" },
  },
})

oapi.schema("AggregateListing", {
  type: "object",
  title: "AggregateListing",
  allOf: [
    { $ref: "#/components/schemas/MarketListingBase" },
    {
      properties: {
        stats: { $ref: "#/components/schemas/AggregateListingStats" },
        game_item: {
          type: "object",
          properties: {
            name: { type: "string" },
            icon_url: { type: "string" },
          },
        },
      },
    },
  ],
})

oapi.schema("MarketListingComplete", {
  type: "object",
  title: "MarketListingComplete",
  properties: {
    listing_id: {
      type: "string",
      title: "MarketListingComplete.listing_id",
    },
    price: {
      type: "number",
      minimum: 0,
      title: "MarketListingComplete.price",
    },
    sale_type: {
      type: "string",
      enum: ["sale", "auction", "aggregate", "multiple"],
      title: "MarketListingComplete.sale_type",
    },
    quantity_available: {
      type: "integer",
      minimum: 0,
      title: "MarketListingComplete.quantity_available",
    },
    status: {
      type: "string",
      enum: ["active", "inactive", "archived"],
      title: "MarketListingComplete.status",
    },
    title: {
      type: "string",
      title: "MarketListingComplete.title",
    },
    description: {
      type: "string",
      title: "MarketListingComplete.description",
    },
    item_type: {
      type: "string",
      title: "MarketListingComplete.item_type",
    },
    internal: {
      type: "boolean",
      title: "MarketListingComplete.internal",
    },
    seller: {
      type: "object",
      properties: {
        user: {
          type: "object",
          nullable: true,
          properties: {
            user_id: { type: "string" },
            username: { type: "string" },
            avatar_url: { type: "string", nullable: true },
          },
        },
        contractor: {
          type: "object",
          nullable: true,
          properties: {
            contractor_id: { type: "string" },
            name: { type: "string" },
            spectrum_id: { type: "string" },
            logo_url: { type: "string", nullable: true },
          },
        },
      },
    },
    photos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          resource_id: { type: "string" },
          url: { type: "string" },
        },
      },
    },
    auction_details: {
      type: "object",
      nullable: true,
      properties: {
        minimum_bid_increment: { type: "number" },
        end_time: { type: "string", format: "date-time" },
        status: { type: "string", enum: ["active", "inactive"] },
        current_bid: {
          type: "object",
          nullable: true,
          properties: {
            amount: { type: "number" },
            bidder: {
              type: "object",
              properties: {
                user_id: { type: "string" },
                username: { type: "string" },
                avatar_url: { type: "string", nullable: true },
              },
            },
          },
        },
      },
    },
    game_item: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        type: { type: "string" },
        description: { type: "string" },
      },
    },
    created_at: {
      type: "string",
      format: "date-time",
      title: "MarketListingComplete.created_at",
    },
    updated_at: {
      type: "string",
      format: "date-time",
      title: "MarketListingComplete.updated_at",
    },
  },
  required: [
    "listing_id",
    "price",
    "sale_type",
    "quantity_available",
    "status",
    "title",
    "description",
    "item_type",
    "internal",
    "photos",
    "created_at",
    "updated_at",
  ],
  additionalProperties: false,
})

marketRouter.get(
  "/listings/:listing_id",
  valid_market_listing,
  oapi.validPath({
    summary: "Get market listing details",
    description: "Returns detailed information about a specific market listing",
    tags: ["Market", "Market Listing"],
    parameters: [
      {
        name: "listing_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "ID of the listing to retrieve",
      },
    ],
    responses: {
      "200": {
        description: "Successfully retrieved listing details",
        content: {
          "application/json": {
            schema: {
              oneOf: [
                oapi.schema("UniqueListing"),
                oapi.schema("AggregateListing"),
              ],
            },
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: {
              "Invalid listing": {
                value: { error: "Invalid listing" },
              },
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    const user = req.user as User | null | undefined
    const listing = req.market_listing!

    if (user) {
      if (listing.contractor_seller_id) {
        const contractors = await database.getUserContractors({
          user_id: user.user_id,
        })

        if (
          contractors.find(
            (c) => c.contractor_id === listing.contractor_seller_id,
          ) ||
          listing.user_seller_id === user.user_id ||
          user.role === "admin"
        ) {
          res.json(createResponse(await formatListing(listing, true)))
          return
        }
      } else {
        if (listing.user_seller_id === user.user_id) {
          res.json(createResponse(await formatListing(listing, true)))
          return
        }
      }
    }

    res.json(createResponse(await formatListing(listing)))
  },
)

// Schema for listing orders pagination response
oapi.schema("ListingOrdersPagination", {
  type: "object",
  title: "ListingOrdersPagination",
  properties: {
    currentPage: { type: "number" },
    pageSize: { type: "number" },
    totalItems: { type: "number" },
    totalPages: { type: "number" },
    hasNextPage: { type: "boolean" },
    hasPreviousPage: { type: "boolean" },
  },
  required: [
    "currentPage",
    "pageSize",
    "totalItems",
    "totalPages",
    "hasNextPage",
    "hasPreviousPage",
  ],
})

oapi.schema("ListingOrdersResponse", {
  type: "object",
  title: "ListingOrdersResponse",
  properties: {
    data: {
      type: "array",
      items: { $ref: "#/components/schemas/Order" },
    },
    pagination: { $ref: "#/components/schemas/ListingOrdersPagination" },
  },
  required: ["data", "pagination"],
})

marketRouter.get(
  "/listing/:listing_id/orders",
  can_manage_market_listing,
  oapi.validPath({
    summary: "Get paginated orders for a market listing",
    description:
      "Returns paginated orders associated with a specific market listing",
    tags: ["Market", "Market Listing"],
    parameters: [
      {
        name: "listing_id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "ID of the listing to get orders for",
      },
      {
        name: "page",
        in: "query",
        required: false,
        schema: { type: "number", minimum: 1, default: 1 },
        description: "Page number (1-based)",
      },
      {
        name: "pageSize",
        in: "query",
        required: false,
        schema: { type: "number", minimum: 1, maximum: 100, default: 20 },
        description: "Number of orders per page",
      },
      {
        name: "status",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["not-started,in-progress", "fulfilled,cancelled"],
        },
        description: "Filter orders by status",
      },
      {
        name: "sortBy",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["timestamp", "status"],
          default: "timestamp",
        },
        description: "Field to sort by",
      },
      {
        name: "sortOrder",
        in: "query",
        required: false,
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
        description: "Sort order",
      },
    ],
    responses: {
      "200": {
        description: "Successfully retrieved listing orders",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ListingOrdersResponse" },
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: {
              "Invalid listing": {
                value: { error: "Invalid listing" },
              },
            },
          },
        },
      },
      "404": {
        description: "Listing not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  }),
  async (req, res) => {
    const listing_id = req.params["listing_id"]
    const page = parseInt(req.query["page"] as string) || 1
    const pageSize = parseInt(req.query["pageSize"] as string) || 20
    const status = req.query["status"] as string | undefined
    const sortBy = (req.query["sortBy"] as string) || "timestamp"
    const sortOrder = (req.query["sortOrder"] as string) || "desc"
    const statusArray: string[] | undefined = status ? status.split(",") : []

    try {
      const result = await database.getOrdersForListingPaginated({
        listing_id,
        page,
        pageSize,
        status: statusArray,
        sortBy: sortBy as "timestamp" | "status",
        sortOrder: sortOrder as "asc" | "desc",
      })

      // Format the orders using the existing serialization
      const formattedOrders = await Promise.all(
        result.orders.map(async (order) => {
          return await serializeOrderDetails(order, null)
        }),
      )

      res.json({
        data: formattedOrders,
        pagination: result.pagination,
      })
    } catch (error) {
      logger.error("Error fetching listing orders:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

oapi.schema("PurchaseRequest", {
  type: "object",
  title: "PurchaseRequest",
  properties: {
    items: {
      type: "array",
      items: {
        $ref: "#/components/schemas/OfferBodyMarketListing",
      },
      minItems: 1,
    },
    note: {
      type: "string",
      description: "Optional note from buyer to seller",
    },
    offer: {
      type: "number",
      minimum: 0,
      description: "Optional custom offer amount in aUEC",
    },
  },
  required: ["items"],
})

marketRouter.post(
  "/purchase",

  requireMarketWrite,
  oapi.validPath({
    summary: "Purchase market listings",
    description: "Create a purchase offer for one or more market listings",
    tags: ["Market"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/PurchaseRequest",
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Purchase offer created successfully",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {
                    result: {
                      type: "string",
                      enum: ["Success"],
                    },
                    offer_id: {
                      type: "string",
                    },
                    session_id: {
                      type: "string",
                    },
                    discord_invite: {
                      type: "string",
                      nullable: true,
                    },
                  },
                  required: [
                    "result",
                    "offer_id",
                    "session_id",
                    "discord_invite",
                  ],
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
    },
  }),
  async (req, res) => {
    try {
      const user = req.user as User

      const {
        items,
        note,
        offer,
      }: {
        items: {
          listing_id: string
          quantity: number
        }[]
        note: string
        offer?: number
      } = req.body

      if (!items || !items.length) {
        res.status(400).json({ error: "Missing required fields" })
        return
      }

      const listings = await verify_listings(res, items, user)
      if (listings === undefined) {
        return
      }

      let total = 0
      let message = `Complete the delivery of sold items to [${user.username}](https://sc-market.space/user/${user.username})\n`

      for (const { quantity, listing } of listings) {
        total += quantity * +listing.listing.price
        message += `- [${listing.details.title}](https://sc-market.space/market/${
          listing.listing.listing_id
        }) (${(+listing.listing.price).toLocaleString(
          "en-us",
        )} aUEC x${quantity.toLocaleString("en-us")})\n`
      }

      message += `- Total: ${total.toLocaleString("en-us")} aUEC\n`
      message += `- User Offer: ${(offer || total).toLocaleString(
        "en-us",
      )} aUEC\n`
      if (note) {
        message += `\nNote from buyer:\n> ${note || "None"}`
      }

      const {
        offer: offer_obj,
        session,
        discord_invite,
      } = await createOffer(
        {
          customer_id: user.user_id,
          assigned_id: listings[0].listing.listing.user_seller_id,
          contractor_id: listings[0].listing.listing.contractor_seller_id,
        },
        {
          actor_id: user.user_id,
          kind: "Delivery",
          cost: (offer || total).toString(),
          title: `Items Sold to ${user.username}`,
          description: message,
        },
        listings,
      )

      res.json({
        result: "Success",
        offer_id: offer_obj.id,
        session_id: session.id,
        discord_invite: discord_invite,
      })
    } catch (e) {
      console.error(e)
      res.status(400).json({ error: "Invalid formatting!" })
    }
  },
)

oapi.schema("MarketBidRequest", {
  type: "object",
  title: "MarketBidRequest",
  properties: {
    listing_id: {
      type: "string",
      title: "MarketBidRequest.listing_id",
    },
    bid: {
      type: "number",
      minimum: 0,
      title: "MarketBidRequest.bid",
    },
  },
  required: ["listing_id", "bid"],
  additionalProperties: false,
})

marketRouter.post(
  "/listings/:listing_id/bids",

  requireMarketWrite,
  valid_market_listing,
  oapi.validPath({
    summary: "Place a bid on an auction listing",
    description: "Place or update a bid on an auction listing",
    operationId: "placeBidOnAuction",
    tags: ["Market", "Auctions"],
    security: [{ verifiedUser: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/MarketBidRequest",
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Bid placed successfully",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "object",
                  properties: {
                    result: {
                      type: "string",
                      enum: ["Success"],
                    },
                  },
                  required: ["result"],
                },
              },
              required: ["data"],
              title: "PlaceBidResponse",
            },
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Missing fields": {
                value: { error: "Missing required fields" },
              },
              "Invalid listing": {
                value: { error: "Invalid listing" },
              },
              "Invalid bid": {
                value: { error: "Invalid bid amount!" },
              },
              "Own item": {
                value: { error: "You cannot buy your own item!" },
              },
            },
          },
        },
      },
      "500": {
        description: "Server error",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Internal error": {
                value: { error: "Internal server error" },
              },
              "Auction ended": {
                value: { error: "Auction is over" },
              },
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    const user = req.user as User

    const {
      listing_id,
      bid,
    }: {
      listing_id: string
      bid: number
    } = req.body

    if (!(listing_id || bid)) {
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    const listing = req.market_listing!

    let price = +listing.price
    if (listing.sale_type !== "auction") {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    const bids = await database.getMarketBids({
      listing_id: listing.listing_id,
    })
    if (bids.length) {
      price = Math.max(...bids.map((bid) => bid.bid))
    }

    const details = await database.getAuctionDetail({ listing_id })
    if (!details) {
      res.status(500).json({ error: "Internal server error" })
      return
    }

    if (new Date(details.end_time) < new Date()) {
      res.status(500).json({ error: "Auction is over" })
      return
    }

    if (bid < price + details.minimum_bid_increment) {
      res.status(400).json({ error: "Invalid bid amount!" })
      return
    }

    if (listing.user_seller_id === user.user_id) {
      res.status(400).json({ error: "You cannot buy your own item!" })
      return
    }

    await database.deleteMarketBids({
      listing_id: listing.listing_id,
      user_bidder_id: user.user_id,
    })

    const bid_results = await database.createMarketBid({
      listing_id: listing.listing_id,
      bid: bid,
      user_bidder_id: user.user_id,
    })

    const complete = await database.getMarketListingComplete(listing.listing_id)
    await marketBidNotification(complete, bid_results[0])

    res.json({ result: "Success" })
  },
)

oapi.schema("MarketListingCreateRequest", {
  type: "object",
  title: "MarketListingCreateRequest",
  properties: {
    price: {
      type: "number",
      minimum: 0,
      title: "MarketListingCreateRequest.price",
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      title: "MarketListingCreateRequest.title",
    },
    description: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
      title: "MarketListingCreateRequest.description",
    },
    sale_type: {
      type: "string",
      enum: ["sale", "auction"],
      title: "MarketListingCreateRequest.sale_type",
    },
    item_type: {
      type: "string",
      title: "MarketListingCreateRequest.item_type",
    },
    item_name: {
      type: "string",
      nullable: true,
      title: "MarketListingCreateRequest.item_name",
    },
    quantity_available: {
      type: "integer",
      minimum: 1,
      title: "MarketListingCreateRequest.quantity_available",
    },
    photos: {
      type: "array",
      items: {
        type: "string",
        format: "uri",
      },
      title: "MarketListingCreateRequest.photos",
      description:
        "Array of photo URLs. If empty or not provided, a default placeholder photo will be used.",
    },
    minimum_bid_increment: {
      type: "number",
      minimum: 0,
      title: "MarketListingCreateRequest.minimum_bid_increment",
    },
    status: {
      type: "string",
      enum: ["active", "inactive"],
      title: "MarketListingCreateRequest.status",
    },
    end_time: {
      type: "string",
      nullable: true,
      format: "date-time",
      title: "MarketListingCreateRequest.end_time",
    },
  },
  required: [
    "price",
    "title",
    "description",
    "sale_type",
    "item_type",
    "quantity_available",
    "minimum_bid_increment",
    "status",
  ],
})

marketRouter.post(
  "/listings",

  requireMarketWrite,
  oapi.validPath({
    summary: "Create a new market listing",
    description: "Create a new market listing with optional auction settings",
    operationId: "createMarketListing",
    tags: ["Market"],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/MarketListingCreateRequest",
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Listing created successfully",
        content: {
          "application/json": {
            schema: oapi.schema("MarketListingComplete"),
          },
        },
      },
      "400": Response400,
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const {
        price,
        title,
        description,
        sale_type,
        item_type,
        item_name,
        quantity_available,
        photos,
        minimum_bid_increment,
        status,
        end_time,
        spectrum_id,
      } = req.body

      let contractor
      if (spectrum_id) {
        // Validate contractor exists and user has permissions
        contractor = await database.getContractor({ spectrum_id })
        if (!contractor) {
          res.status(400).json({ message: "Invalid contractor" })
          return
        }

        if (
          !(await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_market",
          ))
        ) {
          res.status(403).json({
            message:
              "You are not authorized to create listings on behalf of this contractor!",
          })
          return
        }
      }

      // Handle empty photos by using default placeholder
      const photosToProcess =
        photos && photos.length > 0 ? photos : [DEFAULT_PLACEHOLDER_PHOTO_URL]

      // Validate urls are valid
      if (photosToProcess.find((p: string) => !cdn.verifyExternalResource(p))) {
        res.status(400).json({ message: "Invalid photo!" })
        return
      }

      // Validate auction end time
      if (sale_type === "auction") {
        if (new Date(end_time) < new Date()) {
          res.status(400).json({ message: "Invalid end time" })
          return
        }
      }

      // Validate game item if provided
      let game_item_id: string | null = null
      if (item_name) {
        const item = await database.getGameItem({ name: item_name })
        if (!item) {
          res.status(400).json({ message: "Invalid item name" })
          return
        }
        game_item_id = item.id
      }

      const details = (
        await database.createListingDetails({
          title,
          description,
          item_type,
          game_item_id,
        })
      )[0]

      const [listing] = await database.createMarketListing({
        price,
        sale_type,
        quantity_available,
        user_seller_id: contractor ? null : user.user_id,
        contractor_seller_id: contractor ? contractor.contractor_id : null,
        status,
      })

      await database.createUniqueListing({
        accept_offers: false,
        details_id: details.details_id,
        listing_id: listing.listing_id,
      })

      if (sale_type === "auction") {
        await database.createAuctionDetails({
          minimum_bid_increment,
          end_time,
          listing_id: listing.listing_id,
          status: "active",
        })
      }

      const resources = await Promise.all(
        photosToProcess
          .filter((p: string) => p)
          .map(
            async (p: string, i: number) =>
              await cdn.createExternalResource(
                p,
                listing.listing_id + `_photo_${i}`,
              ),
          ),
      )

      await database.insertMarketListingPhoto(
        listing,
        resources.map((r) => ({ resource_id: r.resource_id })),
      )

      res.json(createResponse(await formatListing(listing)))
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: "Internal server error" })
      return
    }
  },
)

oapi.schema("ContractorMarketListingCreateRequest", {
  type: "object",
  title: "ContractorMarketListingCreateRequest",
  properties: {
    price: {
      type: "number",
      minimum: 1,
      title: "ContractorMarketListingCreateRequest.price",
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      title: "ContractorMarketListingCreateRequest.title",
    },
    description: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
      title: "ContractorMarketListingCreateRequest.description",
    },
    sale_type: {
      type: "string",
      enum: ["sale", "auction"],
      title: "ContractorMarketListingCreateRequest.sale_type",
    },
    item_type: {
      type: "string",
      title: "ContractorMarketListingCreateRequest.item_type",
    },
    item_name: {
      type: "string",
      nullable: true,
      title: "ContractorMarketListingCreateRequest.item_name",
    },
    spectrum_id: {
      type: "string",
      nullable: true,
      title: "ContractorMarketListingCreateRequest.spectrum_id",
    },
    quantity_available: {
      type: "integer",
      minimum: 1,
      title: "ContractorMarketListingCreateRequest.quantity_available",
    },
    photos: {
      type: "array",
      items: {
        type: "string",
        format: "uri",
      },
      title: "ContractorMarketListingCreateRequest.photos",
      description:
        "Array of photo URLs. If empty or not provided, a default placeholder photo will be used.",
    },
    status: {
      type: "string",
      enum: ["active", "inactive"],
      title: "ContractorMarketListingCreateRequest.status",
    },
    internal: {
      type: "boolean",
      title: "ContractorMarketListingCreateRequest.internal",
    },
    end_time: {
      type: "string",
      format: "date-time",
      nullable: true,
      title: "ContractorMarketListingCreateRequest.end_time",
    },
    minimum_bid_increment: {
      type: "number",
      minimum: 0,
      title: "ContractorMarketListingCreateRequest.minimum_bid_increment",
    },
  },
  required: [
    "price",
    "title",
    "description",
    "sale_type",
    "item_type",
    "quantity_available",
    "status",
    "internal",
  ],
  additionalProperties: false,
})

marketRouter.post(
  "/contractor/:spectrum_id/create",

  requireMarketWrite,
  oapi.validPath({
    summary: "Create a new contractor market listing",
    description: "Create a new market listing on behalf of a contractor",
    operationId: "createContractorMarketListing",
    tags: ["Market", "Market Listing"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
        },
        description: "Contractor's Spectrum ID",
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: oapi.schema("ContractorMarketListingCreateRequest"),
        },
      },
    },
    responses: {
      "200": {
        description: "Listing created successfully",
        content: {
          "application/json": {
            schema: oapi.schema("MarketListingComplete"),
          },
        },
      },
      "400": Response400,
      "403": Response403,
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: oapi.schema("ErrorResponse"),
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const spectrum_id = req.params["spectrum_id"]

      // Validate contractor exists and user has permissions
      const contractor = await database.getContractor({ spectrum_id })
      if (!contractor) {
        res.status(400).json({ message: "Invalid contractor" })
        return
      }

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        res.status(403).json({
          message:
            "You are not authorized to create listings on behalf of this contractor!",
        })
        return
      }

      const {
        price,
        title,
        description,
        sale_type,
        item_type,
        item_name,
        quantity_available,
        photos,
        status,
        internal,
        end_time,
        minimum_bid_increment,
      } = req.body

      // Handle empty photos by using default placeholder
      const photosToProcess =
        photos && photos.length > 0 ? photos : [DEFAULT_PLACEHOLDER_PHOTO_URL]

      // Validate photos are from CDN
      if (photosToProcess.find((p: string) => !cdn.verifyExternalResource(p))) {
        res.status(400).json({ message: "Invalid photo!" })
        return
      }

      // Validate auction end time
      if (sale_type === "auction") {
        if (new Date(end_time) < new Date()) {
          res.status(400).json({ message: "Invalid end time" })
          return
        }
      }

      // Validate game item if provided
      let game_item_id: string | null = null
      if (item_name) {
        const item = await database.getGameItem({ name: item_name })
        if (!item) {
          res.status(400).json({ message: "Invalid item name" })
          return
        }
        game_item_id = item.id
      }

      const details = (
        await database.createListingDetails({
          title,
          description,
          item_type,
          game_item_id,
        })
      )[0]

      const [listing] = await database.createMarketListing({
        price,
        sale_type,
        quantity_available,
        contractor_seller_id: contractor.contractor_id,
        status,
        internal,
      })

      await database.createUniqueListing({
        accept_offers: false,
        details_id: details.details_id,
        listing_id: listing.listing_id,
      })

      if (sale_type === "auction") {
        await database.createAuctionDetails({
          minimum_bid_increment,
          end_time,
          listing_id: listing.listing_id,
          status: "active",
        })
      }

      const resources = await Promise.all(
        photosToProcess
          .filter((p: string) => p)
          .map(
            async (p: string, i: number) =>
              await cdn.createExternalResource(
                p,
                listing.listing_id + `_photo_${i}`,
              ),
          ),
      )

      await database.insertMarketListingPhoto(
        listing,
        resources.map((r) => ({ resource_id: r.resource_id })),
      )

      res.json(createResponse(await formatListing(listing)))
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: "Internal server error" })
      return
    }
  },
)

// Upload photos for a market listing (multipart/form-data)
marketRouter.post(
  "/listing/:listing_id/photos",
  userAuthorized,
  requireMarketWrite,
  can_manage_market_listing,
  multiplePhotoUpload.array("photos", 5),
  oapi.validPath({
    summary: "Upload photos for a market listing",
    description:
      "Upload up to 5 photos for a specific market listing. Photos are stored in CDN and linked to the listing. If the total number of photos would exceed 5, the oldest photos will be automatically removed to maintain the limit.",
    operationId: "uploadListingPhotos",
    tags: ["Market"],
    parameters: [
      {
        name: "listing_id",
        in: "path",
        required: true,
        description: "ID of the listing to upload photos for",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "Photos uploaded successfully",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/PhotoUploadResponse",
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "500": Response500,
    },
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const listing_id = req.params.listing_id
      const photos = req.files as unknown as Express.Multer.File[]

      if (!photos || photos.length === 0) {
        res.status(400).json({ message: "No photos provided" })
        return
      }

      if (photos.length > 5) {
        res
          .status(400)
          .json({ message: "Maximum 5 photos can be uploaded at once" })
        return
      }

      const listing = req.market_listing!

      // Get existing photos to check count
      const existing_photos =
        await database.getMarketListingImagesByListingID(listing)

      // Check if any existing photos are the default placeholder and should be removed
      const photosToRemove: any[] = []

      // First, identify and remove default placeholder photos
      for (const photo of existing_photos) {
        try {
          const resolvedUrl = await cdn.getFileLinkResource(photo.resource_id)
          if (resolvedUrl === DEFAULT_PLACEHOLDER_PHOTO_URL) {
            photosToRemove.push(photo)
          }
        } catch (error) {
          console.error("Failed to resolve photo URL:", error)
          // Continue processing other photos
        }
      }

      // Calculate total photos after upload (excluding default photos that will be removed)
      const totalPhotosAfterUpload =
        existing_photos.length - photosToRemove.length + photos.length

      // If we would still exceed 5 total photos, remove additional old photos
      if (totalPhotosAfterUpload > 5) {
        const additionalPhotosToDelete = totalPhotosAfterUpload - 5
        const nonDefaultPhotos = existing_photos.filter(
          (photo) =>
            !photosToRemove.some(
              (toRemove) => toRemove.resource_id === photo.resource_id,
            ),
        )

        // Delete oldest non-default photos first
        const additionalPhotosToRemove = nonDefaultPhotos.slice(
          0,
          additionalPhotosToDelete,
        )
        photosToRemove.push(...additionalPhotosToRemove)
      }

      // Remove identified photos
      for (const photo of photosToRemove) {
        try {
          await database.deleteMarketListingImages(photo)
          // Use CDN removeResource to ensure both database and CDN cleanup
          await cdn.removeResource(photo.resource_id)
        } catch (error) {
          console.error("Failed to delete old photo:", error)
          // Continue with new photo insertion even if deletion fails
        }
      }

      // Upload new photos to CDN and create database records
      const uploadResults = []
      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index]
        try {
          const fileExtension = photo.mimetype.split("/")[1] || "png"
          const resource = await cdn.uploadFile(
            `${listing_id}-photos-${index}-${randomUUID()}.${fileExtension}`,
            photo.path,
            photo.mimetype,
          )

          uploadResults.push({ success: true, resource, index })
        } catch (error) {
          // Handle different types of errors and return appropriate responses
          if (error instanceof Error) {
            if (error.message.includes("Image failed moderation checks")) {
              logger.debug(
                `Photo ${index + 1} failed content moderation:`,
                error,
              )
              res.status(400).json({
                error: "Content Moderation Failed",
                message: `Photo ${index + 1} failed content moderation checks and cannot be uploaded.`,
                details: "One or more photos contain inappropriate content.",
              })
              return
            }

            if (
              error.message.includes("Missing required fields") ||
              error.message.includes("VALIDATION_ERROR") ||
              error.message.includes("UNSUPPORTED_FORMAT")
            ) {
              logger.debug(`Photo ${index + 1} failed validation:`, error)
              res.status(400).json({
                error: "Validation Failed",
                message: `Photo ${index + 1} failed validation: ${error.message}`,
                details: "Please check the file format and try again.",
              })
              return
            }

            if (error.message.includes("Unsupported MIME type")) {
              logger.debug(`Photo ${index + 1} has unsupported format:`, error)
              res.status(400).json({
                error: "Unsupported File Type",
                message: `Photo ${index + 1} has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.`,
                details: "Please ensure all photos are in supported formats.",
              })
              return
            }
          }

          // Log unexpected errors as error level
          logger.error(`Failed to upload photo ${index + 1}:`, error)
          res.status(500).json({
            error: "Upload Failed",
            message: `Failed to upload photo ${index + 1}`,
            details:
              "An unexpected error occurred during upload. Please try again.",
          })
          return
        }
      }

      const uploadedResources = uploadResults.map((result) => result.resource)

      // Insert new photos into database
      await database.insertMarketListingPhoto(
        listing,
        uploadedResources.map((r) => ({ resource_id: r.resource_id })),
      )

      // Get CDN URLs for response
      const photoUrls = await Promise.all(
        uploadedResources.map(async (resource) => ({
          resource_id: resource.resource_id,
          url: await cdn.getFileLinkResource(resource.resource_id),
        })),
      )

      res.json({
        result: "Photos uploaded successfully",
        photos: photoUrls,
      })
    } finally {
      // Clean up uploaded files regardless of success/failure
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path)
            }
          } catch (cleanupError) {
            logger.error(
              `Failed to cleanup temporary file ${file.path}:`,
              cleanupError,
            )
          }
        }
      }
    }
  },
)

// Track a view on a market listing
marketRouter.post(
  "/listings/:listing_id/views",
  valid_market_listing,
  oapi.validPath({
    summary: "Track a view on a market listing",
    description: "Records a view on a market listing for analytics purposes",
    operationId: "trackMarketListingView",
    deprecated: false,
    tags: ["Market"],
    parameters: [
      {
        name: "listing_id",
        in: "path",
        required: true,
        description: "ID of the listing to track view for",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "View tracked successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
            },
          },
        },
      },
      "400": Response400,
      "404": Response404,
      "500": Response500,
    },
    security: [],
  }),
  async (req, res) => {
    try {
      const { listing_id } = req.params
      const user = req.user

      // Track the view
      await database.trackListingView({
        listing_type: "market",
        listing_id,
        viewer_id: user ? (user as User).user_id : null,
        viewer_ip: req.ip,
        user_agent: req.get("User-Agent"),
        referrer: req.get("Referer"),
        session_id: req.sessionID,
      })

      res.json({ message: "View tracked successfully" })
    } catch (error) {
      logger.error("Error tracking market listing view", {
        error,
        listing_id: req.params.listing_id,
      })
      res.status(500).json({ message: "Internal server error" })
    }
  },
)

marketRouter.get(
  "/mine",
  userAuthorized,
  requireMarketRead,
  oapi.validPath({
    summary: "Get my market listings",
    description:
      "Get all market listings created by the authenticated user or their organization with optional search and filtering",
    tags: ["Market", "Market Listing"],
    parameters: [
      {
        name: "contractor_id",
        in: "query",
        required: false,
        schema: { type: "string" },
        description:
          "Contractor ID to get listings for (user must be a member)",
      },
      {
        name: "query",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Search query to filter listings by title or description",
      },
      {
        name: "statuses",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Comma-separated list of statuses",
      },
      {
        name: "sale_type",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["unique", "aggregate", "multiple", "auction"],
        },
        description: "Filter by sale type",
      },
      {
        name: "item_type",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Filter by item type",
      },
      {
        name: "listing_type",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: ["unique", "aggregate", "multiple"],
        },
        description: "Filter by listing type",
      },
      {
        name: "sort",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Sort method",
      },
      {
        name: "index",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 0, default: 0 },
        description: "Starting index for pagination",
      },
      {
        name: "page_size",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 96, default: 16 },
        description: "Number of results per page",
      },
      {
        name: "minCost",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Minimum price filter",
      },
      {
        name: "maxCost",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Maximum price filter",
      },
      {
        name: "quantityAvailable",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Minimum quantity available",
      },
    ],
    responses: {
      "200": {
        description: "Successfully retrieved listings",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                listings: {
                  type: "array",
                  items: { type: "object" },
                },
                total: {
                  type: "integer",
                },
              },
            },
          },
        },
      },
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [{ bearerAuth: [] }],
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const contractorId = req.query.contractor_id as string
      const searchQuery = await convertQuery(
        req.query as Partial<MarketSearchQueryArguments>,
      )

      // Use the unified market search approach
      const marketSearchQuery: MarketSearchQuery = {
        query: searchQuery.query || "",
        statuses: searchQuery.statuses || null,
        sale_type: searchQuery.sale_type || null,
        item_type: searchQuery.item_type || null,
        listing_type: searchQuery.listing_type || null,
        minCost: searchQuery.minCost || 0,
        maxCost: searchQuery.maxCost || null,
        quantityAvailable: searchQuery.quantityAvailable || 0,
        sort: searchQuery.sort,
        reverseSort: searchQuery.reverseSort,
        index: searchQuery.index,
        page_size: searchQuery.page_size,
        rating: null,
        seller_rating: 0,
      }

      // Add seller filter
      if (contractorId) {
        // Look up contractor_id from spectrum_id
        const contractor = await database.getContractor({
          spectrum_id: contractorId,
        })
        marketSearchQuery.contractor_seller_id = contractor.contractor_id
      } else {
        marketSearchQuery.user_seller_id = user.user_id
      }

      // Get unified results from unmaterialized view for real-time data
      const searchResults =
        await database.searchMarketUnmaterialized(marketSearchQuery)

      // Format listings using the same approach as market search
      const formattedListings = await Promise.all(
        searchResults.map((listing) => formatPrivateSearchResult(listing)),
      )

      // Extract total count from the first result (if any)
      const total = searchResults.length > 0 ? searchResults[0].full_count : 0

      res.json(createResponse({ listings: formattedListings, total }))
    } catch (error) {
      logger.error("Error in /mine:", error)
      res
        .status(500)
        .json(createErrorResponse({ error: "Internal server error" }))
    }
  },
)

oapi.schema("MarketListingSearchResult", {
  type: "object",
  description: "A market listing as returned in search results",
  properties: {
    listing_id: {
      $ref: "#/components/schemas/UUID",
      description: "Unique identifier for the listing",
    },
    listing_type: {
      $ref: "#/components/schemas/ListingType",
      description: "Type of listing",
    },
    item_type: {
      $ref: "#/components/schemas/ItemType",
      description: "Type of game item",
    },
    item_name: {
      type: "string",
      nullable: true,
      description: "Name of the specific game item",
    },
    game_item_id: {
      $ref: "#/components/schemas/GameItemId",
      description: "Specific game item identifier",
    },
    sale_type: {
      $ref: "#/components/schemas/SaleType",
      description: "Type of sale",
    },
    price: {
      $ref: "#/components/schemas/Price",
      description: "Current price",
    },
    expiration: {
      $ref: "#/components/schemas/Timestamp",
      nullable: true,
      description: "When the listing expires",
    },
    minimum_price: {
      $ref: "#/components/schemas/Price",
      description: "Minimum price (for auctions)",
    },
    maximum_price: {
      $ref: "#/components/schemas/Price",
      description: "Maximum price (for auctions)",
    },
    quantity_available: {
      $ref: "#/components/schemas/Quantity",
      description: "Available quantity",
    },
    timestamp: {
      $ref: "#/components/schemas/Timestamp",
      description: "When the listing was created",
    },
    details_id: {
      $ref: "#/components/schemas/UUID",
      description: "ID of the listing details",
    },
    status: {
      $ref: "#/components/schemas/ListingStatus",
      description: "Current status",
    },
    title: {
      $ref: "#/components/schemas/ListingTitle",
      description: "Listing title",
    },
    photo: {
      type: "string",
      description: "URL to the primary photo",
    },
    internal: {
      type: "boolean",
      description: "Whether this is an internal listing",
    },
    auction_end_time: {
      $ref: "#/components/schemas/Timestamp",
      nullable: true,
      description: "When the auction ends (for auction listings)",
    },
    // Rating information (from seller)
    total_rating: {
      type: "number",
      description: "Total rating points for the seller",
    },
    avg_rating: {
      type: "number",
      description: "Average rating for the seller",
    },
    rating_count: {
      type: "integer",
      nullable: true,
      description: "Number of ratings for the seller",
    },
    rating_streak: {
      type: "integer",
      nullable: true,
      description: "Current rating streak for the seller",
    },
    // Seller information
    user_seller: {
      type: "string",
      nullable: true,
      description: "Username of the user seller",
    },
    contractor_seller: {
      type: "string",
      nullable: true,
      description: "Spectrum ID of the contractor seller",
    },
    // Performance metrics
    total_orders: {
      type: "integer",
      nullable: true,
      description: "Total number of orders for the seller",
    },
    total_assignments: {
      type: "integer",
      nullable: true,
      description: "Total number of assignments for the seller",
    },
    response_rate: {
      type: "number",
      nullable: true,
      description: "Response rate percentage for the seller",
    },
  },
  required: [
    "listing_id",
    "listing_type",
    "item_type",
    "sale_type",
    "price",
    "quantity_available",
    "timestamp",
    "status",
    "title",
    "photo",
    "internal",
    "total_rating",
    "avg_rating",
  ],
  additionalProperties: false,
})

marketRouter.get(
  "/listings",
  oapi.validPath({
    summary: "Search market listings",
    description:
      "Search for market listings with various filters and status options",
    operationId: "searchMarketListings",
    tags: ["Market"],
    parameters: [
      {
        name: "item_type",
        in: "query",
        schema: { type: "string", nullable: true },
      },
      {
        name: "sale_type",
        in: "query",
        schema: { type: "string", nullable: true },
      },
      {
        name: "minCost",
        in: "query",
        schema: { type: "string" },
      },
      {
        name: "maxCost",
        in: "query",
        schema: { type: "string", nullable: true },
      },
      {
        name: "quantityAvailable",
        in: "query",
        schema: { type: "string" },
      },
      {
        name: "query",
        in: "query",
        schema: { type: "string" },
      },
      {
        name: "sort",
        in: "query",
        schema: {
          type: "string",
          enum: [
            "date-old",
            "date-new",
            "rating",
            "title",
            "price-low",
            "price-high",
            "quantity-low",
            "quantity-high",
            "activity",
          ],
        },
      },
      {
        name: "index",
        in: "query",
        schema: { type: "string", default: "0" },
      },
      {
        name: "page_size",
        in: "query",
        schema: {
          type: "string",
          default: 16,
          maximum: 96,
        },
      },
      {
        name: "user_seller",
        in: "query",
        schema: { type: "string" },
      },
      {
        name: "contractor_seller",
        in: "query",
        schema: { type: "string" },
      },
      {
        name: "listing_type",
        in: "query",
        schema: { type: "string", nullable: true },
      },
      {
        name: "statuses",
        in: "query",
        schema: { type: "string", nullable: true },
        description:
          "Comma-separated list of statuses to include (e.g., 'active', 'active,inactive', 'active,inactive,archived')",
      },
    ],
    responses: {
      "200": {
        description: "Search completed successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    total: { type: "integer" },
                    listings: {
                      type: "array",
                      items: oapi.schema("MarketListingSearchResult"),
                    },
                  },
                  required: ["total", "listings"],
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "400": Response400,
      "500": Response500,
    },
  }),
  async (req, res) => {
    let query
    try {
      query = await convertQuery(req.query)
    } catch (e) {
      res.status(400).json(createErrorResponse({ message: "Invalid query" }))
      return
    }

    try {
      // Determine if we should include internal listings
      let includeInternal = false

      // If contractor_seller_id is specified and user is authenticated, check if user is a member
      if (query.contractor_seller_id && req.user) {
        const user = req.user as User
        if (await is_member(query.contractor_seller_id, user.user_id)) {
          includeInternal = true
        }
      }

      const searchResults = await database.searchMarket(query, {
        ...(includeInternal ? {} : { internal: "false" }), // Only filter internal when we don't want to include them
      })

      res.json(
        createResponse({
          total: searchResults[0] ? searchResults[0].full_count : 0,
          listings: searchResults.map((r) => ({
            listing_id: r.listing_id,
            listing_type: r.listing_type,
            item_type: r.item_type,
            item_name: r.item_name,
            game_item_id: r.game_item_id,
            sale_type: r.sale_type === "sale" ? r.listing_type : r.sale_type, // Map 'sale' to listing_type
            price: Number(r.price), // Convert string to number
            expiration: r.expiration,
            minimum_price: Number(r.minimum_price), // Convert string to number
            maximum_price: Number(r.maximum_price), // Convert string to number
            quantity_available: Number(r.quantity_available), // Convert string to number
            timestamp: r.timestamp,
            total_rating: r.total_rating,
            avg_rating: r.avg_rating,
            details_id: r.details_id,
            status: r.status,
            user_seller: r.user_seller,
            contractor_seller: r.contractor_seller,
            auction_end_time: r.auction_end_time,
            rating_count: r.rating_count,
            rating_streak: r.rating_streak,
            total_orders: r.total_orders,
            // Add responsive badge data
            total_assignments: r.total_assignments,
            response_rate: r.response_rate,
            title: r.title,
            photo: r.photo,
            internal: r.internal,
          })),
        }),
      )
    } catch (e) {
      console.error(e)
      res
        .status(500)
        .json(createErrorResponse({ message: "Internal server error" }))
    }
  },
)

marketRouter.get(
  "/public",
  oapi.validPath({
    summary: "Get all public market listings",
    description:
      "Returns all active, public market listings including unique, aggregate, and multiple listings",
    operationId: "getPublicListings",
    tags: ["Market"],
    responses: {
      "200": {
        description: "Public listings retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: oapi.schema("MarketListingComplete"),
            },
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: { type: "string" },
              },
              required: ["error"],
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const listings = await database.getMarketUniqueListingsComplete({
        status: "active",
        internal: false,
      })
      const aggregates = await database.getMarketAggregatesComplete(
        {},
        { status: "active", internal: false },
        true,
      )
      const multiples = await database.getMarketMultiplesComplete(
        {},
        { status: "active", internal: false },
        true,
      )

      res.json(
        await Promise.all(
          [...listings, ...aggregates, ...multiples].map((l) =>
            formatListingComplete(l),
          ),
        ),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

marketRouter.get(
  "/all_listings",
  adminAuthorized,
  requireMarketAdmin,
  async (req, res) => {
    const listings = await database.getMarketListings({})

    res.json(await Promise.all(listings.map((l) => formatListing(l, true))))
  },
)

marketRouter.get(
  "/user/:username",
  oapi.validPath({
    summary: "Get user's active market listings",
    description: "Returns all active market listings for a specific user",
    operationId: "getUserListings",
    tags: ["Market"],
    parameters: [
      {
        name: "username",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
        description: "Username of the seller whose listings to retrieve",
      },
    ],
    responses: {
      "200": {
        description: "User's listings retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: oapi.schema("MarketListingComplete"),
            },
          },
        },
      },
      "400": {
        description: "Invalid username provided",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "string",
                },
              },
              required: ["error"],
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    const username = req.params["username"]
    const user = await database.getUser({ username: username })
    if (!user) {
      res.status(400).json({ error: "Invalid user" })
      return
    }

    const listings = await database.getMarketUniqueListingsComplete({
      status: "active",
      user_seller_id: user.user_id,
    })
    const multiples = await database.getMarketMultipleListingsComplete({
      "market_multiples.user_seller_id": user.user_id,
      status: "active",
    })

    res.json(
      await Promise.all(
        [...listings, ...multiples].map((l) => formatListingComplete(l, false)),
      ),
    )
    return
  },
)

marketRouter.get(
  "/contractor/:spectrum_id",
  valid_contractor,
  oapi.validPath({
    summary: "Get contractor's market listings",
    description:
      "Returns active market listings for a contractor. If user is a member of the contractor organization, includes internal listings.",
    operationId: "getContractorPublicListings",
    tags: ["Market"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
        description: "Spectrum ID of the contractor organization",
      },
    ],
    responses: {
      "200": {
        description: "Contractor listings retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: oapi.schema("MarketListingComplete"),
            },
          },
        },
      },
      "400": {
        description: "Invalid contractor ID provided",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "string",
                },
              },
              required: ["error"],
            },
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "string",
                },
              },
              required: ["error"],
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const contractor = req.contractor

      if (req.user) {
        const user = req.user as User
        if (await is_member(contractor.contractor_id, user.user_id)) {
          const listings = await database.getMarketUniqueListingsComplete({
            status: "active",
            contractor_seller_id: contractor.contractor_id,
          })
          const multiples = await database.getMarketMultipleListingsComplete({
            status: "active",
            "market_multiples.contractor_seller_id": contractor.contractor_id,
          })

          res.json(
            await Promise.all(
              [...listings, ...multiples].map((l) =>
                formatListingComplete(l, false),
              ),
            ),
          )
          return
        }
      }

      const listings = await database.getMarketUniqueListingsComplete({
        status: "active",
        internal: false,
        contractor_seller_id: contractor.contractor_id,
      })
      const multiples = await database.getMarketMultipleListingsComplete({
        status: "active",
        internal: false,
        "market_multiples.contractor_seller_id": contractor.contractor_id,
      })

      res.json(
        await Promise.all(
          [...listings, ...multiples].map((l) => formatListingComplete(l)),
        ),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" }) // Fixed status code from 400 to 500
    }
  },
)

// First register the schema
oapi.schema("MarketAggregateComplete", {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["aggregate"],
      description: "Type of the market listing",
    },
    details: {
      type: "object",
      description: "Item details",
    },
    aggregate_id: {
      type: "string",
      description: "Game item ID for the aggregate",
    },
    photos: {
      type: "array",
      items: {
        type: "string",
        description: "CDN URLs for item images",
      },
    },
    buy_orders: {
      type: "array",
      items: {
        $ref: "#/components/schemas/BuyOrder",
      },
      description: "List of buy orders for this item",
    },
    listings: {
      type: "array",
      items: {
        $ref: "#/components/schemas/ListingBase",
      },
      description: "List of related listings",
    },
  },
  required: [
    "type",
    "details",
    "aggregate_id",
    "photos",
    "buy_orders",
    "listings",
  ],
  additionalProperties: false,
  title: "MarketAggregateComplete",
})

// Then use it in the route
marketRouter.get(
  "/aggregates/buyorders",
  oapi.validPath({
    summary: "Get market buy orders",
    description:
      "Returns all market buy orders grouped by game item aggregates",
    operationId: "getMarketBuyOrders",
    tags: ["Market", "Aggregates"],
    responses: {
      "200": {
        description: "Buy orders retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                $ref: "#/components/schemas/MarketAggregateComplete",
              },
            },
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "string",
                },
              },
              required: ["error"],
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const aggregates = await database.getMarketBuyOrdersComplete()
      res.json(
        await Promise.all(
          aggregates.map((a) => formatMarketAggregateComplete(a)),
        ),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// First register the schema for the chart data point
oapi.schema("BuyOrderChartDataPoint", {
  type: "object",
  properties: {
    high: {
      type: "number",
      description: "Highest price during the day",
    },
    low: {
      type: "number",
      description: "Lowest price during the day",
    },
    close: {
      type: "number",
      description: "Closing price of the day",
    },
    open: {
      type: "number",
      description: "Opening price of the day",
    },
    timestamp: {
      type: "number",
      description: "Unix timestamp for the day",
    },
    volume: {
      type: "number",
      description: "Total quantity of orders during the day",
    },
  },
  required: ["high", "low", "close", "open", "timestamp", "volume"],
  additionalProperties: false,
  title: "BuyOrderChartDataPoint",
})

// Then use it in the route
marketRouter.get(
  "/aggregate/:game_item_id/chart",
  oapi.validPath({
    summary: "Get buy order chart data",
    description:
      "Returns 30 days of OHLC (Open/High/Low/Close) price and volume data for buy orders of a specific game item",
    operationId: "getGameItemBuyOrderChart",
    tags: ["Market", "Aggregates", "Charts"],
    parameters: [
      {
        name: "game_item_id",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
        description: "ID of the game item to get chart data for",
      },
    ],
    responses: {
      "200": {
        description: "Chart data retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                $ref: "#/components/schemas/BuyOrderChartDataPoint",
              },
            },
          },
        },
      },
      "400": {
        description: "Invalid game item ID provided",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "string",
                },
              },
              required: ["error"],
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const game_item_id = req.params["game_item_id"]
      const buy_orders = await database.getBuyOrdersByGameItemID(
        game_item_id,
        true,
      )
      res.json(await formatBuyOrderChartDetails(buy_orders))
    } catch (e) {
      console.error(e)
      res.status(400).json({ error: "Invalid item" })
      return
    }
  },
)

marketRouter.get("/aggregate/:game_item_id/history", async (req, res) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const price_history = await database.getPriceHistory({ game_item_id })
    res.json(await formatPriceHistory(price_history))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
})

// TODO: Redo
marketRouter.post(
  "/aggregate/:game_item_id/update",
  adminAuthorized,
  requireMarketAdmin,
  async (req, res) => {
    try {
      const game_item_id = req.params["game_item_id"]
      const game_item = await database.getGameItem({
        id: game_item_id,
      })

      if (!game_item) {
        res.status(400).json({ error: "Invalid item" })
        return
      }

      const details_id = game_item.details_id

      const { title, description, photo } = req.body as {
        title?: string
        description?: string
        photo?: string
      }

      if (title || description) {
        await database.updateListingDetails(
          { details_id },
          { title, description },
        )
      }

      if (photo) {
        let resource
        try {
          resource = await cdn.createExternalResource(
            photo,
            game_item_id.toString() + `_photo_${0}`,
          )
        } catch (e: any) {
          res.status(400).json({ error: "Invalid photo!" })
          return
        }

        const photos = await database.getMarketListingImages({ details_id })
        for (const p of photos) {
          await database.deleteMarketListingImages(p)
          try {
            // Use CDN removeResource to ensure both database and CDN cleanup
            await cdn.removeResource(p.resource_id)
          } catch {}
        }

        await database.insertMarketDetailsPhoto({
          details_id,
          resource_id: resource.resource_id,
        })
      }

      res.json({ result: "Success" })
    } catch (e) {
      console.error(e)
      res.status(400).json({ error: "Invalid item" })
      return
    }
  },
)

marketRouter.get("/aggregate/:game_item_id", async (req, res) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const aggregate = await database.getMarketAggregateComplete(game_item_id, {
      status: "active",
      internal: false,
    })

    if (aggregate === null) {
      res.status(400).json({ error: "Invalid item" })
      return
    }

    res.json(await formatMarketAggregateComplete(aggregate))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
})

marketRouter.get("/multiple/:multiple_id", async (req, res) => {
  try {
    const user = req.user as User | undefined | null
    const multiple_id = req.params["multiple_id"]
    const multiple = await database.getMarketMultipleComplete(multiple_id, {})

    if (multiple === null) {
      res.status(400).json({ error: "Invalid item" })
      return
    }

    let show_private = false
    if (user) {
      if (multiple.contractor_seller_id) {
        show_private = await is_member(
          multiple.contractor_seller_id,
          user.user_id,
        )
      } else {
        show_private = multiple.user_seller_id === user.user_id
      }
    }

    res.json(await formatMarketMultipleComplete(multiple, show_private))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
})

marketRouter.post(
  "/multiple/contractor/:spectrum_id/create",

  requireMarketWrite,
  org_permission("manage_market"),
  async (req: Request, res) => {
    try {
      const contractor = req.contractor
      const user = req.user

      const { listings, default_listing_id, title, item_type, description } =
        req.body as {
          listings: string[]
          default_listing_id: string
          title: string
          item_type: string
          description: string
        }

      if (
        !title ||
        !title.length ||
        !description ||
        !description.length ||
        !item_type ||
        !item_type.length
      ) {
        res.status(400).json({ error: "Missing required field" })
        return
      }

      if (!listings.includes(default_listing_id)) {
        listings.push(default_listing_id)
      }

      const listingObjects: DBUniqueListing[] = []
      for (const listing of listings) {
        try {
          const listingObject = await database.getMarketListing({
            listing_id: listing,
          })
          const listingObjectUnique = await database.getMarketUniqueListing({
            listing_id: listing,
          })
          listingObjects.push(listingObjectUnique)
          if (listingObject.sale_type !== "sale") {
            res.status(400).json({ error: "Invalid listing sale type" })
            return
          }
          if (
            listingObject.contractor_seller_id !== req.contractor.contractor_id
          ) {
            res
              .status(400)
              .json({ error: "Cannot add listing owned by another user" })
            return
          }
        } catch (e) {
          res.status(400).json({ error: "Invalid listing" })
          return
        }
      }

      const details = await database.createListingDetails({
        item_type,
        title,
        description,
      })

      const multiples = await database.createMarketMultiple({
        contractor_seller_id: req.contractor.contractor_id,
        details_id: details[0].details_id,
        default_listing_id: default_listing_id,
      })

      await database.createMarketMultipleListing(
        listingObjects.map((l) => ({
          multiple_listing_id: l.listing_id,
          multiple_id: multiples[0].multiple_id,
          details_id: l.details_id,
        })),
      )

      for (const listingObject of listingObjects) {
        // Set it to type multiple
        await database.updateMarketListing(listingObject.listing_id, {
          sale_type: "multiple",
        })
        // Remove unique listing
        await database.removeUniqueListing({
          listing_id: listingObject.listing_id,
        })
        // Make multiples compatible with unique/aggregate listing lookup by ID
      }

      res.json(
        await formatListingComplete(
          await database.getMarketMultipleComplete(
            multiples[0].multiple_id,
            {},
          ),
        ),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

marketRouter.post(
  "/multiple/create",

  requireMarketWrite,
  async (req: Request, res) => {
    try {
      const user = req.user as User

      const { listings, default_listing_id, title, item_type, description } =
        req.body as {
          listings: string[]
          default_listing_id: string
          title: string
          item_type: string
          description: string
        }

      if (
        !title ||
        !title.length ||
        !description ||
        !description.length ||
        !item_type ||
        !item_type.length
      ) {
        res.status(400).json({ error: "Missing required field" })
        return
      }

      if (!listings.includes(default_listing_id)) {
        listings.push(default_listing_id)
      }

      const listingObjects: DBUniqueListing[] = []
      for (const listing of listings) {
        try {
          const listingObject = await database.getMarketListing({
            listing_id: listing,
          })
          const listingObjectUnique = await database.getMarketUniqueListing({
            listing_id: listing,
          })
          listingObjects.push(listingObjectUnique)
          if (listingObject.sale_type !== "sale") {
            res.status(400).json({ error: "Invalid listing sale type" })
            return
          }
          if (
            listingObject.contractor_seller_id &&
            listingObject.contractor_seller_id !== req.contractor?.contractor_id
          ) {
            res
              .status(400)
              .json({ error: "Cannot add listing owned by another user" })
            return
          }
        } catch (e) {
          console.error(e)
          res.status(400).json({ error: "Invalid listing" })
          return
        }
      }

      const details = await database.createListingDetails({
        item_type,
        title,
        description,
      })

      const multiples = await database.createMarketMultiple({
        user_seller_id: user.user_id,
        details_id: details[0].details_id,
        default_listing_id: default_listing_id,
      })

      const response = await database.createMarketMultipleListing(
        listingObjects.map((l) => ({
          multiple_listing_id: l.listing_id,
          multiple_id: multiples[0].multiple_id,
          details_id: l.details_id,
        })),
      )

      for (const listingObject of listingObjects) {
        // Set it to type multiple
        await database.updateMarketListing(listingObject.listing_id, {
          sale_type: "multiple",
        })
        // Remove unique listing
        await database.removeUniqueListing({
          listing_id: listingObject.listing_id,
        })
      }

      res.json(response[0])
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/multiple/:multiple_id/update",
  userAuthorized,
  requireMarketWrite,
  async (req: Request, res) => {
    try {
      const multiple_id = req.params.multiple_id
      const user = req.user as User

      const { listings, default_listing_id, title, item_type, description } =
        req.body as {
          listings: string[]
          default_listing_id: string
          title: string
          item_type: string
          description: string
        }

      const multiple = await database.getMarketMultipleComplete(multiple_id, {})
      if (multiple.contractor_seller_id) {
        if (
          !(await has_permission(
            multiple.contractor_seller_id,
            user.user_id,
            "manage_market",
          ))
        ) {
          res.status(403).json({ error: "Missing required permissions" })
          return
        }
      } else {
        if (multiple.user_seller_id !== user.user_id) {
          res.status(403).json({ error: "Missing required permissions" })
          return
        }
      }

      if (
        (title && !title.length) ||
        (description && !description.length) ||
        (item_type && !item_type.length)
      ) {
        res.status(400).json({ error: "Missing required field" })
        return
      }

      if (!listings.includes(default_listing_id)) {
        listings.push(default_listing_id)
      }

      const old_set = new Set(
        multiple.listings.map((l) => l.listing.listing_id),
      )
      const new_set = new Set(listings)
      const removed = new Set(
        Array.from(old_set).filter((l) => !new_set.has(l)),
      ) // in old but not new
      const added = new Set(Array.from(new_set).filter((l) => !old_set.has(l))) // in new but not old

      const uniqueListingObjects: DBUniqueListing[] = []
      const multipleListingObjects: DBMultipleListingComplete[] = []
      for (const listing of added) {
        try {
          const listingObject = await database.getMarketListing({
            listing_id: listing,
          })
          if (listingObject.sale_type === "sale") {
            const listingObjectUnique = await database.getMarketUniqueListing({
              listing_id: listing,
            })
            uniqueListingObjects.push(listingObjectUnique)
          } else {
            const listingObject =
              await database.getMarketMultipleListingComplete(listing)
            multipleListingObjects.push(listingObject)
          }

          if (!["sale", "multiple"].includes(listingObject.sale_type)) {
            res.status(400).json({ error: "Invalid listing sale type" })
            return
          }
          if (listingObject.contractor_seller_id) {
            if (
              listingObject.contractor_seller_id !==
              multiple.contractor_seller_id
            ) {
              res
                .status(400)
                .json({ error: "Cannot add listing owned by another user" })
              return
            }
          }

          if (listingObject.user_seller_id !== multiple.user_seller_id) {
            res
              .status(400)
              .json({ error: "Cannot add listing owned by another user" })
            return
          }
        } catch (e) {
          console.error(e)
          res.status(400).json({ error: "Invalid listing" })
          return
        }
      }

      for (const listingObject of uniqueListingObjects) {
        // Set it to type multiple
        await database.updateMarketListing(listingObject.listing_id, {
          sale_type: "multiple",
        })
        // Remove unique listing
        await database.removeUniqueListing({
          listing_id: listingObject.listing_id,
        })
      }

      for (const listingObject of multipleListingObjects) {
        // Remove old multiple listing
        await database.removeMultipleListing({
          multiple_listing_id: listingObject.listing.listing_id,
        })
      }

      if (uniqueListingObjects.length) {
        await database.createMarketMultipleListing(
          uniqueListingObjects.map((l) => ({
            multiple_listing_id: l.listing_id,
            multiple_id: multiple_id,
            details_id: l.details_id,
          })),
        )
      }

      if (multipleListingObjects.length) {
        await database.createMarketMultipleListing(
          multipleListingObjects.map((l) => ({
            multiple_listing_id: l.listing.listing_id,
            multiple_id: multiple_id,
            details_id: l.details.details_id,
          })),
        )
      }

      for (const listing_id of removed) {
        const listing =
          await database.getMarketMultipleListingComplete(listing_id)
        // Set it to type multiple
        await database.updateMarketListing(listing_id, { sale_type: "sale" })
        // Remove old multiple listing
        await database.removeMultipleListing({
          multiple_listing_id: listing_id,
        })
        // Create unique listing
        await database.createUniqueListing({
          listing_id: listing_id,
          accept_offers: true,
          details_id: listing.details.details_id,
        })
      }

      if (title || description || item_type) {
        await database.updateListingDetails(
          { details_id: multiple.details_id },
          { title, description, item_type },
        )
      }

      if (default_listing_id) {
        await database.updateMarketMultiple(multiple_id, { default_listing_id })
      }

      res.json({ result: "Success" })
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/buyorder/create",

  requireMarketWrite,
  async (req: Request, res) => {
    try {
      const user = req.user as User

      const { quantity, price, expiry, game_item_id } = req.body as {
        quantity: number
        price: number
        expiry: string
        game_item_id: string
      }

      const aggregate = await database.getGameItem({
        id: game_item_id,
      })

      if (!aggregate) {
        res.status(400).json({ error: "Invalid listing" })
        return
      }

      if (quantity < 1) {
        res.status(400).json({ error: "Invalid quantity" })
        return
      }

      if (price < 1) {
        res.status(400).json({ error: "Invalid price" })
        return
      }

      if (new Date(expiry) < new Date()) {
        res.status(400).json({ error: "Invalid expiry" })
        return
      }

      const orders = await database.createBuyOrder({
        quantity,
        price,
        expiry,
        game_item_id,
        buyer_id: user.user_id,
      })

      res.json(orders[0])
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/buyorder/:buy_order_id/fulfill",

  requireMarketWrite,
  async (req: Request, res) => {
    try {
      const { contractor_spectrum_id } = req.body as {
        contractor_spectrum_id?: string | null
      }

      const user = req.user as User
      const buy_order_id = req.params["buy_order_id"]

      let contractor: DBContractor | null = null
      if (contractor_spectrum_id) {
        contractor = await database.getContractor({
          spectrum_id: contractor_spectrum_id,
        })
        if (
          !(await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_orders",
          ))
        ) {
          res.status(400).json({ error: "No permissions" })
          return
        }
      }

      const buy_order = await database.getBuyOrder({ buy_order_id })
      if (
        !buy_order ||
        buy_order.fulfilled_timestamp ||
        buy_order.expiry < new Date()
      ) {
        res.status(400).json({ error: "Invalid buy order" })
        return
      }

      if (buy_order.buyer_id === user.user_id) {
        res.status(400).json({ error: "Can't fulfill own order" })
        return
      }

      const buyer = await database.getUser({ user_id: buy_order.buyer_id })
      const listing = await database.getMarketAggregateComplete(
        buy_order.game_item_id,
        {},
      )

      await database.updateBuyOrder(
        {
          buy_order_id,
        },
        { fulfilled_timestamp: new Date() },
      )

      const total = buy_order.quantity * buy_order.price
      let message = `Complete buy order for [${buyer.username}](https://sc-market.space/user/${buyer.username})\n`

      message += `- [${listing.details.title}](https://sc-market.space/market/${
        listing.game_item_id
      }) (${(+buy_order.price).toLocaleString(
        "en-us",
      )} aUEC x${buy_order.quantity.toLocaleString("en-us")})\n`
      message += `- Total: ${total.toLocaleString("en-us")} aUEC\n`

      const { offer, session, discord_invite } = await createOffer(
        {
          customer_id: buy_order.buyer_id,
          assigned_id: contractor ? null : user.user_id,
          contractor_id: contractor ? contractor.contractor_id : null,
        },
        {
          actor_id: user.user_id,
          kind: "Delivery",
          cost: (buy_order.quantity * buy_order.price).toString(),
          title: `Complete Buy Order for ${buyer.username}`,
          description: message,
        },
        [],
      )

      res.json({ offer, session, discord_invite })
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/buyorder/:buy_order_id/cancel",
  userAuthorized,
  requireMarketWrite,
  async (req: Request, res) => {
    try {
      const user = req.user as User
      const buy_order_id = req.params["buy_order_id"]

      const buy_order = await database.getBuyOrder({ buy_order_id })
      if (
        !buy_order ||
        buy_order.fulfilled_timestamp ||
        buy_order.expiry < new Date()
      ) {
        res.status(400).json({ error: "Invalid buy order" })
        return
      }

      if (buy_order.buyer_id !== user.user_id) {
        res.status(400).json({ error: "No permissions" })
        return
      }

      await database.updateBuyOrder(
        {
          buy_order_id,
        },
        { expiry: database.knex.fn.now() },
      )

      res.json({ result: "Success" })
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.get(
  "/export",
  userAuthorized,
  requireMarketRead,
  async (req: Request, res) => {
    // TODO: Do this
  },
)

marketRouter.get("/category/:category", async (req: Request, res) => {
  const { category } = req.params
  const items = await database.getMarketItemsBySubcategory(category)
  res.json(createResponse(items))
})

marketRouter.get("/categories", async (req: Request, res) => {
  const raw_categories = await database.getMarketCategories()

  res.json(createResponse(raw_categories))
})

// First register the schema for game item description
oapi.schema("GameItemDescription", {
  type: "object",
  title: "GameItemDescription",
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the game item",
    },
    name: {
      type: "string",
      description: "Name of the game item",
    },
    type: {
      type: "string",
      description: "Type/category of the game item",
    },
    description: {
      type: "string",
      description: "Description of the game item",
    },
    image_url: {
      type: "string",
      nullable: true,
      description: "URL to the item's image",
    },
  },
  required: ["id", "name", "type", "description"],
  additionalProperties: false,
})

marketRouter.get(
  "/item/:name",
  oapi.validPath({
    summary: "Get game item description by name",
    description: "Returns detailed information about a game item by its name",
    operationId: "getGameItemByName",
    tags: ["Market", "Game Items"],
    parameters: [
      {
        name: "name",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
        description: "Name of the game item to retrieve",
      },
    ],
    responses: {
      "200": {
        description: "Game item retrieved successfully",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/GameItemDescription",
            },
          },
        },
      },
      "400": {
        description: "Game item not found",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Item not found": {
                value: { error: "Game item not found" },
              },
            },
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
            examples: {
              "Internal error": {
                value: { error: "Internal server error" },
              },
            },
          },
        },
      },
    },
  }),
  async (req, res) => {
    try {
      const item_name = req.params["name"]

      if (!item_name) {
        res
          .status(400)
          .json(createErrorResponse({ error: "Item name is required" }))
        return
      }

      const game_item = await database.getGameItem({ name: item_name })

      if (!game_item) {
        res
          .status(400)
          .json(createErrorResponse({ error: "Game item not found" }))
        return
      }

      // Fetch the details from market_listing_details using the details_id
      const details = await database.getMarketListingDetails({
        details_id: game_item.details_id,
      })

      // Get the image URL from the market listing images
      const images = await database.getMarketListingImagesResolved({
        details_id: game_item.details_id,
      })

      res.json(
        createResponse({
          id: game_item.id,
          name: game_item.name,
          type: game_item.type,
          description: details.description,
          image_url: images.length > 0 ? images[0] : null,
        }),
      )
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// Get view analytics for a seller's listings
marketRouter.get(
  "/seller/analytics",
  userAuthorized,
  requireMarketRead,
  oapi.validPath({
    summary: "Get seller listing analytics",
    description:
      "Returns analytics data for the authenticated user's market listings and services",
    operationId: "getSellerAnalytics",
    deprecated: false,
    tags: ["Market"],
    parameters: [
      {
        name: "period",
        in: "query",
        description: "Time period for analytics (7d, 30d, 90d)",
        schema: {
          type: "string",
          enum: ["7d", "30d", "90d"],
        },
      },
    ],
    responses: {
      "200": {
        description: "Analytics retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    market_listings: { type: "number" },
                    services: { type: "number" },
                    total_market_views: { type: "number" },
                    total_service_views: { type: "number" },
                    time_period: { type: "string" },
                    user_id: { type: "string" },
                  },
                  required: [
                    "market_listings",
                    "services",
                    "total_market_views",
                    "total_service_views",
                    "time_period",
                    "user_id",
                  ],
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "401": Response401,
      "500": Response500,
    },
    security: [],
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const period = (req.query.period as string) || "30d"

      // Get analytics for user's listings
      const userAnalytics = await database.getSellerListingAnalytics({
        user_id: user.user_id,
        time_period: period,
      })

      // If user is part of a contractor, also get contractor analytics
      const contractorAnalytics = null
      if (user.role === "admin" || user.role === "user") {
        // This could be enhanced to check if user has contractor permissions
        // For now, we'll just return user analytics
      }

      res.json(
        createResponse({
          ...userAnalytics,
          user_id: user.user_id,
        }),
      )
    } catch (error) {
      logger.error("Error fetching seller analytics", {
        error,
        user_id: (req.user as User)?.user_id,
      })
      res.status(500).json({ message: "Internal server error" })
    }
  },
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
