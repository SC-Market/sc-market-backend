/**
 * Prometheus-compatible query endpoint
 * Allows tools like grafterm to query metrics directly
 */

import { RequestHandler, Request, Response, NextFunction } from "express"
import * as adminDb from "../admin/database.js"
import * as orderDb from "../orders/database.js"
import { adminAuthorized } from "../../../middleware/auth.js"
import {
  convertActivityToPrometheus,
  convertOrderAnalyticsToPrometheus,
  convertMembershipAnalyticsToPrometheus,
  convertStatsToPrometheus,
} from "../admin/grafana-formatter.js"

// Metric name to endpoint mapping
const METRIC_SOURCES: Record<
  string,
  {
    type: "activity" | "orders" | "membership" | "stats"
    period?: "daily" | "weekly" | "monthly"
    metricKey?: string
  }
> = {
  // Activity metrics
  daily_activity: {
    type: "activity",
    period: "daily",
    metricKey: "daily_activity",
  },
  weekly_activity: {
    type: "activity",
    period: "weekly",
    metricKey: "weekly_activity",
  },
  monthly_activity: {
    type: "activity",
    period: "monthly",
    metricKey: "monthly_activity",
  },
  // Order metrics
  daily_orders_total: { type: "orders", period: "daily" },
  daily_orders_fulfilled: { type: "orders", period: "daily" },
  daily_orders_in_progress: { type: "orders", period: "daily" },
  daily_orders_cancelled: { type: "orders", period: "daily" },
  daily_orders_not_started: { type: "orders", period: "daily" },
  weekly_orders_total: { type: "orders", period: "weekly" },
  weekly_orders_fulfilled: { type: "orders", period: "weekly" },
  weekly_orders_in_progress: { type: "orders", period: "weekly" },
  weekly_orders_cancelled: { type: "orders", period: "weekly" },
  weekly_orders_not_started: { type: "orders", period: "weekly" },
  monthly_orders_total: { type: "orders", period: "monthly" },
  monthly_orders_fulfilled: { type: "orders", period: "monthly" },
  monthly_orders_in_progress: { type: "orders", period: "monthly" },
  monthly_orders_cancelled: { type: "orders", period: "monthly" },
  monthly_orders_not_started: { type: "orders", period: "monthly" },
  // Membership metrics
  daily_membership_new: { type: "membership", period: "daily" },
  daily_membership_new_rsi_verified: { type: "membership", period: "daily" },
  daily_membership_new_rsi_unverified: { type: "membership", period: "daily" },
  daily_membership_cumulative: { type: "membership", period: "daily" },
  daily_membership_cumulative_rsi_verified: {
    type: "membership",
    period: "daily",
  },
  daily_membership_cumulative_rsi_unverified: {
    type: "membership",
    period: "daily",
  },
  weekly_membership_new: { type: "membership", period: "weekly" },
  weekly_membership_new_rsi_verified: { type: "membership", period: "weekly" },
  weekly_membership_new_rsi_unverified: {
    type: "membership",
    period: "weekly",
  },
  weekly_membership_cumulative: { type: "membership", period: "weekly" },
  weekly_membership_cumulative_rsi_verified: {
    type: "membership",
    period: "weekly",
  },
  weekly_membership_cumulative_rsi_unverified: {
    type: "membership",
    period: "weekly",
  },
  monthly_membership_new: { type: "membership", period: "monthly" },
  monthly_membership_new_rsi_verified: {
    type: "membership",
    period: "monthly",
  },
  monthly_membership_new_rsi_unverified: {
    type: "membership",
    period: "monthly",
  },
  monthly_membership_cumulative: { type: "membership", period: "monthly" },
  monthly_membership_cumulative_rsi_verified: {
    type: "membership",
    period: "monthly",
  },
  monthly_membership_cumulative_rsi_unverified: {
    type: "membership",
    period: "monthly",
  },
  // Stats metrics
  total_orders: { type: "stats" },
  total_order_value: { type: "stats" },
  week_orders: { type: "stats" },
  week_order_value: { type: "stats" },
}

/**
 * Extract metric name from Prometheus query string
 * Handles simple metric names like "daily_activity" or PromQL like "daily_activity[5m]"
 */
function extractMetricName(query: string): string {
  // Remove PromQL syntax, just get the metric name
  return query.split(/(\[{}])/, 1)[0].trim()
}

/**
 * Filter Prometheus result to only include the requested metric
 */
function filterMetricResult(
  result: Array<{
    metric: { __name__: string }
    values: Array<[number, string]>
  }>,
  metricName: string,
): Array<{ metric: { __name__: string }; values: Array<[number, string]> }> {
  return result.filter((r) => r.metric.__name__ === metricName)
}

/**
 * Check if a metric requires admin authentication
 */
