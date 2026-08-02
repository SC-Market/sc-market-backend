import { Knex } from "knex"
import logger from "../../logger/logger.js"

/**
 * Bindings as Knex reports them on its query events / accepts in `knex.raw`.
 */
type QueryBindings = readonly Knex.RawBinding[]

/**
 * The query object Knex emits on the `query` / `query-response` / `query-error`
 * events. `__knexQueryUid` is Knex's own correlation id.
 */
interface MonitoredQuery {
  sql: string
  bindings?: QueryBindings
  __knexQueryUid?: string
}

/**
 * Query performance monitoring configuration
 */
const SLOW_QUERY_THRESHOLD_MS = 2000 // 2 seconds as per requirement 7.5

/**
 * Interface for query performance metrics
 */
export interface QueryMetrics {
  sql: string
  bindings?: QueryBindings
  duration: number
  timestamp: Date
}

/**
 * Enable query performance monitoring on a Knex instance.
 * Logs slow queries (>2 seconds) and provides query execution plan analysis.
 *
 * @param knex - The Knex instance to monitor
 */
export function enableQueryMonitoring(knex: Knex): void {
  // Track query start times
  const queryStartTimes = new Map<string, number>()

  knex
    .on(
      "query",
      (query: MonitoredQuery) => {
        const queryId = query.__knexQueryUid || generateQueryId()
        queryStartTimes.set(queryId, Date.now())

        // Store query ID for response handler
        if (query.__knexQueryUid === undefined) {
          query.__knexQueryUid = queryId
        }
      },
    )
    .on(
      "query-response",
      (_response: unknown, query: MonitoredQuery) => {
        const queryId = query.__knexQueryUid
        if (!queryId) return

        const startTime = queryStartTimes.get(queryId)
        if (!startTime) return

        const duration = Date.now() - startTime
        queryStartTimes.delete(queryId)

        // Log slow queries
        if (duration >= SLOW_QUERY_THRESHOLD_MS) {
          logger.warn("Slow query detected", {
            duration: `${duration}ms`,
            sql: query.sql,
            bindings: query.bindings,
            threshold: `${SLOW_QUERY_THRESHOLD_MS}ms`,
          })

          // Automatically analyze slow queries
          analyzeQueryPlan(knex, query.sql, query.bindings).catch((error) => {
            logger.error("Failed to analyze slow query", { error })
          })
        }
      },
    )
    .on(
      "query-error",
      (error: Error, query: MonitoredQuery) => {
        const queryId = query.__knexQueryUid
        if (queryId) {
          queryStartTimes.delete(queryId)
        }

        logger.error("Query error", {
          error: error.message,
          sql: query.sql,
          bindings: query.bindings,
        })
      },
    )
}

/**
 * Analyze query execution plan to identify performance issues
 *
 * @param knex - The Knex instance
 * @param sql - The SQL query to analyze
 * @param bindings - Query parameter bindings
 */
export async function analyzeQueryPlan(
  knex: Knex,
  sql: string,
  bindings?: QueryBindings,
): Promise<void> {
  try {
    // Use EXPLAIN ANALYZE to get actual execution statistics
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`

    const result = await knex.raw<{
      rows: { "QUERY PLAN": ExplainPlanNode[] }[]
    }>(explainQuery, bindings || [])
    const plan = result.rows[0]["QUERY PLAN"]

    // Log the execution plan
    logger.info("Query execution plan", {
      sql,
      plan: JSON.stringify(plan, null, 2),
    })

    // Analyze for common performance issues
    const issues = identifyPerformanceIssues(plan)
    if (issues.length > 0) {
      logger.warn("Query performance issues detected", {
        sql,
        issues,
      })
    }
  } catch (error) {
    logger.error("Failed to analyze query plan", {
      error: error instanceof Error ? error.message : String(error),
      sql,
    })
  }
}

/**
 * A node in the tree returned by `EXPLAIN (FORMAT JSON)`. The top-level array
 * holds one entry per statement, each wrapping its root node under `Plan`;
 * nested nodes hang off `Plans`. Only the members this analysis reads are
 * described.
 */
interface ExplainPlanNode {
  "Node Type"?: string
  "Plan Rows"?: number
  "Join Type"?: string
  "Actual Total Time"?: number
  "Total Cost"?: number
  Plan?: ExplainPlanNode
  Plans?: ExplainPlanNode[]
}

/**
 * Identify common performance issues from query execution plan
 *
 * @param plan - PostgreSQL query execution plan
 * @returns Array of identified issues
 */
function identifyPerformanceIssues(plan: ExplainPlanNode[]): string[] {
  const issues: string[] = []

  function traverse(node: ExplainPlanNode | undefined) {
    if (!node) return

    // Check for sequential scans on large tables
    if (node["Node Type"] === "Seq Scan") {
      const rows = node["Plan Rows"] || 0
      if (rows > 1000) {
        issues.push(
          `Sequential scan on large table (${rows} rows). Consider adding an index.`,
        )
      }
    }

    // Check for missing indexes on joins
    if (node["Node Type"] === "Nested Loop" && node["Join Type"]) {
      const innerNode = node["Plans"]?.[1]
      if (innerNode && innerNode["Node Type"] === "Seq Scan") {
        issues.push(
          `Nested loop join using sequential scan. Consider adding an index on join column.`,
        )
      }
    }

    // Check for high actual time vs planned time
    if (node["Actual Total Time"] && node["Total Cost"]) {
      const actualTime = node["Actual Total Time"]
      const estimatedCost = node["Total Cost"]
      if (actualTime > estimatedCost * 10) {
        issues.push(
          `Actual execution time (${actualTime}ms) significantly exceeds estimated cost (${estimatedCost}). Statistics may be outdated.`,
        )
      }
    }

    // Recursively check child nodes
    if (node["Plans"]) {
      node["Plans"].forEach(traverse)
    }
  }

  plan.forEach(traverse)
  return issues
}

/**
 * Generate a unique query ID for tracking
 */
function generateQueryId(): string {
  return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get query performance metrics for monitoring
 * This can be used to expose metrics to monitoring systems
 */
export class QueryMetricsCollector {
  private metrics: QueryMetrics[] = []
  private maxMetrics = 1000 // Keep last 1000 queries

  recordQuery(
    sql: string,
    bindings: QueryBindings | undefined,
    duration: number,
  ): void {
    this.metrics.push({
      sql,
      bindings,
      duration,
      timestamp: new Date(),
    })

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }
  }

  getSlowQueries(
    thresholdMs: number = SLOW_QUERY_THRESHOLD_MS,
  ): QueryMetrics[] {
    return this.metrics.filter((m) => m.duration >= thresholdMs)
  }

  getAverageDuration(): number {
    if (this.metrics.length === 0) return 0
    const total = this.metrics.reduce((sum, m) => sum + m.duration, 0)
    return total / this.metrics.length
  }

  clear(): void {
    this.metrics = []
  }
}
