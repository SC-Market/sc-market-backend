# Grafana & Grafterm Setup Guide

This guide explains how to visualize your admin stats and homepage stats endpoints using Grafana and grafterm.

## Prerequisites

1. **Grafana instance** (local or remote)
2. **grafterm** installed: `go install github.com/slok/grafterm@latest`
3. **API access token** (for admin endpoints - see authentication section)

## Step 1: Configure Grafana JSON Datasource

You need to add a JSON datasource in Grafana that points to your API endpoints.

### Option A: Using Grafana UI

1. Go to **Configuration ? Data Sources ? Add data source**
2. Select **JSON API**
3. Configure the datasource:
   - **Name**: `SC Market API`
   - **URL**: `https://api.sc-market.space` (or your API URL)
   - **Access**: Server (default)
   - **Authentication**:
     - For admin endpoints: Select "Header Auth" and add:
       - **Header Name**: `Authorization`
       - **Header Value**: `Bearer YOUR_ADMIN_TOKEN_HERE`
     - For public endpoints: Leave authentication as "No Auth"

### Option B: Using grafterm Configuration

Create a Grafana datasource configuration file. Grafterm uses Grafana's datasource configuration format.

## Step 2: Create Dashboard Queries

### Admin Activity Stats

**Query for `/api/v1/admin/activity?format=grafana`:**

```json
{
  "url": "/api/v1/admin/activity?format=grafana",
  "jsonData": {
    "httpMethod": "GET",
    "timeField": "datapoints[1]",
    "valuesField": "datapoints[0]"
  }
}
```

**Available metrics:**

- `daily_activity` - Daily active users
- `weekly_activity` - Weekly active users
- `monthly_activity` - Monthly active users

### Order Analytics

**Query for `/api/v1/admin/orders/analytics?format=grafana`:**

```json
{
  "url": "/api/v1/admin/orders/analytics?format=grafana",
  "jsonData": {
    "httpMethod": "GET",
    "timeField": "datapoints[1]",
    "valuesField": "datapoints[0]"
  }
}
```

**Available metrics:**

- `daily_orders_total` - Total daily orders
- `daily_orders_in_progress` - Daily in-progress orders
- `daily_orders_fulfilled` - Daily fulfilled orders
- `daily_orders_cancelled` - Daily cancelled orders
- `daily_orders_not_started` - Daily not-started orders
- `weekly_orders_*` - Same metrics for weekly period
- `monthly_orders_*` - Same metrics for monthly period

### Membership Analytics

**Query for `/api/v1/admin/membership/analytics?format=grafana`:**

```json
{
  "url": "/api/v1/admin/membership/analytics?format=grafana",
  "jsonData": {
    "httpMethod": "GET",
    "timeField": "datapoints[1]",
    "valuesField": "datapoints[0]"
  }
}
```

**Available metrics:**

- `daily_membership_new` - New daily members
- `daily_membership_new_rsi_verified` - New RSI verified members
- `daily_membership_new_rsi_unverified` - New RSI unverified members
- `daily_membership_cumulative` - Cumulative total members
- `daily_membership_cumulative_rsi_verified` - Cumulative RSI verified
- `daily_membership_cumulative_rsi_unverified` - Cumulative RSI unverified
- `weekly_membership_*` - Same metrics for weekly period
- `monthly_membership_*` - Same metrics for monthly period

### Homepage Stats (Market Order Stats)

**Query for `/api/v1/market/stats?format=grafana`:**

```json
{
  "url": "/api/v1/market/stats?format=grafana",
  "jsonData": {
    "httpMethod": "GET",
    "timeField": "datapoints[1]",
    "valuesField": "datapoints[0]"
  }
}
```

**Available metrics:**

- `total_orders` - Total orders count
- `total_order_value` - Total order value
- `week_orders` - Orders in last week
- `week_order_value` - Order value in last week

## Step 3: Using Grafterm

### Basic Grafterm Usage

1. **Start grafterm**:

   ```bash
   grafterm dashboard dashboard.yaml
   ```

