import { RequestHandler } from "express"
import { database as database } from "../../../../clients/database/knex-db.js"
import { createResponse as createResponse } from "../util/response.js"
import { createErrorResponse } from "../util/response.js"
import { User } from "../api-models.js"
import logger from "../../../../logger/logger.js"
import {
  convertActivityToGrafana,
  convertOrderAnalyticsToGrafana,
  convertMembershipAnalyticsToGrafana,
  convertActivityToPrometheus,
  convertOrderAnalyticsToPrometheus,
  convertMembershipAnalyticsToPrometheus,
} from "./grafana-formatter.js"
import { MinimalUser } from "../../../../clients/database/db-models.js"

export const admin_get_activity: RequestHandler = async (req, res) => {
  const daily = await database.getDailyActivity()
  const weekly = await database.getWeeklyActivity()
  const monthly = await database.getMonthlyActivity()

  // Check if Grafana format is requested
  if (req.query.format === "grafana") {
    const grafanaData = [
      ...convertActivityToGrafana(daily, "daily_activity"),
      ...convertActivityToGrafana(weekly, "weekly_activity"),
      ...convertActivityToGrafana(monthly, "monthly_activity"),
    ]
    res.json(grafanaData)
    return
  }

  // Check if Prometheus format is requested
  if (req.query.format === "prometheus") {
    const prometheusData = {
      status: "success",
      data: {
        resultType: "matrix",
        result: [
          ...convertActivityToPrometheus(daily, "daily_activity").data.result,
          ...convertActivityToPrometheus(weekly, "weekly_activity").data.result,
          ...convertActivityToPrometheus(monthly, "monthly_activity").data
            .result,
        ],
      },
    }
    res.json(prometheusData)
    return
  }

  res.json(createResponse({ daily, weekly, monthly }))
  return
}

export const admin_get_orders_analytics: RequestHandler = async (req, res) => {
  try {
    const analytics = await database.getOrderAnalytics()

    // Check if Grafana format is requested
    if (req.query.format === "grafana") {
      const grafanaData = [
        ...convertOrderAnalyticsToGrafana(analytics.daily_totals, "daily"),
        ...convertOrderAnalyticsToGrafana(analytics.weekly_totals, "weekly"),
        ...convertOrderAnalyticsToGrafana(analytics.monthly_totals, "monthly"),
      ]
      res.json(grafanaData)
      return
    }

    // Check if Prometheus format is requested
    if (req.query.format === "prometheus") {
      const prometheusData = {
        status: "success",
        data: {
          resultType: "matrix",
          result: [
            ...convertOrderAnalyticsToPrometheus(
              analytics.daily_totals,
              "daily",
            ).data.result,
            ...convertOrderAnalyticsToPrometheus(
              analytics.weekly_totals,
              "weekly",
            ).data.result,
            ...convertOrderAnalyticsToPrometheus(
              analytics.monthly_totals,
              "monthly",
            ).data.result,
          ],
        },
      }
      res.json(prometheusData)
      return
    }

    res.json(createResponse(analytics))
  } catch (error) {
    console.error("Error fetching order analytics:", error)
    res
      .status(500)
      .json(createResponse({ error: "Failed to fetch order analytics" }))
  }
  return
}

export const admin_get_users: RequestHandler = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.page_size as string) || 20),
    )
    const role = req.query.role as string
    const banned =
      req.query.banned !== undefined ? req.query.banned === "true" : undefined
    const rsiConfirmed =
      req.query.rsi_confirmed !== undefined
        ? req.query.rsi_confirmed === "true"
        : undefined

    // Get sorting parameters
    const validSortFields = [
      "created_at",
      "username",
      "display_name",
      "role",
      "banned",
      "rsi_confirmed",
      "balance",
      "locale",
    ]
    const sortBy = validSortFields.includes(req.query.sort_by as string)
      ? (req.query.sort_by as string)
      : "created_at"
    const sortOrder = (req.query.sort_order as "asc" | "desc") || "desc"

    // Build where clause for filtering
    const whereClause: any = {}
    if (role) {
      whereClause.role = role
    }
    if (banned !== undefined) {
      whereClause.banned = banned
    }
    if (rsiConfirmed !== undefined) {
      whereClause.rsi_confirmed = rsiConfirmed
    }

    const result = await database.getUsersPaginated(
      page,
      pageSize,
      whereClause,
      sortBy,
      sortOrder,
    )

    res.json(createResponse(result))
  } catch (error) {
    console.error("Error fetching users:", error)
    res.status(500).json(createResponse({ error: "Failed to fetch users" }))
  }
  return
}

