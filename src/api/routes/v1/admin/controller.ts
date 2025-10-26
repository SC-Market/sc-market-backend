import { RequestHandler } from "express"
import { database as database } from "../../../../clients/database/knex-db.js"
import { createResponse as createResponse } from "../util/response.js"

export const admin_get_activity: RequestHandler = async (req, res) => {
  const daily = await database.getDailyActivity()
  const weekly = await database.getWeeklyActivity()
  const monthly = await database.getMonthlyActivity()
  res.json(createResponse({ daily, weekly, monthly }))
  return
}

export const admin_get_orders_analytics: RequestHandler = async (req, res) => {
  try {
    const analytics = await database.getOrderAnalytics()
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
    res.json(createResponse(analytics))
  } catch (error) {
    console.error("Error fetching membership analytics:", error)
    res
      .status(500)
      .json(createResponse({ error: "Failed to fetch membership analytics" }))
  }
  return
}
