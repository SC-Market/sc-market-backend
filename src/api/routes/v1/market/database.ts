/**
 * Market-related database operations.
 * This module contains all database queries specific to market listings,
 * items, aggregates, and related functionality.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import { getService } from "../services/database.js"
import {
  DBMarketListing,
  DBMarketListingDetails,
  DBMarketListingDetailsBase,
  DBMarketListingImage,
  DBUniqueListing,
  DBUniqueListingRaw,
  DBUniqueListingComplete,
  DBBuyOrder,
  DBAggregateRaw,
  DBAggregateComplete,
  DBAggregateListingRaw,
  DBAggregateListingComplete,
  DBMarketOrder,
  DBMarketMultiple,
  DBMarketMultipleListing,
  DBMarketBid,
  DBMarketOffer,
  DBMarketOfferListing,
  DBMultipleRaw,
  DBMultipleComplete,
  DBMultipleListingRaw,
  DBMultipleListingCompositeComplete,
  DBAuctionDetails,
  DBMarketAggregate,
  DBMarketAggregateListing,
  DBOfferMarketListing,
  DBOrder,
  DBPriceHistory,
  DBMarketItem,
  DBMarketCategory,
  DBMarketSearchResult,
} from "../../../../clients/database/db-models.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import {
  UserListingsQuery,
  ContractorListingsQuery,
  MarketSearchQuery,
} from "./types.js"
import logger from "../../../../logger/logger.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get a market listing by where clause.
 * @throws Error if listing not found
 */
export async function getMarketListing(where: any): Promise<DBMarketListing> {
  const listing = await knex()<DBMarketListing>("market_listings")
    .where(where)
    .first()

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return listing
}

/**
 * Get market listing details by where clause.
 * @throws Error if listing details not found
 */
export async function getMarketListingDetails(
  where: Partial<DBMarketListingDetails>,
): Promise<DBMarketListingDetails> {
  const listing = await knex()<DBMarketListingDetails>("market_listing_details")
    .where(where)
    .first()

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return listing
}

/**
 * Get a unique market listing by where clause.
 * @throws Error if listing not found
 */
export async function getMarketUniqueListing(
  where: Partial<DBUniqueListing>,
): Promise<DBUniqueListing> {
  const listing = await knex()<DBUniqueListing>("market_unique_listings")
    .where(where)
    .first()

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return listing
}

/**
 * Get market listing images by where clause.
 */
export async function getMarketListingImages(
  where: Partial<DBMarketListingImage>,
): Promise<DBMarketListingImage[]> {
  return knex()<DBMarketListingImage>("market_images").where(where).select()
}

/**
 * Format a raw unique listing into a complete listing with images.
 */
export async function formatUniqueRaw(
  listing: DBUniqueListingRaw,
): Promise<DBUniqueListingComplete> {
  return {
    listing_id: listing.listing_id,
    accept_offers: listing.accept_offers,
    details_id: listing.details_id,
    details: {
      details_id: listing.details_id,
      item_type: listing.item_type,
      item_name: listing.item_name,
      game_item_id: listing.game_item_id,
      title: listing.title,
      description: listing.description,
    },
    listing: {
      listing_id: listing.listing_id,
      sale_type: listing.sale_type,
      price: listing.price,
      quantity_available: listing.quantity_available,
      status: listing.status,
      internal: listing.internal,
      user_seller_id: listing.user_seller_id,
      contractor_seller_id: listing.contractor_seller_id,
      timestamp: listing.timestamp,
      expiration: listing.expiration,
    },
    images: await getMarketListingImages({
      details_id: listing.details_id,
    }),
  }
}

/**
 * Get a complete unique market listing with all details and images.
 */
export async function getMarketUniqueListingComplete(
  listing_id: string,
): Promise<DBUniqueListingComplete> {
  const listing: DBUniqueListingRaw = await knex()<DBUniqueListingRaw>(
    "market_unique_listings",
  )
    .join(
      "market_listings",
      "market_listings.listing_id",
      "=",
      "market_unique_listings.listing_id",
    )
    .join(
      "market_listing_details",
      "market_unique_listings.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .leftJoin(
      "game_items",
      "game_items.id",
      "=",
      "market_listing_details.game_item_id",
    )
    .where("market_unique_listings.listing_id", "=", listing_id)
    .first(
      "market_unique_listings.*",
      "market_listings.*",
      "market_listing_details.*",
      knex().ref("game_items.name").as("item_name"),
    )

  if (!listing) {
    throw new Error(`Invalid listing! ${listing_id}`)
  }

  return formatUniqueRaw(listing)
}

/**
 * Get multiple complete unique market listings.
 */
export async function getMarketUniqueListingsComplete(
  where: any,
): Promise<DBUniqueListingComplete[]> {
  const listings = await knex()<DBUniqueListingRaw>("market_unique_listings")
    .join(
      "market_listings",
      "market_listings.listing_id",
      "=",
      "market_unique_listings.listing_id",
    )
    .join(
      "market_listing_details",
      "market_unique_listings.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .where(where)
    .select("*")

  return Promise.all(listings.map((listing) => formatUniqueRaw(listing)))
}

/**
 * Get market listings by game item ID.
 */
export async function getListingsByGameItemID(
  game_item_id: string,
  listing_where: any,
): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings")
    .join(
      "market_unique_listings",
      "market_unique_listings.listing_id",
      "=",
      "market_listings.listing_id",
    )
    .join(
      "market_listing_details",
      "market_unique_listings.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .where("market_listing_details.game_item_id", "=", game_item_id)
    .andWhere(listing_where)
    .select()
}

/**
 * Get buy orders by game item ID.
 */
export async function getBuyOrdersByGameItemID(
  game_item_id: string,
  historic = false,
): Promise<DBBuyOrder[]> {
  const base = knex()<DBBuyOrder>("market_buy_orders").where({
    game_item_id,
  })

  if (historic) {
    return base.select()
  } else {
    return base
      .andWhere("expiry", ">", knex().fn.now())
      .andWhere("fulfilled_timestamp", null)
  }
}

/**
 * Format a raw aggregate listing into a complete aggregate with listings and buy orders.
 */
export async function formatAggregateRaw(
  listing: DBAggregateRaw,
  listing_where: any,
): Promise<DBAggregateComplete> {
  const listings = await getListingsByGameItemID(
    listing.game_item_id,
    listing_where,
  )
  const buy_orders = await getBuyOrdersByGameItemID(listing.game_item_id, false)

  return {
    game_item_id: listing.game_item_id,
    details_id: listing.details_id,
    details: {
      details_id: listing.details_id,
      item_type: listing.item_type,
      item_name: listing.item_name,
      game_item_id: listing.game_item_id,
      title: listing.title,
      description: listing.description,
    },
    listings,
    buy_orders,
    images: await getMarketListingImages({
      details_id: listing.details_id,
    }),
  }
}

/**
 * Get a complete market aggregate by game item ID.
 */
export async function getMarketAggregateComplete(
  game_item_id: string,
  listing_where: any,
): Promise<DBAggregateComplete> {
  const listing: DBAggregateRaw = await knex()<DBAggregateRaw>("game_items")
    .join(
      "market_listing_details",
      "game_items.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .where("game_items.id", "=", game_item_id)
    .first(
      "game_items.*",
      "market_listing_details.*",
      knex().ref("game_items.name").as("item_name"),
    )

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return formatAggregateRaw(listing, listing_where)
}

/**
 * Get multiple complete market aggregates.
 */
export async function getMarketAggregatesComplete(
  where: any,
  listing_where: any,
  has_listings: boolean = false,
  has_buy_orders: boolean = false,
): Promise<DBAggregateComplete[]> {
  let listings = knex()<DBAggregateRaw>("game_items").join(
    "market_listing_details",
    "game_items.details_id",
    "=",
    "market_listing_details.details_id",
  )
  if (has_listings) {
    listings = listings.where((pred) =>
      pred.whereExists(
        knex()("market_unique_listings")
          .where(
            "market_unique_listings.details_id",
            "=",
            knex().raw("market_listing_details.details_id"),
          )
          .select(),
      ),
    )
  } else if (has_buy_orders) {
    listings = listings.where((pred) =>
      pred.whereExists(
        knex()("market_buy_orders")
          .where(
            "market_buy_orders.game_item_id",
            "=",
            knex().raw("game_items.id"),
          )
          .select(),
      ),
    )
  }
  listings = listings.andWhere(where).select("*")

  return Promise.all(
    (await listings).map((listing) =>
      formatAggregateRaw(listing, listing_where),
    ),
  )
}

/**
 * Get all market buy orders complete.
 */
export async function getMarketBuyOrdersComplete(): Promise<
  DBAggregateComplete[]
> {
  const q = knex()<DBAggregateRaw>("game_items")
    .join(
      "market_listing_details",
      "game_items.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .whereExists(
      knex()("market_buy_orders")
        .where(
          "market_buy_orders.game_item_id",
          "=",
          knex().raw("game_items.id"),
        )
        .select(),
    )

  return Promise.all(
    (await q).map((listing) =>
      formatAggregateRaw(listing, { status: "active" }),
    ),
  )
}

/**
 * Get market listing images resolved to CDN URLs.
 */
export async function getMarketListingImagesResolved(
  where: Partial<DBMarketListingImage>,
): Promise<string[]> {
  const images = await getMarketListingImages(where)
  const urls = await Promise.all(
    images.map((entry) => cdn.getFileLinkResource(entry.resource_id)),
  )
  return urls.filter((x) => x) as string[]
}

/**
 * Get expiring market listings.
 */
export async function getExpiringMarketListings(): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings")
    .where("expiration", "<=", knex().raw("now()"))
    .andWhere("status", "active")
    .select()
}

/**
 * Get a market order by where clause.
 * @throws Error if order not found
 */
export async function getMarketOrder(where: any): Promise<DBMarketListing> {
  const listing = await knex()<DBMarketListing>("market_orders")
    .where(where)
    .first()

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return listing
}

/**
 * Get market listings by where clause.
 */
export async function getMarketListings(
  where: Partial<DBMarketListing>,
): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings")
    .where(where)
    .select("market_listings.*")
}

