# Admin Alerts Feature

## Overview

The Admin Alerts feature allows administrators to create and send notifications to users based on different targeting criteria. These alerts appear as notifications in the user's notification feed and can be targeted to specific user groups.

## Features

- **Admin-only access**: Only users with admin role can create, view, update, and delete alerts
- **Flexible targeting**: Alerts can be sent to different user groups:
  - `all_users`: All non-banned users
  - `org_members`: Users who are members of any organization
  - `org_owners`: Users who own organizations
  - `admins_only`: Only admin users
  - `specific_org`: Members of a specific organization
- **Markdown support**: Alert content supports markdown formatting
- **Optional links**: Alerts can include optional URL links for additional information
- **Notification integration**: Alerts automatically create notifications for target users
- **CRUD operations**: Full create, read, update, delete functionality
- **Pagination**: Support for paginated listing of alerts
- **Filtering**: Filter alerts by target type and active status

## Database Schema

### admin_alerts table

```sql
CREATE TABLE public.admin_alerts (
    alert_id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    link character varying(500),
    target_type character varying(30) NOT NULL,
    target_contractor_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL
);
```

### Constraints

- `target_type` must be one of: `all_users`, `org_members`, `org_owners`, `admins_only`, `specific_org`
- `target_contractor_id` is required when `target_type` is `specific_org`
- `link` must be a valid URL format when provided (optional field)
- Foreign key constraints to `accounts` and `contractors` tables

## API Endpoints

### Create Alert

```
POST /api/v1/admin/alerts
```

**Request Body:**

```json
{
  "title": "System Maintenance Notice",
  "content": "We will be performing system maintenance on **Saturday at 2 AM UTC**.",
  "link": "https://example.com/maintenance-notice",
  "target_type": "all_users",
  "target_contractor_id": null
}
```

### Get Alerts (Paginated)

```
GET /api/v1/admin/alerts?page=0&pageSize=20&target_type=all_users&active=true
```

### Get Specific Alert

```
GET /api/v1/admin/alerts/:alert_id
```

### Update Alert

```
PATCH /api/v1/admin/alerts/:alert_id
```

**Request Body:**

```json
{
  "title": "Updated Title",
  "content": "Updated content",
  "link": "https://example.com/updated-notice",
  "target_type": "org_members",
  "active": false
}
```

### Delete Alert

```
DELETE /api/v1/admin/alerts/:alert_id
```

## Link Field

The `link` field is an optional field that allows admins to include a URL with their alerts. This is useful for:

- **Documentation links**: Point users to detailed information
- **Action links**: Direct users to specific pages or forms
- **External resources**: Link to relevant external websites
- **Support pages**: Guide users to help or contact information

### Link Validation

- Must be a valid URL format (e.g., `https://example.com/page`)
- Maximum length of 500 characters
- Optional field - can be `null` or omitted
- Validated on both create and update operations

### Examples

```json
{
  "title": "New Feature Available",
  "content": "Check out our new dashboard feature!",
  "link": "https://app.example.com/dashboard",
  "target_type": "all_users"
}
```

## User Targeting Logic

### all_users

- All users except banned ones (`accounts.banned = false`)

### org_members

- Users who are members of any organization
- Joins `accounts` with `contractor_members` table
- Excludes banned users

### org_owners

- Users who own organizations
- Looks for users with `role = 'owner'` in `contractor_members` table
- Excludes banned users

### admins_only

- Only users with `role = 'admin'` in accounts table
- Excludes banned users

### specific_org

- Members of a specific organization
- Requires `target_contractor_id` to be provided
- Joins `accounts` with `contractor_members` table
- Filters by the specific contractor ID
- Excludes banned users

## Usage Examples

### Create an alert for all users

```javascript
const response = await fetch("/api/v1/admin/alerts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer YOUR_ADMIN_TOKEN",
  },
  body: JSON.stringify({
    title: "Welcome to the Platform",
    content:
      "Welcome to our new platform! We hope you enjoy using our services.",
    link: "https://example.com/welcome-guide",
    target_type: "all_users",
  }),
})
```

### Create an alert for organization members

```javascript
const response = await fetch("/api/v1/admin/alerts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer YOUR_ADMIN_TOKEN",
  },
  body: JSON.stringify({
    title: "Organization Update",
    content:
      "We've updated our organization features. Check out the new tools!",
    link: "https://example.com/org-features",
    target_type: "org_members",
  }),
})
```

### Create an alert for a specific organization

```javascript
const response = await fetch("/api/v1/admin/alerts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer YOUR_ADMIN_TOKEN",
  },
  body: JSON.stringify({
    title: "Organization-Specific Notice",
    content: "This notice is specifically for your organization members.",
    link: "https://example.com/org-specific-info",
    target_type: "specific_org",
    target_contractor_id: "123e4567-e89b-12d3-a456-426614174000",
  }),
})
```

## Security

- All endpoints require admin authentication
- Only users with `role = 'admin'` can access these endpoints
- Input validation ensures proper data types and constraints
- SQL injection protection through parameterized queries

## Error Handling

The API returns appropriate HTTP status codes:

- `200`: Success
- `400`: Bad request (validation errors)
- `401`: Unauthorized (missing or invalid token)
- `403`: Forbidden (not an admin)
- `404`: Not found (alert doesn't exist)
- `500`: Internal server error

## Testing

Run the test script to verify functionality:

```bash
node test-admin-alerts.js
```

This will test all CRUD operations and user targeting functionality.

## Migration

To set up the admin alerts feature, run the database migration:

```sql
-- Run config/postgres/5-admin-alerts.sql
```

This will:

1. Add the new notification action for admin alerts
2. Create the admin_alerts table
3. Set up all necessary constraints and indexes
