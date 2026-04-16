# Market V2 Monitoring and Alerting Setup

**Version**: 2.0.0  
**Target Audience**: DevOps Engineers, System Administrators  
**Requirements**: PostgreSQL, Node.js application with logging

---

## Overview

This document provides setup instructions for monitoring and alerting for the Market V2 system, covering:
- Search latency monitoring (Requirements 19.3, 19.4)
- Error rate monitoring (Requirement 19.5)
- Performance degradation alerts (Requirement 19.4)
- Database health monitoring

---

## Table of Contents

1. [Metrics Collection](#metrics-collection)
2. [Database Monitoring Views](#database-monitoring-views)
3. [Application Logging](#application-logging)
4. [Alert Configuration](#alert-configuration)
5. [Grafana Dashboard Setup](#grafana-dashboard-setup)
6. [Alert Response Procedures](#alert-response-procedures)

---

## Metrics Collection

### 1. Enable PostgreSQL Statistics

**Enable pg_stat_statements extension**:
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify enabled
SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';
```

**Configure postgresql.conf**:
```ini
# Add to postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000

# Enable slow query logging
log_min_duration_statement = 50  # Log queries >50ms
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_statement = 'none'
log_duration = off
```

**Restart PostgreSQL**:
```bash
sudo systemctl restart postgresql
```

---

### 2. Application Metrics Middleware

**Create metrics middleware** (`src/api/middleware/metrics.ts`):
```typescript
import { Request, Response, NextFunction } from 'express';

interface RequestMetrics {
  endpoint: string;
  method: string;
  status_code: number;
  duration_ms: number;
  timestamp: Date;
  user_id?: string;
}

const metrics: RequestMetrics[] = [];

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // Record metrics
    metrics.push({
      endpoint: req.path,
      method: req.method,
      status_code: res.statusCode,
      duration_ms: duration,
      timestamp: new Date(),
      user_id: req.user?.user_id
    });
    
    // Alert if slow
    if (req.path.includes('/api/v2/listings/search') && duration > 50) {
      console.warn(`SLOW_QUERY: ${req.path} took ${duration}ms`);
    }
    
    // Alert if error
    if (res.statusCode >= 500) {
      console.error(`SERVER_ERROR: ${req.path} returned ${res.statusCode}`);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

// Metrics endpoint
export function getMetrics() {
  const now = Date.now();
  const last24h = metrics.filter(m => now - m.timestamp.getTime() < 24 * 60 * 60 * 1000);
  
  return {
    total_requests: last24h.length,
    avg_duration_ms: last24h.reduce((sum, m) => sum + m.duration_ms, 0) / last24h.length,
    error_count: last24h.filter(m => m.status_code >= 400).length,
    error_rate: last24h.filter(m => m.status_code >= 400).length / last24h.length,
    by_endpoint: groupByEndpoint(last24h)
  };
}

function groupByEndpoint(metrics: RequestMetrics[]) {
  const grouped: Record<string, any> = {};
  
  metrics.forEach(m => {
    if (!grouped[m.endpoint]) {
      grouped[m.endpoint] = {
        count: 0,
        avg_duration: 0,
        error_count: 0,
        durations: []
      };
    }
    
    grouped[m.endpoint].count++;
    grouped[m.endpoint].durations.push(m.duration_ms);
    if (m.status_code >= 400) grouped[m.endpoint].error_count++;
  });
  
  // Calculate averages and percentiles
  Object.keys(grouped).forEach(endpoint => {
    const durations = grouped[endpoint].durations.sort((a, b) => a - b);
    grouped[endpoint].avg_duration = durations.reduce((a, b) => a + b, 0) / durations.length;
    grouped[endpoint].p50_duration = durations[Math.floor(durations.length * 0.5)];
    grouped[endpoint].p95_duration = durations[Math.floor(durations.length * 0.95)];
    grouped[endpoint].p99_duration = durations[Math.floor(durations.length * 0.99)];
    delete grouped[endpoint].durations;
  });
  
  return grouped;
}
```

**Register middleware** (`src/server.ts`):
```typescript
import { metricsMiddleware, getMetrics } from './api/middleware/metrics';

// Apply to all routes
app.use(metricsMiddleware);

// Metrics endpoint
app.get('/api/v2/metrics', (req, res) => {
  res.json(getMetrics());
});
```

---

## Database Monitoring Views

### 1. Search Performance View

**Create view**:
```sql
CREATE OR REPLACE VIEW v2_search_performance AS
SELECT 
  DATE_TRUNC('hour', query_start) as hour,
  COUNT(*) as query_count,
  AVG(EXTRACT(EPOCH FROM (now() - query_start)) * 1000) as avg_duration_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - query_start)) * 1000) as p50_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - query_start)) * 1000) as p95_duration_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (now() - query_start)) * 1000) as p99_duration_ms
