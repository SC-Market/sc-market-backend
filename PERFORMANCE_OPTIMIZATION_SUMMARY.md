# Performance Optimization Summary

This document summarizes the performance optimizations implemented for the game item attributes feature.

## Overview

Three key optimizations were implemented to ensure the attribute filtering system meets the performance requirement of returning results within 2 seconds (Requirement 7.5):

1. **Query Performance Monitoring**
2. **Attribute Filter Query Optimization**
3. **Attribute Definition Caching**

---

## 1. Query Performance Monitoring

### Implementation

Created `src/clients/database/query-monitor.ts` which provides:

- **Automatic slow query detection**: Logs any query taking >2 seconds
- **Query execution plan analysis**: Automatically runs EXPLAIN ANALYZE on slow queries
- **Performance issue identification**: Detects common problems like:
  - Sequential scans on large tables
  - Missing indexes on joins
  - Outdated statistics
  - Nested loops without indexes

### Integration

- Integrated into `knex-db.ts` via `enableQueryMonitoring()`
- Automatically enabled on server startup
- Logs to Winston logger with structured metadata

### Usage

The monitoring is automatic. Slow queries will appear in logs with:
```
[warn] Slow query detected
  duration: 2500ms
  sql: SELECT * FROM ...
  threshold: 2000ms
```

Followed by execution plan analysis with recommendations.

---

## 2. Attribute Filter Query Optimization

### Implementation

Created `src/api/routes/v1/market/attribute-query-optimizer.ts` which provides:

#### Optimized Query Builder
- `applyAttributeFilters()`: Centralized function for applying attribute filters
- Uses EXISTS subqueries (more efficient than IN for large datasets)
- Leverages composite indexes on (attribute_name, attribute_value)
- Maintains AND logic across attributes, OR logic within attribute values

#### Performance Analysis Tools
- `analyzeAttributeFilterPerformance()`: Analyzes query execution plans
- `batchAnalyzeAttributeFilters()`: Tests multiple filter combinations
- `generateCompositeIndexSQL()`: Suggests additional indexes for common patterns

### Database Indexes

Created `config/postgres/45-attribute-composite-indexes.sql` with:

1. **Composite index for size + class** (common for quantum drives)
2. **Composite index for size + grade** (common for components)
3. **Composite index for class + manufacturer**
4. **Composite index for armor_type + color**
5. **Covering index** for index-only scans

These indexes optimize the most common attribute filter combinations based on expected usage patterns.

### Integration

- Updated `src/api/routes/v1/market/database.ts` to use `applyAttributeFilters()`
- Applied to both:
  - Main market search (materialized view)
  - Buy order search (game_items table)

### Performance Characteristics

- **EXISTS vs IN**: EXISTS is more efficient for large datasets as it can short-circuit
- **Index usage**: Composite indexes allow PostgreSQL to use index-only scans
- **Query plan**: Optimized for common filter combinations (size+class, type+color, etc.)

---

## 3. Attribute Definition Caching

### Implementation

Created `src/api/routes/v1/attributes/cache.ts` which provides:

#### LRU Cache
- **TTL**: 1 hour (attribute definitions change infrequently)
- **Max size**: 500 entries
- **Cache keys**:
  - All definitions: `all_definitions`
  - By name: `definition_by_name:{name}`
  - By types: `definitions_by_types:{type1,type2}`

#### Cache Invalidation
- **On create**: Clear entire cache (new definition affects all queries)
- **On update**: Clear specific definition + all list caches
- **On delete**: Clear entire cache (deletion affects all queries)

#### Cache Warm-up
- Automatically warms cache on server startup
- Pre-loads:
  - All definitions
  - Common item type combinations (Quantum Drive, Cooler, Armor, etc.)

### Integration

- Updated `src/api/routes/v1/attributes/controller.ts` to use `cachedDb`
- All read operations use cache
- All write operations invalidate cache appropriately
- Cache warm-up added to `src/server.ts` startup

### Performance Impact

