/**
 * Utility functions to convert time series data to Grafana-compatible format
 * and Prometheus-compatible format
 *
 * Grafana JSON datasource expects data in the format:
 * [
 *   {
 *     "target": "metric_name",
 *     "datapoints": [[value, timestamp_in_ms], ...]
 *   }
 * ]
 *
 * Prometheus query API expects data in the format:
 * {
 *   "status": "success",
 *   "data": {
 *     "resultType": "matrix",
 *     "result": [
 *       {
 *         "metric": { "__name__": "metric_name" },
 *         "values": [[timestamp_seconds, "value"], ...]
 *       }
 *     ]
 *   }
 * }
 */

/**
 * Convert a date string or Date object to Unix timestamp in milliseconds
 */
function dateToTimestamp(date: string | Date | null | undefined): number {
  if (!date) {
    return Date.now()
  }
  if (typeof date === "string") {
    // If it's a date-only string (YYYY-MM-DD), treat it as UTC midnight
    // Otherwise parse normally
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Date(date + "T00:00:00Z").getTime()
    }
    return new Date(date).getTime()
  }
  if (date instanceof Date) {
    return date.getTime()
  }
  // Handle Date-like objects from PostgreSQL
  return new Date(date as any).getTime()
}

/**
 * Convert a date string or Date object to Unix timestamp in seconds (for Prometheus)
 */
function dateToTimestampSeconds(
  date: string | Date | null | undefined,
): number {
  return Math.floor(dateToTimestamp(date) / 1000)
}

/**
 * Convert value to number, handling BigInt and string numbers
 */
function toNumericValue(value: any): number {
  if (typeof value === "number") {
    return value
  }
  if (typeof value === "bigint") {
    return Number(value)
  }
  if (value !== null && value !== undefined) {
    const parsed = Number(value)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Convert time series data to Grafana format
 * @param data Array of objects with date and numeric values
 * @param metrics Object mapping metric names to value keys in the data objects
 * @returns Array of Grafana time series objects
 */
export function convertToGrafanaFormat<T extends { date: string | Date }>(
  data: T[],
  metrics: Record<string, keyof T>,
): Array<{ target: string; datapoints: Array<[number, number]> }> {
  const result: Array<{ target: string; datapoints: Array<[number, number]> }> =
    []

  for (const [metricName, valueKey] of Object.entries(metrics)) {
    const datapoints: Array<[number, number]> = data.map((item) => {
      const value = item[valueKey]
      const timestamp = dateToTimestamp(item.date)
      const numericValue = toNumericValue(value)

      return [numericValue, timestamp]
    })

    result.push({
      target: metricName,
      datapoints,
    })
  }

  return result
}

/**
 * Convert activity data (daily/weekly/monthly) to Grafana format
 */
export function convertActivityToGrafana(
  data: Array<{ date: string | Date; count: number }>,
  seriesName: string,
): Array<{ target: string; datapoints: Array<[number, number]> }> {
  return convertToGrafanaFormat(data, { [seriesName]: "count" })
}

/**
 * Convert order analytics time series to Grafana format
 */
export function convertOrderAnalyticsToGrafana(
  data: Array<{
    date: string | Date
    total: number
    in_progress: number
    fulfilled: number
    cancelled: number
    not_started: number
    average_fulfilled_value?: number
  }>,
  period: "daily" | "weekly" | "monthly",
): Array<{ target: string; datapoints: Array<[number, number]> }> {
  const prefix = `${period}_orders`
  const metrics: Record<string, keyof (typeof data)[0]> = {
    [`${prefix}_total`]: "total",
    [`${prefix}_in_progress`]: "in_progress",
    [`${prefix}_fulfilled`]: "fulfilled",
    [`${prefix}_cancelled`]: "cancelled",
    [`${prefix}_not_started`]: "not_started",
  }

  // Add average_fulfilled_value only for monthly data
  if (
    period === "monthly" &&
    data.length > 0 &&
    "average_fulfilled_value" in data[0]
  ) {
    metrics[`${prefix}_average_fulfilled_value`] = "average_fulfilled_value"
  }

  return convertToGrafanaFormat(data, metrics)
}

/**
 * Convert membership analytics time series to Grafana format
 */
export function convertMembershipAnalyticsToGrafana(
  data: Array<{
    date: string | Date
    new_members: number
    new_members_rsi_verified: number
    new_members_rsi_unverified: number
    cumulative_members: number
    cumulative_members_rsi_verified: number
    cumulative_members_rsi_unverified: number
  }>,
  period: "daily" | "weekly" | "monthly",
): Array<{ target: string; datapoints: Array<[number, number]> }> {
  const prefix = `${period}_membership`
  return convertToGrafanaFormat(data, {
    [`${prefix}_new`]: "new_members",
    [`${prefix}_new_rsi_verified`]: "new_members_rsi_verified",
    [`${prefix}_new_rsi_unverified`]: "new_members_rsi_unverified",
    [`${prefix}_cumulative`]: "cumulative_members",
    [`${prefix}_cumulative_rsi_verified`]: "cumulative_members_rsi_verified",
    [`${prefix}_cumulative_rsi_unverified`]:
      "cumulative_members_rsi_unverified",
  })
}

/**
 * Convert single-value stats to Grafana format
 * For snapshot statistics that don't have time series data,
 * this creates a single datapoint with the current timestamp
 */
export function convertStatsToGrafana(
  stats: Record<string, number | string | null | undefined>,
): Array<{ target: string; datapoints: Array<[number, number]> }> {
  const result: Array<{ target: string; datapoints: Array<[number, number]> }> =
    []
  const timestamp = Date.now()

  for (const [metricName, value] of Object.entries(stats)) {
    const numericValue = toNumericValue(value)

    result.push({
      target: metricName,
      datapoints: [[numericValue, timestamp]],
    })
  }

  return result
}

/**
 * Convert time series data to Prometheus format
 * @param data Array of objects with date and numeric values
 * @param metrics Object mapping metric names to value keys in the data objects
 * @returns Prometheus query response format
 */
export function convertToPrometheusFormat<T extends { date: string | Date }>(
  data: T[],
  metrics: Record<string, keyof T>,
): {
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
} {
  const result: Array<{
    metric: { __name__: string }
    values: Array<[number, string]>
  }> = []

  for (const [metricName, valueKey] of Object.entries(metrics)) {
    const values: Array<[number, string]> = data.map((item) => {
      const value = item[valueKey]
      const timestamp = dateToTimestampSeconds(item.date)
      const numericValue = toNumericValue(value)
      return [timestamp, numericValue.toString()]
    })

    result.push({
      metric: { __name__: metricName },
      values,
    })
  }

  return {
    status: "success",
    data: {
      resultType: "matrix",
      result,
    },
  }
}

/**
 * Convert single-value stats to Prometheus format
 */
export function convertStatsToPrometheus(
  stats: Record<string, number | string | null | undefined>,
): {
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      value: [number, string]
    }>
  }
} {
  const result: Array<{
    metric: { __name__: string }
    value: [number, string]
  }> = []
  const timestamp = Math.floor(Date.now() / 1000)

  for (const [metricName, value] of Object.entries(stats)) {
    const numericValue = toNumericValue(value)
    result.push({
      metric: { __name__: metricName },
      value: [timestamp, numericValue.toString()],
    })
  }

  return {
    status: "success",
    data: {
      resultType: "vector",
      result,
    },
  }
}

