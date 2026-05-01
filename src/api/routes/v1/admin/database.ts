/**
 * Admin-related database operations.
 * This module contains all database queries specific to admin analytics,
 * activity tracking, and related functionality.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  DBAdminAlert,
  DBContentReport,
} from "../../../../clients/database/db-models.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get daily activity.
 */
export async function getDailyActivity(options?: {
  startTime?: number
  endTime?: number
}) {
  let query = knex()<{ date: Date; count: number }>("daily_activity")

  if (options?.startTime) {
    query = query.where("date", ">=", new Date(options.startTime * 1000))
  }
  if (options?.endTime) {
    query = query.where("date", "<=", new Date(options.endTime * 1000))
  }

  return query.orderBy("date", "ASC").select()
}

/**
 * Get weekly activity.
 */
export async function getWeeklyActivity(options?: {
  startTime?: number
  endTime?: number
}) {
  let query = knex()<{ date: Date; count: number }>("weekly_activity")

  if (options?.startTime) {
    query = query.where("date", ">=", new Date(options.startTime * 1000))
  }
  if (options?.endTime) {
    query = query.where("date", "<=", new Date(options.endTime * 1000))
  }

  return query.orderBy("date", "ASC").select()
}

/**
 * Get monthly activity.
 */
export async function getMonthlyActivity(options?: {
  startTime?: number
  endTime?: number
}) {
  let query = knex()<{ date: Date; count: number }>("monthly_activity")

  if (options?.startTime) {
    query = query.where("date", ">=", new Date(options.startTime * 1000))
  }
  if (options?.endTime) {
    query = query.where("date", "<=", new Date(options.endTime * 1000))
  }

  return query.orderBy("date", "ASC").select()
}

/**
 * Get membership analytics.
 */