/**
 * Format a raw aggregate listing into a complete aggregate listing with images.
 */
export async function formatAggregateListingRaw(
  listing: DBAggregateListingRaw,
): Promise<DBAggregateListingComplete> {
  return {
    aggregate: {
      game_item_id: listing.game_item_id,
      details_id: listing.details_id,
    },
    details: {
      details_id: listing.details_id,
      item_type: listing.item_type,
      item_name: listing.item_name,
      game_item_id: listing.game_item_id,
      title: listing.title,
      description: listing.description,
    },
    listing: {
      listing_id: listing.listing_id,
      sale_type: listing.sale_type,
      price: listing.price,
      quantity_available: listing.quantity_available,
      status: listing.status,
      internal: listing.internal,
      user_seller_id: listing.user_seller_id,
      contractor_seller_id: listing.contractor_seller_id,
      timestamp: listing.timestamp,
      expiration: listing.expiration,
    },
    images: await getMarketListingImages({
      details_id: listing.details_id,
    }),
  }
}

/**
 * Get a complete market aggregate listing with all details and images.
 */
export async function getMarketAggregateListingComplete(
  listing_id: string,
): Promise<DBAggregateListingComplete> {
  const listing: DBAggregateListingRaw = await knex()<DBAggregateListingRaw>(
    "market_listings",
  )
    .join(
      "market_unique_listings",
      "market_listings.listing_id",
      "=",
      "market_unique_listings.listing_id",
    )
    .join(
      "market_listing_details",
      "market_aggregates.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .leftJoin(
      "game_items",
      "game_items.id",
      "=",
      "market_listing_details.game_item_id",
    )
    .where("market_listings.listing_id", "=", listing_id)
    .first(
      "market_listings.*",
      "market_unique_listings.*",
      "market_listing_details.*",
      knex().ref("game_items.name").as("item_name"),
    )

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return formatAggregateListingRaw(listing)
}

/**
 * Get market listing images by listing ID (handles different sale types).
 */
export async function getMarketListingImagesByListingID(
  listing: DBMarketListing,
): Promise<DBMarketListingImage[]> {
  if (listing.sale_type === "aggregate") {
    const complete = await getMarketAggregateListingComplete(listing.listing_id)
    return complete.images
  } else {
    const complete = await getMarketUniqueListingComplete(listing.listing_id)
    return complete.images
  }
}

/**
 * Delete market listing images.
 */
