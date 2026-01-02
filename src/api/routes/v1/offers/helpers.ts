import {
  DBOffer,
  DBOfferSession,
} from "../../../../clients/database/db-models.js"
import { has_permission } from "../util/permissions.js"
import { User } from "../api-models.js"
import type { Request } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import type { Knex } from "knex"
import * as offerDb from "./database.js"
import * as marketDb from "../market/database.js"
import {
  OfferSearchQuery,
  OfferSearchQueryArguments,
  OfferSearchSortMethod,
  OfferSearchStatus,
} from "./types.js"
import { createOffer } from "../orders/helpers.js"
import {
  OfferNotFoundError,
  OfferNotActiveError,
  OfferValidationError,
} from "./errors.js"
import logger from "../../../../logger/logger.js"
import { withTransaction } from "../../../../clients/database/transaction.js"

export async function is_related_to_offer(
  user_id: string,
  session: DBOfferSession,
) {
  if (user_id === session.customer_id) {
    return true
  }

  if (user_id === session.assigned_id) {
    return true
  }

  if (session.contractor_id) {
    return has_permission(session.contractor_id, user_id, "manage_orders")
  }

  return false
}

export async function can_respond_to_offer_helper(
  session: DBOfferSession,
  mostRecent: DBOffer,
  user: User,
) {
  if (session.status !== "active") {
    return false
  }

  const last_action_by_customer = mostRecent.actor_id === session.customer_id
  const is_customer = user.user_id === session.customer_id

  if (session.contractor_id) {
    // If contractor and last action by customer, contractor must respond
    if (last_action_by_customer) {
      if (
        !(await has_permission(
          session.contractor_id,
          user.user_id,
          "manage_orders",
        ))
      ) {
        return false
      }
    } else {
      if (!is_customer) {
        return false
      }
    }
  } else {
    // If assigned and last action by customer, assigned must respond
    if (last_action_by_customer) {
      if (user.user_id !== session.assigned_id) {
        return false
      }
    } else {
      if (!is_customer) {
        return false
      }
    }
  }
  return true
}

export async function convert_offer_search_query(
  req: Request,
): Promise<OfferSearchQueryArguments> {
  const query = req.query as OfferSearchQuery

  const customer = query.customer ? req.users!.get("customer") || null : null
  const assigned = query.assigned ? req.users!.get("assigned") || null : null
  const contractor = query.contractor
    ? req.contractors!.get("contractor")
    : null

  // Parse boolean filters
  const has_market_listings =
    query.has_market_listings !== undefined
      ? query.has_market_listings === "true"
      : undefined
  const has_service =
    query.has_service !== undefined ? query.has_service === "true" : undefined

  // Parse cost range
  const cost_min = query.cost_min ? +query.cost_min : undefined
  const cost_max = query.cost_max ? +query.cost_max : undefined

  return {
    assigned_id: assigned?.user_id || undefined,
    contractor_id: contractor?.contractor_id || undefined,
    customer_id: customer?.user_id || undefined,
    index: +(query.index || 0),
    page_size: +((query.page_size as string) || 5),
    sort_method: (query.sort_method as OfferSearchSortMethod) || "timestamp",
    status: (query.status as OfferSearchStatus) || undefined,
    reverse_sort: query.reverse_sort == "true",
    buyer_username: query.buyer_username,
    seller_username: query.seller_username,
    has_market_listings,
    has_service,
    cost_min: cost_min && !isNaN(cost_min) ? cost_min : undefined,
    cost_max: cost_max && !isNaN(cost_max) ? cost_max : undefined,
    date_from: query.date_from,
    date_to: query.date_to,
  }
}