export async function getMembershipAnalytics(options?: {
  startTime?: number
  endTime?: number
}) {
  // Build time filter query builder
  const buildTimeFilter = (query: any) => {
    if (options?.startTime && options?.endTime) {
      return query
        .where("created_at", ">=", new Date(options.startTime * 1000))
        .where("created_at", "<=", new Date(options.endTime * 1000))
    } else if (options?.startTime) {
      return query.where("created_at", ">=", new Date(options.startTime * 1000))
    } else if (options?.endTime) {
      return query.where("created_at", "<=", new Date(options.endTime * 1000))
    }
    return query
  }

  // Get daily new members
  // If no time range provided, default to last 30 days for backward compatibility
  let dailyQuery = knex()("accounts")
    .select(
      knex().raw("DATE(created_at) as date"),
      knex().raw("COUNT(*) as new_members"),
      knex().raw(
        "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as new_members_rsi_verified",
      ),
      knex().raw(
        "COUNT(CASE WHEN rsi_confirmed = false THEN 1 END) as new_members_rsi_unverified",
      ),
      knex().raw(
        "SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) as cumulative_members",
      ),
      knex().raw(
        "SUM(COUNT(CASE WHEN rsi_confirmed = true THEN 1 END)) OVER (ORDER BY DATE(created_at)) as cumulative_members_rsi_verified",
      ),
      knex().raw(
        "SUM(COUNT(CASE WHEN rsi_confirmed = false THEN 1 END)) OVER (ORDER BY DATE(created_at)) as cumulative_members_rsi_unverified",
      ),
    )
    .groupBy(knex().raw("DATE(created_at)"))
    .orderBy("date", "asc")

  if (!options?.startTime && !options?.endTime) {
    dailyQuery = dailyQuery.where(
      "created_at",
      ">=",
      knex().raw("NOW() - INTERVAL '30 days'"),
    )
  } else {
    dailyQuery = buildTimeFilter(dailyQuery)
  }
  const dailyMembers = await dailyQuery

  // Get weekly new members
  // If no time range provided, default to last 12 weeks for backward compatibility
  let weeklyQuery = knex()("accounts")
    .select(
      knex().raw("DATE_TRUNC('week', created_at) as date"),
      knex().raw("COUNT(*) as new_members"),
      knex().raw(
        "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as new_members_rsi_verified",
      ),
      knex().raw(
        "COUNT(CASE WHEN rsi_confirmed = false THEN 1 END) as new_members_rsi_unverified",
      ),
      knex().raw(
        "SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('week', created_at)) as cumulative_members",
      ),
      knex().raw(
        "SUM(COUNT(CASE WHEN rsi_confirmed = true THEN 1 END)) OVER (ORDER BY DATE_TRUNC('week', created_at)) as cumulative_members_rsi_verified",
      ),
      knex().raw(
        "SUM(COUNT(CASE WHEN rsi_confirmed = false THEN 1 END)) OVER (ORDER BY DATE_TRUNC('week', created_at)) as cumulative_members_rsi_unverified",
      ),
    )
    .groupBy(knex().raw("DATE_TRUNC('week', created_at)"))
    .orderBy("date", "asc")

  if (!options?.startTime && !options?.endTime) {
    weeklyQuery = weeklyQuery.where(
      "created_at",
      ">=",
      knex().raw("NOW() - INTERVAL '12 weeks'"),
    )
  } else {
    weeklyQuery = buildTimeFilter(weeklyQuery)
  }
  const weeklyMembers = await weeklyQuery

  // Get monthly new members
  // If no time range provided, default to last 12 months for backward compatibility
  let monthlyQuery = knex()("accounts")
    .select(
      knex().raw("DATE_TRUNC('month', created_at) as date"),
      knex().raw("COUNT(*) as new_members"),
      knex().raw(
        "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as new_members_rsi_verified",
      ),
      knex().raw(
        "COUNT(CASE WHEN rsi_confirmed = false THEN 1 END) as new_members_rsi_unverified",
      ),
      knex().raw(
        "SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative_members",
      ),
      knex().raw(
        "SUM(COUNT(CASE WHEN rsi_confirmed = true THEN 1 END)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative_members_rsi_verified",
      ),
      knex().raw(
        "SUM(COUNT(CASE WHEN rsi_confirmed = false THEN 1 END)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as cumulative_members_rsi_unverified",
      ),
    )
    .groupBy(knex().raw("DATE_TRUNC('month', created_at)"))
    .orderBy("date", "asc")

  if (!options?.startTime && !options?.endTime) {
    monthlyQuery = monthlyQuery.where(
      "created_at",
      ">=",
      knex().raw("NOW() - INTERVAL '12 months'"),
    )
  } else {
    monthlyQuery = buildTimeFilter(monthlyQuery)
  }
  const monthlyMembers = await monthlyQuery

  // Get overall membership statistics
  const totalMembers = await knex()("accounts")
    .select(
      knex().raw("COUNT(*) as total_members"),
      knex().raw("COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_members"),
      knex().raw(
        "COUNT(CASE WHEN role = 'user' THEN 1 END) as regular_members",
      ),
      knex().raw(
        "COUNT(CASE WHEN rsi_confirmed = true THEN 1 END) as rsi_confirmed_members",
      ),
      knex().raw("COUNT(CASE WHEN banned = true THEN 1 END) as banned_members"),
      knex().raw(
        "COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_members_30d",
      ),
      knex().raw(
        "COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_members_7d",
      ),
    )
    .first()

  return {
    daily_totals: dailyMembers || [],
    weekly_totals: weeklyMembers || [],
    monthly_totals: monthlyMembers || [],
    summary: totalMembers || {},
  }
}

/**
 * Get user IDs for admin alert targets based on target type.
 */
export async function getUsersForAlertTarget(
  targetType: string,
  targetContractorId?: string,
): Promise<string[]> {
  let query = knex()("accounts").select("accounts.user_id")

  switch (targetType) {
    case "all_users":
      // All users except banned ones
      query = query.where("banned", false)
      break

    case "org_members":
      // Users who are members of any organization
      query = query
        .join(
          "contractor_members",
          "accounts.user_id",
          "=",
          "contractor_members.user_id",
        )
        .where("accounts.banned", false)
      break

    case "org_owners":
      // Users who own organizations (have Owner role in contractor_member_roles)
      query = query
        .join(
          "contractor_member_roles",
          "accounts.user_id",
          "=",
          "contractor_member_roles.user_id",
        )
        .join(
          "contractor_roles",
          "contractor_member_roles.role_id",
          "=",
          "contractor_roles.role_id",
        )
        .where("contractor_roles.name", "Owner")
        .where("accounts.banned", false)
      break

    case "admins_only":
      // Only admin users
      query = query.where("role", "admin").where("banned", false)
      break

    case "specific_org":
      // Members of a specific organization
      if (!targetContractorId) {
        return []
      }
      query = query
        .join(
          "contractor_members",
          "accounts.user_id",
          "=",
          "contractor_members.user_id",
        )
        .where("contractor_members.contractor_id", targetContractorId)
        .where("accounts.banned", false)
      break

    default:
      return []
  }

  const results = await query
  return results.map((r: { user_id: string }) => r.user_id)
}