export async function deleteMarketListingImages(
  where: Partial<DBMarketListingImage>,
): Promise<DBMarketListingImage[]> {
  return knex()<DBMarketListingImage>("market_images")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Get market listing orders.
 */
export async function getMarketListingOrders(
  where: Partial<DBMarketOrder>,
): Promise<DBMarketOrder[]> {
  return knex()<DBMarketOrder>("market_orders").where(where).select()
}

/**
 * Get orders for a listing with pagination.
 */
export async function getOrdersForListingPaginated(params: {
  listing_id: string
  page?: number
  pageSize?: number
  status?: string[]
  sortBy?: "timestamp" | "status"
  sortOrder?: "asc" | "desc"
}): Promise<{
  orders: DBOrder[]
  pagination: {
    currentPage: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}> {
  const {
    listing_id,
    page = 1,
    pageSize = 20,
    status,
    sortBy = "timestamp",
    sortOrder = "desc",
  } = params

  let query = knex()("orders")
    .join("market_orders", "market_orders.order_id", "=", "orders.order_id")
    .where("market_orders.listing_id", listing_id)

  if (status && status.length > 0) {
    query = query.whereIn("orders.status", status)
  }

  // Get total count for pagination
  const [{ count }] = await query.clone().count("* as count")
  const totalItems = parseInt(count as string)
  const totalPages = Math.ceil(totalItems / pageSize)
  const offset = (page - 1) * pageSize

  // Apply sorting and pagination
  const orders = await query
    .orderBy(`orders.${sortBy}`, sortOrder)
    .limit(pageSize)
    .offset(offset)
    .select("orders.*")

  return {
    orders,
    pagination: {
      currentPage: page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  }
}

/**
 * Update a market listing.
 */
export async function updateMarketListing(
  listing_id: string,
  data: Partial<DBMarketListing>,
): Promise<void> {
  await knex()<DBMarketListing>("market_listings")
    .where({ listing_id })
    .update(data)
}

/**
 * Update a market multiple.
 */
export async function updateMarketMultiple(
  multiple_id: string,
  data: Partial<DBMarketMultiple>,
): Promise<void> {
  await knex()<DBMarketMultiple>("market_multiples")
    .where({ multiple_id })
    .update(data)
}

/**
 * Get market bids by where clause.
 */
export async function getMarketBids(where: any): Promise<DBMarketBid[]> {
  return knex()<DBMarketBid>("market_bids").where(where).select()
}

/**
 * Get market offers by where clause.
 */
export async function getMarketOffers(where: any): Promise<DBMarketOffer[]> {
  return knex()<DBMarketOffer>("market_offers").where(where).select()
}

/**
 * Remove market offers by where clause.
 */
export async function removeMarketOffers(where: any): Promise<DBMarketOffer[]> {
  return knex()<DBMarketOffer>("market_offers")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Remove market offer listings by where clause.
 */
export async function removeMarketOfferListings(
  where: any,
): Promise<DBMarketOfferListing[]> {
  return knex()<DBMarketOfferListing>("market_offer_listings")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Format a raw multiple listing into a complete multiple with listings.
 */
export async function formatMultipleRaw(
  listing: DBMultipleRaw,
  listing_where: any,
): Promise<DBMultipleComplete> {
  const listings = await getMarketMultipleListingsComplete({
    "market_multiples.multiple_id": listing.multiple_id,
    ...listing_where,
  })

  return {
    contractor_seller_id: listing.contractor_seller_id,
    default_listing: listings.find(
      (l) => l.listing.listing_id === listing.default_listing_id,
    )!,
    default_listing_id: listing.default_listing_id,
    user_seller_id: listing.user_seller_id,
    multiple_id: listing.multiple_id,
    details_id: listing.details_id,
    details: {
      details_id: listing.details_id,
      item_type: listing.item_type,
      item_name: listing.item_name,
      game_item_id: listing.game_item_id,
      title: listing.title,
      description: listing.description,
    },
    listings,
  }
}

/**
 * Get a complete market multiple by multiple ID.
 */
export async function getMarketMultipleComplete(
  multiple_id: string,
  listing_where: any,
): Promise<DBMultipleComplete> {
  const listing: DBMultipleRaw = await knex()<DBMultipleRaw>("market_multiples")
    .join(
      "market_listing_details",
      "market_multiples.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .leftJoin(
      "game_items",
      "game_items.id",
      "=",
      "market_listing_details.game_item_id",
    )
    .where("market_multiples.multiple_id", "=", multiple_id)
    .first(
      "market_multiples.*",
      "market_listing_details.*",
      knex().ref("game_items.name").as("item_name"),
    )

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return formatMultipleRaw(listing, listing_where)
}

/**
 * Get multiple complete market multiples.
 */
export async function getMarketMultiplesComplete(
  where: any,
  listing_where: any,
  has_listings: boolean = false,
): Promise<DBMultipleComplete[]> {
  let listings
  if (has_listings) {
    listings = await knex()<DBMultipleRaw>("market_multiples")
      .join(
        "market_listing_details",
        "market_multiples.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      .where(where)
      .select(
        "market_multiples.*",
        "market_listing_details.*",
        knex().ref("game_items.name").as("item_name"),
      )
  } else {
    listings = await knex()<DBMultipleRaw>("market_multiples")
      .join(
        "market_listing_details",
        "market_multiples.details_id",
        "=",
        "market_listing_details.details_id",
      )
      .leftJoin(
        "game_items",
        "game_items.id",
        "=",
        "market_listing_details.game_item_id",
      )
      .whereExists(
        knex()("market_multiple_listings")
          .where(
            "market_multiple_listings.multiple_id",
            "=",
            knex().raw("market_multiples.multiple_id"),
          )
          .select("*", knex().ref("game_items.name").as("item_name")),
      )
      .where(where)
      .select("*")
  }

  return Promise.all(
    listings.map((listing) => formatMultipleRaw(listing, listing_where)),
  )
}

/**
 * Format a raw multiple listing into a complete multiple listing with images.
 */
export async function formatMultipleListingRaw(
  listing: DBMultipleListingRaw,
): Promise<DBMultipleListingCompositeComplete> {
  return {
    multiple: {
      multiple_id: listing.multiple_id,
      details_id: listing.multiple_details_id,
      default_listing_id: listing.default_listing_id,
      user_seller_id: listing.user_seller_id,
      contractor_seller_id: listing.contractor_seller_id,
    },
    details: {
      details_id: listing.details_id,
      item_type: listing.item_type,
      item_name: listing.item_name,
      game_item_id: listing.game_item_id,
      title: listing.title,
      description: listing.description,
    },
    listing: {
      listing_id: listing.listing_id,
      sale_type: listing.sale_type,
      price: listing.price,
      quantity_available: listing.quantity_available,
      status: listing.status,
      internal: listing.internal,
      user_seller_id: listing.user_seller_id,
      contractor_seller_id: listing.contractor_seller_id,
      timestamp: listing.timestamp,
      expiration: listing.expiration,
    },
    images: await getMarketListingImages({
      details_id: listing.details_id,
    }),
  }
}

/**
 * Get a complete market multiple listing with all details and images.
 */
export async function getMarketMultipleListingComplete(
  listing_id: string,
): Promise<DBMultipleListingCompositeComplete> {
  const listing: DBMultipleListingRaw = await knex()<DBMultipleListingRaw>(
    "market_listings",
  )
    .join(
      "market_multiple_listings",
      "market_listings.listing_id",
      "=",
      "market_multiple_listings.multiple_listing_id",
    )
    .join(
      "market_multiples",
      "market_multiples.multiple_id",
      "=",
      "market_multiple_listings.multiple_id",
    )
    .join(
      "market_listing_details",
      "market_multiple_listings.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .leftJoin(
      "game_items",
      "game_items.id",
      "=",
      "market_listing_details.game_item_id",
    )
    .where("market_listings.listing_id", "=", listing_id)
    .first(
      "market_listings.*",
      "market_multiples.*",
      "market_listing_details.*",
      knex().ref("game_items.name").as("item_name"),
      knex().ref("market_multiple_listings.details_id").as("details_id"),
      knex().ref("market_multiples.details_id").as("multiple_details_id"),
    )

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  return formatMultipleListingRaw(listing)
}

/**
 * Get multiple complete market multiple listings.
 */
export async function getMarketMultipleListingsComplete(
  where: any,
): Promise<DBMultipleListingCompositeComplete[]> {
  const listings = await knex()<DBMultipleListingRaw>("market_listings")
    .join(
      "market_multiple_listings",
      "market_listings.listing_id",
      "=",
      "market_multiple_listings.multiple_listing_id",
    )
    .join(
      "market_multiples",
      "market_multiples.multiple_id",
      "=",
      "market_multiple_listings.multiple_id",
    )
    .join(
      "market_listing_details",
      "market_multiple_listings.details_id",
      "=",
      "market_listing_details.details_id",
    )
    .leftJoin(
      "game_items",
      "game_items.id",
      "=",
      "market_listing_details.game_item_id",
    )
    .where(where)
    .select(
      "market_listings.*",
      "market_multiples.*",
      "market_listing_details.*",
      knex().ref("market_multiple_listings.details_id").as("details_id"),
      knex().ref("market_multiples.details_id").as("multiple_details_id"),
      knex().ref("game_items.name").as("item_name"),
    )

  return Promise.all(
    listings.map((listing) => formatMultipleListingRaw(listing)),
  )
}

/**
 * Get auction detail by where clause.
 */
export async function getAuctionDetail(
  where: any,
): Promise<DBAuctionDetails | undefined> {
  return knex()<DBAuctionDetails>("market_auction_details").where(where).first()
}

/**
 * Get auction details by where clause.
 */
export async function getAuctionDetails(
  where: any,
): Promise<DBAuctionDetails[]> {
  return knex()<DBAuctionDetails>("market_auction_details")
    .where(where)
    .select()
}

/**
 * Create auction details.
 */
export async function createAuctionDetails(
  values: any,
): Promise<DBAuctionDetails[]> {
  return knex()<DBAuctionDetails>("market_auction_details")
    .insert(values)
    .returning("*")
}

/**
 * Update auction details.
 */
export async function updateAuctionDetails(
  where: any,
  values: any,
): Promise<DBAuctionDetails[]> {
  return knex()<DBAuctionDetails>("market_auction_details")
    .where(where)
    .update(values)
}

/**
 * Get expiring auctions.
 */
export async function getExpiringAuctions(): Promise<DBAuctionDetails[]> {
  return knex()<DBAuctionDetails>("market_auction_details")
    .where("end_time", "<=", knex().raw("now()"))
    .select()
}

/**
 * Remove market bids by where clause.
 * Note: This function has dependencies on notification functions that remain in the main database class.
 */
export async function removeMarketBids(where: any): Promise<DBMarketBid[]> {
  return knex()<DBMarketBid>("market_bids").where(where).delete().returning("*")
}

/**
 * Insert a market listing order.
 */
export async function insertMarketListingOrder(
  data: Partial<DBMarketOrder>,
): Promise<DBMarketOrder[]> {
  return knex()<DBMarketOrder>("market_orders").insert(data).returning("*")
}

/**
 * Get market aggregates by where clause.
 */
export async function getMarketAggregates(
  where: Partial<DBMarketAggregate>,
): Promise<DBMarketAggregate[]> {
  return knex()<DBMarketAggregate>("market_aggregates")
    .where(where)
    .select("market_aggregates.*")
}

/**
 * Get a market aggregate by where clause.
 */
export async function getMarketAggregate(
  where: Partial<DBMarketAggregate>,
): Promise<DBMarketAggregate | undefined> {
  return knex()<DBMarketAggregate>("market_aggregates").where(where).first()
}

/**
 * Get market aggregate listings by where clause.
 */
export async function getMarketAggregateListings(
  where: any,
): Promise<DBMarketAggregateListing[]> {
  return knex()<DBMarketAggregateListing>("market_aggregate_listings")
    .join(
      "market_listings",
      "market_listings.listing_id",
      "=",
      "market_aggregate_listings.aggregate_listing_id",
    )
    .where(where)
    .select("*")
}

/**
 * Update a buy order.
 */
export async function updateBuyOrder(
  where: Partial<DBBuyOrder>,
  values: any,
): Promise<DBBuyOrder[]> {
  return knex()<DBBuyOrder>("market_buy_orders")
    .update(values)
    .where(where)
    .returning("*")
}

/**
 * Get a buy order by where clause.
 */
export async function getBuyOrder(
  where: Partial<DBBuyOrder>,
): Promise<DBBuyOrder | undefined> {
  return knex()<DBBuyOrder>("market_buy_orders").where(where).first()
}

/**
 * Insert a market aggregate.
 */
export async function insertMarketAggregate(
  body: Partial<DBMarketAggregate>,
): Promise<DBMarketAggregate[]> {
  return knex()<DBMarketAggregate>("market_aggregates")
    .insert(body)
    .returning("*")
}

/**
 * Update a market aggregate.
 */
export async function updateMarketAggregate(
  where: Partial<DBMarketAggregate>,
  values: Partial<DBMarketAggregate>,
): Promise<DBMarketAggregate[]> {
  return knex()<DBMarketAggregate>("market_aggregates")
    .where(where)
    .update(values)
    .returning("*")
}

/**
 * Insert a market aggregate listing.
 */
export async function insertMarketAggregateListing(
  body: Partial<DBMarketAggregateListing>,
): Promise<DBMarketAggregateListing[]> {
  return knex()<DBMarketAggregateListing>("market_aggregate_listings")
    .insert(body)
    .returning("*")
}

/**
 * Get contractor market listings.
 */
export async function getContractorMarketListings(
  where: any,
): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings")
    .join(
      "contractors",
      "contractors.contractor_id",
      "=",
      "market_listings.contractor_seller_id",
    )
    .where(where)
    .select("market_listings.*")
}

/**
 * Create a market listing.
 */
export async function createMarketListing(
  body: Partial<DBMarketListing>,
): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings").insert(body).returning("*")
}

/**
 * Create a unique listing.
 */
export async function createUniqueListing(
  body: Partial<DBUniqueListing>,
): Promise<DBUniqueListing[]> {
  return knex()<DBUniqueListing>("market_unique_listings")
    .insert(body)
    .returning("*")
}

/**
 * Remove a unique listing.
 */
export async function removeUniqueListing(
  where: Partial<DBUniqueListing>,
): Promise<DBUniqueListing[]> {
  return knex()<DBUniqueListing>("market_unique_listings")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Remove a multiple listing.
 */
export async function removeMultipleListing(
  where: Partial<DBMarketMultipleListing>,
): Promise<DBMarketMultipleListing[]> {
  return knex()<DBMarketMultipleListing>("market_multiple_listings")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Create listing details.
 */
export async function createListingDetails(
  body: Partial<DBMarketListingDetailsBase>,
): Promise<DBMarketListingDetails[]> {
  return knex()<DBMarketListingDetails>("market_listing_details")
    .insert(body)
    .returning("*")
}

/**
 * Update listing details.
 */
export async function updateListingDetails(
  where: Partial<DBMarketListingDetails>,
  values: Partial<DBMarketListingDetails>,
): Promise<DBMarketListingDetails[]> {
  return knex()<DBMarketListingDetails>("market_listing_details")
    .where(where)
    .update(values)
    .returning("*")
}

/**
 * Create a market bid.
 */
export async function createMarketBid(
  data: Partial<DBMarketBid>,
): Promise<DBMarketBid[]> {
  return knex()<DBMarketBid>("market_bids").insert(data).returning("*")
}

/**
 * Delete market bids.
 */
export async function deleteMarketBids(where: any): Promise<DBMarketBid[]> {
  return knex()<DBMarketBid>("market_bids").where(where).delete().returning("*")
}

/**
 * Insert a market details photo.
 */
export async function insertMarketDetailsPhoto(
  value: Partial<DBMarketListingImage>,
): Promise<DBMarketListingImage[]> {
  return knex()<DBMarketListingImage>("market_images")
    .insert(value)
    .returning("*")
}

/**
 * Insert a market listing photo.
 */
export async function insertMarketListingPhoto(
  listing: DBMarketListing,
  items: {
    resource_id?: string
    aggregate_id?: string
  }[],
): Promise<DBMarketListingImage[]> {
  const unique = await getMarketUniqueListingComplete(listing.listing_id)
  return knex()<DBMarketListingImage>("market_images")
    .insert(items.map((o) => ({ ...o, details_id: unique.details.details_id })))
    .returning("*")
}

/**
 * Insert offer market listing.
 */
export async function insertOfferMarketListing(
  data: Partial<DBOfferMarketListing> | Partial<DBOfferMarketListing>[],
): Promise<DBOfferMarketListing[]> {
  return knex()<DBOfferMarketListing>("offer_market_items")
    .insert(data)
    .returning("*")
}

/**
 * Get offer market listings.
 */
export async function getOfferMarketListings(
  offer_id: string,
): Promise<DBOfferMarketListing[]> {
  return knex()<DBOfferMarketListing>("offer_market_items")
    .where({ offer_id })
    .select()
}

/**
 * Get offer market listing count.
 */
export async function getOfferMarketListingCount(
  offer_id: string,
): Promise<{ sum: number }> {
  return knex()<DBOfferMarketListing>("offer_market_items")
    .where({ offer_id })
    .first(knex().raw("COALESCE(SUM(quantity), 0) as sum"))
}

/**
 * Get order market listing count.
 */
export async function getOrderMarketListingCount(
  order_id: string,
): Promise<{ sum: number }> {
  return knex()<DBMarketOrder>("market_orders")
    .where({ order_id })
    .first(knex().raw("COALESCE(SUM(quantity), 0) as sum"))
}

/**
 * Get user market listings.
 */
export async function getUserMarketListings(
  user_id: string,
): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings")
    .join("accounts", "accounts.user_id", "=", "market_listings.user_seller_id")
    .where({ user_seller_id: user_id })
    .select("market_listings.*")
}

/**
 * Get public market listings.
 */
export async function getPublicMarketListings(): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings")
    .where({ status: "active", internal: false })
    .select("market_listings.*")
}

/**
 * Update market aggregate listing.
 */
export async function updateMarketAggregateListing(
  aggregate_id: string,
  data: Partial<DBMarketAggregateListing>,
): Promise<DBMarketAggregateListing[]> {
  return knex()<DBMarketAggregateListing>("market_aggregate_listings")
    .where({ aggregate_id })
    .update(data)
    .returning("*")
}

/**
 * Get market aggregate listing.
 */
export async function getMarketAggregateListing(
  where: Partial<DBMarketAggregateListing>,
): Promise<DBMarketAggregateListing | undefined> {
  return knex()<DBMarketAggregateListing>("market_aggregate_listings")
    .where(where)
    .first()
}

/**
 * Create market multiple.
 */
export async function createMarketMultiple(
  body: Partial<DBMarketMultiple> | Partial<DBMarketMultiple>[],
): Promise<DBMarketMultiple[]> {
  return knex()<DBMarketMultiple>("market_multiples")
    .insert(body)
    .returning("*")
}

/**
 * Create market multiple listing.
 */
export async function createMarketMultipleListing(
  body: Partial<DBMarketMultipleListing> | Partial<DBMarketMultipleListing>[],
): Promise<DBMarketMultipleListing[]> {
  return knex()<DBMarketMultipleListing>("market_multiple_listings")
    .insert(body)
    .returning("*")
}

/**
 * Get market aggregate listing by user.
 */
export async function getMarketAggregateListingByUser(
  aggregate_id: string,
  user_seller_id: string,
): Promise<DBMarketAggregateListing | undefined> {
  return knex()<DBMarketAggregateListing>("market_aggregate_listings")
    .join(
      "market_listings",
      "market_listings.listing_id",
      "=",
      "market_aggregate_listings.aggregate_listing_id",
    )
    .where({ user_seller_id, aggregate_id })
    .andWhere("status", "!=", "archived")
    .first()
}

/**
 * Get market aggregate listing by contractor.
 */
export async function getMarketAggregateListingByContractor(
  aggregate_id: string,
  contractor_seller_id: string,
): Promise<DBMarketAggregateListing | undefined> {
  return knex()<DBMarketAggregateListing>("market_aggregate_listings")
    .join(
      "market_listings",
      "market_listings.listing_id",
      "=",
      "market_aggregate_listings.aggregate_listing_id",
    )
    .where({ contractor_seller_id, aggregate_id })
    .andWhere("status", "!=", "archived")
    .first()
}

/**
 * Get user market listings filtered.
 */
export async function getUserMarketListingsFiltered(
  query: UserListingsQuery,
): Promise<{
  listings: (DBUniqueListingComplete | DBMultipleListingCompositeComplete)[]
  multiples: DBMultipleComplete[]
  total: number
}> {
  const db = knex()

  // Build base queries for unique listings
  let uniqueQuery = db("market_unique_listings")
    .join(
      "market_listings",
      "market_unique_listings.listing_id",
      "market_listings.listing_id",
    )
    .join(
      "market_listing_details",
      "market_unique_listings.details_id",
      "market_listing_details.details_id",
    )
    .where("market_listings.user_seller_id", query.user_id)
    .select(
      "market_unique_listings.*",
      "market_listings.*",
      "market_listing_details.*",
    )

  // Apply filters
  if (query.statuses && query.statuses.length > 0) {
    uniqueQuery = uniqueQuery.whereIn("market_listings.status", query.statuses)
  }

  if (query.sale_type) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.sale_type",
      query.sale_type,
    )
  }

  if (query.item_type) {
    uniqueQuery = uniqueQuery.where(
      "market_listing_details.item_type",
      query.item_type,
    )
  }

  if (query.query) {
    uniqueQuery = uniqueQuery.where(function () {
      this.whereRaw("market_listing_details.title ILIKE ?", [
        `%${query.query}%`,
      ]).orWhereRaw("market_listing_details.description ILIKE ?", [
        `%${query.query}%`,
      ])
    })
  }

  if (query.minCost && query.minCost > 0) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.price",
      ">=",
      query.minCost,
    )
  }

  if (query.maxCost) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.price",
      "<=",
      query.maxCost,
    )
  }

  if (query.quantityAvailable && query.quantityAvailable > 0) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.quantity_available",
      ">=",
      query.quantityAvailable,
    )
  }

  // Build query for multiples
  let multiplesQuery = db("market_multiples").where(
    "market_multiples.user_seller_id",
    query.user_id,
  )

  if (query.statuses && query.statuses.length > 0) {
    multiplesQuery = multiplesQuery.whereIn(
      "market_multiples.status",
      query.statuses,
    )
  }

  // Apply same filters to multiples query
  if (query.sale_type) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.sale_type",
      query.sale_type,
    )
  }

  if (query.item_type) {
    multiplesQuery = multiplesQuery
      .join(
        "market_listing_details",
        "market_multiples.details_id",
        "market_listing_details.details_id",
      )
      .where("market_listing_details.item_type", query.item_type)
  }

  if (query.query) {
    if (!query.item_type) {
      multiplesQuery = multiplesQuery.join(
        "market_listing_details",
        "market_multiples.details_id",
        "market_listing_details.details_id",
      )
    }
    multiplesQuery = multiplesQuery.where(function () {
      this.whereRaw("market_listing_details.title ILIKE ?", [
        `%${query.query}%`,
      ]).orWhereRaw("market_listing_details.description ILIKE ?", [
        `%${query.query}%`,
      ])
    })
  }

  if (query.minCost && query.minCost > 0) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.price",
      ">=",
      query.minCost,
    )
  }

  if (query.maxCost) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.price",
      "<=",
      query.maxCost,
    )
  }

  if (query.quantityAvailable && query.quantityAvailable > 0) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.quantity_available",
      ">=",
      query.quantityAvailable,
    )
  }

  // Get counts
  const uniqueCount = await uniqueQuery.clone().count("* as count").first()
  const multiplesCount = await multiplesQuery
    .clone()
    .count("* as count")
    .first()
  const total =
    Number(uniqueCount?.count || 0) + Number(multiplesCount?.count || 0)

  // Apply sorting
  const sortColumn =
    query.sort === "title"
      ? "market_listing_details.title"
      : query.sort === "minimum_price"
        ? "market_listings.price"
        : query.sort === "quantity_available"
          ? "market_listings.quantity_available"
          : query.sort === "expiration"
            ? "market_listings.expiration"
            : "market_listings.timestamp"

  uniqueQuery = uniqueQuery.orderBy(
    sortColumn,
    query.reverseSort ? "desc" : "asc",
  )

  // Apply pagination to unique listings
  uniqueQuery = uniqueQuery.limit(query.page_size).offset(query.index)

  const listings = await uniqueQuery
  const multiples = await multiplesQuery

  return {
    listings: listings as (
      | DBUniqueListingComplete
      | DBMultipleListingCompositeComplete
    )[],
    multiples: multiples as DBMultipleComplete[],
    total,
  }
}