export const admin_get_membership_analytics: RequestHandler = async (
  req,
  res,
) => {
  try {
    const analytics = await database.getMembershipAnalytics()

    // Check if Grafana format is requested
    if (req.query.format === "grafana") {
      const grafanaData = [
        ...convertMembershipAnalyticsToGrafana(analytics.daily_totals, "daily"),
        ...convertMembershipAnalyticsToGrafana(
          analytics.weekly_totals,
          "weekly",
        ),
        ...convertMembershipAnalyticsToGrafana(
          analytics.monthly_totals,
          "monthly",
        ),
      ]
      res.json(grafanaData)
      return
    }

    // Check if Prometheus format is requested
    if (req.query.format === "prometheus") {
      const prometheusData = {
        status: "success",
        data: {
          resultType: "matrix",
          result: [
            ...convertMembershipAnalyticsToPrometheus(
              analytics.daily_totals,
              "daily",
            ).data.result,
            ...convertMembershipAnalyticsToPrometheus(
              analytics.weekly_totals,
              "weekly",
            ).data.result,
            ...convertMembershipAnalyticsToPrometheus(
              analytics.monthly_totals,
              "monthly",
            ).data.result,
          ],
        },
      }
      res.json(prometheusData)
      return
    }

    res.json(createResponse(analytics))
  } catch (error) {
    console.error("Error fetching membership analytics:", error)
    res
      .status(500)
      .json(createResponse({ error: "Failed to fetch membership analytics" }))
  }
  return
}