/**
 * Get admin alerts by where clause.
 */
export async function getAdminAlerts(where: any = {}): Promise<DBAdminAlert[]> {
  return knex()<DBAdminAlert>("admin_alerts")
    .select("*")
    .where(where)
    .orderBy("created_at", "desc")
}

/**
 * Create an admin alert.
 */
export async function createAdminAlert(
  alert: Omit<DBAdminAlert, "alert_id" | "created_at">,
): Promise<DBAdminAlert> {
  const [newAlert] = await knex()<DBAdminAlert>("admin_alerts")
    .insert(alert)
    .returning("*")

  return newAlert
}

/**
 * Get admin alerts (paginated).
 */
export async function getAdminAlertsPaginated(
  page: number = 0,
  pageSize: number = 20,
  where: any = {},
): Promise<{ alerts: DBAdminAlert[]; pagination: any }> {
  const offset = page * pageSize

  const alerts = await knex()<DBAdminAlert>("admin_alerts")
    .select("*")
    .where(where)
    .orderBy("created_at", "desc")
    .offset(offset)
    .limit(pageSize)

  const [{ count }] = await knex()("admin_alerts")
    .count("* as count")
    .where(where)

  const total = parseInt(count as string)
  const totalPages = Math.ceil(total / pageSize)

  return {
    alerts,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_next: page < totalPages - 1,
      has_prev: page > 0,
    },
  }
}

/**
 * Update an admin alert.
 */
export async function updateAdminAlert(
  alertId: string,
  updates: Partial<DBAdminAlert>,
): Promise<DBAdminAlert | null> {
  const [updatedAlert] = await knex()<DBAdminAlert>("admin_alerts")
    .where({ alert_id: alertId })
    .update(updates)
    .returning("*")

  return updatedAlert || null
}

/**
 * Delete an admin alert.
 */
export async function deleteAdminAlert(alertId: string): Promise<boolean> {
  const deletedCount = await knex()<DBAdminAlert>("admin_alerts")
    .where({ alert_id: alertId })
    .del()

  return deletedCount > 0
}

/**
 * Insert a content report.
 */
export async function insertContentReport(
  report: Partial<DBContentReport>,
): Promise<DBContentReport[]> {
  return knex()<DBContentReport>("content_reports")
    .insert(report)
    .returning("*")
}

/**
 * Get content reports.
 */
export async function getContentReports(
  where: any = {},
): Promise<DBContentReport[]> {
  return knex()<DBContentReport>("content_reports")
    .select("*")
    .where(where)
    .orderBy("created_at", "desc")
}

/**
 * Update a content report.
 */
export async function updateContentReport(
  where: any,
  values: Partial<DBContentReport>,
): Promise<DBContentReport[]> {
  return knex()<DBContentReport>("content_reports")
    .where(where)
    .update(values)
    .returning("*")
}

/**
 * Delete a content report.
 */