/**
 * Get contractor market listings filtered.
 */
/**
 * Get a complete market listing by listing_id.
 * Returns the appropriate complete listing type based on sale_type.
 */
export async function getMarketListingComplete(
  listing_id: string,
): Promise<
  | DBUniqueListingComplete
  | DBAggregateListingComplete
  | DBMultipleListingCompositeComplete
> {
  const listing = await getMarketListing({ listing_id })

  if (!listing) {
    throw new Error("Invalid listing!")
  }

  if (listing.sale_type === "aggregate") {
    return getMarketAggregateListingComplete(listing.listing_id)
  } else if (listing.sale_type === "multiple") {
    return getMarketMultipleListingComplete(listing.listing_id)
  } else {
    return getMarketUniqueListingComplete(listing.listing_id)
  }
}

export async function getContractorMarketListingsFiltered(
  query: ContractorListingsQuery,
): Promise<{
  listings: (DBUniqueListingComplete | DBMultipleListingCompositeComplete)[]
  multiples: DBMultipleComplete[]
  total: number
}> {
  const db = knex()

  // Build base queries for unique listings
  let uniqueQuery = db("market_unique_listings")
    .join(
      "market_listings",
      "market_unique_listings.listing_id",
      "market_listings.listing_id",
    )
    .join(
      "market_listing_details",
      "market_unique_listings.details_id",
      "market_listing_details.details_id",
    )
    .where("market_listings.contractor_seller_id", query.contractor_id)
    .select(
      "market_unique_listings.*",
      "market_listings.*",
      "market_listing_details.*",
    )

  // Apply filters
  if (query.statuses && query.statuses.length > 0) {
    uniqueQuery = uniqueQuery.whereIn("market_listings.status", query.statuses)
  }

  if (query.sale_type) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.sale_type",
      query.sale_type,
    )
  }

  if (query.item_type) {
    uniqueQuery = uniqueQuery.where(
      "market_listing_details.item_type",
      query.item_type,
    )
  }

  if (query.query) {
    uniqueQuery = uniqueQuery.where(function () {
      this.whereRaw("market_listing_details.title ILIKE ?", [
        `%${query.query}%`,
      ]).orWhereRaw("market_listing_details.description ILIKE ?", [
        `%${query.query}%`,
      ])
    })
  }

  if (query.minCost && query.minCost > 0) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.price",
      ">=",
      query.minCost,
    )
  }

  if (query.maxCost) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.price",
      "<=",
      query.maxCost,
    )
  }

  if (query.quantityAvailable && query.quantityAvailable > 0) {
    uniqueQuery = uniqueQuery.where(
      "market_listings.quantity_available",
      ">=",
      query.quantityAvailable,
    )
  }

  // Build query for multiples
  let multiplesQuery = db("market_multiples").where(
    "market_multiples.contractor_seller_id",
    query.contractor_id,
  )

  if (query.statuses && query.statuses.length > 0) {
    multiplesQuery = multiplesQuery.whereIn(
      "market_multiples.status",
      query.statuses,
    )
  }

  // Apply same filters to multiples query
  if (query.sale_type) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.sale_type",
      query.sale_type,
    )
  }

  if (query.item_type) {
    multiplesQuery = multiplesQuery
      .join(
        "market_listing_details",
        "market_multiples.details_id",
        "market_listing_details.details_id",
      )
      .where("market_listing_details.item_type", query.item_type)
  }

  if (query.query) {
    if (!query.item_type) {
      multiplesQuery = multiplesQuery.join(
        "market_listing_details",
        "market_multiples.details_id",
        "market_listing_details.details_id",
      )
    }
    multiplesQuery = multiplesQuery.where(function () {
      this.whereRaw("market_listing_details.title ILIKE ?", [
        `%${query.query}%`,
      ]).orWhereRaw("market_listing_details.description ILIKE ?", [
        `%${query.query}%`,
      ])
    })
  }

  if (query.minCost && query.minCost > 0) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.price",
      ">=",
      query.minCost,
    )
  }

  if (query.maxCost) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.price",
      "<=",
      query.maxCost,
    )
  }

  if (query.quantityAvailable && query.quantityAvailable > 0) {
    multiplesQuery = multiplesQuery.where(
      "market_multiples.quantity_available",
      ">=",
      query.quantityAvailable,
    )
  }

  // Get counts
  const uniqueCount = await uniqueQuery.clone().count("* as count").first()
  const multiplesCount = await multiplesQuery
    .clone()
    .count("* as count")
    .first()
  const total =
    Number(uniqueCount?.count || 0) + Number(multiplesCount?.count || 0)

  // Apply sorting
  const sortColumn =
    query.sort === "title"
      ? "market_listing_details.title"
      : query.sort === "minimum_price"
        ? "market_listings.price"
        : query.sort === "quantity_available"
          ? "market_listings.quantity_available"
          : query.sort === "expiration"
            ? "market_listings.expiration"
            : "market_listings.timestamp"

  uniqueQuery = uniqueQuery.orderBy(
    sortColumn,
    query.reverseSort ? "desc" : "asc",
  )

  // Apply pagination to unique listings
  uniqueQuery = uniqueQuery.limit(query.page_size).offset(query.index)

  const listings = await uniqueQuery
  const multiples = await multiplesQuery

  return {
    listings: listings as (
      | DBUniqueListingComplete
      | DBMultipleListingCompositeComplete
    )[],
    multiples: multiples as DBMultipleComplete[],
    total,
  }
}

