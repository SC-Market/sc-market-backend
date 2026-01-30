import { oapi as oapi } from "../openapi.js"
import { Response400 as Response400 } from "../openapi.js"
import { Response401 as Response401 } from "../openapi.js"
import { Response403 as Response403 } from "../openapi.js"
import { Response404 as Response404 } from "../openapi.js"
import { Response500 as Response500 } from "../openapi.js"
import {
  Response429Critical,
  Response429Write,
  Response429Read,
  Response429Bulk,
  RateLimitHeaders,
} from "../openapi.js"

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

oapi.schema("GrafanaTimeSeries", {
  type: "object",
  title: "GrafanaTimeSeries",
  properties: {
    target: {
      type: "string",
      description: "Metric name/series identifier",
      example: "total_orders",
    },
    datapoints: {
      type: "array",
      description: "Array of [value, timestamp_in_ms] pairs",
      items: {
        type: "array",
        items: {
          type: "number",
        },
        minItems: 2,
        maxItems: 2,
      },
      example: [[150, 1704067200000]],
    },
  },
  required: ["target", "datapoints"],
})

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
    week_orders: {
      type: "number",
      description: "Number of orders in the last week",
    },
    week_order_value: {
      type: "number",
      description: "Total value of orders in the last week",
    },
  },
  required: ["total_orders", "total_order_value"],
})

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

oapi.schema("BuyOrder", {
  type: "object",
  title: "BuyOrder",
  description: "Market buy order for an aggregate listing",
  properties: {
    buy_order_id: { type: "string", description: "Unique buy order ID" },
    aggregate_id: { type: "string", description: "Game item ID (aggregate)" },
    quantity: { type: "number", description: "Requested quantity" },
    price: {
      type: "number",
      nullable: true,
      description: "Price per unit; null when negotiable",
    },
    negotiable: {
      type: "boolean",
      description: "Whether price is negotiable (no fixed price offered)",
    },
    buyer: {
      $ref: "#/components/schemas/MinimalUser",
      description: "Buyer user summary",
    },
    expiry: {
      type: "string",
      format: "date-time",
      description: "Order expiry timestamp",
    },
  },
  required: [
    "buy_order_id",
    "aggregate_id",
    "quantity",
    "negotiable",
    "buyer",
    "expiry",
  ],
})

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
        $ref: "#/components/schemas/MarketListingBase",
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

export const market_get_stats_spec = oapi.validPath({
  tags: ["Market"],
  summary: "Get market order statistics",
  description:
    "Returns statistics about orders including total count and value. Use format=grafana to get Grafana-compatible format.",
  parameters: [
    {
      name: "format",
      in: "query",
      description:
        "Response format - use 'grafana' for Grafana JSON datasource format",
      required: false,
      schema: {
        type: "string",
        enum: ["grafana"],
      },
    },
  ],
  responses: {
    "200": {
      description:
        "Successfully retrieved order statistics. Returns Grafana format if format=grafana is specified.",
      content: {
        "application/json": {
          schema: {
            oneOf: [
              {
                type: "array",
                description: "Grafana format - array of time series objects",
                items: {
                  $ref: "#/components/schemas/GrafanaTimeSeries",
                },
              },
              {
                $ref: "#/components/schemas/OrderStats",
              },
            ],
          },
        },
      },
    },
  },
})

export const market_post_listings_stats_spec = oapi.validPath({
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
})

export const market_put_listing_listing_id_spec = oapi.validPath({
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
})

export const market_post_listing_listing_id_update_quantity_spec =
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
  })

export const market_post_listing_listing_id_refresh_spec = oapi.validPath({
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
})

export const market_get_listings_listing_id_spec = oapi.validPath({
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
})

export const market_get_listing_listing_id_orders_spec = oapi.validPath({
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
})

export const market_post_purchase_spec = oapi.validPath({
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
    "429": Response429Critical,
  },
})

export const market_post_listings_listing_id_bids_spec = oapi.validPath({
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
})

export const market_post_listings_spec = oapi.validPath({
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
    "429": Response429Critical,
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
})

export const market_post_listing_listing_id_photos_spec = oapi.validPath({
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
})

export const market_post_listings_listing_id_views_spec = oapi.validPath({
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
})

export const market_get_mine_spec = oapi.validPath({
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
      description: "Contractor ID to get listings for (user must be a member)",
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
})

export const market_get_listings_spec = oapi.validPath({
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
    "429": Response429Read,
    "500": Response500,
  },
})

export const market_get_user_username_spec = oapi.validPath({
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
})

export const market_get_contractor_spectrum_id_spec = oapi.validPath({
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
})

export const market_get_aggregates_buyorders_spec = oapi.validPath({
  summary: "Get market buy orders",
  description: "Returns all market buy orders grouped by game item aggregates",
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
})

export const market_get_aggregate_game_item_id_chart_spec = oapi.validPath({
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
})

export const market_get_item_name_spec = oapi.validPath({
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
})

export const market_get_seller_analytics_spec = oapi.validPath({
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
})