function requiresAdminAuth(metricName: string): boolean {
  // Stats metrics are public, everything else requires admin
  const publicMetrics = [
    "total_orders",
    "total_order_value",
    "week_orders",
    "week_order_value",
  ]
  return !publicMetrics.includes(metricName)
}

/**
 * Middleware that checks if auth is needed based on the query parameter
 * If the metric is public, skip auth; otherwise require admin auth
 */
export async function prometheusAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const query = req.query.query as string | undefined

  if (!query) {
    // Let the endpoint handle the missing query error
    return next()
  }

  // Extract metric name from query
  const metricName = query.split(/[\[{}\])]/, 1)[0].trim()

  // If it's a public metric, skip auth
  if (!requiresAdminAuth(metricName)) {
    return next()
  }

  // Otherwise, require admin auth
  return adminAuthorized(req, res, next)
}

export const prometheus_query: RequestHandler = async (req, res) => {
  const query = req.query.query as string | undefined

  if (!query) {
    res.status(400).json({
      status: "error",
      errorType: "bad_data",
      error: "Missing query parameter",
    })
    return
  }

  const metricName = extractMetricName(query)
  const metricSource = METRIC_SOURCES[metricName]

  if (!metricSource) {
    res.status(200).json({
      status: "success",
      data: {
        resultType: "vector",
        result: [],
      },
    })
    return
  }

  // Auth is handled by middleware - if we get here, auth passed (if required)

  try {
    let prometheusData: {
      status: string
      data: {
        resultType: string
        result: Array<{
          metric: { __name__: string }
          values?: Array<[number, string]>
          value?: [number, string]
        }>
      }
    }

    // Route to appropriate handler based on metric type
    switch (metricSource.type) {
      case "activity": {
        const daily = await adminDb.getDailyActivity()
        const weekly = await adminDb.getWeeklyActivity()
        const monthly = await adminDb.getMonthlyActivity()

        const allData = {
          status: "success",
          data: {
            resultType: "matrix" as const,
            result: [
              ...convertActivityToPrometheus(daily, "daily_activity").data
                .result,
              ...convertActivityToPrometheus(weekly, "weekly_activity").data
                .result,
              ...convertActivityToPrometheus(monthly, "monthly_activity").data
                .result,
            ],
          },
        }

        // Filter to requested metric
        const filtered = filterMetricResult(allData.data.result, metricName)
        prometheusData = {
          status: "success",
          data: {
            resultType: "matrix",
            result: filtered,
          },
        }
        break
      }
      case "orders": {
        const analytics = await orderDb.getOrderAnalytics()
        const totals =
          metricSource.period === "daily"
            ? analytics.daily_totals
            : metricSource.period === "weekly"
              ? analytics.weekly_totals
              : analytics.monthly_totals

        const allData = convertOrderAnalyticsToPrometheus(
          totals,
          metricSource.period!,
        )
        const filtered = filterMetricResult(allData.data.result, metricName)
        prometheusData = {
          status: "success",
          data: {
            resultType: "matrix",
            result: filtered,
          },
        }
        break
      }
      case "membership": {
        const analytics = await adminDb.getMembershipAnalytics()
        const totals =
          metricSource.period === "daily"
            ? analytics.daily_totals
            : metricSource.period === "weekly"
              ? analytics.weekly_totals
              : analytics.monthly_totals

        const allData = convertMembershipAnalyticsToPrometheus(
          totals,
          metricSource.period!,
        )
        const filtered = filterMetricResult(allData.data.result, metricName)
        prometheusData = {
          status: "success",
          data: {
            resultType: "matrix",
            result: filtered,
          },
        }
        break
      }
      case "stats": {
        const stats = await orderDb.getOrderStats()
        const allData = convertStatsToPrometheus(stats)
        const filtered = allData.data.result.filter(
          (r) => r.metric.__name__ === metricName,
        )

        // Convert to matrix format (single point = instant query)
        prometheusData = {
          status: "success",
          data: {
            resultType: "vector",
            result: filtered,
          },
        }
        break
      }
      default:
        res.status(500).json({
          status: "error",
          errorType: "internal",
          error: "Unknown metric type",
        })
        return
    }

    res.json(prometheusData)
  } catch (error) {
    console.error("Error querying Prometheus metric:", error)
    res.status(500).json({
      status: "error",
      errorType: "internal",
      error: "Internal server error",
    })
  }
}

/**
 * Handler for activity metrics (daily/weekly/monthly activity)
 */