export const admin_get_audit_logs: RequestHandler = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.page_size as string) || 20),
    )
    const action = req.query.action as string | undefined
    const subjectType = req.query.subject_type as string | undefined
    const subjectId = req.query.subject_id as string | undefined
    const actorId = req.query.actor_id as string | undefined
    const startDate = req.query.start_date as string | undefined
    const endDate = req.query.end_date as string | undefined

    // Build query
    let query = database.knex("audit_logs").select("audit_logs.*")

    // Apply filters
    if (action) {
      query = query.where("audit_logs.action", action)
    }
    if (subjectType) {
      query = query.where("audit_logs.subject_type", subjectType)
    }
    if (subjectId) {
      query = query.where("audit_logs.subject_id", subjectId)
    }
    if (actorId) {
      query = query.where("audit_logs.actor_id", actorId)
    }
    if (startDate) {
      query = query.where("audit_logs.created_at", ">=", startDate)
    }
    if (endDate) {
      query = query.where("audit_logs.created_at", "<=", endDate)
    }

    // Get total count
    const countQuery = query.clone().clearSelect().count("* as count").first()
    const totalResult = await countQuery
    const total = totalResult ? parseInt(totalResult.count as string) : 0

    // Apply pagination and ordering
    const offset = (page - 1) * pageSize
    const logs = await query
      .orderBy("audit_logs.created_at", "desc")
      .limit(pageSize)
      .offset(offset)

    // Fetch actor information for logs that have actor_id
    const actorIds = logs
      .map((log) => log.actor_id)
      .filter((id): id is string => id !== null)
    const actorsMap = new Map<string, MinimalUser>()

    if (actorIds.length > 0) {
      const actors = await Promise.all(
        actorIds.map(async (id) => {
          try {
            const user = await database.getMinimalUser({ user_id: id })
            return { id, user }
          } catch {
            return null
          }
        }),
      )

      actors.forEach((result) => {
        if (result) {
          actorsMap.set(result.id, result.user)
        }
      })
    }

    // Extract unique contractor IDs from metadata
    const contractorIds = new Set<string>()
    logs.forEach((log) => {
      const metadata = log.metadata as Record<string, unknown> | null
      if (
        metadata &&
        typeof metadata === "object" &&
        "contractor_id" in metadata
      ) {
        const contractorId = metadata.contractor_id
        if (typeof contractorId === "string") {
          contractorIds.add(contractorId)
        }
      }
      // Also check if subject_type is contractor and subject_id is a contractor_id
      if (log.subject_type === "contractor" && log.subject_id) {
        contractorIds.add(log.subject_id)
      }
    })

    // Fetch contractor information
    const contractorsMap = new Map<
      string,
      { contractor_id: string; name: string; spectrum_id: string }
    >()
    if (contractorIds.size > 0) {
      const contractors = await Promise.all(
        Array.from(contractorIds).map(async (contractorId) => {
          try {
            const contractor = await database.getMinimalContractor({
              contractor_id: contractorId,
            })
            return { contractor_id: contractorId, contractor }
          } catch {
            return null
          }
        }),
      )

      contractors.forEach((result) => {
        if (result && result.contractor) {
          // MinimalContractor doesn't have contractor_id, so we use the one we passed in
          contractorsMap.set(result.contractor_id, {
            contractor_id: result.contractor_id,
            name: result.contractor.name,
            spectrum_id: result.contractor.spectrum_id,
          })
        }
      })
    }

    // Format response
    const items = logs.map((log) => {
      const metadata = log.metadata as Record<string, unknown> | null
      let contractor = null

      // Try to get contractor from metadata first
      if (
        metadata &&
        typeof metadata === "object" &&
        "contractor_id" in metadata
      ) {
        const contractorId = metadata.contractor_id
        if (typeof contractorId === "string") {
          contractor = contractorsMap.get(contractorId) || null
        }
      }

      // If not in metadata, check if subject is a contractor
      if (!contractor && log.subject_type === "contractor" && log.subject_id) {
        contractor = contractorsMap.get(log.subject_id) || null
      }

      return {
        audit_log_id: log.audit_log_id,
        action: log.action,
        actor_id: log.actor_id,
        actor: log.actor_id ? actorsMap.get(log.actor_id) || null : null,
        subject_type: log.subject_type,
        subject_id: log.subject_id,
        metadata: log.metadata,
        created_at: log.created_at,
        contractor,
      }
    })

    res.json(
      createResponse({
        items,
        total,
        page,
        page_size: pageSize,
      }),
    )
  } catch (error) {
    console.error("Error fetching audit logs:", error)
    res
      .status(500)
      .json(createResponse({ error: "Failed to fetch audit logs" }))
  }
  return
}

export const admin_post_users_username_unlink: RequestHandler = async (
  req,
  res,
) => {
  try {
    const { username } = req.params
    const adminUser = req.user as User

    // Get the target user
    const user = await database.getUser({ username })
    if (!user) {
      res.status(404).json(
        createErrorResponse({
          message: "User not found",
          status: "error",
        }),
      )
      return
    }

    // Check if user is currently verified
    if (!user.rsi_confirmed) {
      res.status(400).json(
        createErrorResponse({
          message: "User is not currently verified with a Star Citizen account",
          status: "error",
        }),
      )
      return
    }

    // Generate default username from Discord ID or user ID
    const discordProvider = await database.getUserProvider(
      user.user_id,
      "discord",
    )
    const discordId =
      discordProvider?.provider_id || user.user_id.substring(0, 8)
    const defaultUsername = `new_user${discordId}`
    const defaultDisplayName = `new_user${discordId}`

    // Update user to unverified state with default usernames
    await database.updateUser(
      { user_id: user.user_id },
      {
        rsi_confirmed: false,
        spectrum_user_id: null,
        username: defaultUsername,
        display_name: defaultDisplayName,
      },
    )

    logger.info(
      `Admin ${adminUser.user_id} unlinked Star Citizen account for user ${user.user_id} (${username}). Reset to default usernames.`,
    )

    res.json(
      createResponse({
        message: "User account successfully unlinked",
        username: defaultUsername,
      }),
    )
  } catch (e) {
    logger.error("Error during admin Star Citizen account unlink:", e)
    res.status(500).json(
      createErrorResponse({
        message: "Internal server error during account unlink",
        status: "error",
      }),
    )
  }
}
