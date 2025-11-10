# Grafterm Commands - Quick Reference

## Step-by-Step Commands

### 1. Install Grafterm

```bash
go install github.com/slok/grafterm@latest
```

### 2. Ensure Grafana is Running

```bash
# Check if Grafana is running
curl http://localhost:3000/api/health

# Start Grafana if needed (macOS)
brew services start grafana

# Start Grafana if needed (Linux)
sudo systemctl start grafana-server
```

### 3. Get Grafana API Token

1. Go to http://localhost:3000
2. Login (default: admin/admin)
3. Go to **Configuration ? API Keys ? New API Key**
4. Name: `grafterm`, Role: `Admin`, Add key
5. Copy the token

### 4. Configure Dashboard File

Edit `docs/sc-market-dashboard.yaml` and replace `YOUR_GRAFANA_API_TOKEN_HERE` with your actual token.

Also ensure the datasource name matches what you configured in Grafana (default: `SC Market API`).

### 5. Sync Dashboard to Grafana (First Time)

```bash
# Navigate to your project directory
cd /path/to/sc-market-backend

# Sync the dashboard to Grafana
grafterm sync docs/sc-market-dashboard.yaml
```

This creates the dashboard in Grafana.

### 6. View Dashboard in Terminal

```bash
# View the dashboard in grafterm
grafterm dashboard docs/sc-market-dashboard.yaml
```

Or if the dashboard is already in Grafana:

```bash
# View by dashboard ID (check Grafana URL after sync)
grafterm dashboard --id 1
```

## Alternative: Direct Grafana Dashboard View

If you prefer to view an existing dashboard:

```bash
# List all dashboards
grafterm list

# View specific dashboard by ID
grafterm dashboard --id DASHBOARD_ID
```

## Common Commands

```bash
# Sync dashboard to Grafana
grafterm sync dashboard.yaml

# View dashboard
grafterm dashboard dashboard.yaml

# View dashboard by ID
grafterm dashboard --id 1

# List all dashboards
grafterm list

# Show help
grafterm --help
```

## Keyboard Shortcuts in Grafterm

Once running, use these keys:

- `?` - Show help
- Arrow keys - Navigate panels
- `Enter` - Focus on panel
- `Esc` - Back/Exit
- `q` - Quit

## Troubleshooting

### "Connection refused" error

```bash
# Make sure Grafana is running
curl http://localhost:3000/api/health
```

### "Unauthorized" error

- Check your API token is correct
- Ensure token has Admin role in Grafana

### "Datasource not found" error

- Verify datasource name matches exactly (`SC Market API`)
- Check datasource is configured in Grafana UI

### Dashboard not syncing

```bash
# Try with verbose output
grafterm sync --verbose docs/sc-market-dashboard.yaml
```
