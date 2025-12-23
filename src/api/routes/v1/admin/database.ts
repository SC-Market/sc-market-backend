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