/**
 * Get price history by where clause.
 */
export async function getPriceHistory(
  where: Partial<DBPriceHistory>,
): Promise<DBPriceHistory[]> {
  return knex()<DBPriceHistory>("market_price_history")
    .where(where)
    .orderBy("date", "asc")
    .select()
}

/**
 * Get game item by where clause.
 */
export async function getGameItem(
  where: Partial<DBMarketItem>,
): Promise<DBMarketItem | undefined> {
  return knex()<DBMarketItem>("game_items").where(where).first()
}

/**
 * Get market items by subcategory.
 */
export async function getMarketItemsBySubcategory(
  subcategory: string,
): Promise<DBMarketItem[]> {
  return knex()<DBMarketItem>("game_items")
    .where("type", subcategory)
    .orderBy("name")
    .select("name", "type", "id")
}

/**
 * Get market categories.
 */
export async function getMarketCategories(): Promise<DBMarketCategory[]> {
  return knex()<DBMarketCategory>("game_item_categories")
    .orderBy("category")
    .orderBy("game_item_categories")
    .select()
}

/**
 * Get seller listing analytics.
 */
export async function getSellerListingAnalytics(data: {
  user_id?: string
  contractor_id?: string
  time_period?: string
}) {
  const { user_id, contractor_id, time_period = "30d" } = data

  let timeFilter
  switch (time_period) {
    case "7d":
      timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      break
    case "30d":
      timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      break
    case "90d":
      timeFilter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      break
    default:
      timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  }

  // Get market listing analytics
  const marketListings = await knex()("market_listings")
    .select("listing_id")
    .where("timestamp", ">=", timeFilter)
    .modify((queryBuilder) => {
      if (user_id) {
        queryBuilder.where("user_seller_id", user_id)
      }
      if (contractor_id) {
        queryBuilder.where("contractor_seller_id", contractor_id)
      }
    })

  const marketListingIds = marketListings.map((l: any) => l.listing_id)

  // Get service analytics
  const services = await knex()("services")
    .select("service_id")
    .where("timestamp", ">=", timeFilter)
    .modify((queryBuilder) => {
      if (user_id) {
        queryBuilder.where("user_id", user_id)
      }
      if (contractor_id) {
        queryBuilder.where("contractor_id", contractor_id)
      }
    })

  const serviceIds = services.map((s: any) => s.service_id)

  // Get view statistics for all listings
  const marketViews = await knex()("listing_views")
    .where("listing_type", "market")
    .whereIn("listing_id", marketListingIds)
    .where("timestamp", ">=", timeFilter)
    .count("* as view_count")

  const serviceViews = await knex()("listing_views")
    .where("listing_type", "service")
    .whereIn("listing_id", serviceIds)
    .where("timestamp", ">=", timeFilter)
    .count("* as view_count")

  return {
    market_listings: marketListingIds.length,
    services: serviceIds.length,
    total_market_views: marketViews[0]?.view_count || 0,
    total_service_views: serviceViews[0]?.view_count || 0,
    time_period: time_period,
  }
}