export async function deleteContentReport(
  where: any,
): Promise<DBContentReport[]> {
  return knex()<DBContentReport>("content_reports")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Get offer analytics (mirrors getOrderAnalytics for offer_sessions).
 */
export async function getOfferAnalytics() {
  // Daily totals (last 30 days)
  const dailyTotals = await knex()("offer_sessions")
    .select(
      knex().raw("DATE(timestamp) as date"),
      knex().raw("COUNT(*) as total"),
      knex().raw("COUNT(CASE WHEN status = 'active' THEN 1 END) as active"),
      knex().raw("COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted"),
      knex().raw("COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected"),
    )
    .where("timestamp", ">=", knex().raw("NOW() - INTERVAL '30 days'"))
    .groupBy(knex().raw("DATE(timestamp)"))
    .orderBy("date", "asc")

  // Weekly totals (last 12 weeks)
  const weeklyTotals = await knex()("offer_sessions")
    .select(
      knex().raw("DATE_TRUNC('week', timestamp) as date"),
      knex().raw("COUNT(*) as total"),
      knex().raw("COUNT(CASE WHEN status = 'active' THEN 1 END) as active"),
      knex().raw("COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted"),
      knex().raw("COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected"),
    )
    .where("timestamp", ">=", knex().raw("NOW() - INTERVAL '12 weeks'"))
    .groupBy(knex().raw("DATE_TRUNC('week', timestamp)"))
    .orderBy("date", "asc")

  // Monthly totals (last 12 months)
  const monthlyTotals = await knex()("offer_sessions")
    .select(
      knex().raw("DATE_TRUNC('month', timestamp) as date"),
      knex().raw("COUNT(*) as total"),
      knex().raw("COUNT(CASE WHEN status = 'active' THEN 1 END) as active"),
      knex().raw("COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted"),
      knex().raw("COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected"),
      knex().raw(
        `COALESCE(AVG(CASE WHEN status = 'accepted' THEN (SELECT CAST(oo.cost AS numeric) FROM order_offers oo WHERE oo.session_id = offer_sessions.id ORDER BY oo.timestamp DESC LIMIT 1) END), 0) as average_accepted_value`,
      ),
    )
    .where("timestamp", ">=", knex().raw("NOW() - INTERVAL '12 months'"))
    .groupBy(knex().raw("DATE_TRUNC('month', timestamp)"))
    .orderBy("date", "asc")

  // Top contractors
  const topContractors = await knex()("offer_sessions as os")
    .join("contractors as c", "os.contractor_id", "c.contractor_id")
    .whereNotNull("os.contractor_id")
    .select(
      "c.name",
      knex().raw("COUNT(CASE WHEN os.status = 'accepted' THEN 1 END) as accepted_offers"),
      knex().raw("COUNT(*) as total_offers"),
    )
    .groupBy("c.contractor_id", "c.name")
    .orderBy("accepted_offers", "desc")
    .orderBy("total_offers", "desc")
    .limit(10)

  // Top users
  const topUsers = await knex()("offer_sessions as os")
    .join("accounts as a", "os.customer_id", "a.user_id")
    .select(
      "a.username",
      knex().raw("COUNT(CASE WHEN os.status = 'accepted' THEN 1 END) as accepted_offers"),
      knex().raw("COUNT(*) as total_offers"),
    )
    .groupBy("a.user_id", "a.username")
    .orderBy("accepted_offers", "desc")
    .orderBy("total_offers", "desc")
    .limit(10)

  // Summary
  const summary = await knex()("offer_sessions")
    .select(
      knex().raw("COUNT(*) as total_offers"),
      knex().raw("COUNT(CASE WHEN status = 'active' THEN 1 END) as active_offers"),
      knex().raw("COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_offers"),
      knex().raw("COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_offers"),
      knex().raw(
        `COALESCE(SUM(CASE WHEN status = 'accepted' THEN (SELECT CAST(oo.cost AS numeric) FROM order_offers oo WHERE oo.session_id = offer_sessions.id ORDER BY oo.timestamp DESC LIMIT 1) ELSE 0 END), 0) as total_value`,
      ),
    )
    .first()

  const fmt = (row: any) => ({
    date: row.date.toISOString().split("T")[0],
    total: parseInt(row.total),
    active: parseInt(row.active),
    accepted: parseInt(row.accepted),
    rejected: parseInt(row.rejected),
  })

  return {
    daily_totals: dailyTotals.map(fmt),
    weekly_totals: weeklyTotals.map(fmt),
    monthly_totals: monthlyTotals.map((row: any) => ({
      ...fmt(row),
      average_accepted_value: parseFloat(row.average_accepted_value) || 0,
    })),
    top_contractors: topContractors.map((row: any) => ({
      name: row.name,
      accepted_offers: parseInt(row.accepted_offers),
      total_offers: parseInt(row.total_offers),
    })),
    top_users: topUsers.map((row: any) => ({
      username: row.username,
      accepted_offers: parseInt(row.accepted_offers),
      total_offers: parseInt(row.total_offers),
    })),
    summary: {
      total_offers: parseInt(summary.total_offers),
      active_offers: parseInt(summary.active_offers),
      accepted_offers: parseInt(summary.accepted_offers),
      rejected_offers: parseInt(summary.rejected_offers),
      total_value: parseInt(summary.total_value),
    },
  }
}