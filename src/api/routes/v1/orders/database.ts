/**
 * Order-related database operations.
 * This module contains all database queries specific to orders,
 * order reviews, order comments, and related functionality.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  DBOrder,
  DBOrderComment,
  DBOrderApplicant,
  DBReview,
  DBOrderSetting,
  OrderApplicantResponse,
  DBBuyOrder,
} from "../../../../clients/database/db-models.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get order count by where clause.
 */
export async function getOrderCount(where: Partial<DBOrder>): Promise<number> {
  return +(await knex()<{ count: number }>("orders").where(where).count())[0]
    .count
}

/**
 * Get orders by where clause.
 */
export async function getOrders(where: any): Promise<DBOrder[]> {
  return knex()<DBOrder>("orders").where(where).select()
}

/**
 * Get a single order by where clause.
 * @throws Error if order not found
 */
export async function getOrder(where: any): Promise<DBOrder> {
  const order = await knex()<DBOrder>("orders").where(where).first()

  if (!order) {
    throw new Error("Invalid order!")
  }

  return order
}

/**
 * Create a new order.
 */
export async function createOrder(
  data: Partial<DBOrder>,
  trx?: any,
): Promise<DBOrder[]> {
  if (trx) {
    return trx("orders").insert(data).returning("*")
  }
  return knex()<DBOrder>("orders").insert(data).returning("*")
}

/**
 * Update an order.
 */
export async function updateOrder(
  order_id: string,
  data: Partial<DBOrder>,
): Promise<DBOrder[]> {
  return knex()<DBOrder>("orders")
    .where({ order_id })
    .update(data)
    .returning("*")
}

/**
 * Get order comments by where clause.
 */
export async function getOrderComments(where: any): Promise<DBOrderComment[]> {
  return knex()<DBOrderComment>("order_comments").where(where).select()
}

/**
 * Create an order comment.
 */
export async function createOrderComment(
  data: Partial<DBOrderComment>,
): Promise<DBOrderComment[]> {
  return knex()<DBOrderComment>("order_comments").insert(data).returning("*")
}

/**
 * Get order reviews by where clause.
 */
export async function getOrderReviews(where: any): Promise<DBReview[]> {
  return knex()<DBReview>("order_reviews").where(where).select()
}

/**
 * Get a single order review by where clause.
 */
export async function getOrderReview(
  where: Partial<DBReview>,
): Promise<DBReview | null> {
  const review = await knex()<DBReview>("order_reviews").where(where).first()
  return review || null
}

/**
 * Create an order review.
 */
export async function createOrderReview(
  data: Partial<DBReview>,
): Promise<DBReview[]> {
  return knex()<DBReview>("order_reviews").insert(data).returning("*")
}

/**
 * Update an order review.
 */
export async function updateOrderReview(
  review_id: string,
  updates: Partial<DBReview>,
): Promise<DBReview> {
  const [review] = await knex()<DBReview>("order_reviews")
    .where({ review_id })
    .update({
      ...updates,
      last_modified_at: new Date(),
    })
    .returning("*")

  return review
}

/**
 * Get order applicants by where clause.
 */
export async function getOrderApplicants(
  where: any,
): Promise<DBOrderApplicant[]> {
  return knex()<DBOrderApplicant>("order_applicants").where(where).select()
}

/**
 * Create an order application.
 */
export async function createOrderApplication(
  data: Partial<DBOrderApplicant>,
): Promise<void> {
  await knex()<DBOrderApplicant>("order_applicants").insert(data)
}

/**
 * Clear order applications (delete all applicants for an order).
 */
export async function clearOrderApplications(order_id: string): Promise<void> {
  await knex()<DBOrderApplicant>("order_applicants")
    .where({ order_id })
    .delete()
}

/**
 * Get related orders for a user (customer or assigned).
 */
export async function getRelatedOrders(c: string): Promise<DBOrder[]> {
  return knex()<DBOrder>("orders")
    .where({ customer_id: c })
    .orWhere({ assigned_id: c })
    .select()
}

/**
 * Get related active orders for a user.
 */
export async function getRelatedActiveOrders(c: string): Promise<DBOrder[]> {
  return knex()<DBOrder>("orders")
    .where("status", "!=", "fulfilled")
    .andWhere("status", "!=", "cancelled")
    .andWhere((qb) => qb.where({ customer_id: c }).orWhere({ assigned_id: c }))
    .orderBy("timestamp", "desc")
    .select()
}

/**
 * Get order applicants with public IDs (includes user/contractor details).
 */