/**
 * Track a listing view.
 */
export async function trackListingView(data: {
  listing_type: "market" | "service"
  listing_id: string
  viewer_id?: string | null
  viewer_ip?: string
  user_agent?: string
  referrer?: string
  session_id?: string | null
}): Promise<void> {
  // Don't track views from the seller themselves
  if (data.viewer_id) {
    if (data.listing_type === "market") {
      const listing = await getMarketListing({ listing_id: data.listing_id })

      if (
        listing &&
        (listing.user_seller_id === data.viewer_id ||
          listing.contractor_seller_id === data.viewer_id)
      ) {
        return // Don't track seller's own views
      }
    } else if (data.listing_type === "service") {
      const service = await getService({ service_id: data.listing_id })

      if (
        service &&
        (service.user_id === data.viewer_id ||
          service.contractor_id === data.viewer_id)
      ) {
        return // Don't track seller's own views
      }
    }
  }

  // Check if this is a unique view (same user/session hasn't viewed in last 24 hours)
  // Only check for existing views if we have a session_id
  let existingView = null
  if (data.session_id) {
    existingView = await knex()("listing_views")
      .where({
        listing_type: data.listing_type,
        listing_id: data.listing_id,
        session_id: data.session_id,
      })
      .where("timestamp", ">", new Date(Date.now() - 24 * 60 * 60 * 1000))
      .first()
  }

  if (existingView) {
    // Update existing view timestamp but don't count as new view
    await knex()("listing_views")
      .where({ view_id: existingView.view_id })
      .update({
        timestamp: new Date(),
        is_unique: false,
      })
  } else {
    // Insert new view
    await knex()("listing_views").insert({
      listing_type: data.listing_type,
      listing_id: data.listing_id,
      viewer_id: data.viewer_id,
      viewer_ip: data.viewer_ip,
      user_agent: data.user_agent,
      referrer: data.referrer,
      session_id: data.session_id || null,
      is_unique: true,
    })
  }
}

