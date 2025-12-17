import {
  DBAggregateComplete,
  DBAggregateListingComplete,
  DBAvailabilityEntry,
  DBBuyOrder,
  DBComment,
  DBContractor,
  DBContractorInvite,
  DBMarketAggregateListing,
  DBMarketBid,
  DBMarketListing,
  DBMarketSearchResult,
  DBMultipleComplete,
  DBMultipleListingComplete,
  DBMultipleListingCompositeComplete,
  DBOfferSession,
  DBOrder,
  DBPriceHistory,
  DBRecruitingPost,
  DBUniqueListingComplete,
  MinimalUser,
  OrderStatus,
  OrderStub,
  Rating,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { User } from "../api-models.js"
import { is_member } from "./permissions.js"
import moment from "moment"
import {
  FormattedAggregateListing,
  FormattedBuyOrder,
  FormattedListing,
  FormattedMultipleListing,
  FormattedUniqueListing,
  ListingBase,
} from "../market/types.js"

export async function formatPrivateSearchResult(listing: DBMarketSearchResult) {
  if (listing.listing_type === "unique") {
    const complete = await database.getMarketUniqueListingComplete(
      listing.listing_id,
    )
    return formatUniqueListingComplete(complete, true)
  } else if (listing.listing_type === "aggregate") {
    const complete = await database.getMarketAggregateComplete(
      listing.listing_id,
      {
        status: "active",
        internal: false,
      },
    )
    return formatMarketAggregateComplete(complete)
  } else {
    const complete = await database.getMarketMultipleComplete(
      listing.listing_id,
      {
        status: "active",
        internal: false,
      },
    )
    return formatMarketMultipleComplete(complete)
  }
}

export async function formatListingComplete(
  listing:
    | DBAggregateComplete
    | DBUniqueListingComplete
    | DBAggregateListingComplete
    | DBMultipleComplete
    | DBMultipleListingCompositeComplete,
  isPrivate = false,
): Promise<FormattedListing> {
  const aggregate = listing as DBAggregateComplete
  const aggregate_listing = listing as DBAggregateListingComplete
  const multiple = listing as DBMultipleComplete
  const multiple_listing = listing as DBMultipleListingCompositeComplete
  if (aggregate.listings && aggregate.game_item_id) {
    return formatMarketAggregateComplete(aggregate)
  } else if (aggregate_listing.aggregate) {
    return formatMarketAggregateListingCompositeComplete(
      listing as DBAggregateListingComplete,
      isPrivate,
    )
  } else if (multiple.default_listing_id) {
    return formatMarketMultipleComplete(multiple, isPrivate)
  } else if (multiple_listing.listing.sale_type === "multiple") {
    return formatMultipleListingCompleteComposite(multiple_listing, isPrivate)
  } else {
    return formatUniqueListingComplete(
      listing as DBUniqueListingComplete,
      isPrivate,
    )
  }
}

export async function formatBuyOrderChartDetails(orders: DBBuyOrder[]) {
  const days = []

  for (let i = 1; i < 31; i++) {
    // Listings that are valid at any point of day
    const day = moment().subtract(i, "days")

    const day_listings = orders.filter((o) => {
      const expiration = o.fulfilled_timestamp
        ? moment(o.fulfilled_timestamp)
        : moment(o.expiry)
      const creation = moment(o.created_timestamp)
      return (
        expiration.isAfter(day.startOf("day")) &&
        creation.isBefore(day.endOf("day"))
      )
    })

    // Listings that are valid at start of day
    const start_listings = orders.filter((o) => {
      const expiration = o.fulfilled_timestamp
        ? moment(o.fulfilled_timestamp)
        : moment(o.expiry)
      const creation = moment(o.created_timestamp)
      return (
        expiration.isAfter(day.startOf("day")) &&
        creation.isBefore(day.startOf("day"))
      )
    })

    // Listings that are valid at end of day
    const end_listings = orders.filter((o) => {
      const expiration = o.fulfilled_timestamp
        ? moment(o.fulfilled_timestamp)
        : moment(o.expiry)
      const creation = moment(o.created_timestamp)
      return (
        expiration.isAfter(day.endOf("day")) &&
        creation.isBefore(day.endOf("day"))
      )
    })

    const high = day_listings.reduce(
      (current, next) => (current > next.price ? current : next.price),
      0,
    )
    const low = day_listings.reduce(
      (current, next) => (current < next.price ? current : next.price),
      day_listings[0]?.price || 0,
    )

    const open = start_listings.reduce(
      (current, next) => (current > next.price ? current : next.price),
      0,
    )
    const close = end_listings.reduce(
      (current, next) => (current > next.price ? current : next.price),
      0,
    )

    days.push({
      high,
      low,
      close,
      open,
      timestamp: day.valueOf(),
      volume: day_listings.reduce(
        (current, next) => current + next.quantity,
        0,
      ),
    })
  }

  return days.reverse()
}

export async function formatPriceHistory(price_history: DBPriceHistory[]) {
  const days = []

  for (let i = 0; i < price_history.length; i++) {
    // Listings that are valid at any point of day
    const high = price_history[i].price
    const low = price_history[i].price
    const open =
      i === 0 || price_history.length === 0
        ? price_history[i].price
        : price_history[i - 1].price
    const close = price_history[i].price

    days.push({
      high,
      low,
      close,
      open,
      timestamp: price_history[i].date,
      volume: i === 0 ? 0 : price_history[i - 1].quantity_available,
    })
  }

  return days
}

export async function formatListing(
  listing: DBMarketListing,
  isPrivate: boolean = false,
) {
  if (listing.sale_type === "aggregate") {
    const complete = await database.getMarketAggregateListingComplete(
      listing.listing_id,
    )
    return formatListingComplete(complete, isPrivate)
  } else if (listing.sale_type === "multiple") {
    const complete = await database.getMarketMultipleListingComplete(
      listing.listing_id,
    )
    return formatListingComplete(complete, isPrivate)
  } else {
    const complete = await database.getMarketUniqueListingComplete(
      listing.listing_id,
    )
    return formatListingComplete(complete, isPrivate)
  }
}

/**
 * Generates the stats associated with a user's listing, including
 * the views the listing has gotten, the number of associated open orders and
 * offers, and some other stuff probably
 *
 * @param listing The listing to fetch and format stats for
 */
export async function serializeListingStats(listing: DBMarketListing) {
  const [{ order_count }] = await database
    .knex<{ order_count: number }>("orders")
    .rightJoin(
      "market_orders",
      "market_orders.order_id",
      "=",
      "orders.order_id",
    )
    .where("market_orders.listing_id", listing.listing_id)
    .andWhere((pred) =>
      pred.whereIn("orders.status", ["not-started", "in-progress"]),
    )
    .count("* as order_count")
    .select()

  const [{ offer_count }] = await database
    .knex<{ offer_count: number }>("offer_market_items")
    .rightJoin(
      "order_offers",
      "order_offers.id",
      "=",
      "offer_market_items.offer_id",
    )
    .rightJoin(
      "offer_sessions",
      "offer_sessions.id",
      "=",
      "order_offers.session_id",
    )
    .where("offer_market_items.listing_id", listing.listing_id)
    .andWhere("offer_sessions.status", "active")
    .countDistinct("order_offers.session_id as offer_count")
    .select()

  // Get view count for unique listings only
  const viewStats = await database.getListingViewStats(
    "market",
    listing.listing_id,
  )

  return {
    order_count: +order_count,
    offer_count: +offer_count,
    view_count: +(viewStats?.total_views || 0),
  }
}

/**
 * Serializes a Unique listing
 * @param complete The complete details from the DB to be serialized
 * @param isPrivate Whether or not to include private details such as current
 * bids and order stats
 */
export async function formatUniqueListingComplete(
  complete: DBUniqueListingComplete,
  isPrivate: boolean = false,
): Promise<FormattedUniqueListing> {
  const listing = complete.listing
  const photos = []
  for (const photo of complete.images) {
    photos.push((await cdn.getFileLinkResource(photo.resource_id))!)
  }

  let price = +listing.price

  if (listing.sale_type === "auction") {
    const bids = await database.getMarketBids({
      listing_id: listing.listing_id,
    })
    if (bids.length) {
      price = Math.max(...bids.map((bid) => bid.bid))
    }
  }

  return {
    type: "unique",
    details: complete.details,
    listing: {
      ...(await formatListingBase(complete.listing, isPrivate)),
      price: price,
    },
    accept_offers: complete.accept_offers,
    auction_details:
      listing.sale_type === "auction"
        ? await database.getAuctionDetail({ listing_id: listing.listing_id })
        : undefined,
    photos: photos,
    stats: isPrivate
      ? await serializeListingStats(listing)
      : {
          view_count:
            (await database.getListingViewStats("market", listing.listing_id))
              ?.total_views || 0,
        },
  }
}

export async function formatBuyOrder(
  buy_order: DBBuyOrder,
): Promise<FormattedBuyOrder> {
  return {
    buy_order_id: buy_order.buy_order_id,
    aggregate_id: buy_order.game_item_id,
    quantity: buy_order.quantity,
    price: buy_order.price,
    buyer: await database.getMinimalUser({ user_id: buy_order.buyer_id }),
    expiry: buy_order.expiry,
  }
}

export async function formatMarketAggregateComplete(
  complete: DBAggregateComplete,
): Promise<FormattedAggregateListing> {
  const photos: string[] = []
  for (const photo of complete.images) {
    photos.push((await cdn.getFileLinkResource(photo.resource_id))!)
  }

  return {
    type: "aggregate",
    listing: {
      listing_id: complete.listings[0]?.listing_id || "",
      sale_type: "aggregate",
      price: complete.listings[0]?.price || 0,
      quantity_available: complete.listings[0]?.quantity_available || 0,
      status: complete.listings[0]?.status || "active",
      timestamp: complete.listings[0]?.timestamp || new Date(),
      expiration: complete.listings[0]?.expiration || new Date(),
    },
    listings: await Promise.all(
      complete.listings.map((l) => formatListingBase(l)),
    ),
    details: {
      item_type: complete.details.item_type,
      game_item_id: complete.details.game_item_id,
      description: complete.details.description,
      title: complete.details.title,
    },
    photos: photos,
    buy_orders: await Promise.all(complete.buy_orders.map(formatBuyOrder)),
    stats: {
      order_count: 0,
      offer_count: 0,
      view_count: 0,
    },
  }
}

export async function formatMarketMultipleComplete(
  complete: DBMultipleComplete,
  isPrivate: boolean = false,
): Promise<FormattedMultipleListing> {
  const defaultListing = complete.listings.find(
    (l) => l.listing.listing_id === complete.default_listing_id,
  )

  const photos: string[] = []
  for (const photo of complete.default_listing.images) {
    photos.push((await cdn.getFileLinkResource(photo.resource_id))!)
  }

  return {
    type: "multiple",
    listing: {
      listing_id: complete.multiple_id,
      sale_type: "multiple",
      price: defaultListing?.listing.price || 0,
      quantity_available: defaultListing?.listing.quantity_available || 0,
      status: defaultListing?.listing.status || "active",
      timestamp: defaultListing?.listing.timestamp || new Date(),
      expiration: defaultListing?.listing.expiration || new Date(),
    },
    details: {
      item_type: complete.details.item_type,
      game_item_id: complete.details.game_item_id,
      description: complete.details.description,
      title: complete.details.title,
    },
    photos,
    stats: {
      order_count: 0,
      offer_count: 0,
      view_count: 0,
    },
  }
}

export async function formatMultipleListingComplete(
  complete: DBMultipleListingComplete,
  isPrivate: boolean = false,
) {
  const base = await formatListingBase(complete.listing)

  const photos: string[] = []
  for (const photo of complete.images) {
    photos.push((await cdn.getFileLinkResource(photo.resource_id))!)
  }

  return {
    type: "multiple_listing",
    listing: base,
    details: complete.details,
    photos,
  }
}

export async function formatMultipleListingCompleteComposite(
  complete: DBMultipleListingCompositeComplete,
  isPrivate: boolean = false,
): Promise<FormattedMultipleListing> {
  const photos: string[] = []
  for (const photo of complete.images) {
    photos.push((await cdn.getFileLinkResource(photo.resource_id))!)
  }

  return {
    type: "multiple",
    listing: {
      listing_id: complete.listing.listing_id,
      sale_type: "multiple",
      price: complete.listing.price,
      quantity_available: complete.listing.quantity_available,
      status: complete.listing.status,
      timestamp: complete.listing.timestamp,
      expiration: complete.listing.expiration,
    },
    details: {
      item_type: complete.details.item_type,
      game_item_id: complete.details.game_item_id,
      description: complete.details.description,
      title: complete.details.title,
    },
    photos,
    stats: {
      order_count: 0,
      offer_count: 0,
      view_count: 0,
    },
  }
}

export async function formatListingBase(
  listing: DBMarketListing,
  isPrivate: boolean = false,
): Promise<ListingBase> {
  const public_details = {
    price: +listing.price,
    timestamp: listing.timestamp,
    quantity_available: listing.quantity_available,
    listing_id: listing.listing_id,
    user_seller: listing.user_seller_id
      ? await database.getMinimalUser({ user_id: listing.user_seller_id })
      : null,
    contractor_seller: listing.contractor_seller_id
      ? await database.getMinimalContractor({
          contractor_id: listing.contractor_seller_id,
        })
      : null,
    status: listing.status,
    sale_type: listing.sale_type,
    expiration: listing.expiration,
    internal: listing.internal,
    // aggregate: await
  }

  if (!isPrivate) {
    return public_details
  }

  // Note: Orders are now fetched via separate paginated endpoint
  // /api/market/listing/:listing_id/orders

  let bids: any | undefined = []
  if (listing.sale_type === "auction") {
    const bid_objects = await database.getMarketBids({
      listing_id: listing.listing_id,
    })
    for (const bid of bid_objects) {
      bids.push(await formatBid(bid))
    }
  } else {
    bids = undefined
  }

  return {
    ...public_details,
    bids: bids,
  }
}

export async function formatMarketAggregateListingComposite(
  listing: DBMarketAggregateListing,
) {
  const complete = await database.getMarketAggregateListingComplete(
    listing.aggregate_listing_id,
  )
  return formatMarketAggregateListingCompositeComplete(complete)
}

export async function formatMarketAggregateListingCompositeComplete(
  complete: DBAggregateListingComplete,
  isPrivate: boolean = false,
): Promise<FormattedAggregateListing> {
  const photos = []
  for (const photo of complete.images) {
    photos.push((await cdn.getFileLinkResource(photo.resource_id))!)
  }

  return {
    type: "aggregate",
    listing: {
      listing_id: complete.listing.listing_id,
      sale_type: "aggregate",
      price: complete.listing.price,
      quantity_available: complete.listing.quantity_available,
      status: complete.listing.status,
      timestamp: complete.listing.timestamp,
      expiration: complete.listing.expiration,
    },
    details: {
      item_type: complete.details.item_type,
      game_item_id: complete.details.game_item_id,
      description: complete.details.description,
      title: complete.details.title,
    },
    photos,
    stats: {
      order_count: 0,
      offer_count: 0,
      view_count: 0,
    },
  }
}

export async function formatBid(bid: DBMarketBid) {
  return {
    user_bidder:
      bid.user_bidder_id &&
      (await database.getMinimalUser({ user_id: bid.user_bidder_id })),
    contractor_bidder:
      bid.contractor_bidder_id &&
      (await database.getMinimalContractor({
        contractor_id: bid.contractor_bidder_id,
      })),
    bid: bid.bid,
    timestamp: +bid.timestamp,
    bid_id: bid.bid_id,
    listing_id: bid.listing_id,
  }
}

// export async function formatOffer(offer: DBMarketOffer) {
//   return {
//     user:
//       offer.buyer_user_id &&
//       (await database.getMinimalUser({ user_id: offer.buyer_user_id })),
//     contractor:
//       offer.buyer_contractor_id &&
//       (await database.getMinimalContractor({
//         contractor_id: offer.buyer_contractor_id,
//       })),
//     offer: offer.offer,
//     // quantity: offer.quantity,
//     timestamp: +offer.timestamp,
//     offer_id: offer.offer_id,
//     // listing_id: offer.listing_id
//   }
// }

export async function formatPrivateListing(listing: DBMarketListing) {
  if (listing.sale_type === "aggregate") {
    const complete = await database.getMarketAggregateListingComplete(
      listing.listing_id,
    )
    return formatMarketAggregateListingCompositeComplete(complete, true)
  } else {
    const complete = await database.getMarketUniqueListingComplete(
      listing.listing_id,
    )
    return formatUniqueListingComplete(complete, true)
  }
}

export async function formatReview(
  order: DBOrder,
  role?: "customer" | "contractor",
) {
  const order_review = await database.getOrderReview({
    order_id: order.order_id,
    role,
  })
  if (!order_review) {
    return null
  }
  return {
    review_id: order_review.review_id,
    user_author: order_review.user_author
      ? await database.getMinimalUser({ user_id: order_review.user_author })
      : null,
    contractor_author: order_review.contractor_author
      ? await database.getMinimalContractor({
          contractor_id: order_review.contractor_author,
        })
      : null,
    rating: order_review.rating,
    content: order_review.content,
    timestamp: order_review.timestamp,
    order_id: order_review.order_id,
    role: order_review.role,
    revision_requested: order_review.revision_requested,
    revision_requested_at: order_review.revision_requested_at,
    last_modified_at: order_review.last_modified_at,
    revision_message: order_review.revision_message,
  }
}

export async function formatOrderAvailability(order: DBOrder | DBOfferSession) {
  const availabilities: {
    customer: null | DBAvailabilityEntry[]
    assigned: null | DBAvailabilityEntry[]
  } = { customer: null, assigned: null }

  if (order.customer_id) {
    availabilities.customer = await database.getUserAvailability(
      order.customer_id,
      null,
    )
  }

  if (order.assigned_id) {
    availabilities.assigned = await database.getUserAvailability(
      order.assigned_id,
      order.contractor_id,
    )
  }

  return availabilities
}

export async function formatOrderStub(order: DBOrder): Promise<OrderStub> {
  const itemCount = await database.getOrderMarketListingCount(order.order_id)
  let service_name = null
  if (order.service_id) {
    const service = await database.getService({
      service_id: order.service_id,
    })
    service_name = service!.title
  }

  return {
    order_id: order.order_id,
    contractor: order.contractor_id
      ? await database.getMinimalContractor({
          contractor_id: order.contractor_id,
        })
      : null,
    assigned_to: order.assigned_id
      ? await database.getMinimalUser({ user_id: order.assigned_id })
      : null,
    customer: await database.getMinimalUser({ user_id: order.customer_id }),
    status: order.status as OrderStatus,
    timestamp: order.timestamp.toISOString(),
    cost: order.cost.toString(),
    title: order.title,
    payment_type: order.payment_type,
    count: +itemCount.sum,
    service_name,
  }
}

// Type for the optimized order row from search_orders_optimized
interface OptimizedOrderRow {
  // Order fields
  order_id: string
  customer_id: string
  assigned_id: string | null
  contractor_id: string | null
  status: string
  timestamp: Date
  title: string
  kind: string
  cost: number
  payment_type: string
  service_id: string | null

  // Item count
  item_count: number

  // Service fields
  service_title: string | null

  // Customer account fields
  customer_username: string
  customer_avatar: string
  customer_display_name: string

  // Assigned account fields
  assigned_username: string | null
  assigned_avatar: string | null
  assigned_display_name: string | null

  // Contractor fields
  contractor_spectrum_id: string | null
  contractor_name: string | null
  contractor_avatar: string | null
}

// Optimized serializer for pre-joined data
export async function formatOrderStubOptimized(
  row: OptimizedOrderRow,
): Promise<OrderStub> {
  // We still need to fetch ratings and process avatars since they're not in the optimized query
  const customerRating = await getUserRating(row.customer_id)
  const assignedRating = row.assigned_id
    ? await getUserRating(row.assigned_id)
    : null
  const contractorRating = row.contractor_id
    ? await getContractorRating(row.contractor_id)
    : null

  // Process avatars through CDN service
  const customerAvatar = await cdn.getFileLinkResource(row.customer_avatar)
  const assignedAvatar = row.assigned_avatar
    ? await cdn.getFileLinkResource(row.assigned_avatar)
    : null
  const contractorAvatar = row.contractor_avatar
    ? await cdn.getFileLinkResource(row.contractor_avatar)
    : null

  return {
    order_id: row.order_id,
    contractor:
      row.contractor_id && row.contractor_spectrum_id && row.contractor_name
        ? {
            spectrum_id: row.contractor_spectrum_id,
            name: row.contractor_name,
            avatar: contractorAvatar!,
            rating: contractorRating!,
          }
        : null,
    assigned_to:
      row.assigned_id && row.assigned_username && row.assigned_display_name
        ? {
            username: row.assigned_username,
            avatar: assignedAvatar!,
            display_name: row.assigned_display_name,
            rating: assignedRating!,
          }
        : null,
    customer: {
      username: row.customer_username,
      avatar: customerAvatar!,
      display_name: row.customer_display_name,
      rating: customerRating,
    },
    status: row.status as OrderStatus,
    timestamp: row.timestamp.toISOString(),
    cost: row.cost.toString(),
    title: row.title,
    payment_type: row.payment_type,
    count: +row.item_count,
    service_name: row.service_title,
  }
}

export async function getContractorRating(
  contractor_id: string,
): Promise<Rating> {
  // Try to get badges from materialized view first
  const badgeData = await database.getContractorBadges(contractor_id)

  if (badgeData && badgeData.metadata) {
    const metadata = badgeData.metadata
    return {
      avg_rating: metadata.avg_rating || 0,
      rating_count: metadata.rating_count || 0,
      streak: metadata.rating_streak || 0,
      total_rating: metadata.total_rating || 0,
      // Don't include response_rate, total_assignments, total_orders in Rating
      // These are available in badge metadata if needed
    }
  }

  // Fallback to current calculation if badge data missing
  const reviews = await database.getContractorReviews(contractor_id)
  const count = await database.getOrderCount({
    contractor_id: contractor_id,
    status: "fulfilled",
  })

  reviews.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp))
  let streak = 0
  for (const review of reviews) {
    if (+review.rating === 5) {
      streak += 1
    } else {
      break
    }
  }

  const ratings = reviews.filter((r) => r.rating).map((r) => +r.rating)
  const responseStats = await database.getContractorResponseStats(contractor_id)
  const total_rating = ratings.reduce((a, b) => a + b, 0)

  return {
    avg_rating: (total_rating * 10) / ratings.length || 0,
    rating_count: ratings.length,
    streak,
    total_rating,
    total_orders: count,
    response_rate: responseStats.response_rate,
    total_assignments: responseStats.total_assignments,
  }
}