export async function getOrderApplicantsPublicIds(
  where: any,
): Promise<OrderApplicantResponse[]> {
  const apps = await getOrderApplicants(where)
  return await Promise.all(
    apps.map(async (applicant) => ({
      ...applicant,
      user_applicant_id: undefined,
      org_applicant_id: undefined,
      user_applicant: applicant.user_applicant_id
        ? await profileDb.getMinimalUser({
            user_id: applicant.user_applicant_id,
          })
        : null,
      org_applicant: applicant.org_applicant_id
        ? await contractorDb.getMinimalContractor({
            contractor_id: applicant.org_applicant_id,
          })
        : null,
    })),
  )
}

/**
 * Get order review with revision status.
 */
export async function getOrderReviewWithRevisionStatus(
  review_id: string,
): Promise<(DBReview & { can_edit: boolean }) | null> {
  const review = await getOrderReview({ review_id })
  if (!review) return null

  // This method will be enhanced with permission logic in the controller
  // For now, we'll return a placeholder that will be updated based on user context
  return {
    ...review,
    can_edit: false, // Placeholder - will be determined by controller based on user permissions
  }
}

/**
 * Get order statistics.
 */
export async function getOrderStats() {
  const order_stats = await knex()<{
    total_orders: number
    total_order_value: number
    fulfilled_orders: number
    fulfilled_order_value: number
    cancelled_orders: number
    cancelled_order_value: number
  }>("order_stats").first()

  const order_week_stats = await knex()<{
    week_orders: number
    week_order_value: number
  }>("order_week_stats").first()

  return {
    ...order_stats,
    ...order_week_stats,
  }
}

/**
 * Get order analytics with optional time range.
 */