FROM pg_stat_activity
WHERE query LIKE '%listing_search%'
  AND state = 'active'
  AND query_start > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', query_start)
ORDER BY hour DESC;

COMMENT ON VIEW v2_search_performance IS 
'Hourly search performance metrics for V2 listing search queries';
```

**Query view**:
```sql
-- Get current hour performance
SELECT * FROM v2_search_performance 
WHERE hour = DATE_TRUNC('hour', NOW());

-- Get last 24 hours
SELECT * FROM v2_search_performance 
ORDER BY hour DESC 
LIMIT 24;
```

---

### 2. Error Rate View

**Create view**:
```sql
CREATE OR REPLACE VIEW v2_error_rates AS
WITH error_logs AS (
  SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    endpoint,
    status_code,
    COUNT(*) as count
  FROM api_logs
  WHERE endpoint LIKE '/api/v2/%'
    AND timestamp > NOW() - INTERVAL '24 hours'
  GROUP BY DATE_TRUNC('hour', timestamp), endpoint, status_code
)
SELECT 
  hour,
  endpoint,
  SUM(count) as total_requests,
  SUM(CASE WHEN status_code >= 400 THEN count ELSE 0 END) as error_count,
  SUM(CASE WHEN status_code >= 500 THEN count ELSE 0 END) as server_error_count,
  (SUM(CASE WHEN status_code >= 400 THEN count ELSE 0 END)::float / SUM(count)) * 100 as error_rate_pct
FROM error_logs
GROUP BY hour, endpoint
ORDER BY hour DESC, endpoint;

COMMENT ON VIEW v2_error_rates IS 
'Hourly error rates by endpoint for V2 API';
```

**Query view**:
```sql
-- Get current hour error rates
SELECT * FROM v2_error_rates 
WHERE hour = DATE_TRUNC('hour', NOW())
ORDER BY error_rate_pct DESC;

-- Get endpoints with high error rates
SELECT endpoint, AVG(error_rate_pct) as avg_error_rate
FROM v2_error_rates
WHERE hour > NOW() - INTERVAL '24 hours'
GROUP BY endpoint
HAVING AVG(error_rate_pct) > 1.0
ORDER BY avg_error_rate DESC;
```

---

### 3. Database Health View

**Create view**:
```sql
CREATE OR REPLACE VIEW v2_database_health AS
SELECT 
  -- Connection pool usage
  (SELECT count(*) FROM pg_stat_activity WHERE datname = 'sc_market') as active_connections,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
  (SELECT count(*)::float / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') * 100 
   FROM pg_stat_activity WHERE datname = 'sc_market') as connection_usage_pct,
  
  -- Table sizes
  (SELECT pg_size_pretty(pg_total_relation_size('listings'))) as listings_size,
  (SELECT pg_size_pretty(pg_total_relation_size('listing_items'))) as listing_items_size,
  (SELECT pg_size_pretty(pg_total_relation_size('item_variants'))) as item_variants_size,
  (SELECT pg_size_pretty(pg_total_relation_size('listing_item_lots'))) as listing_item_lots_size,
  
  -- Row counts
  (SELECT count(*) FROM listings WHERE status = 'active') as active_listings,
  (SELECT count(*) FROM item_variants) as total_variants,
  (SELECT count(*) FROM listing_item_lots WHERE listed = true) as listed_lots,
  
  -- Cache hit ratio
  (SELECT sum(blks_hit)::float / (sum(blks_hit) + sum(blks_read)) * 100 
   FROM pg_stat_database WHERE datname = 'sc_market') as cache_hit_ratio_pct,
  
  -- Slow queries
  (SELECT count(*) FROM pg_stat_statements WHERE mean_time > 50) as slow_query_count;

COMMENT ON VIEW v2_database_health IS 
'Overall database health metrics for V2 system';
```

**Query view**:
```sql
SELECT * FROM v2_database_health;
```

---

### 4. Slow Queries View

**Create view**:
```sql
CREATE OR REPLACE VIEW v2_slow_queries AS
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time,
  stddev_time,
  rows