async function handleActivityMetric(
  metricName: string,
  startTime: number,
  endTime: number,
): Promise<{
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
}> {
  console.log(
    `[handleActivityMetric] Querying database: startTime=${startTime} (${new Date(startTime * 1000).toISOString()}), endTime=${endTime} (${new Date(endTime * 1000).toISOString()})`,
  )
  const daily = await adminDb.getDailyActivity({ startTime, endTime })
  const weekly = await adminDb.getWeeklyActivity({ startTime, endTime })
  const monthly = await adminDb.getMonthlyActivity({ startTime, endTime })
  console.log(
    `[handleActivityMetric] Database returned: daily=${daily.length}, weekly=${weekly.length}, monthly=${monthly.length} records`,
  )

  const allData = {
    status: "success",
    data: {
      resultType: "matrix" as const,
      result: [
        ...convertActivityToPrometheus(daily, "daily_activity").data.result,
        ...convertActivityToPrometheus(weekly, "weekly_activity").data.result,
        ...convertActivityToPrometheus(monthly, "monthly_activity").data.result,
      ],
    },
  }

  // Filter to requested metric
  const filtered = filterMetricResult(allData.data.result, metricName)

  // Data is already filtered by time range at database level
  // Just ensure proper sorting
  const sorted = filtered.map((series) => ({
    ...series,
    values: series.values.sort(([a], [b]) => a - b), // Sort by timestamp ascending
  }))

  return {
    status: "success",
    data: {
      resultType: "matrix",
      result: sorted,
    },
  }
}

/**
 * Handler for order metrics (daily/weekly/monthly orders)
 */
async function handleOrderMetric(
  metricName: string,
  period: "daily" | "weekly" | "monthly",
  startTime: number,
  endTime: number,
): Promise<{
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
}> {
  const analytics = await orderDb.getOrderAnalytics({ startTime, endTime })
  const totals =
    period === "daily"
      ? analytics.daily_totals
      : period === "weekly"
        ? analytics.weekly_totals
        : analytics.monthly_totals

  const allData = convertOrderAnalyticsToPrometheus(totals, period)
  const filtered = filterMetricResult(allData.data.result, metricName)

  // Data is already filtered by time range at database level
  // Just ensure proper sorting
  const sorted = filtered.map((series) => ({
    ...series,
    values: series.values.sort(([a], [b]) => a - b), // Sort by timestamp ascending
  }))

  return {
    status: "success",
    data: {
      resultType: "matrix",
      result: sorted,
    },
  }
}

/**
 * Handler for membership metrics (daily/weekly/monthly membership)
 */
async function handleMembershipMetric(
  metricName: string,
  period: "daily" | "weekly" | "monthly",
  startTime: number,
  endTime: number,
): Promise<{
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
}> {
  const analytics = await adminDb.getMembershipAnalytics({
    startTime,
    endTime,
  })
  const totals =
    period === "daily"
      ? analytics.daily_totals
      : period === "weekly"
        ? analytics.weekly_totals
        : analytics.monthly_totals

  const allData = convertMembershipAnalyticsToPrometheus(totals, period)
  const filtered = filterMetricResult(allData.data.result, metricName)

  // Data is already filtered by time range at database level
  // Just ensure proper sorting
  const sorted = filtered.map((series) => ({
    ...series,
    values: series.values.sort(([a], [b]) => a - b), // Sort by timestamp ascending
  }))

  return {
    status: "success",
    data: {
      resultType: "matrix",
      result: sorted,
    },
  }
}

/**
 * Handler for stats metrics (instant values like total_orders)
 */
async function handleStatsMetric(
  metricName: string,
  startTime: number,
  endTime: number,
): Promise<{
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
}> {
  // For stats metrics (instant values), convert to range format
  // by creating points at start and end time so the graph shows a flat line
  const stats = await orderDb.getOrderStats()
  const allData = convertStatsToPrometheus(stats)
  const filtered = allData.data.result.filter(
    (r) => r.metric.__name__ === metricName,
  )

  // Convert instant vector to matrix format with points at start and end
  // This creates a flat line across the requested time range
  return {
    status: "success",
    data: {
      resultType: "matrix",
      result: filtered.map((series) => {
        const value = series.value ? series.value[1] : "0"
        return {
          metric: series.metric,
          values: [
            [startTime, value],
            [endTime, value],
          ],
        }
      }),
    },
  }
}

/**
 * Range query endpoint - returns time series data over a time range
 * Used by grafterm for graph widgets
 */
