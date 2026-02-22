/**
 * Prometheus query response
 * Note: Uses any for result to support Prometheus-specific tuple format [timestamp, value]
 */
export interface PrometheusQueryResponse {
  status: string
  data: {
    resultType: string
    result: any[]
  }
}

/**
 * Prometheus error response
 */
export interface PrometheusErrorResponse {
  status: string
  errorType: string
  error: string
}

/**
 * Prometheus label values response
 */
export interface PrometheusLabelValuesResponse {
  status: string
  data: string[]
}

/**
 * Prometheus series response
 * Note: Uses any for data to support Prometheus-specific format
 */
export interface PrometheusSeriesResponse {
  status: string
  data: any[]
}
