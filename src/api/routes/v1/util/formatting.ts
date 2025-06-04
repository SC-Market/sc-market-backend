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
import { serializeOrderDetails } from "../orders/serializers.js"
import { ListingBase } from "../market/types.js"

export async function formatSearchResult(listing: DBMarketSearchResult) {
  if (listing.listing_type === "unique") {
    const complete = await database.getMarketUniqueListingComplete(
      listing.listing_id,
    )
    return formatUniqueListingComplete(complete)
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
) {
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
async function serializeListingStats(listing: DBMarketListing) {
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

  return {
    order_count: order_count,
    offer_count: offer_count,
    view_count: 0,
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
): Promise<any> {
  const listing = complete.listing
  const photos = []
  for (const photo of complete.images) {
    photos.push(await cdn.getFileLinkResource(photo.resource_id))
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
    user_seller: listing.user_seller_id
      ? await database.getMinimalUser({ user_id: listing.user_seller_id })
      : null,
    contractor_seller: listing.contractor_seller_id
      ? await database.getMinimalContractor({
          contractor_id: listing.contractor_seller_id,
        })
      : null,
    stats: await serializeListingStats(listing),
  }
}

export async function formatBuyOrder(buy_order: DBBuyOrder) {
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
) {
  const photos = []
  for (const photo of complete.images) {
    photos.push(await cdn.getFileLinkResource(photo.resource_id))
  }

  return {
    type: "aggregate",
    details: complete.details,
    aggregate_id: complete.game_item_id,
    photos: photos,
    buy_orders: await Promise.all(
      complete.buy_orders.map((o) => formatBuyOrder(o)),
    ),
    listings: await Promise.all(
      complete.listings.map((l) => formatListingBase(l)),
    ),
  }
}

export async function formatMarketMultipleComplete(
  complete: DBMultipleComplete,
  isPrivate: boolean = false,
) {
  let listings = await Promise.all(
    complete.listings.map((l) => formatMultipleListingComplete(l, isPrivate)),
  )
  if (!isPrivate) {
    listings = listings.filter(
      (l) => l.listing.status === "active" && l.listing.expiration > new Date(),
    )
  }

  const photos =
    listings.find((l) => complete.default_listing_id === l.listing.listing_id)
      ?.photos || []

  return {
    type: "multiple",
    details: complete.details,
    multiple_id: complete.multiple_id,
    photos: photos,
    listings,
    default_listing: listings.find(
      (l) => l.listing.listing_id === complete.default_listing_id,
    )!,
    user_seller:
      complete.user_seller_id &&
      (await database.getMinimalUser({ user_id: complete.user_seller_id })),
    contractor_seller:
      complete.contractor_seller_id &&
      (await database.getMinimalContractor({
        contractor_id: complete.contractor_seller_id,
      })),
  }
}

export async function formatMultipleListingComplete(
  complete: DBMultipleListingComplete,
  isPrivate: boolean = false,
) {
  const base = await formatListingBase(complete.listing)

  const photos = []
  for (const photo of complete.images) {
    photos.push(await cdn.getFileLinkResource(photo.resource_id))
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
) {
  const base = await formatListingBase(complete.listing)

  const photos = []
  for (const photo of complete.images) {
    photos.push(await cdn.getFileLinkResource(photo.resource_id))
  }

  return {
    type: "multiple_listing",
    listing: base,
    details: complete.details,
    photos,
    multiple: {
      multiple_id: complete.multiple.multiple_id,
      default_listing_id: complete.multiple.default_listing_id,
      details: complete.details,
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
    // aggregate: await
  }

  if (!isPrivate) {
    return public_details
  }

  const market_orders = await database.getMarketListingOrders({
    listing_id: listing.listing_id,
  })

  const orders = await Promise.all(
    market_orders.map(async (ml) => {
      const order = await database.getOrder({ order_id: ml.order_id })
      return await serializeOrderDetails(order, null)
    }),
  )

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
    orders: orders,
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
) {
  const photos = []
  for (const photo of complete.images) {
    photos.push(await cdn.getFileLinkResource(photo.resource_id))
  }

  return {
    type: "aggregate_composite",
    listing: await formatListingBase(complete.listing, isPrivate),
    aggregate_id: complete.aggregate.game_item_id,
    aggregate: complete.aggregate,
    details: complete.details,
    photos,
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

export async function getContractorRating(
  contractor_id: string,
): Promise<Rating> {
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
  return {
    avg_rating: (ratings.reduce((a, b) => a + b, 0) * 10) / ratings.length || 0,
    rating_count: ratings.length,
    streak,
    total_orders: count,
  }
}

export async function getUserRating(user_id: string): Promise<Rating> {
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
  return {
    avg_rating: (ratings.reduce((a, b) => a + b, 0) * 10) / ratings.length || 0,
    rating_count: ratings.length,
    streak,
    total_orders: count,
  }
}

export async function contractorDetails(
  contractor: DBContractor,
  user: User | null,
) {
  const members = await database.getContractorMembersUsernamesAndID({
    "contractor_members.contractor_id": contractor.contractor_id,
  })
  const fields = await database.getContractorFields({
    "contractors.contractor_id": contractor.contractor_id,
  })

  return {
    ...contractor,
    members: await Promise.all(
      members.map(async (m) => ({
        username: m.username,
        roles: (
          await database.getMemberRoles(contractor.contractor_id, m.user_id)
        ).map((r) => r.role_id),
      })),
    ),
    fields: fields.map((f) => f.field),
    rating: await getContractorRating(contractor.contractor_id),
    avatar: await cdn.getFileLinkResource(contractor.avatar),
    banner: await cdn.getFileLinkResource(contractor.banner),
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
