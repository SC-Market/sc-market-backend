import {
  DBOffer,
  DBOfferSession,
} from "../../../../clients/database/db-models.js"
import { has_permission } from "../util/permissions.js"
import { User } from "../api-models.js"
import { Request } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import {
  OfferSearchQuery,
  OfferSearchQueryArguments,
  OfferSearchSortMethod,
  OfferSearchStatus,
} from "./types.js"

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

  const customer = query.customer ? req.users!.get("customer") : null
  const assigned = query.assigned ? req.users!.get("assigned") : null
  const contractor = query.contractor
    ? req.contractors!.get("contractor")
    : null

  return {
    assigned_id: assigned?.user_id || undefined,
    contractor_id: contractor?.contractor_id || undefined,
    customer_id: customer?.user_id || undefined,
    index: +(query.index || 0),
    page_size: +((query.page_size as string) || 5),
    sort_method: (query.sort_method as OfferSearchSortMethod) || "timestamp",
    status: (query.status as OfferSearchStatus) || undefined,
    reverse_sort: query.reverse_sort == "true",
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
  let base = database.knex("offer_sessions").where((qd) => {
    if (args.customer_id) qd = qd.where("customer_id", args.customer_id)
    if (args.assigned_id) qd = qd.where("assigned_id", args.assigned_id)
    if (args.contractor_id) qd = qd.where("contractor_id", args.contractor_id)
    return qd
  })

  // Get totals (same as before)
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

  // Build optimized query with JOINs to get all related data
  let optimizedQuery = database
    .knex("offer_sessions")
    .leftJoin(
      "order_offers as most_recent_offer",
      "offer_sessions.id",
      "=",
      "most_recent_offer.session_id",
    )
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
    .where((qd) => {
      if (args.customer_id)
        qd = qd.where("offer_sessions.customer_id", args.customer_id)
      if (args.assigned_id)
        qd = qd.where("offer_sessions.assigned_id", args.assigned_id)
      if (args.contractor_id)
        qd = qd.where("offer_sessions.contractor_id", args.contractor_id)
      return qd
    })

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
    optimizedQuery = optimizedQuery.andWhere((qb) => {
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
      "services.service_id",
      "customer_account.user_id",
      "assigned_account.user_id",
      "contractors.contractor_id",
    )

  return { item_counts, items }
}