export async function search_offer_sessions(
  args: OfferSearchQueryArguments,
): Promise<{
  items: DBOfferSession[]
  item_counts: { [k: string]: number }
}> {
  let base = database.knex("offer_sessions").where((qd) => {
    if (args.customer_id) qd = qd.where("customer_id", args.customer_id)
    if (args.assigned_id) qd = qd.where("assigned_id", args.assigned_id)
    if (args.contractor_id) qd = qd.where("contractor_id", args.contractor_id)
    return qd
  })

  const totals: { offer_status: string; count: number }[] = await base
    .clone()
    .groupByRaw("offer_status")
    .select(
      database.knex.raw(
        "get_offer_status(id, customer_id, status) as offer_status",
      ),
      database.knex.raw("COUNT(*) as count"),
    )

  const item_counts = Object.fromEntries(
    totals.map(({ offer_status, count }) => [offer_status, +count]),
  )

  switch (args.sort_method) {
    case "status":
      base = base.orderByRaw(
        `get_offer_status(id, customer_id, status) ${args.reverse_sort ? "DESC" : "ASC"}`,
      )
      break
    case "timestamp":
      base = base.orderBy(args.sort_method, args.reverse_sort ? "desc" : "asc")
      break
    case "title":
      base = base.orderByRaw(
        `(SELECT title FROM order_offers WHERE session_id = offer_sessions.id ORDER BY timestamp DESC LIMIT 1) ${args.reverse_sort ? "DESC" : "ASC"}`,
        [],
      )
      break
    case "customer_name":
      base = base
        .leftJoin(
          "accounts",
          "offer_sessions.customer_id",
          "=",
          "accounts.user_id",
        )
        .orderBy("accounts.username", args.reverse_sort ? "desc" : "asc")
      break
    case "contractor_name":
      base = base
        .leftJoin(
          "accounts",
          "offer_sessions.customer_id",
          "=",
          "accounts.user_id",
        )
        .leftJoin(
          "contractors",
          "orders.contractor_id",
          "=",
          "accounts.user_id",
        )
        .orderByRaw(
          `COALESCE(accounts.username, contractors.name) ${args.reverse_sort ? "desc" : "asc"}`,
        )
      break
  }

  if (args.status) {
    base = base.andWhere((qb) => {
      return qb.whereRaw("get_offer_status(id, customer_id, status) = ?", [
        args.status,
      ])
    })
  }

  const items = await base
    .limit(args.page_size)
    .offset(args.page_size * args.index)
    .select("*")

  return { item_counts, items }
}

// Type for the optimized query result with all joined data
interface OptimizedOfferSessionRow {
  // Offer session fields
  id: string
  customer_id: string
  assigned_id: string | null
  contractor_id: string | null
  status: string
  timestamp: Date

