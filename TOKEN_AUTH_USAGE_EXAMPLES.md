# Token Authentication Usage Examples

This document shows how to use the extended authentication middlewares that support both session and token authentication.

## Updated Middleware Functions

All existing middleware functions now support both session and token authentication:

- `userAuthorized` - Works with both session and token auth
- `verifiedUser` - Works with both session and token auth  
- `adminAuthorized` - Works with both session and token auth

## New Scope Validation Middleware

- `requireScopes(...scopes)` - Validates specific scopes (token auth only)
- Pre-built convenience middleware for common patterns

## Usage Examples

### 1. Basic Route (Session + Token Compatible)

```typescript
// This route works with both session and token authentication
router.get('/profile', userAuthorized, async (req, res) => {
  const user = req.user // Populated the same way for both auth methods
  const profile = await getUserProfile(user.user_id)
  res.json({ data: profile })
})
```

### 2. Route with Scope Validation (Token Only)

```typescript
// This route requires specific scopes when using token auth
router.get('/market/mine', 
  userAuthorized,           // Standard auth (session or token)
  requireMarketRead,       // Additional scope validation (token only)
  async (req, res) => {
    const user = req.user
    const listings = await getUserMarketListings(user.user_id)
    res.json({ data: listings })
  }
)
```

### 3. Write Operations with Scopes

```typescript
// Creating market listings requires write scope
router.post('/market/create',
  userAuthorized,           // Must be authenticated
  verifiedUser,            // Must be verified
  requireMarketWrite,      // Must have market write scope
  async (req, res) => {
    const user = req.user
    const listing = await createMarketListing(req.body, user.user_id)
    res.json(listing)
  }
)
```

### 4. Admin Routes with Admin Scopes

```typescript
// Admin routes require admin scopes
router.get('/admin/users',
  adminAuthorized,         // Must be admin user
  requireAdminRead,        // Must have admin read scope
  async (req, res) => {
    const users = await getAllUsers()
    res.json({ data: users })
  }
)
```

### 5. Custom Scope Requirements

```typescript
// Custom scope combinations
router.post('/market/bid',
  userAuthorized,
  verifiedUser,
  requireScopes('market:purchase'), // Custom scope requirement
  async (req, res) => {
    const user = req.user
    const bid = await placeBid(req.body, user.user_id)
    res.json(bid)
  }
)
```

### 6. Multiple Scope Options

```typescript
// Route that accepts multiple scope patterns
router.get('/orders/search',
  userAuthorized,
  requireScopes('orders:read', 'readonly', 'full', 'admin'),
  async (req, res) => {
    const user = req.user
    const orders = await searchOrders(req.query, user.user_id)
    res.json({ data: orders })
  }
)
```

## Request Object Properties

When using token authentication, the request object is enhanced:

```typescript
interface AuthRequest extends Request {
  user?: User                    // Same as session auth
  token?: {                     // Only present with token auth
    id: string
    name: string
    scopes: string[]
    expires_at?: Date
  }
  authMethod?: 'session' | 'token' // Indicates which auth method was used
}
```

## Token Management Endpoints

### Create Token
```http
POST /api/tokens
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "name": "Market Bot",
  "description": "Automated market operations",
  "scopes": ["market:read", "market:write", "market:photos"],
  "expires_at": "2024-12-31T23:59:59Z"
}
```

### List Tokens
```http
GET /api/tokens
Authorization: Bearer <session_token>
```

### Update Token
```http
PUT /api/tokens/{token_id}
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "scopes": ["market:read", "market:write"],
  "expires_at": "2025-01-01T00:00:00Z"
}
```

### Revoke Token
```http
DELETE /api/tokens/{token_id}
Authorization: Bearer <session_token>
```

## Using Tokens

### With curl
```bash
# Using a token instead of session
curl -H "Authorization: Bearer scm_live_abc123def456" \
     https://api.scmarket.com/api/market/mine
```

### With JavaScript
```javascript
const response = await fetch('/api/market/mine', {
  headers: {
    'Authorization': 'Bearer scm_live_abc123def456'
  }
})
```

## Migration Strategy

### Phase 1: Update Existing Routes
```typescript
// Before
router.get('/profile', userAuthorized, getProfile)

// After (no changes needed - works with both auth methods)
router.get('/profile', userAuthorized, getProfile)
```

### Phase 2: Add Scope Validation
```typescript
// Add scope validation to sensitive routes
router.post('/market/create',
  userAuthorized,
  verifiedUser,
  requireMarketWrite,  // New scope requirement
  createMarketListing
)
```

### Phase 3: Token-Only Routes
```typescript
// Routes that only work with tokens (for API integrations)
router.post('/api/bulk/market/create',
  userAuthorized,
  requireScopes('market:write', 'full', 'admin'),
  bulkCreateMarketListings
)
```

## Error Responses

### Invalid Token
```json
{
  "error": "Invalid or expired token"
}
```

### Insufficient Permissions
```json
{
  "error": "Insufficient permissions",
  "required": ["market:write"],
  "granted": ["market:read"]
}
```

### Scope Middleware Misuse
```json
{
  "error": "Scope middleware used without token authentication"
}
```

## Best Practices

1. **Always use `userAuthorized` first** - This ensures authentication
2. **Add scope validation for sensitive operations** - Protect write operations
3. **Use convenience middleware** - `requireMarketWrite` instead of `requireScopes('market:write')`
4. **Test both auth methods** - Ensure routes work with sessions and tokens
5. **Document scope requirements** - Make it clear what scopes are needed

## Available Convenience Middleware

- `requireMarketRead` / `requireMarketWrite`
- `requireOrdersRead` / `requireOrdersWrite`
- `requireProfileRead` / `requireProfileWrite`
- `requireContractorsRead` / `requireContractorsWrite`
- `requireServicesRead` / `requireServicesWrite`
- `requireOffersRead` / `requireOffersWrite`
- `requireChatsRead` / `requireChatsWrite`
- `requireNotificationsRead` / `requireNotificationsWrite`
- `requireModerationRead` / `requireModerationWrite`
- `requireAdminRead` / `requireAdminWrite`