/**
 * Convert activity data to Prometheus format
 */
export function convertActivityToPrometheus(
  data: Array<{ date: string | Date; count: number }>,
  seriesName: string,
): {
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
} {
  return convertToPrometheusFormat(data, { [seriesName]: "count" })
}

/**
 * Convert order analytics to Prometheus format
 */
export function convertOrderAnalyticsToPrometheus(
  data: Array<{
    date: string | Date
    total: number
    in_progress: number
    fulfilled: number
    cancelled: number
    not_started: number
    average_fulfilled_value?: number
  }>,
  period: "daily" | "weekly" | "monthly",
): {
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
} {
  const prefix = `${period}_orders`
  const metrics: Record<string, keyof (typeof data)[0]> = {
    [`${prefix}_total`]: "total",
    [`${prefix}_in_progress`]: "in_progress",
    [`${prefix}_fulfilled`]: "fulfilled",
    [`${prefix}_cancelled`]: "cancelled",
    [`${prefix}_not_started`]: "not_started",
  }

  // Add average_fulfilled_value only for monthly data
  if (
    period === "monthly" &&
    data.length > 0 &&
    "average_fulfilled_value" in data[0]
  ) {
    metrics[`${prefix}_average_fulfilled_value`] = "average_fulfilled_value"
  }

  return convertToPrometheusFormat(data, metrics)
}

/**
 * Convert membership analytics to Prometheus format
 */
export function convertMembershipAnalyticsToPrometheus(
  data: Array<{
    date: string | Date
    new_members: number
    new_members_rsi_verified: number
    new_members_rsi_unverified: number
    cumulative_members: number
    cumulative_members_rsi_verified: number
    cumulative_members_rsi_unverified: number
  }>,
  period: "daily" | "weekly" | "monthly",
): {
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: { __name__: string }
      values: Array<[number, string]>
    }>
  }
} {
  const prefix = `${period}_membership`
  return convertToPrometheusFormat(data, {
    [`${prefix}_new`]: "new_members",
    [`${prefix}_new_rsi_verified`]: "new_members_rsi_verified",
    [`${prefix}_new_rsi_unverified`]: "new_members_rsi_unverified",
    [`${prefix}_cumulative`]: "cumulative_members",
    [`${prefix}_cumulative_rsi_verified`]: "cumulative_members_rsi_verified",
    [`${prefix}_cumulative_rsi_unverified`]:
      "cumulative_members_rsi_unverified",
  })
}