export async function getOrderAnalytics(options?: {
  startTime?: number
  endTime?: number
}) {
  // Build time filter query builder
  const buildTimeFilter = (query: any) => {
    if (options?.startTime && options?.endTime) {
      return query
        .where("timestamp", ">=", new Date(options.startTime * 1000))
        .where("timestamp", "<=", new Date(options.endTime * 1000))
    } else if (options?.startTime) {
      return query.where("timestamp", ">=", new Date(options.startTime * 1000))
    } else if (options?.endTime) {
      return query.where("timestamp", "<=", new Date(options.endTime * 1000))
    }
    return query
  }

  // Get daily totals
  // If no time range provided, default to last 30 days for backward compatibility
  let dailyQuery = knex()("orders")
    .select(
      knex().raw("DATE(timestamp) as date"),
      knex().raw("COUNT(*) as total"),
      knex().raw(
        "COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as fulfilled",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'not-started' THEN 1 END) as not_started",
      ),
    )
    .groupBy(knex().raw("DATE(timestamp)"))
    .orderBy("date", "asc")

  if (!options?.startTime && !options?.endTime) {
    dailyQuery = dailyQuery.where(
      "timestamp",
      ">=",
      knex().raw("NOW() - INTERVAL '30 days'"),
    )
  } else {
    dailyQuery = buildTimeFilter(dailyQuery)
  }
  const dailyTotals = await dailyQuery

  // Get weekly totals
  // If no time range provided, default to last 12 weeks for backward compatibility
  let weeklyQuery = knex()("orders")
    .select(
      knex().raw("DATE_TRUNC('week', timestamp) as date"),
      knex().raw("COUNT(*) as total"),
      knex().raw(
        "COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as fulfilled",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'not-started' THEN 1 END) as not_started",
      ),
    )
    .groupBy(knex().raw("DATE_TRUNC('week', timestamp)"))
    .orderBy("date", "asc")

  if (!options?.startTime && !options?.endTime) {
    weeklyQuery = weeklyQuery.where(
      "timestamp",
      ">=",
      knex().raw("NOW() - INTERVAL '12 weeks'"),
    )
  } else {
    weeklyQuery = buildTimeFilter(weeklyQuery)
  }
  const weeklyTotals = await weeklyQuery

  // Get monthly totals
  // If no time range provided, default to last 12 months for backward compatibility
  let monthlyQuery = knex()("orders")
    .select(
      knex().raw("DATE_TRUNC('month', timestamp) as date"),
      knex().raw("COUNT(*) as total"),
      knex().raw(
        "COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as fulfilled",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'not-started' THEN 1 END) as not_started",
      ),
      knex().raw(
        "COALESCE(AVG(CASE WHEN status = 'fulfilled' THEN cost END), 0) as average_fulfilled_value",
      ),
    )
    .groupBy(knex().raw("DATE_TRUNC('month', timestamp)"))
    .orderBy("date", "asc")

  if (!options?.startTime && !options?.endTime) {
    monthlyQuery = monthlyQuery.where(
      "timestamp",
      ">=",
      knex().raw("NOW() - INTERVAL '12 months'"),
    )
  } else {
    monthlyQuery = buildTimeFilter(monthlyQuery)
  }
  const monthlyTotals = await monthlyQuery

  // Get top contractors by fulfilled orders
  const topContractors = await knex()("orders as o")
    .join("contractors as c", "o.contractor_id", "c.contractor_id")
    .whereNotNull("o.contractor_id")
    .select(
      "c.name",
      knex().raw(
        "COUNT(CASE WHEN o.status = 'fulfilled' THEN 1 END) as fulfilled_orders",
      ),
      knex().raw("COUNT(*) as total_orders"),
    )
    .groupBy("c.contractor_id", "c.name")
    .orderBy("fulfilled_orders", "desc")
    .orderBy("total_orders", "desc")
    .limit(10)

  // Get top users by fulfilled orders
  const topUsers = await knex()("orders as o")
    .join("accounts as a", "o.customer_id", "a.user_id")
    .select(
      "a.username",
      knex().raw(
        "COUNT(CASE WHEN o.status = 'fulfilled' THEN 1 END) as fulfilled_orders",
      ),
      knex().raw("COUNT(*) as total_orders"),
    )
    .groupBy("a.user_id", "a.username")
    .orderBy("fulfilled_orders", "desc")
    .orderBy("total_orders", "desc")
    .limit(10)

  // Get summary stats
  const summary = await knex()("orders")
    .select(
      knex().raw("COUNT(*) as total_orders"),
      knex().raw(
        "COUNT(CASE WHEN status IN ('in-progress', 'not-started') THEN 1 END) as active_orders",
      ),
      knex().raw(
        "COUNT(CASE WHEN status = 'fulfilled' THEN 1 END) as completed_orders",
      ),
      knex().raw(
        "COALESCE(SUM(CASE WHEN status = 'fulfilled' THEN cost ELSE 0 END), 0) as total_value",
      ),
    )
    .first()

  return {
    daily_totals: dailyTotals.map((row: any) => ({
      date: row.date.toISOString().split("T")[0],
      total: parseInt(row.total),
      in_progress: parseInt(row.in_progress),
      fulfilled: parseInt(row.fulfilled),
      cancelled: parseInt(row.cancelled),
      not_started: parseInt(row.not_started),
    })),
    weekly_totals: weeklyTotals.map((row: any) => ({
      date: row.date.toISOString().split("T")[0],
      total: parseInt(row.total),
      in_progress: parseInt(row.in_progress),
      fulfilled: parseInt(row.fulfilled),
      cancelled: parseInt(row.cancelled),
      not_started: parseInt(row.not_started),
    })),
    monthly_totals: monthlyTotals.map((row: any) => ({
      date: row.date.toISOString().split("T")[0],
      total: parseInt(row.total),
      in_progress: parseInt(row.in_progress),
      fulfilled: parseInt(row.fulfilled),
      cancelled: parseInt(row.cancelled),
      not_started: parseInt(row.not_started),
      average_fulfilled_value: parseFloat(row.average_fulfilled_value) || 0,
    })),
    top_contractors: topContractors.map((row: any) => ({
      name: row.name,
      fulfilled_orders: parseInt(row.fulfilled_orders),
      total_orders: parseInt(row.total_orders),
    })),
    top_users: topUsers.map((row: any) => ({
      username: row.username,
      fulfilled_orders: parseInt(row.fulfilled_orders),
      total_orders: parseInt(row.total_orders),
    })),
    summary: {
      total_orders: parseInt(summary.total_orders),
      active_orders: parseInt(summary.active_orders),
      completed_orders: parseInt(summary.completed_orders),
      total_value: parseInt(summary.total_value),
    },
  }
}

/**
 * Get order settings for an entity (user or contractor).
 */
export async function getOrderSettings(
  entityType: "user" | "contractor",
  entityId: string,
): Promise<DBOrderSetting[]> {
  return knex()<DBOrderSetting>("order_settings")
    .where({ entity_type: entityType, entity_id: entityId })
    .orderBy("setting_type", "asc")
}

/**
 * Get a specific order setting.
 */
export async function getOrderSetting(
  entityType: "user" | "contractor",
  entityId: string,
  settingType:
    | "offer_message"
    | "order_message"
    | "require_availability"
    | "stock_subtraction_timing"
    | "min_order_size"
    | "max_order_size"
    | "min_order_value"
    | "max_order_value"
    | "allocation_mode",
): Promise<DBOrderSetting | null> {
  const setting = await knex()<DBOrderSetting>("order_settings")
    .where({
      entity_type: entityType,
      entity_id: entityId,
      setting_type: settingType,
    })
    .first()
  return setting || null
}