FROM pg_stat_statements
WHERE query LIKE '%listing%'
  AND mean_time > 50
ORDER BY mean_time DESC
LIMIT 20;

COMMENT ON VIEW v2_slow_queries IS 
'Top 20 slowest queries related to V2 listings (mean time >50ms)';
```

**Query view**:
```sql
SELECT * FROM v2_slow_queries;
```

---

## Application Logging

### 1. Structured Logging Setup

**Install Winston** (if not already installed):
```bash
npm install winston winston-daily-rotate-file
```

**Configure logger** (`src/utils/logger.ts`):
```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'sc-market-v2' },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // Error log file
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    
    // Combined log file
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    
    // Performance log file (for slow queries)
    new DailyRotateFile({
      filename: 'logs/performance-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'warn',
      maxSize: '20m',
      maxFiles: '7d'
    })
  ]
});

export default logger;
```

**Log search performance**:
```typescript
import logger from '../utils/logger';

export async function searchListings(filters: SearchFilters) {
  const startTime = Date.now();
  
  try {
    const results = await db('listing_search')
      .where(/* filters */)
      .limit(filters.page_size);
    
    const duration = Date.now() - startTime;
    
    // Log performance
    if (duration > 50) {
      logger.warn('Slow search query', {
        duration_ms: duration,
        filters,
        result_count: results.length,
        metric: 'search_latency'
      });
    } else {
      logger.info('Search query completed', {
        duration_ms: duration,
        filters,
        result_count: results.length,
        metric: 'search_latency'
      });
    }
    
    return results;
  } catch (error) {
    logger.error('Search query failed', {
      error: error.message,
      stack: error.stack,
      filters,
      metric: 'search_error'
    });
    throw error;
  }
}
```

---

### 2. API Request Logging

**Log all V2 requests**:
```typescript
import logger from '../utils/logger';

