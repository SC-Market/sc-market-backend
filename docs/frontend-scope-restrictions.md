# Frontend Scope Restrictions Guide

## Overview

Certain API token scopes are restricted to admin users only. The frontend should hide or disable these scopes for non-admin users when creating or editing API tokens.

## Admin-Only Scopes

The following scopes can only be assigned by admin users:

### Admin Scopes

- `admin` - Full admin access
- `admin:read` - Read admin endpoints
- `admin:write` - Write admin endpoints
- `admin:spectrum` - Spectrum migration access
- `admin:stats` - Access to stats/metrics endpoints (Prometheus, Grafana)

### Moderation Scopes

- `moderation:read` - Read moderation reports
- `moderation:write` - Submit moderation reports

## Backend Enforcement

The backend enforces these restrictions:

1. **Token Creation** (`POST /api/v1/tokens`):

   - Returns `403 Forbidden` if non-admin tries to create token with admin/moderation scopes
   - Error message: "Only admins can create tokens with admin scopes" or "Only admins can create tokens with moderation scopes"

2. **Token Update** (`PUT /api/v1/tokens/:tokenId`):
   - Same restrictions apply when updating token scopes

## Frontend Implementation

### Option 1: Filter Scopes Based on User Role

```typescript
// When displaying scope options in the UI
const allScopes = [
  "profile:read",
  "profile:write",
  // ... other scopes
  "moderation:read",
  "moderation:write",
  "admin:read",
  "admin:write",
  "admin:spectrum",
  "admin:stats",
  "admin",
]

const availableScopes =
  user.role === "admin"
    ? allScopes
    : allScopes.filter(
        (scope) =>
          !scope.startsWith("admin:") &&
          scope !== "admin" &&
          scope !== "moderation:read" &&
          scope !== "moderation:write",
      )
```

### Option 2: Use the Available Scopes Endpoint

```typescript
// GET /api/v1/tokens/scopes
// Returns: { data: { scopes: string[] } }
// Automatically filtered based on user role

const response = await fetch("/api/v1/tokens/scopes", {
  headers: { Authorization: `Bearer ${sessionToken}` },
})
const { scopes } = await response.json()
// Use `scopes` array for UI options
```

### Recommended UI Behavior

1. **Hide Admin/Moderation Scopes**: Don't show these options to non-admin users
2. **Disable Instead of Hide** (Alternative): If you want to show what's available, disable the checkboxes with a tooltip: "Admin only"
3. **Validation**: Even if hidden/disabled, the backend will reject invalid requests, providing defense in depth

## Example: React Component

```tsx
interface ScopeSelectorProps {
  user: User
  selectedScopes: string[]
  onChange: (scopes: string[]) => void
}

const ScopeSelector: React.FC<ScopeSelectorProps> = ({
  user,
  selectedScopes,
  onChange,
}) => {
  const allScopes = [
    // Regular scopes
    "profile:read",
    "profile:write",
    "market:read",
    "market:write",
    // ... etc
    // Admin-only scopes
    "moderation:read",
    "moderation:write",
    "admin:read",
    "admin:write",
    "admin:spectrum",
    "admin:stats",
    "admin",
  ]

  const isAdminOnly = (scope: string) => {
    return (
      scope.startsWith("admin:") ||
      scope === "admin" ||
      scope === "moderation:read" ||
      scope === "moderation:write"
    )
  }

  const availableScopes =
    user.role === "admin"
      ? allScopes
      : allScopes.filter((scope) => !isAdminOnly(scope))

  return (
    <div>
      {availableScopes.map((scope) => (
        <label key={scope}>
          <input
            type="checkbox"
            checked={selectedScopes.includes(scope)}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...selectedScopes, scope])
              } else {
                onChange(selectedScopes.filter((s) => s !== scope))
              }
            }}
          />
          {scope}
        </label>
      ))}
    </div>
  )
}
```

## API Endpoint

**GET `/api/v1/tokens/scopes`**

Returns available scopes for the authenticated user, automatically filtered by role.

**Response:**

```json
{
  "data": {
    "scopes": [
      "profile:read",
      "profile:write"
      // ... filtered based on user role
    ]
  }
}
```

**Auth:** Requires `userAuthorized` middleware (authenticated user)

## Testing

To test scope restrictions:

1. **As Non-Admin User:**

   ```bash
   curl -X POST /api/v1/tokens \
     -H "Authorization: Bearer <non-admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Test", "scopes": ["admin:stats"]}'
   # Should return 403 Forbidden
   ```

2. **As Admin User:**
   ```bash
   curl -X POST /api/v1/tokens \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"name": "Test", "scopes": ["admin:stats"]}'
   # Should succeed
   ```
