import { Knex } from "knex"
import { AttributeFilter } from "./types.js"

/**
 * Optimized attribute filter query builder.
 * Uses EXISTS subqueries for efficient filtering with proper index usage.
 * 
 * Performance characteristics:
 * - EXISTS is more efficient than IN for large datasets
 * - Leverages composite index on (attribute_name, attribute_value)
 * - AND logic across different attributes
 * - OR logic within same attribute (multiple values)
 * 
 * @param query - The base Knex query to add filters to
 * @param attributes - Array of attribute filters to apply
 * @param gameItemIdColumn - The column name containing game_item_id (e.g., 'game_items.id' or 'market_search_materialized.game_item_id')
 * @returns Modified query with attribute filters applied
 */
export function applyAttributeFilters<T extends {}>(
  query: Knex.QueryBuilder<T>,
  attributes: AttributeFilter[],
  gameItemIdColumn: string,
  knex: Knex
): Knex.QueryBuilder<T> {
  if (!attributes || attributes.length === 0) {
    return query
  }

  console.log('[ATTR FILTER] Applying filters:', JSON.stringify(attributes, null, 2))

  // Apply each attribute filter as an EXISTS subquery
  // This ensures AND logic across different attributes
  for (const attributeFilter of attributes) {
    const sql = `EXISTS (
          SELECT 1 
          FROM game_item_attributes 
          WHERE game_item_attributes.game_item_id = ${gameItemIdColumn}
            AND game_item_attributes.attribute_name = ?
            AND game_item_attributes.attribute_value IN (${attributeFilter.values.map(() => "?").join(",")})
        )`
    console.log('[ATTR FILTER] SQL:', sql, 'Params:', [attributeFilter.name, ...attributeFilter.values])
    
    query = query.andWhereRaw(
      knex.raw(sql, [attributeFilter.name, ...attributeFilter.values]),
    )
  }

  return query
}

/**
 * Generate SQL for creating additional composite indexes if needed.
 * This function analyzes common attribute filter combinations and suggests
 * additional indexes for optimization.
 * 
 * @param attributeCombinations - Array of commonly used attribute name combinations
 * @returns SQL statements for creating composite indexes
 */
export function generateCompositeIndexSQL(
  attributeCombinations: string[][]
): string[] {
  const sqlStatements: string[] = []

  for (const combination of attributeCombinations) {
    if (combination.length < 2) continue

    const indexName = `idx_game_item_attrs_${combination.join("_").toLowerCase()}`
    const columns = combination
      .map((attr) => `(CASE WHEN attribute_name = '${attr}' THEN attribute_value END)`)
      .join(", ")

    sqlStatements.push(`
-- Composite index for common attribute combination: ${combination.join(", ")}
CREATE INDEX IF NOT EXISTS ${indexName}
  ON game_item_attributes(game_item_id, attribute_name)
  WHERE attribute_name IN (${combination.map((attr) => `'${attr}'`).join(", ")});
    `.trim())
  }

  return sqlStatements
}

/**
 * Analyze query performance for attribute filters.
 * This can be used to identify which attribute combinations are slow
 * and may benefit from additional indexes.
 * 
 * @param knex - Knex instance
 * @param attributes - Attribute filters to analyze
 * @param gameItemIdColumn - Column containing game_item_id
 * @returns Query execution plan analysis
 */
export async function analyzeAttributeFilterPerformance(
  knex: Knex,
  attributes: AttributeFilter[],
  gameItemIdColumn: string = "market_search_materialized.game_item_id"
): Promise<{
  estimatedCost: number
  actualTime?: number
  usesIndex: boolean
  recommendations: string[]
}> {
  if (attributes.length === 0) {
    return {
      estimatedCost: 0,
      usesIndex: true,
      recommendations: [],
    }
  }

  // Build a sample query for analysis
  let testQuery = knex("market_search_materialized").select("listing_id")

  testQuery = applyAttributeFilters(
    testQuery,
    attributes,
    gameItemIdColumn,
    knex
  )

  // Get EXPLAIN output
  const explainQuery = `EXPLAIN (FORMAT JSON) ${testQuery.toString()}`
  const result = await knex.raw(explainQuery)
  const plan = result.rows[0]["QUERY PLAN"][0]

  const recommendations: string[] = []
  let usesIndex = false
  let estimatedCost = plan["Plan"]?.["Total Cost"] || 0

  // Analyze the plan
  function analyzePlan(node: any) {
    if (!node) return

    // Check if indexes are being used
    if (node["Index Name"]) {
      usesIndex = true
    }

    // Check for sequential scans
    if (node["Node Type"] === "Seq Scan" && node["Relation Name"] === "game_item_attributes") {
      recommendations.push(
        "Sequential scan detected on game_item_attributes. Consider adding a composite index for this attribute combination."
      )
    }

    // Check for nested loops without index
    if (node["Node Type"] === "Nested Loop") {
      const innerNode = node["Plans"]?.[1]
      if (innerNode && innerNode["Node Type"] === "Seq Scan") {
        recommendations.push(
          "Nested loop join using sequential scan. Index may not be optimal for this query."
        )
      }
    }

    // Recursively analyze child nodes
    if (node["Plans"]) {
      node["Plans"].forEach(analyzePlan)
    }
  }

  analyzePlan(plan["Plan"])

  // Add recommendations based on attribute count
  if (attributes.length > 2 && !usesIndex) {
    recommendations.push(
      `Query uses ${attributes.length} attribute filters. Consider creating a composite index for: ${attributes.map((a) => a.name).join(", ")}`
    )
  }

  return {
    estimatedCost,
    usesIndex,
    recommendations,
  }
}

/**
 * Batch analyze multiple attribute filter combinations to identify
 * which ones would benefit most from optimization.
 * 
 * @param knex - Knex instance
 * @param attributeCombinations - Array of attribute filter combinations to test
 * @returns Analysis results sorted by estimated cost (highest first)
 */
export async function batchAnalyzeAttributeFilters(
  knex: Knex,
  attributeCombinations: AttributeFilter[][]
): Promise<
  Array<{
    attributes: AttributeFilter[]
    analysis: Awaited<ReturnType<typeof analyzeAttributeFilterPerformance>>
  }>
> {
  const results = await Promise.all(
    attributeCombinations.map(async (attributes) => ({
      attributes,
      analysis: await analyzeAttributeFilterPerformance(knex, attributes),
    }))
  )

  // Sort by estimated cost (highest first)
  return results.sort((a, b) => b.analysis.estimatedCost - a.analysis.estimatedCost)
}