/**
 * Get listing view statistics.
 */
export async function getListingViewStats(
  listing_type: "market" | "service",
  listing_id: string,
) {
  return knex()<{
    total_views: string
    listing_type: string
    listing_id: string
  }>("listing_view_stats")
    .where({ listing_type, listing_id })
    .first()
}

/**
 * Rebuild market materialized view.
 */
export async function rebuildMarket(): Promise<void> {
  try {
    await knex().schema.refreshMaterializedView(
      "market_search_materialized",
      true,
    )
  } catch (error) {
    logger.error(
      "Failed to refresh materialized view 'market_search_materialized' concurrently",
      {
        error: error instanceof Error ? error : new Error(String(error)),
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        hint: (error as any)?.hint,
      },
    )
    // Wait for next scheduled run (already scheduled every 5 minutes)
  }
}

/**
 * Refresh badge materialized view.
 */
export async function refreshBadgeView(): Promise<void> {
  try {
    // Use CONCURRENTLY to allow reads during refresh (requires unique index)
    // This is slower than non-concurrent but doesn't block reads
    await knex().raw(
      "REFRESH MATERIALIZED VIEW CONCURRENTLY user_badges_materialized",
    )
  } catch (error) {
    logger.error(
      "Failed to refresh materialized view 'user_badges_materialized' concurrently",
      {
        error: error instanceof Error ? error : new Error(String(error)),
        message: error instanceof Error ? error.message : String(error),
        code: (error as any)?.code,
        hint: (error as any)?.hint,
      },
    )
    // Wait for next scheduled run (already scheduled every 2 hours)
  }
}

/**
 * Update price history.
 */
export async function updatePriceHistpry(): Promise<void> {
  await knex().raw("CALL upsert_daily_price_history()")
}

/**
 * Search market using materialized view.
 */
export async function searchMarket(
  searchQuery: MarketSearchQuery,
  andWhere?: any,
): Promise<DBMarketSearchResult[]> {
  let query = knex()<DBMarketSearchResult>("market_search_materialized")
    .leftJoin("user_badges_materialized", function () {
      this.on(function () {
        this.on(
          "market_search_materialized.user_seller_id",
          "=",
          "user_badges_materialized.user_id",
        ).andOn(
          "user_badges_materialized.entity_type",
          "=",
          knex().raw("'user'"),
        )
      }).orOn(function () {
        this.on(
          "market_search_materialized.contractor_seller_id",
          "=",
          "user_badges_materialized.contractor_id",
        ).andOn(
          "user_badges_materialized.entity_type",
          "=",
          knex().raw("'contractor'"),
        )
      })
    })
    .select(
      knex().raw("market_search_materialized.*"),
      knex().raw(
        "COALESCE(user_badges_materialized.badge_ids, ARRAY[]::text[]) as badge_ids",
      ),
      knex().raw("count(*) OVER() AS full_count"),
    )
    .orderBy(
      `market_search_materialized.${searchQuery.sort}`,
      searchQuery.reverseSort ? "asc" : "desc",
    )

  if (searchQuery.sale_type) {
    query = query.where(
      "market_search_materialized.sale_type",
      searchQuery.sale_type || undefined,
    )
  }

  if (searchQuery.item_type) {
    query = query.andWhere(
      knex().raw(
        "to_tsquery('simple', COALESCE(websearch_to_tsquery('english', ?)::text, ':*'))",
        searchQuery.item_type,
      ),
      "@@",
      knex().raw("market_search_materialized.item_type_ts"),
    )
  }

  if (searchQuery.minCost) {
    query = query.andWhere(
      "market_search_materialized.minimum_price",
      ">=",
      searchQuery.minCost,
    )
  }

  if (searchQuery.maxCost) {
    query = query.andWhere(
      "market_search_materialized.maximum_price",
      "<=",
      searchQuery.maxCost,
    )
  }

  if (searchQuery.quantityAvailable) {
    query = query.andWhere(
      "market_search_materialized.quantity_available",
      ">=",
      searchQuery.quantityAvailable,
    )
  }

  if (searchQuery.rating) {
    query = query.andWhere(
      "market_search_materialized.avg_rating",
      ">",
      searchQuery.seller_rating,
    )
  }

  if (searchQuery.query) {
    // to_tsquery('simple', websearch_to_tsquery('english', ?)::text || ':*')
    query = query
      .andWhere(
        knex().raw("websearch_to_tsquery('english', ?)", searchQuery.query),
        "@@",
        knex().raw("market_search_materialized.textsearch"),
      )
      .orderBy(
        // @ts-ignore
        knex().raw(
          "ts_rank_cd(market_search_materialized.textsearch, websearch_to_tsquery('english', ?))",
          searchQuery.query,
        ),
        "desc",
      )
  }

  if (searchQuery.listing_type) {
    if (searchQuery.listing_type === "not-aggregate") {
      query = query.andWhere(
        "market_search_materialized.listing_type",
        "!=",
        "aggregate",
      )
    } else {
      query = query.andWhere(
        "market_search_materialized.listing_type",
        searchQuery.listing_type,
      )
    }
  }

  if (searchQuery.user_seller_id) {
    query = query.andWhere(
      "market_search_materialized.user_seller_id",
      searchQuery.user_seller_id,
    )
  }

  if (searchQuery.contractor_seller_id) {
    query = query.andWhere(
      "market_search_materialized.contractor_seller_id",
      searchQuery.contractor_seller_id,
    )
  }

  query = query.andWhere((qb) => {
    qb.whereNull("market_search_materialized.contractor_seller_id").orWhereIn(
      "market_search_materialized.contractor_seller_id",
      knex()("contractors").select("contractor_id").where({ archived: false }),
    )
  })

  if (searchQuery.statuses && searchQuery.statuses.length > 0) {
    query = query.andWhere(
      "market_search_materialized.status",
      "in",
      searchQuery.statuses,
    )
  }

  // Language filtering: filter by seller's supported languages (OR logic)
  if (searchQuery.language_codes && searchQuery.language_codes.length > 0) {
    // Build array expression using knex().raw() with safe parameter binding
    // Create placeholders for each language code and bind them as parameters
    const placeholders = searchQuery.language_codes.map(() => "?").join(",")
    const languageArrayRaw = knex().raw(
      "ARRAY[" + placeholders + "]::text[]",
      searchQuery.language_codes,
    )

    query = query.andWhere((qb) => {
      qb.where((subQb) => {
        // For user sellers: check if user's supported_languages contains any of the selected languages
        subQb
          .whereNotNull("market_search_materialized.user_seller_id")
          .andWhereRaw(
            knex().raw(
              "EXISTS (SELECT 1 FROM accounts WHERE accounts.user_id = market_search_materialized.user_seller_id AND COALESCE(accounts.supported_languages, ARRAY['en']) && ?)",
              [languageArrayRaw],
            ),
          )
      }).orWhere((subQb) => {
        // For contractor sellers: check if contractor's supported_languages contains any of the selected languages
        subQb
          .whereNotNull("market_search_materialized.contractor_seller_id")
          .andWhereRaw(
            knex().raw(
              "EXISTS (SELECT 1 FROM contractors WHERE contractors.contractor_id = market_search_materialized.contractor_seller_id AND COALESCE(contractors.supported_languages, ARRAY['en']) && ?)",
              [languageArrayRaw],
            ),
          )
      })
    })
  }

  if (andWhere) {
    query = query.andWhere(andWhere)
  }

  if (searchQuery.page_size) {
    query = query
      .limit(searchQuery.page_size)
      .offset(searchQuery.page_size * searchQuery.index)
  }

  const results = await query
  return results.map((r: any) => ({
    ...r,
    badges:
      r.badge_ids && r.badge_ids.length > 0
        ? {
            badge_ids: r.badge_ids,
          }
        : null,
  })) as DBMarketSearchResult[]
}

