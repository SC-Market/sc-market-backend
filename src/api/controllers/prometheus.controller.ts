import {
  Controller,
  Route,
  Get,
  Post,
  Query,
  Path,
  Body,
  Security,
  Middlewares,
  Response,
  Request,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController, ValidationErrorClass, ForbiddenError, NotFoundError, ConflictError } from "./base.controller.js"
import {
  PrometheusQueryResponse,
  PrometheusErrorResponse,
  PrometheusLabelValuesResponse,
  PrometheusSeriesResponse,
} from "../models/prometheus.models.js"
import { Unauthorized, Forbidden } from "../models/common.models.js"
import { tsoaCriticalRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as adminDb from "../routes/v1/admin/database.js"
import * as orderDb from "../routes/v1/orders/database.js"
import {
  convertActivityToPrometheus,
  convertOrderAnalyticsToPrometheus,
  convertMembershipAnalyticsToPrometheus,
  convertStatsToPrometheus,
} from "../routes/v1/admin/grafana-formatter.js"

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
 */
function extractMetricName(query: string): string {
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

@Route("api/v1/prometheus")
export class PrometheusController extends BaseController {
  /**
   * Prometheus instant query
   * @summary Query Prometheus metrics at a single point in time
   */
  @Get("query")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin:stats", "admin"])
  @Middlewares(tsoaCriticalRateLimit)
  @Response<PrometheusErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<PrometheusErrorResponse>(500, "Internal Server Error")
  public async query(
    @Query() query: string,
    @Request() request: ExpressRequest,
  ): Promise<PrometheusQueryResponse> {
    try {
      if (!query) {
        throw new ValidationErrorClass("Missing query parameter")
      }

      // Verify admin access and scope
      if (!this.isAdmin(request)) {
        throw new ForbiddenError("Admin access required")
      }

      if (!this.hasScope(request, "admin:stats") && !this.hasScope(request, "admin")) {
        throw new ForbiddenError("Insufficient permissions")
      }

      const metricName = extractMetricName(query)
      const metricSource = METRIC_SOURCES[metricName]

      if (!metricSource) {
        return {
          status: "success",
          data: {
            resultType: "vector",
            result: [],
          },
        }
      }

      let prometheusData: PrometheusQueryResponse

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
          throw new Error("Unknown metric type")
      }

      return prometheusData
    } catch (error) {
      return this.handleError(error, "query")
    }
  }

  /**
   * Prometheus range query (GET)
   * @summary Query Prometheus metrics over a time range
   */
  @Get("query_range")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin:stats", "admin"])
  @Middlewares(tsoaCriticalRateLimit)
  @Response<PrometheusErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<PrometheusErrorResponse>(500, "Internal Server Error")
  public async queryRangeGet(
    @Query() query: string,
    @Query() start: string,
    @Query() end: string,
    @Query() step?: string,
    @Request() request?: ExpressRequest,
  ): Promise<PrometheusQueryResponse> {
    return this.queryRangeImpl(query, start, end, step, request!)
  }

  /**
   * Prometheus range query (POST)
   * @summary Query Prometheus metrics over a time range (POST method)
   */
  @Post("query_range")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin:stats", "admin"])
  @Middlewares(tsoaCriticalRateLimit)
  @Response<PrometheusErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<PrometheusErrorResponse>(500, "Internal Server Error")
  public async queryRangePost(
    @Body()
    body: {
      query: string
      start: string
      end: string
      step?: string
    },
    @Request() request: ExpressRequest,
  ): Promise<PrometheusQueryResponse> {
    return this.queryRangeImpl(
      body.query,
      body.start,
      body.end,
      body.step,
      request,
    )
  }

  /**
   * Get label values
   * @summary Get available values for a Prometheus label
   */
  @Get("label/{label_name}/values")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin:stats", "admin"])
  @Middlewares(tsoaCriticalRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  public async getLabelValues(
    @Path() label_name: string,
    @Request() request: ExpressRequest,
  ): Promise<PrometheusLabelValuesResponse> {
    try {
      // Verify admin access and scope
      if (!this.isAdmin(request)) {
        throw new ForbiddenError("Admin access required")
      }

      if (!this.hasScope(request, "admin:stats") && !this.hasScope(request, "admin")) {
        throw new ForbiddenError("Insufficient permissions")
      }

      if (label_name === "__name__") {
        return {
          status: "success",
          data: Object.keys(METRIC_SOURCES),
        }
      } else {
        return {
          status: "success",
          data: [],
        }
      }
    } catch (error) {
      return this.handleError(error, "getLabelValues")
    }
  }

  /**
   * Get series metadata
   * @summary Get metadata for Prometheus series
   */
  @Get("series")
  @Security("sessionAuth", ["admin"])
  @Security("bearerAuth", ["admin:stats", "admin"])
  @Middlewares(tsoaCriticalRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  public async getSeries(
    @Request() request: ExpressRequest,
  ): Promise<PrometheusSeriesResponse> {
    try {
      // Verify admin access and scope
      if (!this.isAdmin(request)) {
        throw new ForbiddenError("Admin access required")
      }

      if (!this.hasScope(request, "admin:stats") && !this.hasScope(request, "admin")) {
        throw new ForbiddenError("Insufficient permissions")
      }

      // Get match parameter from request (can be string or array)
      const match = request.query.match
      const matches = Array.isArray(match) ? match : match ? [match as string] : []
      const allMetrics = Object.keys(METRIC_SOURCES)

      let filteredMetrics = allMetrics
      if (matches.length > 0) {
        filteredMetrics = allMetrics.filter((metric) => {
          return matches.some((pattern) => {
            if (typeof pattern === 'string' && pattern.includes("__name__=")) {
              const metricPattern = pattern.split("=")[1]?.replace(/"/g, "")
              return (
                metric === metricPattern ||
                metric.startsWith(metricPattern + "_")
              )
            }
            return true
          })
        })
      }

      const result = filteredMetrics.map((metric) => ({
        __name__: metric,
      }))

      return {
        status: "success",
        data: result,
      }
    } catch (error) {
      return this.handleError(error, "getSeries")
    }
  }

  /**
   * Implementation of range query logic
   */
  private async queryRangeImpl(
    query: string,
    start: string,
    end: string,
    step: string | undefined,
    request: ExpressRequest,
  ): Promise<PrometheusQueryResponse> {
    try {
      if (!query) {
        throw new ValidationErrorClass("Missing query parameter")
      }

      if (!start || !end) {
        throw new ValidationErrorClass("Missing start or end parameter")
      }

      // Verify admin access and scope
      if (!this.isAdmin(request)) {
        throw new ForbiddenError("Admin access required")
      }

      if (!this.hasScope(request, "admin:stats") && !this.hasScope(request, "admin")) {
        throw new ForbiddenError("Insufficient permissions")
      }

      const metricName = extractMetricName(query)
      const metricSource = METRIC_SOURCES[metricName]

      if (!metricSource) {
        return {
          status: "success",
          data: {
            resultType: "matrix",
            result: [],
          },
        }
      }

      // Parse start and end times
      let startTime: number
      let endTime: number

      const startNum = parseFloat(start)
      const endNum = parseFloat(end)

      if (!isNaN(startNum) && startNum > 1000000000 && startNum < 9999999999) {
        startTime = startNum
      } else {
        const startDate = new Date(start)
        if (isNaN(startDate.getTime())) {
          throw new ValidationErrorClass(
            `Invalid start time format: ${start}`,
          )
        }
        startTime = Math.floor(startDate.getTime() / 1000)
      }

      if (!isNaN(endNum) && endNum > 1000000000 && endNum < 9999999999) {
        endTime = endNum
      } else {
        const endDate = new Date(end)
        if (isNaN(endDate.getTime())) {
          throw new ValidationErrorClass(`Invalid end time format: ${end}`)
        }
        endTime = Math.floor(endDate.getTime() / 1000)
      }

      let prometheusData: PrometheusQueryResponse

      switch (metricSource.type) {
        case "activity": {
          const daily = await adminDb.getDailyActivity({ startTime, endTime })
          const weekly = await adminDb.getWeeklyActivity({ startTime, endTime })
          const monthly = await adminDb.getMonthlyActivity({
            startTime,
            endTime,
          })

          const allData = {
            status: "success",
            data: {
              resultType: "matrix" as const,
              result: [
                ...convertActivityToPrometheus(daily, "daily_activity").data
                  .result,
                ...convertActivityToPrometheus(weekly, "weekly_activity").data
                  .result,
                ...convertActivityToPrometheus(monthly, "monthly_activity")
                  .data.result,
              ],
            },
          }

          const filtered = filterMetricResult(allData.data.result, metricName)
          const sorted = filtered.map((series) => ({
            ...series,
            values: series.values.sort(([a], [b]) => a - b),
          }))

          prometheusData = {
            status: "success",
            data: {
              resultType: "matrix",
              result: sorted,
            },
          }
          break
        }
        case "orders": {
          const analytics = await orderDb.getOrderAnalytics({
            startTime,
            endTime,
          })
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
          const sorted = filtered.map((series) => ({
            ...series,
            values: series.values.sort(([a], [b]) => a - b),
          }))

          prometheusData = {
            status: "success",
            data: {
              resultType: "matrix",
              result: sorted,
            },
          }
          break
        }
        case "membership": {
          const analytics = await adminDb.getMembershipAnalytics({
            startTime,
            endTime,
          })
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
          const sorted = filtered.map((series) => ({
            ...series,
            values: series.values.sort(([a], [b]) => a - b),
          }))

          prometheusData = {
            status: "success",
            data: {
              resultType: "matrix",
              result: sorted,
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

          prometheusData = {
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
          break
        }
        default:
          throw new Error("Unknown metric type")
      }

      return prometheusData
    } catch (error) {
      return this.handleError(error, "queryRangeImpl")
    }
  }
}