- **Cache hit**: ~0.1ms (in-memory lookup)
- **Cache miss**: ~10-50ms (database query)
- **Expected hit rate**: >95% (definitions change rarely)

---

## Performance Testing Recommendations

To verify the optimizations meet requirements:

### 1. Query Performance Testing

```typescript
import { analyzeAttributeFilterPerformance } from './attribute-query-optimizer'

// Test common filter combinations
const testCases = [
  [{ name: 'size', values: ['4'], operator: 'in' }],
  [
    { name: 'size', values: ['4'], operator: 'in' },
    { name: 'class', values: ['Military'], operator: 'in' }
  ],
  [
    { name: 'size', values: ['4', '5'], operator: 'in' },
    { name: 'class', values: ['Military', 'Stealth'], operator: 'in' },
    { name: 'grade', values: ['A'], operator: 'in' }
  ]
]

for (const filters of testCases) {
  const analysis = await analyzeAttributeFilterPerformance(knex, filters)
  console.log(`Filters: ${JSON.stringify(filters)}`)
  console.log(`Estimated cost: ${analysis.estimatedCost}`)
  console.log(`Uses index: ${analysis.usesIndex}`)
  console.log(`Recommendations: ${analysis.recommendations}`)
}
```

### 2. Load Testing

Test with large dataset (100k+ listings):

```bash
# Run market search with various attribute filters
curl "http://localhost:7000/api/v1/market/search?item_type=Quantum%20Drive&attr_size=4&attr_class=Military"

# Monitor slow query logs
tail -f logs/combined.log | grep "Slow query"
```

### 3. Cache Performance Testing

```typescript
import { attributeDefinitionCache } from './cache'

// Test cache hit rate
const stats = attributeDefinitionCache.getStats()
console.log(`Cache size: ${stats.size}/${stats.maxSize}`)

// Test cache warm-up time
const start = Date.now()
await attributeDefinitionCache.warmUp()
console.log(`Warm-up time: ${Date.now() - start}ms`)
```

---

## Monitoring in Production

### Key Metrics to Track

1. **Query Performance**
   - Number of slow queries (>2s)
   - Average query duration
   - 95th percentile query duration

2. **Cache Performance**
   - Cache hit rate
   - Cache size
   - Cache eviction rate

3. **Index Usage**
   - Index scan vs sequential scan ratio
   - Index hit rate
   - Unused indexes

### Logging

All performance-related logs include structured metadata:

```json
{
  "level": "warn",
  "message": "Slow query detected",
  "duration": "2500ms",
  "sql": "SELECT ...",
  "threshold": "2000ms"
}
```

### Alerts

Consider setting up alerts for:
- Slow query count > 10/hour
- Cache hit rate < 90%
- Sequential scans on game_item_attributes table

---

## Future Optimizations

If performance issues persist, consider:

1. **Materialized view for attributes**: Pre-join game_item_attributes with game_items
2. **Partial indexes**: Create indexes for specific high-traffic attribute combinations
3. **Query result caching**: Cache search results for common filter combinations
4. **Database connection pooling**: Increase pool size if connection wait time is high
5. **Read replicas**: Offload read queries to replica databases

---

## Validation Checklist

- [x] Query monitoring logs slow queries (>2s)
- [x] Query monitoring analyzes execution plans
- [x] Attribute filters use EXISTS subqueries
- [x] Composite indexes created for common combinations
- [x] Attribute definitions cached with LRU cache
- [x] Cache invalidation on create/update/delete
- [x] Cache warm-up on server startup
- [x] No TypeScript errors
- [ ] Performance testing with 100k+ listings (requires production data)
- [ ] Load testing under concurrent requests (requires load testing tools)

---

## References

- Requirements: 7.1, 7.2, 7.3, 7.5, 9.1
- Design Document: Performance Considerations section
- PostgreSQL Documentation: [EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html)
- PostgreSQL Documentation: [Indexes](https://www.postgresql.org/docs/current/indexes.html)