/**
 * Create an order setting.
 */
export async function createOrderSetting(
  setting: Omit<DBOrderSetting, "id" | "created_at" | "updated_at">,
): Promise<DBOrderSetting> {
  const [created] = await knex()<DBOrderSetting>("order_settings")
    .insert({
      ...setting,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning("*")

  return created
}

/**
 * Update an order setting.
 */
export async function updateOrderSetting(
  id: string,
  updates: Partial<Pick<DBOrderSetting, "message_content" | "enabled">>,
): Promise<DBOrderSetting> {
  const [updated] = await knex()<DBOrderSetting>("order_settings")
    .where({ id })
    .update({
      ...updates,
      updated_at: new Date(),
    })
    .returning("*")

  return updated
}

/**
 * Delete an order setting.
 */
export async function deleteOrderSetting(id: string): Promise<void> {
  await knex()("order_settings").where({ id }).del()
}

/**
 * Create a buy order.
 */
export async function createBuyOrder(data: any): Promise<DBBuyOrder[]> {
  return knex()<DBBuyOrder>("market_buy_orders").insert(data).returning("*")
}

/**
 * Request a review revision.
 */
export async function requestReviewRevision(
  review_id: string,
  requester_id: string,
  message?: string,
): Promise<DBReview> {
  const now = new Date()
  const [review] = await knex()<DBReview>("order_reviews")
    .where({ review_id })
    .update({
      revision_requested: true,
      revision_requested_at: now,
      revision_message: message || null,
    })
    .returning("*")

  return review
}

/**
 * Get all thread IDs from orders.
 */
/**
 * Track order assignment for response time tracking.
 */
export async function trackOrderAssignment(
  order_id: string,
  assigned_user_id?: string,
  assigned_contractor_id?: string,
): Promise<void> {
  if (!assigned_user_id && !assigned_contractor_id) {
    throw new Error(
      "Either assigned_user_id or assigned_contractor_id must be provided",
    )
  }

  await knex()("order_response_times").insert({
    order_id,
    assigned_user_id: assigned_user_id || null,
    assigned_contractor_id: assigned_contractor_id || null,
    assigned_at: new Date(),
    is_responded: false,
  })
}

/**
 * Track order response for response time tracking.
 */
export async function trackOrderResponse(
  order_id: string,
  assigned_user_id?: string,
  assigned_contractor_id?: string,
): Promise<void> {
  if (!assigned_user_id && !assigned_contractor_id) {
    throw new Error(
      "Either assigned_user_id or assigned_contractor_id must be provided",
    )
  }

  const whereClause: any = { order_id }
  if (assigned_user_id) {
    whereClause.assigned_user_id = assigned_user_id
  }
  if (assigned_contractor_id) {
    whereClause.assigned_contractor_id = assigned_contractor_id
  }

  const assignment = await knex()("order_response_times")
    .where(whereClause)
    .first()

  if (assignment && !assignment.is_responded) {
    const responseTimeMinutes = Math.floor(
      (new Date().getTime() - new Date(assignment.assigned_at).getTime()) /
        (1000 * 60),
    )

    await knex()("order_response_times").where(whereClause).update({
      responded_at: new Date(),
      response_time_minutes: responseTimeMinutes,
      is_responded: true,
    })
  }
}

export async function getAllThreads(): Promise<{ thread_id: number }[]> {
  return knex()<{ thread_id: number }>("orders")
    .where("thread_id", "IS NOT", null)
    .select("thread_id")
}

/**
 * Get availability requirement for seller.
 */
export async function getAvailabilityRequirement(
  contractor_id: string | null,
  user_id: string | null,
): Promise<boolean> {
  // Check contractor setting first (higher priority)
  if (contractor_id) {
    const contractorSetting = await getOrderSetting(
      "contractor",
      contractor_id,
      "require_availability",
    )
    if (contractorSetting && contractorSetting.enabled) {
      return true
    }
  }

  // Check user setting if no contractor setting found
  if (user_id) {
    const userSetting = await getOrderSetting(
      "user",
      user_id,
      "require_availability",
    )
    if (userSetting && userSetting.enabled) {
      return true
    }
  }

  return false
}

/**
 * Check if user has availability set.
 */
export async function hasAvailabilitySet(
  user_id: string,
  seller_contractor_id: string | null,
): Promise<boolean> {
  const availability = await profileDb.getUserAvailability(
    user_id,
    seller_contractor_id,
  )
  return availability.length > 0
}
