# White-Label Focus Modes Plan

## Overview

Add two white-label modes for orgs: **public** (external storefront) and **internal** (members-only workspace). Add org-controlled homepage, sidebar tab visibility, and custom sidebar tabs.

## Current State

- White-label detected by hostname → resolves to `CURRENT_CUSTOM_ORG` (spectrum_id)
- Landing page always redirects to `/contractor/{spectrum_id}` (org public page)
- Sidebar filtered by `custom: true/false` flags — same for all white-label orgs
- All routes accessible regardless of white-label — filtering is UI-only
- No login requirement on white-label
- `org_premium_tiers` table has: `tier`, `custom_domain`, `granted_at`, `revoked_at`

## Target State

### Two Focus Modes

**Public focus** (default — current behavior):
- No login required to browse
- Landing page: org public page (current behavior) or org-configured page
- Shows: market, services, contracts, org info
- Login prompted only for actions (place order, message, etc.)

**Internal focus**:
- Login required to see anything — unauthenticated users see a branded login page
- Must be an org member to access (non-members see "request access" or redirect to main site)
- Landing page: org-configured (default: dashboard/orders)
- Shows: orders, dashboard, messaging, stock management, org admin
- Market visible but scoped to internal listings

### Org-Controlled Homepage

Org admins choose which page loads at `/` on their white-label domain. Options:
- Org public page (default for public mode)
- Market listings
- Dashboard / orders (default for internal mode)
- Services
- Custom URL path

### Sidebar Tab Control

Org admins can:
- Enable/disable any standard sidebar tab for their white-label
- Reorder tabs
- Add custom tabs (label + URL path or external link)
- "Back to SC Market" tab is always visible and cannot be disabled

## Database Changes

### Migration: `org_whitelabel_config`

```sql
CREATE TABLE org_whitelabel_config (
  contractor_id UUID PRIMARY KEY REFERENCES contractors(contractor_id) ON DELETE CASCADE,
  focus_mode VARCHAR(20) NOT NULL DEFAULT 'public',  -- 'public' | 'internal'
  homepage_path VARCHAR(500) DEFAULT NULL,            -- NULL = mode default
  require_membership BOOLEAN NOT NULL DEFAULT false,  -- internal mode: require org membership
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES accounts(user_id)
);
```

### Migration: `org_sidebar_config`

```sql
CREATE TABLE org_sidebar_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
  -- For standard tabs: the sidebar item key (e.g., "market", "orders", "services")
  -- For custom tabs: NULL
  standard_tab_key VARCHAR(100),
  -- For custom tabs
  custom_label VARCHAR(200),
  custom_path VARCHAR(500),       -- internal path or external URL
  custom_icon VARCHAR(100),       -- MUI icon name
  is_external BOOLEAN DEFAULT false,
  -- Shared
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(contractor_id, standard_tab_key)
);
CREATE INDEX idx_org_sidebar_config_contractor ON org_sidebar_config(contractor_id);
```

## Backend Changes

### 1. Domain Resolution Enhancement

Update `GET /api/domain/:hostname` to also return:
```json
{
  "spectrum_id": "...",
  "contractor_id": "...",
  "name": "...",
  "focus_mode": "public" | "internal",
  "homepage_path": "/market" | null,
  "require_membership": false
}
```

### 2. Sidebar Config API

New endpoints (require `manage_org_details` permission):
```
GET    /api/contractors/:spectrum_id/whitelabel-config
PUT    /api/contractors/:spectrum_id/whitelabel-config
GET    /api/contractors/:spectrum_id/sidebar-config
PUT    /api/contractors/:spectrum_id/sidebar-config
```

### 3. Membership Check Endpoint

For internal mode, need a fast check:
```
GET /api/contractors/:spectrum_id/membership-check
```
Returns `{ is_member: boolean }` for the authenticated user. Already partially exists via contractor member queries.

## Frontend Changes

### 1. Domain Resolution Cache Update

`CustomDomain.ts` — cache `focus_mode`, `homepage_path`, `require_membership` alongside `spectrum_id`.

### 2. Internal Mode Auth Gate

New component: `WhiteLabelAuthGate`
- Wraps the entire app when `IS_CUSTOM_DOMAIN && focus_mode === "internal"`
- If not logged in → show branded login page (org theme + logo + login buttons)
- If logged in but `require_membership && !is_member` → show "request access" page
- If logged in and authorized → render children

### 3. Homepage Control

`LandingPage.tsx` — instead of always redirecting to `/contractor/{spectrum_id}`:
```typescript
if (CURRENT_CUSTOM_ORG) {
  const config = getWhiteLabelConfig()
  if (config.homepage_path) {
    navigate(config.homepage_path)
  } else if (config.focus_mode === "internal") {
    navigate("/dashboard")
  } else {
    navigate(`/contractor/${CURRENT_CUSTOM_ORG}`)
  }
}
```

### 4. Sidebar Customization

Update `sidebarFilters.ts`:
- Fetch org sidebar config on white-label domains
- Filter standard tabs by `enabled` flag from config
- Insert custom tabs at configured `sort_order`
- Always include "Back to SC Market" tab regardless of config

New admin UI: `OrgSidebarSettings.tsx`
- Toggle standard tabs on/off
- Drag-to-reorder
- Add/edit/remove custom tabs (label, path, icon, external flag)
- Preview sidebar

### 5. Focus Mode Admin UI

Add to org settings (alongside theme editor):
- Radio: Public / Internal
- Homepage path selector (dropdown of available pages + custom input)
- Toggle: Require org membership (only for internal mode)

## Sidebar Tab Keys (Standard)

These are the keys org admins can enable/disable:

| Key | Label | Default (Public) | Default (Internal) |
|-----|-------|-------------------|---------------------|
| `market` | Player Market | ✅ | ✅ |
| `services` | Contractor Services | ✅ | ✅ |
| `contracts` | Open Contracts | ✅ | ❌ |
| `orders_placed` | Orders I've Placed | ✅ | ✅ |
| `orders_assigned` | Orders Assigned to Me | ✅ | ✅ |
| `org_orders` | Org Orders | ❌ | ✅ |
| `dashboard` | Dashboard | ❌ | ✅ |
| `messaging` | Messaging | ✅ | ✅ |
| `manage_listings` | Manage Listings | ❌ | ✅ |
| `manage_stock` | Manage Stock | ❌ | ✅ |
| `manage_services` | Manage Services | ❌ | ✅ |
| `availability` | Availability | ❌ | ✅ |
| `org_settings` | Organization Settings | ❌ | ✅ |
| `sc_market_home` | Back to SC Market | ✅ (always) | ✅ (always) |

## Implementation Order

1. **Database migrations** — `org_whitelabel_config` + `org_sidebar_config` tables
2. **Backend API** — CRUD for whitelabel config + sidebar config, update domain resolution
3. **Frontend: domain resolution** — cache new fields
4. **Frontend: auth gate** — `WhiteLabelAuthGate` for internal mode
5. **Frontend: homepage control** — update `LandingPage.tsx`
6. **Frontend: sidebar filtering** — read org sidebar config, apply
7. **Frontend: admin UI** — focus mode settings + sidebar editor
8. **Testing** — both modes end-to-end

## Estimated Effort

| Phase | Duration |
|-------|----------|
| 1-2. DB + Backend API | 1 day |
| 3-5. Frontend core (auth gate, homepage, sidebar) | 2 days |
| 6. Admin UI (settings + sidebar editor) | 1.5 days |
| 7. Testing | 0.5 day |
| **Total** | **~5 days** |