  // Most recent offer fields
  most_recent_offer_id: string
  most_recent_cost: number
  most_recent_title: string
  most_recent_payment_type: string
  most_recent_timestamp: Date
  most_recent_actor_id: string
  most_recent_status: string
  most_recent_service_id: string | null

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

// Optimized version that includes all related data in a single query
export async function search_offer_sessions_optimized(
  args: OfferSearchQueryArguments,
): Promise<{
  items: OptimizedOfferSessionRow[]
  item_counts: { [k: string]: number }
}> {
  // Build filtered sessions query to get matching session IDs
  // Use a subquery to get only the most recent offer per session
  const mostRecentOfferSubquery = database.knex.raw(
    `(
      SELECT DISTINCT ON (session_id) 
        id, session_id, cost, title, payment_type, timestamp, actor_id, status, service_id
      FROM order_offers
      ORDER BY session_id, timestamp DESC
    ) as most_recent_offer`,
  )

  let filteredSessionsQuery = database
    .knex("offer_sessions")
    .leftJoin(mostRecentOfferSubquery, function () {
      this.on(
        "offer_sessions.id",
        "=",
        database.knex.raw("most_recent_offer.session_id"),
      )
    })
    .leftJoin(
      "offer_market_items",
      "most_recent_offer.id",
      "=",
      "offer_market_items.offer_id",
    )
    // Join accounts for buyer username filtering
    .leftJoin(
      "accounts as buyer_account",
      "offer_sessions.customer_id",
      "=",
      "buyer_account.user_id",
    )
    // Join accounts for assigned username filtering (seller)
    .leftJoin(
      "accounts as assigned_account_filter",
      "offer_sessions.assigned_id",
      "=",
      "assigned_account_filter.user_id",
    )
    // Join contractors for spectrum_id filtering (seller)
    .leftJoin(
      "contractors as seller_contractor",
      "offer_sessions.contractor_id",
      "=",
      "seller_contractor.contractor_id",
    )
    .where((qd: Knex.QueryBuilder) => {
      if (args.customer_id)
        qd = qd.where("offer_sessions.customer_id", args.customer_id)
      if (args.assigned_id)
        qd = qd.where("offer_sessions.assigned_id", args.assigned_id)
      if (args.contractor_id)
        qd = qd.where("offer_sessions.contractor_id", args.contractor_id)

      // Buyer username filter (partial match)
      if (args.buyer_username) {
        qd = qd.where(
          "buyer_account.username",
          "ILIKE",
          `%${args.buyer_username}%`,
        )
      }

      // Seller username filter (partial match on spectrum_id or assigned username)
      if (args.seller_username) {
        qd = qd.where((subQd: Knex.QueryBuilder) => {
          subQd = subQd
            .where(
              "seller_contractor.spectrum_id",
              "ILIKE",
              `%${args.seller_username}%`,
            )
            .orWhere(
              "assigned_account_filter.username",
              "ILIKE",
              `%${args.seller_username}%`,
            )
          return subQd
        })
      }

      // Date range filters
      if (args.date_from) {
        qd = qd.where("offer_sessions.timestamp", ">=", args.date_from)
      }
      if (args.date_to) {
        qd = qd.where("offer_sessions.timestamp", "<=", args.date_to)
      }

      // Service filter
      if (args.has_service !== undefined) {
        if (args.has_service) {
          qd = qd.whereNotNull("most_recent_offer.service_id")
        } else {
          qd = qd.whereNull("most_recent_offer.service_id")
        }
      }

      // Cost range filters
      if (args.cost_min !== undefined) {
        qd = qd.where("most_recent_offer.cost", ">=", args.cost_min.toString())
      }
      if (args.cost_max !== undefined) {
        qd = qd.where("most_recent_offer.cost", "<=", args.cost_max.toString())
      }

      return qd
    })
    .groupBy(
      "offer_sessions.id",
      "offer_sessions.customer_id",
      "offer_sessions.status",
    )

  // Apply market listings filter (must be after GROUP BY for HAVING)
  if (args.has_market_listings !== undefined) {
    if (args.has_market_listings) {
      filteredSessionsQuery = filteredSessionsQuery.havingRaw(
        "COUNT(offer_market_items.offer_id) > 0",
      )
    } else {
      filteredSessionsQuery = filteredSessionsQuery.havingRaw(
        "COUNT(offer_market_items.offer_id) = 0",
      )
    }
  }

  // Get filtered sessions
  const filteredSessions = await filteredSessionsQuery.select(
    "offer_sessions.id",
    "offer_sessions.customer_id",
    "offer_sessions.status",
  )

  // Calculate totals from filtered sessions
  let item_counts: { [k: string]: number }
  if (filteredSessions.length === 0) {
    item_counts = {
      "to-seller": 0,
      "to-customer": 0,
      accepted: 0,
      rejected: 0,
    }
  } else {
    const filteredIds = filteredSessions.map((s: any) => s.id)
    const totals: { offer_status: string; count: number }[] = await database
      .knex("offer_sessions")
      .whereIn("id", filteredIds)
      .groupByRaw("get_offer_status(id, customer_id, status)")
      .select(
        database.knex.raw(
          "get_offer_status(id, customer_id, status) as offer_status",
        ),
        database.knex.raw("COUNT(*) as count"),
      )

    item_counts = Object.fromEntries(
      totals.map(({ offer_status, count }) => [offer_status, +count]),
    ) as { [k: string]: number }
  }

  // Build optimized query with JOINs to get all related data
  // Only query sessions that passed the filters
  const filteredIds =
    filteredSessions.length > 0
      ? filteredSessions.map((s: { id: string }) => s.id)
      : []

  // Use a subquery to get only the most recent offer per session
  const mostRecentOfferSubqueryOptimized = database.knex.raw(
    `(
      SELECT DISTINCT ON (session_id) 
        id, session_id, cost, title, payment_type, timestamp, actor_id, status, service_id
      FROM order_offers
      ORDER BY session_id, timestamp DESC
    ) as most_recent_offer`,
  )

  let optimizedQuery = database
    .knex("offer_sessions")
    .leftJoin(mostRecentOfferSubqueryOptimized, function () {
      this.on(
        "offer_sessions.id",
        "=",
        database.knex.raw("most_recent_offer.session_id"),
      )
    })
    .leftJoin(
      "offer_market_items",
      "most_recent_offer.id",
      "=",
      "offer_market_items.offer_id",
    )
    .leftJoin(
      "services",
      "most_recent_offer.service_id",
      "=",
      "services.service_id",
    )
    .leftJoin(
      "accounts as customer_account",
      "offer_sessions.customer_id",
      "=",
      "customer_account.user_id",
    )
    .leftJoin(
      "accounts as assigned_account",
      "offer_sessions.assigned_id",
      "=",
      "assigned_account.user_id",
    )
    .leftJoin(
      "contractors",
      "offer_sessions.contractor_id",
      "=",
      "contractors.contractor_id",
    )
    .where((qd: Knex.QueryBuilder) => {
      // Only include filtered session IDs
      if (filteredIds.length > 0) {
        qd = qd.whereIn("offer_sessions.id", filteredIds)
      } else {
        // If no filtered sessions, return empty result
        qd = qd.whereRaw("1 = 0")
      }
      return qd
    })

  // Apply service filter
  if (args.has_service !== undefined) {
    if (args.has_service) {
      // Has service - service_id must not be null
      optimizedQuery = optimizedQuery.whereNotNull(
        "most_recent_offer.service_id",
      )
    } else {
      // No service - service_id must be null
      optimizedQuery = optimizedQuery.whereNull("most_recent_offer.service_id")
    }
  }

  // Apply cost range filter
  if (args.cost_min !== undefined) {
    optimizedQuery = optimizedQuery.where(
      "most_recent_offer.cost",
      ">=",
      args.cost_min.toString(),
    )
  }
  if (args.cost_max !== undefined) {
    optimizedQuery = optimizedQuery.where(
      "most_recent_offer.cost",
      "<=",
      args.cost_max.toString(),
    )
  }

  // Apply sorting
  switch (args.sort_method) {
    case "status":
      optimizedQuery = optimizedQuery.orderByRaw(
        `get_offer_status(offer_sessions.id, offer_sessions.customer_id, offer_sessions.status) ${args.reverse_sort ? "DESC" : "ASC"}`,
      )
      break
    case "timestamp":
      optimizedQuery = optimizedQuery.orderBy(
        "offer_sessions.timestamp",
        args.reverse_sort ? "desc" : "asc",
      )
      break
    case "title":
      optimizedQuery = optimizedQuery.orderBy(
        "most_recent_offer.title",
        args.reverse_sort ? "desc" : "asc",
      )
      break
    case "customer_name":
      optimizedQuery = optimizedQuery.orderBy(
        "customer_account.username",
        args.reverse_sort ? "desc" : "asc",
      )
      break
    case "contractor_name":
      optimizedQuery = optimizedQuery.orderByRaw(
        `COALESCE(customer_account.username, contractors.name) ${args.reverse_sort ? "desc" : "asc"}`,
      )
      break
  }

  // Apply status filter
  if (args.status) {
    optimizedQuery = optimizedQuery.andWhere((qb: Knex.QueryBuilder) => {
      return qb.whereRaw(
        "get_offer_status(offer_sessions.id, offer_sessions.customer_id, offer_sessions.status) = ?",
        [args.status],
      )
    })
  }

  // Execute query with all related data
  const items = await optimizedQuery
    .limit(args.page_size)
    .offset(args.page_size * args.index)
    .select(
      "offer_sessions.*",
      "most_recent_offer.id as most_recent_offer_id",
      "most_recent_offer.cost as most_recent_cost",
      "most_recent_offer.title as most_recent_title",
      "most_recent_offer.payment_type as most_recent_payment_type",
      "most_recent_offer.timestamp as most_recent_timestamp",
      "most_recent_offer.actor_id as most_recent_actor_id",
      "most_recent_offer.status as most_recent_status",
      "most_recent_offer.service_id as most_recent_service_id",
      database.knex.raw("COUNT(offer_market_items.offer_id) as item_count"),
      "services.title as service_title",
      "customer_account.username as customer_username",
      "customer_account.avatar as customer_avatar",
      "customer_account.display_name as customer_display_name",
      "assigned_account.username as assigned_username",
      "assigned_account.avatar as assigned_avatar",
      "assigned_account.display_name as assigned_display_name",
      "contractors.spectrum_id as contractor_spectrum_id",
      "contractors.name as contractor_name",
      "contractors.avatar as contractor_avatar",
    )
    .groupBy(
      "offer_sessions.id",
      "most_recent_offer.id",
      "most_recent_offer.cost",
      "most_recent_offer.title",
      "most_recent_offer.payment_type",
      "most_recent_offer.timestamp",
      "most_recent_offer.actor_id",
      "most_recent_offer.status",
      "most_recent_offer.service_id",
      "services.service_id",
      "customer_account.user_id",
      "assigned_account.user_id",
      "contractors.contractor_id",
    )

  // Apply market listings filter (must be after GROUP BY for HAVING)
  if (args.has_market_listings !== undefined) {
    if (args.has_market_listings) {
      // Has market listings - must have at least one
      optimizedQuery = optimizedQuery.havingRaw(
        "COUNT(offer_market_items.offer_id) > 0",
      )
    } else {
      // No market listings - must have zero
      optimizedQuery = optimizedQuery.havingRaw(
        "COUNT(offer_market_items.offer_id) = 0",
      )
    }
  }

  return { item_counts, items }
}

export async function mergeOfferSessions(
  offer_session_ids: string[],
  customer_id: string,
  customer_username: string,
): Promise<{
  merged_session: DBOfferSession
  merged_offer: DBOffer
  source_session_ids: string[]
}> {
  // Get all offer sessions (validation - can be outside transaction)
  const sessions = await Promise.all(
    offer_session_ids.map((id) =>
      offerDb.getOfferSessions({ id }).then((s) => s[0]),
    ),
  )

  // Also query timestamps as raw strings to avoid timezone conversion issues
  // Use PostgreSQL's to_char to get the timestamp as a string in the exact format it's stored
  const sessionTimestamps = sessions.map((s) => s.timestamp)

  // Validate all sessions exist
  if (sessions.some((s) => !s)) {
    throw new OfferNotFoundError("One or more offer sessions not found")
  }

  // Validate all sessions belong to the same customer
  if (sessions.some((s) => s!.customer_id !== customer_id)) {
    throw new OfferValidationError(
      "All offer sessions must belong to the same customer",
      "DIFFERENT_CUSTOMER",
    )
  }

  // Validate all sessions are active
  if (sessions.some((s) => s!.status !== "active")) {
    throw new OfferNotActiveError("All offer sessions must be active")
  }

  // Get most recent offer from each session
  const mostRecentOffers = await Promise.all(
    sessions.map((s) => offerDb.getMostRecentOrderOffer(s!.id)),
  )

  // Validate all offers exist
  if (mostRecentOffers.some((o) => !o)) {
    throw new OfferNotFoundError("One or more offers not found")
  }

  // Validate no offers are already accepted or rejected (only pending offers can be merged)
  if (
    mostRecentOffers.some(
      (o) => o!.status === "accepted" || o!.status === "rejected",
    )
  ) {
    throw new OfferNotActiveError(
      "Cannot merge offers that are already accepted or rejected. Only pending offers can be merged.",
    )
  }

  // Validate no offers have service_id
  if (mostRecentOffers.some((o) => o!.service_id)) {
    throw new OfferValidationError(
      "Offers with services cannot be merged",
      "HAS_SERVICES",
    )
  }

  // Validate all sessions have same contractor_id
  const contractor_id = sessions[0]!.contractor_id
  if (sessions.some((s) => s!.contractor_id !== contractor_id)) {
    throw new OfferValidationError(
      "All offer sessions must have the same contractor",
      "DIFFERENT_CONTRACTOR",
    )
  }

  // Validate all sessions have same assigned_id if contractor_id is null
  if (!contractor_id) {
    const assigned_id = sessions[0]!.assigned_id
    if (sessions.some((s) => s!.assigned_id !== assigned_id)) {
      throw new OfferValidationError(
        "All offer sessions must have the same assigned user when no contractor is set",
        "DIFFERENT_ASSIGNED",
      )
    }
  }

  // Validate all offers have same payment_type
  const payment_type = mostRecentOffers[0]!.payment_type
  if (mostRecentOffers.some((o) => o!.payment_type !== payment_type)) {
    throw new OfferValidationError(
      "All offers must have the same payment type",
      "DIFFERENT_PAYMENT_TYPE",
    )
  }

  // Find the minimum session timestamp (oldest session)
  // Compare raw timestamp strings to avoid any Date/timezone conversion issues
  // PostgreSQL 'timestamp without time zone' values are compared as strings
  const oldestSessionTimestamp = sessionTimestamps.reduce((min, ts) => {
    if (!ts) return min
    // Compare as strings - PostgreSQL timestamps without time zone compare correctly as strings
    return ts < min ? ts : min
  }, sessionTimestamps[0]!)

  logger.debug("Session timestamps", { sessionTimestamps })
  logger.debug("Oldest session timestamp", { oldestSessionTimestamp })

  // Combine costs and collaterals
  const totalCost = mostRecentOffers.reduce(
    (sum, o) => sum + Number(o!.cost),
    0,
  )
  const totalCollateral = mostRecentOffers.reduce(
    (sum, o) => sum + Number(o!.collateral || 0),
    0,
  )

  // Build merged description with links to source sessions
  const descriptionParts = mostRecentOffers.map((offer, index) => {
    const session = sessions[index]!
    const sessionLink = `/offer/${session.id}` // Frontend URL format
    return `${offer!.description}\n\n[View original offer session](${sessionLink})`
  })
  const mergedDescription = descriptionParts.join("\n\n---\n\n")

  // Get all market listings from source offers
  const allMarketListings: {
    listing_id: string
    quantity: number
  }[] = []
  for (const offer of mostRecentOffers) {
    const listings = await marketDb.getOfferMarketListings(offer!.id)
    for (const listing of listings) {
      const existing = allMarketListings.find(
        (l) => l.listing_id === listing.listing_id,
      )
      if (existing) {
        existing.quantity += listing.quantity
      } else {
        allMarketListings.push({
          listing_id: listing.listing_id,
          quantity: listing.quantity,
        })
      }
    }
  }

  // Create new merged offer using existing createOffer helper
  // This handles session creation, offer creation, chat creation, notifications, Discord threads
  // Use the oldest offer's timestamp for the merged offer and oldest session timestamp for the merged session
  const { session: merged_session, offer: merged_offer } = await createOffer(
    {
      customer_id: customer_id,
      contractor_id: contractor_id,
      assigned_id: contractor_id ? null : sessions[0]!.assigned_id,
      status: "active",
      timestamp: oldestSessionTimestamp.toUTCString(),
    },
    {
      actor_id: customer_id,
      kind: mostRecentOffers[0]!.kind,
      cost: totalCost.toString(),
      title: `Merged order from ${customer_username}`,
      description: mergedDescription,
      collateral: totalCollateral.toString(),
      payment_type: payment_type,
      service_id: undefined,
      timestamp: oldestSessionTimestamp.toUTCString(),
    },
    [], // Market listings will be added separately since we only have listing_ids
  )

  // Link all market listings to merged offer
  for (const listing of allMarketListings) {
    await marketDb.insertOfferMarketListing({
      listing_id: listing.listing_id,
      offer_id: merged_offer.id,
      quantity: listing.quantity,
    })
  }

  // Close all source offer sessions and mark their offers as rejected
  // Wrap in transaction to ensure atomicity
  await withTransaction(async (trx) => {
    // Update session status to closed
    await trx<DBOfferSession>("offer_sessions")
      .whereIn(
        "id",
        sessions.map((s) => s!.id),
      )
      .update({ status: "closed" })

    // Update all order_offers to rejected status
    const offerIds = mostRecentOffers.map((o) => o!.id)
    await trx("order_offers")
      .whereIn("id", offerIds)
      .update({ status: "rejected" })
  })

  return {
    merged_session,
    merged_offer,
    source_session_ids: offer_session_ids,
  }
}
