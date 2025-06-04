import express, { Request } from "express"
import {
  adminAuthorized,
  userAuthorized,
  verifiedUser,
} from "../../../middleware/auth.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  DBContractor,
  DBMarketListing,
  DBMultipleListingComplete,
  DBUniqueListing,
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
import { has_permission, is_member } from "../util/permissions.js"
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
} from "./helpers.js"
import { oapi, Response400, Response401, Response403 } from "../openapi.js"

export const marketRouter = express.Router()

oapi.schema("OrderStats", {
  type: "object",
  title: "OrderStats",
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
    res.json(order_stats)
    return
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

marketRouter.post(
  "/listing/:listing_id/update",
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

    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    if (user.role !== "admin") {
      if (listing.contractor_seller_id) {
        const contractor = await database.getContractor({
          contractor_id: listing.contractor_seller_id,
        })

        if (
          !(await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_market",
          ))
        ) {
          res.status(403).json({
            error:
              "You are not authorized to update listings on behalf of this contractor!",
          })
          return
        }
      } else {
        if (listing.user_seller_id !== user.user_id) {
          res
            .status(403)
            .json({ error: "You are not authorized to update this listing!" })
          return
        }
      }
    }

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
    }: {
      title?: string
      description?: string
      item_type?: string
      item_name?: string

      status?: string
      price?: number
      quantity_available?: number

      minimum_bid_increment?: number

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

    if (status || price !== undefined || quantity_available !== undefined) {
      await database.updateMarketListing(listing_id, {
        status,
        price,
        quantity_available,
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

    if (photos && photos.length) {
      const old_photos =
        await database.getMarketListingImagesByListingID(listing)

      for (const photo of photos) {
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

      for (const p of old_photos) {
        await database.deleteMarketListingImages(p)
        try {
          await database.removeImageResource({ resource_id: p.resource_id })
        } catch {}
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
    const listing_id = req.params["listing_id"]
    const user = req.user as User

    const {
      quantity_available,
    }: {
      quantity_available: number
    } = req.body

    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    await handle_quantity_update(res, user, listing, quantity_available)
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

    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    if (user.role !== "admin") {
      if (listing.contractor_seller_id) {
        const contractor = await database.getContractor({
          contractor_id: listing.contractor_seller_id,
        })

        if (
          !(await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_market",
          ))
        ) {
          res.status(403).json({
            error:
              "You are not authorized to update listings on behalf of this contractor!",
          })
          return
        }
      } else {
        if (listing.user_seller_id !== user.user_id) {
          res
            .status(403)
            .json({ error: "You are not authorized to update this listing!" })
          return
        }
      }
    }

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
      enum: ["direct", "auction", "aggregate", "multiple"],
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
  "/listing/:listing_id",
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
    const listing_id = req.params["listing_id"]
    let listing: DBMarketListing
    try {
      listing = await database.getMarketListing({ listing_id: listing_id })
    } catch (e) {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

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
          res.json(await formatListing(listing, true))
          return
        }
      } else {
        if (listing.user_seller_id === user.user_id) {
          res.json(await formatListing(listing, true))
          return
        }
      }
    }

    res.json(await formatListing(listing))
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
  verifiedUser,
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
  "/bid",
  verifiedUser,
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

    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

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
      enum: ["direct", "auction"],
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
      minItems: 1,
      title: "MarketListingCreateRequest.photos",
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
    "photos",
    "status",
  ],
  additionalProperties: false,
})

marketRouter.post(
  "/create",
  verifiedUser,
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
      } = req.body

      // Validate urls are valid
      if (photos.find((p: string) => !cdn.verifyExternalResource(p))) {
        res.status(400).json({ error: "Invalid photo!" })
        return
      }

      // Validate auction end time
      if (sale_type === "auction") {
        if (new Date(end_time) < new Date()) {
          res.status(400).json({ error: "Invalid end time" })
          return
        }
      }

      // Validate game item if provided
      let game_item_id: string | null = null
      if (item_name) {
        const item = await database.getGameItem({ name: item_name })
        if (!item) {
          res.status(400).json({ error: "Invalid item name" })
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

      const listings = await database.createMarketListing({
        price,
        sale_type,
        quantity_available,
        user_seller_id: user.user_id,
        status,
      })

      await database.createUniqueListing({
        accept_offers: false,
        details_id: details.details_id,
        listing_id: listings[0].listing_id,
      })

      if (sale_type === "auction") {
        await database.createAuctionDetails({
          minimum_bid_increment,
          end_time,
          listing_id: listings[0].listing_id,
          status: "active",
        })
      }

      const resources = await Promise.all(
        photos
          .filter((p: string) => p)
          .map(
            async (p: string, i: number) =>
              await cdn.createExternalResource(
                p,
                listings[0].listing_id + `_photo_${i}`,
              ),
          ),
      )

      await database.insertMarketListingPhoto(
        listings[0],
        resources.map((r) => ({ resource_id: r.resource_id })),
      )

      res.json(listings[0])
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
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
      enum: ["direct", "auction"],
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
      minItems: 1,
      title: "ContractorMarketListingCreateRequest.photos",
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
    "photos",
    "status",
    "internal",
  ],
  additionalProperties: false,
})

marketRouter.post(
  "/contractor/:spectrum_id/create",
  verifiedUser,
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
        res.status(400).json({ error: "Invalid contractor" })
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
          error:
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

      // Validate photos are from CDN
      if (photos.find((p: string) => !cdn.verifyExternalResource(p))) {
        res.status(400).json({ error: "Invalid photo!" })
        return
      }

      // Validate auction end time
      if (sale_type === "auction") {
        if (new Date(end_time) < new Date()) {
          res.status(400).json({ error: "Invalid end time" })
          return
        }
      }

      // Validate game item if provided
      let game_item_id: string | null = null
      if (item_name) {
        const item = await database.getGameItem({ name: item_name })
        if (!item) {
          res.status(400).json({ error: "Invalid item name" })
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

      const listings = await database.createMarketListing({
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
        listing_id: listings[0].listing_id,
      })

      if (sale_type === "auction") {
        await database.createAuctionDetails({
          minimum_bid_increment,
          end_time,
          listing_id: listings[0].listing_id,
          status: "active",
        })
      }

      const resources = await Promise.all(
        photos
          .filter((p: string) => p)
          .map(
            async (p: string, i: number) =>
              await cdn.createExternalResource(
                p,
                listings[0].listing_id + `_photo_${i}`,
              ),
          ),
      )

      await database.insertMarketListingPhoto(
        listings[0],
        resources.map((r) => ({ resource_id: r.resource_id })),
      )

      res.json(listings[0])
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.get(
  "/mine",
  userAuthorized,
  oapi.validPath({
    summary: "Get user's market listings",
    description: "Returns all market listings owned by the authenticated user",
    operationId: "getMyMarketListings",
    tags: ["Market"],
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
      "401": Response401,
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
      const user = req.user as User
      res.json(await get_my_listings(user))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

oapi.schema("MarketListingSearchResult", {
  type: "object",
  title: "MarketListingSearchResult",
  properties: {
    listing_id: { type: "string" },
    listing_type: { type: "string" },
    item_type: { type: "string" },
    item_name: { type: "string", nullable: true },
    game_item_id: { type: "string", nullable: true },
    sale_type: { type: "string" },
    price: { type: "number" },
    expiration: { type: "string", format: "date-time", nullable: true },
    minimum_price: { type: "number" },
    maximum_price: { type: "number" },
    quantity_available: { type: "integer" },
    timestamp: { type: "string", format: "date-time" },
    total_rating: { type: "number" },
    avg_rating: { type: "number" },
    details_id: { type: "string" },
    status: { type: "string" },
    user_seller: { type: "object", nullable: true },
    contractor_seller: { type: "object", nullable: true },
    auction_end_time: { type: "string", format: "date-time", nullable: true },
    rating_count: { type: "integer", nullable: true },
    rating_streak: { type: "integer", nullable: true },
    total_orders: { type: "integer", nullable: true },
    title: { type: "string" },
    photo: { type: "string" },
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
  ],
})

marketRouter.get(
  "/public/search",
  oapi.validPath({
    summary: "Search public market listings",
    description:
      "Search for active, public market listings with various filters",
    operationId: "searchPublicListings",
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
    ],
    responses: {
      "200": {
        description: "Search completed successfully",
        content: {
          "application/json": {
            schema: {
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
        },
      },
      "400": {
        description: "Invalid query parameters",
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
      "500": {
        description: "Internal server error",
      },
    },
  }),
  async (req, res) => {
    let query
    try {
      query = await convertQuery(req.query)
    } catch (e) {
      res.status(400).json({ error: "Invalid query" })
      return
    }

    try {
      const searchResults = await database.searchMarket(query, {
        status: "active",
        internal: "false",
      })

      res.json({
        total: searchResults[0] ? searchResults[0].full_count : 0,
        listings: searchResults.map((r) => ({
          listing_id: r.listing_id,
          listing_type: r.listing_type,
          item_type: r.item_type,
          item_name: r.item_name,
          game_item_id: r.game_item_id,
          sale_type: r.sale_type,
          price: r.price,
          expiration: r.expiration,
          minimum_price: r.minimum_price,
          maximum_price: r.maximum_price,
          quantity_available: r.quantity_available,
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
          title: r.title,
          photo: r.photo,
        })),
      })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
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

marketRouter.get("/all_listings", adminAuthorized, async (req, res) => {
  const listings = await database.getMarketListings({})

  res.json(await Promise.all(listings.map((l) => formatListing(l, true))))
})

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
  "/contractor/:spectrum_id/mine",
  userAuthorized,
  org_authorized,
  oapi.validPath({
    summary: "Get contractor's market listings",
    description:
      "Returns all market listings for a specific contractor (requires contractor member authorization)",
    operationId: "getContractorListings",
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
      "401": Response401,
      "403": {
        description: "User is not authorized to view these listings",
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

      const user = req.user as User

      res.json(await get_org_listings(contractor))
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
    }
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
            await database.removeImageResource({ resource_id: p.resource_id })
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
  verifiedUser,
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
  verifiedUser,
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
  verifiedUser,
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
  verifiedUser,
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

marketRouter.get("/export", userAuthorized, async (req: Request, res) => {
  // TODO: Do this
})

marketRouter.get("/category/:category", async (req: Request, res) => {
  const { category } = req.params
  const items = await database.getMarketItemsBySubcategory(category)
  res.json(items)
})

marketRouter.get("/categories", async (req: Request, res) => {
  const raw_categories = await database.getMarketCategories()
  // const categories: { [key: string]: string[] } = {}
  // raw_categories.forEach((c) => {
  //   if (categories[c.category]) {
  //     categories[c.category].push(c.subcategory)
  //   } else {
  //     categories[c.category] = [c.subcategory]
  //   }
  // })

  res.json(raw_categories)
})

// TODO: Create listing as part of multiple
//  ~~fetch a multiple~~
//  ~~convert a unique to a multiple~~
//  ~~convert a multiple back to unique~~
//  ~~user create multiple~~
//  ~~provide multiples in normal lookup endpoints~~
//  create helper func for finding kinds of listings complete
//  ~~Make multiples compatible with unique/aggregate listing lookup by ID~~
//  attach orders to aggregate composite, multiples, and multiple composites when fetched