export async function getUserRating(user_id: string): Promise<Rating> {
  // Try to get badges from materialized view first
  const badgeData = await database.getUserBadges(user_id)

  if (badgeData && badgeData.metadata) {
    const metadata = badgeData.metadata
    return {
      avg_rating: metadata.avg_rating || 0,
      rating_count: metadata.rating_count || 0,
      streak: metadata.rating_streak || 0,
      total_rating: metadata.total_rating || 0,
      // Don't include response_rate, total_assignments, total_orders in Rating
      // These are available in badge metadata if needed
    }
  }

  // Fallback to current calculation if badge data missing
  const reviews = await database.getUserReviews(user_id)
  const count = await database.getOrderCount({
    assigned_id: user_id,
    contractor_id: null,
    status: "fulfilled",
  })
  reviews.sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp))
  let streak = 0
  for (const review of reviews) {
    if (+review.rating === 5) {
      streak += 1
    } else {
      break
    }
  }

  const ratings = reviews.filter((r) => r.rating).map((r) => +r.rating)
  const responseStats = await database.getUserResponseStats(user_id)
  const total_rating = ratings.reduce((a, b) => a + b, 0)

  return {
    avg_rating: (total_rating * 10) / ratings.length || 0,
    rating_count: ratings.length,
    streak,
    total_rating,
    total_orders: count,
    response_rate: responseStats.response_rate,
    total_assignments: responseStats.total_assignments,
  }
}

