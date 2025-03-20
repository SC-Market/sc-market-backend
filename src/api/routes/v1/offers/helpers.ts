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
