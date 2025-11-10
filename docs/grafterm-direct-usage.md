# Using Grafterm Directly (No Grafana Required)

This guide shows you how to use [grafterm](https://github.com/slok/grafterm) directly with your SC Market API endpoints without needing a Grafana instance.

## How It Works

Grafterm supports Prometheus and Graphite datasources natively, but your API returns Grafana-compatible JSON. We've created a simple adapter that:

1. Converts your API's Grafana JSON format to Prometheus format
2. Exposes a Prometheus-compatible API endpoint
3. Allows grafterm to query your metrics directly

## Quick Start

### 1. Install Grafterm

```bash
# Using Go
go install github.com/slok/grafterm@latest

# Or download from releases: https://github.com/slok/grafterm/releases
```

### 2. Start the API Adapter

The adapter proxies your API and converts responses to Prometheus format:

```bash
# With admin token (for full stats)
ADMIN_TOKEN=your_token_here yarn tsx scripts/grafterm-api-adapter.ts

# Or with custom API URL
API_URL=http://localhost:7000 ADMIN_TOKEN=your_token yarn tsx scripts/grafterm-api-adapter.ts
```

The adapter will start on `http://localhost:9091` by default (configurable via `PORT` env var).

### 3. Configure Grafterm Datasource

Create a datasources configuration file (`~/.grafterm/datasources.json` or use `-u` flag):

```json
{
  "version": "v1",
  "datasources": {
    "sc-market-api": {
      "prometheus": {
        "address": "http://localhost:9091"
      }
    }
  }
}
```

### 4. Run Grafterm

```bash
# Basic usage
grafterm -c docs/sc-market-grafterm-dashboard.json

# With custom datasources file
grafterm -c docs/sc-market-grafterm-dashboard.json -u ~/.grafterm/datasources.json

# With refresh interval
grafterm -c docs/sc-market-grafterm-dashboard.json -r 30s

# With relative time range (last 7 days)
grafterm -c docs/sc-market-grafterm-dashboard.json -d 7d

# Debug mode
grafterm -c docs/sc-market-grafterm-dashboard.json --debug
```

## Available Metrics

The adapter exposes these metrics as Prometheus queries:

### Activity Metrics

- `daily_activity` - Daily active users
- `weekly_activity` - Weekly active users
- `monthly_activity` - Monthly active users

### Order Analytics

- `daily_orders_total` - Total daily orders
- `daily_orders_fulfilled` - Daily fulfilled orders
- `daily_orders_in_progress` - Daily in-progress orders
- `daily_orders_cancelled` - Daily cancelled orders
- `daily_orders_not_started` - Daily not-started orders

### Membership Analytics

- `daily_membership_new` - New members today
- `daily_membership_cumulative` - Total cumulative members

### Homepage Stats (Public - No Auth Required)

- `total_orders` - Total orders
- `total_order_value` - Total order value in aUEC
- `week_orders` - Orders this week
- `week_order_value` - Week order value in aUEC

## Testing the Adapter

You can test the adapter directly:

```bash
# Health check
curl http://localhost:9091/health

# Query a metric
curl "http://localhost:9091/api/v1/query?query=daily_activity"

# List all available metrics
curl http://localhost:9091/api/v1/label/__name__/values
```

## Dashboard Configuration

The dashboard file (`docs/sc-market-grafterm-dashboard.json`) includes:

- **Activity panels**: Daily, weekly, monthly user activity graphs
- **Order panels**: Fulfilled and in-progress order trends
- **Stat panels**: Total orders, order value, week orders

You can customize the dashboard by editing the JSON file. See [grafterm documentation](https://github.com/slok/grafterm) for dashboard configuration details.

## Environment Variables

### Adapter (`grafterm-api-adapter.ts`)

- `API_URL` - Your API base URL (default: `https://api.sc-market.space`)
- `ADMIN_TOKEN` - Admin authentication token (required for admin endpoints)
- `PORT` - Adapter port (default: `9091`)

### Grafterm

- `GRAFTERM_USER_DATASOURCES` - Path to user datasources config file

## Example Workflow

```bash
# Terminal 1: Start the adapter
ADMIN_TOKEN=abc123 yarn tsx scripts/grafterm-api-adapter.ts

# Terminal 2: Run grafterm
grafterm -c docs/sc-market-grafterm-dashboard.json -r 30s -d 7d
```

## Troubleshooting

### "Authentication required" error

- Make sure `ADMIN_TOKEN` is set when starting the adapter
- Verify your token is valid by testing with `curl`:
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN" \
    "https://api.sc-market.space/api/v1/admin/activity?format=grafana"
  ```

### "Unknown metric" error

- Check that the metric name matches one of the available metrics listed above
- Verify the adapter is running and can reach your API

### No data showing

- Check adapter logs for errors
- Test the adapter directly with `curl`
- Use `--debug` flag with grafterm: `grafterm -c dashboard.json --debug`
- Check the log file: `tail -f grafterm.log`

### Connection refused

- Ensure the adapter is running on the expected port
- Check `PORT` environment variable if using custom port
- Verify datasource configuration points to correct address

## Advanced Usage

### Custom Time Ranges

```bash
# Last 24 hours
grafterm -c dashboard.json -d 24h

# Last 7 days
grafterm -c dashboard.json -d 7d

# Fixed time range (ISO 8601)
grafterm -c dashboard.json -s 2024-01-01T00:00:00Z -e 2024-01-07T23:59:59Z
```

### Multiple Datasources

If you have multiple SC Market API instances:

```json
{
  "version": "v1",
  "datasources": {
    "sc-market-prod": {
      "prometheus": { "address": "http://localhost:9091" }
    },
    "sc-market-staging": {
      "prometheus": { "address": "http://localhost:9092" }
    }
  }
}
```

Then use alias flag:

```bash
grafterm -c dashboard.json -a "sc-market-api=sc-market-prod"
```

## See Also

- [Grafterm GitHub](https://github.com/slok/grafterm)
- [Grafterm Documentation](https://github.com/slok/grafterm/tree/master/docs)
- [Prometheus Query API](https://prometheus.io/docs/prometheus/latest/querying/api/)