export async function contractorDetails(
  contractor: DBContractor,
  user: User | null,
) {
  const fields = await database.getContractorFields({
    "contractors.contractor_id": contractor.contractor_id,
  })

  return {
    ...contractor,
    fields: fields.map((f) => f.field),
    rating: await getContractorRating(contractor.contractor_id),
    badges: await database.getContractorBadges(contractor.contractor_id),
    avatar: await cdn.getFileLinkResource(contractor.avatar),
    banner: await cdn.getFileLinkResource(contractor.banner),
    archived: contractor.archived,
    roles:
      user && (await is_member(contractor.contractor_id, user.user_id))
        ? await database.getContractorRoles({
            contractor_id: contractor.contractor_id,
          })
        : await database.getContractorRolesPublic({
            contractor_id: contractor.contractor_id,
          }),
    market_order_template: contractor.market_order_template,
    // balance: ['admin', 'owner'].includes(members.find(m => m.username === user?.username)?.role || '') ? Number.parseInt(contractor.balance) : undefined,
  }
}

export async function formatInvite(invite: DBContractorInvite) {
  const cont = await database.getContractor({
    contractor_id: invite.contractor_id,
  })
  return { spectrum_id: cont.spectrum_id, message: invite.message }
}

export interface FormattedComment {
  comment_id: string
  author: MinimalUser | null
  content: string
  timestamp: Date
  replies: FormattedComment[]
  upvotes?: string | number
  downvotes?: string | number
}