export const prometheus_query_range: RequestHandler = async (req, res) => {
  // Handle both GET (query params) and POST (form data in body)
  const query =
    (req.query.query as string | undefined) ||
    (req.body?.query as string | undefined)
  const start =
    (req.query.start as string | undefined) ||
    (req.body?.start as string | undefined)
  const end =
    (req.query.end as string | undefined) ||
    (req.body?.end as string | undefined)
  const step =
    (req.query.step as string | undefined) ||
    (req.body?.step as string | undefined)

  if (!query) {
    res.status(400).json({
      status: "error",
      errorType: "bad_data",
      error: "Missing query parameter",
    })
    return
  }

  if (!start || !end) {
    res.status(400).json({
      status: "error",
      errorType: "bad_data",
      error: "Missing start or end parameter",
    })
    return
  }

  const metricName = extractMetricName(query)
  const metricSource = METRIC_SOURCES[metricName]

  if (!metricSource) {
    res.status(200).json({
      status: "success",
      data: {
        resultType: "matrix",
        result: [],
      },
    })
    return
  }

  try {
    // Parse start and end times - handle both Unix timestamps and ISO 8601 dates
    let startTime: number
    let endTime: number

    // Try parsing as Unix timestamp first (numbers)
    const startNum = parseFloat(start)
    const endNum = parseFloat(end)

    // Check if the parsed values are reasonable Unix timestamps
    // Unix timestamps should be > 1000000000 (year 2001) and < 9999999999 (year 2286)
    if (!isNaN(startNum) && startNum > 1000000000 && startNum < 9999999999) {
      startTime = startNum
    } else {
      // Try parsing as ISO 8601 date string
      const startDate = new Date(start)
      if (isNaN(startDate.getTime())) {
        res.status(400).json({
          status: "error",
          errorType: "bad_data",
          error: `Invalid start time format: ${start}. Expected Unix timestamp or ISO 8601 date.`,
        })
        return
      }
      startTime = Math.floor(startDate.getTime() / 1000)
    }

    if (!isNaN(endNum) && endNum > 1000000000 && endNum < 9999999999) {
      endTime = endNum
    } else {
      const endDate = new Date(end)
      if (isNaN(endDate.getTime())) {
        res.status(400).json({
          status: "error",
          errorType: "bad_data",
          error: `Invalid end time format: ${end}. Expected Unix timestamp or ISO 8601 date.`,
        })
        return
      }
      endTime = Math.floor(endDate.getTime() / 1000)
    }

    const stepSeconds = step ? parseFloat(step) : 60 // Default 60s step

    // Debug logging for time range
    const startDate = new Date(startTime * 1000).toISOString()
    const endDate = new Date(endTime * 1000).toISOString()
    const durationHours = (endTime - startTime) / 3600
    console.log(
      `[Prometheus query_range] ${metricName}: start=${startTime} (${startDate}), end=${endTime} (${endDate}), duration=${durationHours.toFixed(2)}h, step=${stepSeconds}s`,
    )

    let prometheusData: {
      status: string
      data: {
        resultType: string
        result: Array<{
          metric: { __name__: string }
          values: Array<[number, string]>
        }>
      }
    }

    // Route to appropriate handler based on metric type
    switch (metricSource.type) {
      case "activity":
        prometheusData = await handleActivityMetric(
          metricName,
          startTime,
          endTime,
        )
        break
      case "orders":
        prometheusData = await handleOrderMetric(
          metricName,
          metricSource.period!,
          startTime,
          endTime,
        )
        break
      case "membership":
        prometheusData = await handleMembershipMetric(
          metricName,
          metricSource.period!,
          startTime,
          endTime,
        )
        break
      case "stats":
        prometheusData = await handleStatsMetric(metricName, startTime, endTime)
        break
      default:
        res.status(500).json({
          status: "error",
          errorType: "internal",
          error: "Unknown metric type",
        })
        return
    }

    res.json(prometheusData)
  } catch (error) {
    console.error("Error querying Prometheus range metric:", error)
    res.status(500).json({
      status: "error",
      errorType: "internal",
      error: "Internal server error",
    })
  }
}

/**
 * List all available metric names
 */
export const prometheus_label_values: RequestHandler = async (req, res) => {
  const labelName = req.params.label_name as string

  if (labelName === "__name__") {
    res.json({
      status: "success",
      data: Object.keys(METRIC_SOURCES),
    })
  } else {
    res.json({
      status: "success",
      data: [],
    })
  }
}

/**
 * Get series metadata
 */
export const prometheus_series: RequestHandler = async (req, res) => {
  const match = req.query.match as string | string[] | undefined
  const matches = Array.isArray(match) ? match : match ? [match] : []

  const allMetrics = Object.keys(METRIC_SOURCES)

  // Filter metrics if match[] is provided
  let filteredMetrics = allMetrics
  if (matches.length > 0) {
    filteredMetrics = allMetrics.filter((metric) => {
      return matches.some((pattern) => {
        // Simple pattern matching (supports __name__="metric_name")
        if (pattern.includes("__name__=")) {
          const metricPattern = pattern.split("=")[1]?.replace(/"/g, "")
          return (
            metric === metricPattern || metric.startsWith(metricPattern + "_")
          )
        }
        return true
      })
    })
  }

  const result = filteredMetrics.map((metric) => ({
    __name__: metric,
  }))

  res.json({
    status: "success",
    data: result,
  })
}
