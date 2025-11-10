# Quick Start: Visualizing SC Market Stats in Grafana/Grafterm

## TL;DR Setup

### 1. Install Dependencies

```bash
# Install Grafana (if not already installed)
# macOS
brew install grafana

# Linux
# Follow: https://grafana.com/docs/grafana/latest/setup-grafana/installation/

# Install grafterm
go install github.com/slok/grafterm@latest
```

### 2. Start Grafana

```bash
# Start Grafana service
brew services start grafana  # macOS
# OR
sudo systemctl start grafana-server  # Linux

# Grafana will be available at http://localhost:3000
# Default login: admin/admin (change on first login)
```

### 3. Add JSON Datasource in Grafana

Go to http://localhost:3000 ? **Configuration ? Data Sources ? Add data source**

Select **JSON API** plugin (install if needed: https://grafana.com/grafana/plugins/marcusolsson-json-datasource/)

**Configuration:**

- **Name**: `SC Market API`
- **URL**: `https://api.sc-market.space` (or your API URL)
- **HTTP Method**: `GET`
- **Time field path**: `datapoints[1]`
- **Value field path**: `datapoints[0]`

**Authentication** (for admin endpoints):

- Enable **Header Auth**
- **Header Name**: `Authorization`
- **Header Value**: `Bearer YOUR_ADMIN_TOKEN`

### 4. Create Dashboard with Queries

#### Panel 1: Daily Activity

**Query A:**

```json
{
  "query": "/api/v1/admin/activity?format=grafana",
  "type": "json",
  "fields": [
    {
      "jsonPath": "$[?(@.target == 'daily_activity')]",
      "type": "time",
      "path": "datapoints[*][1]"
    },
    {
      "jsonPath": "$[?(@.target == 'daily_activity')]",
      "type": "number",
      "path": "datapoints[*][0]"
    }
  ]
}
```

#### Panel 2: Order Status Trends

**Query A:**

```json
{
  "query": "/api/v1/admin/orders/analytics?format=grafana",
  "type": "json",
  "fields": [
    {
      "jsonPath": "$[?(@.target =~ /daily_orders_fulfilled/)]",
      "type": "time",
      "path": "datapoints[*][1]"
    },
    {
      "jsonPath": "$[?(@.target =~ /daily_orders_fulfilled/)]",
      "type": "number",
      "path": "datapoints[*][0]"
    }
  ]
}
```

#### Panel 3: Total Orders (Stat)

**Query A:**

```json
{
  "query": "/api/v1/market/stats?format=grafana",
  "type": "json",
  "fields": [
    {
      "jsonPath": "$[?(@.target == 'total_orders')]",
      "type": "number",
      "path": "datapoints[0][0]"
    }
  ]
}
```

### 5. Use Grafterm to View Dashboard

```bash
# Get your Grafana API token from:
# http://localhost:3000 ? Configuration ? API Keys ? New API Key

# Run grafterm
grafterm dashboard dashboard.yaml
```

**Example `dashboard.yaml`:**

```yaml
grafana:
  url: http://localhost:3000
  token: YOUR_GRAFANA_API_TOKEN

dashboard:
  title: "SC Market Stats"
  refresh: 30s

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
          jsonPath: "$[?(@.target == 'daily_activity')]"
```

## Available Endpoints Summary

| Endpoint                                            | Metrics                                                                             | Auth Required |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| `/api/v1/admin/activity?format=grafana`             | daily_activity, weekly_activity, monthly_activity                                   | Yes           |
| `/api/v1/admin/orders/analytics?format=grafana`     | daily/weekly/monthly orders (total, in_progress, fulfilled, cancelled, not_started) | Yes           |
| `/api/v1/admin/membership/analytics?format=grafana` | daily/weekly/monthly membership stats (new, cumulative, RSI verified/unverified)    | Yes           |
| `/api/v1/market/stats?format=grafana`               | total_orders, total_order_value, week_orders, week_order_value                      | No            |

## Testing Endpoints

```bash
# Test public endpoint
curl "https://api.sc-market.space/api/v1/market/stats?format=grafana"

# Test admin endpoint (replace YOUR_TOKEN)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://api.sc-market.space/api/v1/admin/activity?format=grafana"
```

## Getting Admin Token

To get an admin token, you'll need to authenticate through your API's admin authentication endpoint. Check your API documentation for the authentication flow.