export async function formatComment(
  comment: DBComment,
): Promise<FormattedComment> {
  const replied = await database.getComments({ reply_to: comment.comment_id })
  const votes = await database.getCommentVoteCounts({
    comment_id: comment.comment_id,
  })

  const formatted_replies = await Promise.all(replied.map(formatComment))
  formatted_replies.sort(
    (a: FormattedComment, b: FormattedComment) =>
      +b.upvotes! - +b.downvotes! - (+a.upvotes! - +a.downvotes!),
  )

  return {
    ...comment,
    content: comment.deleted ? "[deleted]" : comment.content,
    author: comment.deleted
      ? null
      : await database.getMinimalUser({ user_id: comment.author }),
    replies: formatted_replies,
    upvotes: +(votes.find((v) => v.upvote)?.count || 0),
    downvotes: +(votes.find((v) => !v.upvote)?.count || 0),
  }
}

export async function formatRecruitingPost(post: DBRecruitingPost) {
  const cont = await database.getContractor({
    contractor_id: post.contractor_id,
  })
  const contractor = await contractorDetails(cont, null)
  const votes = await database.getRecruitingPostVoteCounts({
    post_id: post.post_id,
  })

  return {
    contractor,
    post_id: post.post_id,
    title: post.title,
    body: post.body,
    timestamp: post.timestamp,
    upvotes: +(votes.find((v) => v.upvote)?.count || 0),
    downvotes: +(votes.find((v) => !v.upvote)?.count || 0),
  }
}

export async function adminCheck(spectrum_id: string, user: User) {
  const contractor = await database.getContractorSafe({ spectrum_id })
  if (!contractor) {
    return false
  }

  const isAdmin = await database.isContractorAdmin(
    user.user_id,
    contractor.contractor_id,
  )
  if (!isAdmin) {
    return false
  } else {
    return true
  }
}