app.use('/api/v2', (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('API request', {
    method: req.method,
    path: req.path,
    query: req.query,
    user_id: req.user?.user_id,
    metric: 'api_request'
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info('API response', {
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: duration,
      user_id: req.user?.user_id,
      metric: 'api_response'
    });
    
    return originalSend.call(this, data);
  };
  
  next();
});
```

---

## Alert Configuration

### 1. Search Performance Alert

**Alert Condition**: p95 search latency >50ms

**SQL Check**:
```sql
-- Check if p95 latency exceeds threshold
SELECT 
  CASE 
    WHEN p95_duration_ms > 50 THEN 'CRITICAL'
    WHEN p95_duration_ms > 40 THEN 'WARNING'
    ELSE 'OK'
  END as alert_level,
  p95_duration_ms,
  query_count
FROM v2_search_performance
WHERE hour = DATE_TRUNC('hour', NOW())
LIMIT 1;
```

**Alert Script** (`scripts/check_search_performance.sh`):
```bash
#!/bin/bash

THRESHOLD=50
RESULT=$(psql -t -c "
  SELECT p95_duration_ms 
  FROM v2_search_performance 
  WHERE hour = DATE_TRUNC('hour', NOW()) 
  LIMIT 1;
")

if (( $(echo "$RESULT > $THRESHOLD" | bc -l) )); then
  echo "ALERT: Search performance degraded - p95 latency: ${RESULT}ms (threshold: ${THRESHOLD}ms)"
  # Send alert (email, Slack, PagerDuty, etc.)
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"🚨 Market V2 Alert: Search performance degraded - p95 latency: ${RESULT}ms\"}"
  exit 1
else
  echo "OK: Search performance normal - p95 latency: ${RESULT}ms"
  exit 0
fi
```

**Cron Job**:
```bash
# Check every 5 minutes
*/5 * * * * /path/to/scripts/check_search_performance.sh >> /var/log/v2_alerts.log 2>&1
```

---

### 2. Error Rate Alert

**Alert Condition**: Error rate >1%

**SQL Check**:
```sql
-- Check if error rate exceeds threshold
SELECT 
  CASE 
    WHEN error_rate_pct > 5 THEN 'CRITICAL'
    WHEN error_rate_pct > 1 THEN 'WARNING'
    ELSE 'OK'
  END as alert_level,
  error_rate_pct,
  error_count,
  total_requests
FROM v2_error_rates
WHERE hour = DATE_TRUNC('hour', NOW())
  AND endpoint = '/api/v2/listings/search'
LIMIT 1;
```

**Alert Script** (`scripts/check_error_rate.sh`):
```bash
#!/bin/bash

THRESHOLD=1.0
RESULT=$(psql -t -c "
  SELECT error_rate_pct 
  FROM v2_error_rates 
  WHERE hour = DATE_TRUNC('hour', NOW()) 
    AND endpoint = '/api/v2/listings/search'
  LIMIT 1;
")

if (( $(echo "$RESULT > $THRESHOLD" | bc -l) )); then
  echo "ALERT: High error rate - ${RESULT}% (threshold: ${THRESHOLD}%)"
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"🚨 Market V2 Alert: High error rate - ${RESULT}%\"}"
  exit 1
else
  echo "OK: Error rate normal - ${RESULT}%"
  exit 0
fi
```

**Cron Job**:
```bash
# Check every 5 minutes
*/5 * * * * /path/to/scripts/check_error_rate.sh >> /var/log/v2_alerts.log 2>&1
```

---

### 3. Database Connection Pool Alert

**Alert Condition**: Connection pool >90% utilized

**SQL Check**:
```sql
-- Check connection pool usage
SELECT 
  CASE 
    WHEN connection_usage_pct > 90 THEN 'CRITICAL'
    WHEN connection_usage_pct > 80 THEN 'WARNING'
    ELSE 'OK'
  END as alert_level,
  connection_usage_pct,
  active_connections,
  max_connections
FROM v2_database_health;
```

**Alert Script** (`scripts/check_connection_pool.sh`):
```bash
#!/bin/bash

THRESHOLD=90
RESULT=$(psql -t -c "
  SELECT connection_usage_pct 
  FROM v2_database_health;
")

if (( $(echo "$RESULT > $THRESHOLD" | bc -l) )); then
  echo "ALERT: Connection pool near limit - ${RESULT}% (threshold: ${THRESHOLD}%)"
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"🚨 Market V2 Alert: Connection pool near limit - ${RESULT}%\"}"
  exit 1
else
  echo "OK: Connection pool usage normal - ${RESULT}%"
  exit 0
fi
```

**Cron Job**:
```bash
# Check every 5 minutes
*/5 * * * * /path/to/scripts/check_connection_pool.sh >> /var/log/v2_alerts.log 2>&1
```

---

## Grafana Dashboard Setup

### 1. Install Grafana (if not already installed)

```bash
# Ubuntu/Debian
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana

# Start Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# Access at http://localhost:3000 (default login: admin/admin)
```

---

### 2. Configure PostgreSQL Data Source

**Add data source**:
1. Go to Configuration → Data Sources
2. Click "Add data source"
3. Select "PostgreSQL"
4. Configure:
   - Name: `SC Market V2`
   - Host: `localhost:5432`
   - Database: `sc_market`
   - User: `postgres` (or your DB user)
   - Password: `your_password`
   - SSL Mode: `disable` (or configure as needed)
   - Version: `12+`
5. Click "Save & Test"

---

### 3. Create Dashboard

**Import dashboard JSON** (`docs/grafana-v2-dashboard.json`):
```json
{
  "dashboard": {
    "title": "Market V2 Performance",
    "panels": [
      {
        "id": 1,
        "title": "Search Latency (p95)",
        "type": "graph",
        "targets": [
          {
            "rawSql": "SELECT hour as time, p95_duration_ms as value FROM v2_search_performance WHERE hour > NOW() - INTERVAL '24 hours' ORDER BY hour",
            "format": "time_series"
          }
        ],
        "yaxes": [
          {
            "label": "Latency (ms)",
            "min": 0,
            "max": 100
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": {
                "params": [50],
                "type": "gt"
              },
              "operator": {
                "type": "and"
              },
              "query": {
                "params": ["A", "5m", "now"]
              },
              "reducer": {
                "params": [],
                "type": "avg"
              },
              "type": "query"
            }
          ],
          "name": "Search Latency Alert",
          "message": "Search p95 latency exceeded 50ms threshold"
        }
      },
      {
        "id": 2,
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "rawSql": "SELECT hour as time, error_rate_pct as value FROM v2_error_rates WHERE hour > NOW() - INTERVAL '24 hours' AND endpoint = '/api/v2/listings/search' ORDER BY hour",
            "format": "time_series"
          }
        ],
        "yaxes": [
          {
            "label": "Error Rate (%)",
            "min": 0,
            "max": 5
          }
        ]
      },
      {
        "id": 3,
        "title": "Active Listings",
        "type": "stat",
        "targets": [
          {
            "rawSql": "SELECT active_listings FROM v2_database_health",
            "format": "table"
          }
        ]
      },
      {
        "id": 4,
        "title": "Connection Pool Usage",
        "type": "gauge",
        "targets": [
          {
            "rawSql": "SELECT connection_usage_pct FROM v2_database_health",
            "format": "table"
          }
        ],
        "options": {
          "thresholds": [
            { "value": 0, "color": "green" },
            { "value": 80, "color": "yellow" },
            { "value": 90, "color": "red" }
          ]
        }
      },
      {
        "id": 5,
        "title": "Slow Queries",
        "type": "table",
        "targets": [
          {
            "rawSql": "SELECT query, calls, mean_time, max_time FROM v2_slow_queries LIMIT 10",
            "format": "table"
          }
        ]
      }
    ]
  }
}
```

**Import dashboard**:
1. Go to Dashboards → Import
2. Upload `grafana-v2-dashboard.json`
3. Select data source: `SC Market V2`
4. Click "Import"

---

## Alert Response Procedures

### Alert 1: Search Performance Degraded

**Severity**: High  
**Response Time**: 15 minutes

**Steps**:
1. Check current p95 latency:
   ```sql
   SELECT * FROM v2_search_performance WHERE hour = DATE_TRUNC('hour', NOW());
   ```

2. Check slow queries:
   ```sql
   SELECT * FROM v2_slow_queries;
   ```

3. Check database load:
   ```sql
   SELECT * FROM pg_stat_activity WHERE state = 'active';
   ```

4. Immediate mitigation:
   ```sql
   -- Rebuild indexes
   REINDEX INDEX idx_listings_search_vector;
   ANALYZE listings;
   ```

5. If persistent, escalate to database team

---

### Alert 2: High Error Rate

**Severity**: Critical  
**Response Time**: 5 minutes

**Steps**:
1. Check error details:
   ```sql
   SELECT * FROM v2_error_rates WHERE hour = DATE_TRUNC('hour', NOW());
   ```

2. Check application logs:
   ```bash
   tail -f logs/error-*.log | grep "ERROR"
   ```

3. Check for specific error patterns:
   ```bash
   grep "VALIDATION_ERROR" logs/error-*.log | tail -20
   grep "NOT_FOUND" logs/error-*.log | tail -20
   grep "INTERNAL_SERVER_ERROR" logs/error-*.log | tail -20
   ```

4. Immediate mitigation:
   - If validation errors: Check for bad client requests
   - If 500 errors: Restart application
   - If database errors: Check database health

5. If critical (>5% error rate), consider rollback to V1:
   ```sql
   UPDATE user_preferences SET market_version = 'V1';
   ```

---

### Alert 3: Connection Pool Exhausted

**Severity**: Critical  
**Response Time**: 5 minutes

**Steps**:
1. Check connection usage:
   ```sql
   SELECT * FROM v2_database_health;
   ```

2. Check for long-running queries:
   ```sql
   SELECT pid, now() - query_start as duration, query
   FROM pg_stat_activity
   WHERE state = 'active'
     AND now() - query_start > interval '5 minutes';
   ```

3. Kill long-running queries:
   ```sql
   SELECT pg_terminate_backend(PID);
   ```

4. Increase connection pool (temporary):
   ```sql
   ALTER SYSTEM SET max_connections = 200;
   SELECT pg_reload_conf();
   ```

5. Restart application to reset pool

---

## Summary

**Monitoring Setup Checklist**:
- [ ] PostgreSQL statistics enabled
- [ ] Application metrics middleware installed
- [ ] Database monitoring views created
- [ ] Structured logging configured
- [ ] Alert scripts created and scheduled
- [ ] Grafana dashboard imported
- [ ] Alert response procedures documented
- [ ] Team trained on alert response

**Key Metrics**:
- Search latency (p50, p95, p99) - Target: <50ms
- Error rate - Target: <1%
- Connection pool usage - Target: <80%
- Active listings count
- Database cache hit ratio - Target: >95%

**Alert Thresholds**:
- Search p95 latency >50ms - WARNING
- Error rate >1% - WARNING
- Error rate >5% - CRITICAL
- Connection pool >80% - WARNING
- Connection pool >90% - CRITICAL

---

## References

- [Troubleshooting Guide](./v2-troubleshooting-guide.md)
- [Database Schema Documentation](./v2-database-schema.md)
- [API Documentation](./v2-api-documentation.md)
- [Migration Guide](./v2-migration-guide.md)