2. **Navigate Grafana**: Use keyboard shortcuts to navigate
   - `?` - Show help
   - Arrow keys - Navigate panels
   - `Enter` - Focus on panel
   - `Esc` - Back

### Example Dashboard Configuration

Create a `dashboard.yaml` file:

```yaml
grafana:
  url: http://localhost:3000 # Your Grafana URL
  token: YOUR_GRAFANA_API_TOKEN

dashboard:
  title: "SC Market Stats"
  tags:
    - "sc-market"
    - "admin"

  panels:
    - title: "Daily Activity"
      grid:
        x: 0
        y: 0
        w: 12
        h: 8
      target:
        - datasource: "SC Market API"
          refId: "A"
          query: "/api/v1/admin/activity?format=grafana"
          jsonPath: "$[*]"
          # Filter to daily_activity metric
          jsonPathTime: "$.datapoints[*][1]"
          jsonPathValue: "$.datapoints[*][0]"

    - title: "Order Status Trends"
      grid:
        x: 0
        y: 8
        w: 12
        h: 8
      target:
        - datasource: "SC Market API"
          refId: "A"
          query: "/api/v1/admin/orders/analytics?format=grafana"
          jsonPath: "$[?(@.target =~ /daily_orders_.*/)]"
```

## Step 4: Authentication Setup

For admin endpoints, you need to authenticate. Here are your options:

### Option 1: Grafana API Token (Recommended)

1. In Grafana: **Configuration ? API Keys ? New API Key**
2. Create a key with Admin role
3. Use this token in grafterm config

### Option 2: HTTP Header Authentication

Configure the JSON datasource with header authentication:

- **Header Name**: `Authorization`
- **Header Value**: `Bearer YOUR_ADMIN_TOKEN`

You can get an admin token from your API's admin authentication endpoint.

## Step 5: Grafana Panel Configuration

### Time Series Panel

For time series data (activity, orders, membership), use a **Time Series** panel:

1. **Panel Type**: Time Series
2. **Query**:
   ```json
   {
     "datasource": "SC Market API",
     "query": "/api/v1/admin/activity?format=grafana",
     "jsonPath": "$[?(@.target == 'daily_activity')]"
   }
   ```
3. **Field**: Select the target metric you want to display

### Stat Panel

For single-value stats (homepage stats), use a **Stat** panel:

1. **Panel Type**: Stat
2. **Query**:
   ```json
   {
     "datasource": "SC Market API",
     "query": "/api/v1/market/stats?format=grafana",
     "jsonPath": "$[?(@.target == 'total_orders')]"
   }
   ```

## Example API Calls

### Test the endpoints directly:

```bash
# Public endpoint (no auth needed)
curl "https://api.sc-market.space/api/v1/market/stats?format=grafana"

# Admin endpoint (auth required)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://api.sc-market.space/api/v1/admin/activity?format=grafana"
```

### Example Response Format

The Grafana format returns data like this:

```json
[
  {
    "target": "daily_activity",
    "datapoints": [
      [10, 1704067200000],
      [15, 1704153600000],
      [20, 1704240000000]
    ]
  },
  {
    "target": "weekly_activity",
    "datapoints": [
      [45, 1704067200000],
      [50, 1704672000000]
    ]
  }
]
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Make sure your admin token is valid and has proper permissions
2. **CORS Issues**: Ensure your API allows requests from your Grafana instance
3. **Time Field Format**: Grafana expects timestamps in milliseconds (which we provide)
4. **Data Not Showing**: Check that `format=grafana` parameter is included in the URL

### Debug Steps

1. Test the endpoint directly with `curl` to verify response format
2. Check Grafana datasource logs for connection issues
3. Verify the JSON path queries match your data structure
4. Ensure time ranges in Grafana match your data availability

## Additional Resources

- [Grafterm Documentation](https://github.com/slok/grafterm)
- [Grafana JSON API Datasource](https://grafana.com/grafana/plugins/marcusolsson-json-datasource/)
- [Grafana Dashboard API](https://grafana.com/docs/grafana/latest/developers/http_api/dashboard/)