/**
 * Search market using unmaterialized tables (for all statuses).
 */
export async function searchMarketUnmaterialized(
  searchQuery: MarketSearchQuery,
  andWhere?: any,
): Promise<any[]> {
  // Query underlying tables directly to get all statuses, not just active
  // Build a query that mimics the market_search_complete view but includes all statuses
  let query = knex()
    .select([
      "market_listings.listing_id",
      "market_listings.sale_type",
      "market_listings.price",
      "market_listings.price as minimum_price",
      "market_listings.price as maximum_price",
      "market_listings.quantity_available",
      "market_listings.timestamp",
      "market_listings.expiration",
      "market_listings.status",
      "market_listings.internal",
      "market_listings.user_seller_id",
      "market_listings.contractor_seller_id",
      "market_listing_details.details_id",
      "market_listing_details.title",
      "market_listing_details.item_type",
      "market_listing_details.game_item_id",
      knex().raw("'unique' as listing_type"),
      knex().raw(
        "to_tsvector('english', market_listing_details.title || ' ' || market_listing_details.description) as textsearch",
      ),
      knex().raw(
        "to_tsvector('english', market_listing_details.item_type) as item_type_ts",
      ),
      knex().raw("0 as total_rating"),
      knex().raw("0 as avg_rating"),
      knex().raw("0 as rating_count"),
      knex().raw("0 as rating_streak"),
      knex().raw("0 as total_orders"),
      knex().raw("0 as total_assignments"),
      knex().raw("0 as response_rate"),
      knex().raw("null as photo_details"),
      knex().raw("null as photo"),
      knex().raw("null as item_name"),
      knex().raw("null as auction_end_time"),
      knex().raw("null as user_seller"),
      knex().raw("null as contractor_seller"),
    ])
    .from("market_listings")
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
    .orderBy(searchQuery.sort, searchQuery.reverseSort ? "asc" : "desc")

  // Apply filters
  if (searchQuery.sale_type) {
    query = query.where("market_listings.sale_type", searchQuery.sale_type)
  }

  if (searchQuery.item_type) {
    query = query.where(
      "market_listing_details.item_type",
      searchQuery.item_type,
    )
  }

  if (searchQuery.minCost) {
    query = query.where("market_listings.price", ">=", searchQuery.minCost)
  }

  if (searchQuery.maxCost) {
    query = query.where("market_listings.price", "<=", searchQuery.maxCost)
  }

  if (searchQuery.quantityAvailable) {
    query = query.where(
      "market_listings.quantity_available",
      ">=",
      searchQuery.quantityAvailable,
    )
  }

  if (searchQuery.query) {
    query = query.where(function () {
      this.whereRaw("market_listing_details.title ILIKE ?", [
        `%${searchQuery.query}%`,
      ]).orWhereRaw("market_listing_details.description ILIKE ?", [
        `%${searchQuery.query}%`,
      ])
    })
  }

  if (searchQuery.user_seller_id) {
    query = query.where(
      "market_listings.user_seller_id",
      searchQuery.user_seller_id,
    )
  }

  if (searchQuery.contractor_seller_id) {
    query = query.where(
      "market_listings.contractor_seller_id",
      searchQuery.contractor_seller_id,
    )
  }

  query = query.where((qb) => {
    qb.whereNull("market_listings.contractor_seller_id").orWhereIn(
      "market_listings.contractor_seller_id",
      knex()("contractors").select("contractor_id").where({ archived: false }),
    )
  })

  if (searchQuery.statuses && searchQuery.statuses.length > 0) {
    query = query.whereIn("market_listings.status", searchQuery.statuses)
  }

  // Language filtering: filter by seller's supported languages (OR logic)
  if (searchQuery.language_codes && searchQuery.language_codes.length > 0) {
    // Build array expression using knex().raw() with safe parameter binding
    // Create placeholders for each language code and bind them as parameters
    const placeholders = searchQuery.language_codes.map(() => "?").join(",")
    const languageArrayRaw = knex().raw(
      "ARRAY[" + placeholders + "]::text[]",
      searchQuery.language_codes,
    )

    query = query.andWhere((qb) => {
      qb.where((subQb) => {
        // For user sellers: check if user's supported_languages contains any of the selected languages
        subQb
          .whereNotNull("market_listings.user_seller_id")
          .andWhereRaw(
            knex().raw(
              "EXISTS (SELECT 1 FROM accounts WHERE accounts.user_id = market_listings.user_seller_id AND COALESCE(accounts.supported_languages, ARRAY['en']) && ?)",
              [languageArrayRaw],
            ),
          )
      }).orWhere((subQb) => {
        // For contractor sellers: check if contractor's supported_languages contains any of the selected languages
        subQb
          .whereNotNull("market_listings.contractor_seller_id")
          .andWhereRaw(
            knex().raw(
              "EXISTS (SELECT 1 FROM contractors WHERE contractors.contractor_id = market_listings.contractor_seller_id AND COALESCE(contractors.supported_languages, ARRAY['en']) && ?)",
              [languageArrayRaw],
            ),
          )
      })
    })
  }

  if (andWhere) {
    query = query.andWhere(andWhere)
  }

  if (searchQuery.page_size) {
    query = query
      .limit(searchQuery.page_size)
      .offset(searchQuery.page_size * searchQuery.index)
  }

  return query.select(knex().raw("count(*) OVER() AS full_count"))
}

/**
 * Upsert daily activity for a user.
 */
export async function upsertDailyActivity(user_id: string): Promise<void> {
  try {
    await knex().raw("CALL upsert_daily_activity(?)", [user_id])
  } catch (e) {
    logger.error("Error upserting daily activity", { user_id, error: e })
  }
}

/**
 * Get market items by category.
 */
export async function getMarketItemsByCategory(
  category: string,
): Promise<DBMarketItem[]> {
  return knex()<DBMarketItem>("game_items")
    .join(
      "game_item_categories",
      "game_item_categories.subcategory",
      "game_items.type",
    )
    .where("category", category)
    .orderBy("name")
    .select("name", "type")
}
