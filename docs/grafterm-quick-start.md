# Quick Start: Using Grafterm with SC Market API

Use grafterm directly with your API endpoints - no Grafana required!

## Step 1: Install Grafterm

```bash
# Using Go
go install github.com/slok/grafterm@latest

# Or download from: https://github.com/slok/grafterm/releases
```

## Step 2: Start the API Adapter

The adapter converts your Grafana JSON API responses to Prometheus format:

```bash
# Start the adapter (in one terminal)
ADMIN_TOKEN=your_token_here yarn tsx scripts/grafterm-api-adapter.ts
```

The adapter runs on `http://localhost:9091` by default.

## Step 3: Run Grafterm

```bash
# Basic usage
grafterm -c docs/sc-market-grafterm-dashboard.json

# With auto-refresh every 30 seconds
grafterm -c docs/sc-market-grafterm-dashboard.json -r 30s

# View last 7 days of data
grafterm -c docs/sc-market-grafterm-dashboard.json -d 7d

# Debug mode (if something isn't working)
grafterm -c docs/sc-market-grafterm-dashboard.json --debug
```

## What You'll See

- **Daily/Weekly/Monthly Activity** graphs
- **Order Trends** (fulfilled, in-progress)
- **Homepage Stats** (total orders, order value, week stats)

## Configuration

### Environment Variables

**For the adapter:**

- `API_URL` - Your API base URL (default: `https://api.sc-market.space`)
- `ADMIN_TOKEN` - Admin token (required for admin endpoints)
- `PORT` - Adapter port (default: `9091`)

**For grafterm:**

- Use `-u` flag to specify custom datasources file if needed

### Custom Datasources (Optional)

If you want to override the dashboard datasource:

Create `~/.grafterm/datasources.json`:

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

Then run:

```bash
grafterm -c docs/sc-market-grafterm-dashboard.json -u ~/.grafterm/datasources.json
```

## Troubleshooting

**No data showing?**

- Make sure the adapter is running
- Check adapter logs for errors
- Use `--debug` flag: `grafterm -c dashboard.json --debug`
- View logs: `tail -f grafterm.log`

**Authentication errors?**

- Set `ADMIN_TOKEN` environment variable
- Verify token is valid: `curl -H "Authorization: Bearer TOKEN" https://api.sc-market.space/api/v1/admin/activity?format=grafana`

**Connection refused?**

- Ensure adapter is running on expected port
- Check `PORT` environment variable if using custom port

## Exit

Press `q` or `Esc` to exit grafterm.

## Full Documentation

See `docs/grafterm-direct-usage.md` for complete documentation.
