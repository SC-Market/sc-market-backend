# Admin Endpoints

This document describes the available admin endpoints for the SC Market Backend.

## Authentication

All admin endpoints require admin authentication via the `adminAuthorized` middleware.

## Available Endpoints

### GET /admin/activity

Returns activity statistics for the platform.

**Response:**

```json
{
  "data": {
    "daily": [...],
    "weekly": [...],
    "monthly": [...]
  }
}
```

### GET /admin/orders/analytics

Returns comprehensive order analytics for the admin panel.

**Response:**

```json
{
  "data": {
    "daily_totals": [
      {
        "date": "2024-01-01",
        "total": 15,
        "in_progress": 5,
        "fulfilled": 8,
        "cancelled": 1,
        "not_started": 1
      }
    ],
    "weekly_totals": [...],
    "monthly_totals": [...],
    "top_contractors": [
      {
        "name": "Contractor Name",
        "fulfilled_orders": 25,
        "total_orders": 30
      }
    ],
    "top_users": [
      {
        "username": "username",
        "fulfilled_orders": 10,
        "total_orders": 12
      }
    ],
    "summary": {
      "total_orders": 150,
      "active_orders": 45,
      "completed_orders": 95,
      "total_value": 50000
    }
  }
}
```

## Data Structure

### Time Series Data

- **daily_totals**: Last 30 days of order statistics
- **weekly_totals**: Last 12 weeks of order statistics
- **monthly_totals**: Last 12 months of order statistics

Each time series entry includes:

- `date`: ISO date string
- `total`: Total orders for that period
- `in_progress`: Orders currently in progress
- `fulfilled`: Completed orders
- `cancelled`: Cancelled orders
- `not_started`: Orders not yet started

### Top Performers

- **top_contractors**: Top 10 contractors by fulfilled orders
- **top_users**: Top 10 users by fulfilled orders

### Summary Statistics

- **total_orders**: Total number of orders in the system
- **active_orders**: Orders currently in progress or not started
- **completed_orders**: Total fulfilled orders
- **total_value**: Total value of all fulfilled orders

## Usage Examples

### Frontend Integration

```typescript
// Fetch order analytics
const response = await fetch("/admin/orders/analytics", {
  headers: {
    Authorization: `Bearer ${adminToken}`,
  },
})

const analytics = await response.json()

// Use the data for charts and dashboards
const { daily_totals, summary, top_contractors } = analytics.data
```

### Chart Data Preparation

```typescript
// Prepare data for chart libraries
const chartData = daily_totals.map((day) => ({
  date: day.date,
  total: day.total,
  inProgress: day.in_progress,
  fulfilled: day.fulfilled,
  cancelled: day.cancelled,
  notStarted: day.not_started,
}))
```
