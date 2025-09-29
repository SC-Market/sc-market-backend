# API Token Scope Validation Implementation Plan

## Overview
This document outlines the comprehensive plan for implementing scope validation across all API endpoints to ensure proper access control for API tokens.

## Current Status
- ✅ Token authentication system implemented
- ✅ Basic scope validation middleware exists (`requireScopes`)
- ✅ Contractor access control middleware exists (`requireContractorAccess`)
- ❌ **Scope validation not yet applied to endpoints**

## Phase 1: Endpoint Audit & Categorization

### Identified Route Files
1. `profiles/profiles.ts` - User profile management
2. `market/market.ts` - Market listings and transactions
3. `orders/orders.ts` - Order management
4. `contractors/contractors.ts` - Organization management
5. `services/services.ts` - Service listings
6. `offers/offers.ts` - Offer management
7. `chats/chats.ts` - Chat functionality
8. `notifications/notification.ts` - Notification system
9. `moderation/moderation.ts` - Content moderation
10. `admin/admin.ts` - Administrative functions
11. `admin/alerts.ts` - Admin alerts
12. `admin/spectrum-migration.ts` - Spectrum migration
13. `recruiting/recruiting.ts` - Recruitment posts
14. `comments/comments.ts` - Comment system
15. `transactions/transactions.ts` - Financial transactions
16. `deliveries/deliveries.ts` - Delivery management
17. `contracts/contracts.ts` - Contract management
18. `commodities/commodities.ts` - Commodity data
19. `ships/ships.ts` - Ship management
20. `shops/shops.ts` - Shop functionality
21. `starmap/starmap.ts` - Star map data
22. `wiki/wiki.ts` - Wiki functionality
23. `tokens/tokens.ts` - Token management (already implemented)

## Phase 2: Scope Categories & Mapping

### Scope Categories
Based on our existing scope definitions:

#### Core Scopes
- `profile:read` - Read user profile data
- `profile:write` - Modify user profile data
- `market:read` - Read market listings and data
- `market:write` - Create/modify market listings
- `market:purchase` - Purchase items from market
- `market:photos` - Manage market listing photos
- `orders:read` - Read order data
- `orders:write` - Create/modify orders
- `orders:reviews` - Write order reviews
- `contractors:read` - Read contractor/organization data
- `contractors:write` - Modify contractor data
- `contractors:members` - Manage contractor members
- `contractors:webhooks` - Manage contractor webhooks
- `contractors:blocklist` - Manage contractor blocklist
- `services:read` - Read service listings
- `services:write` - Create/modify services
- `services:photos` - Manage service photos
- `offers:read` - Read offers
- `offers:write` - Create/modify offers
- `chats:read` - Read chat messages
- `chats:write` - Send chat messages
- `notifications:read` - Read notifications
- `notifications:write` - Manage notifications
- `moderation:read` - Read moderation reports
- `moderation:write` - Submit moderation reports

#### Special Scopes
- `readonly` - Read-only access to all read endpoints
- `full` - Full access to all non-admin endpoints
- `admin` - Full access including admin endpoints

### Endpoint-to-Scope Mapping

#### Public Endpoints (No scope validation needed)
- `GET /api/profile/user/:username` → Public user profile
- `GET /api/market/stats` → Public market statistics
- `GET /api/contractors` → Public contractor list
- `GET /api/services` → Public service listings
- `GET /api/recruiting` → Public recruitment posts
- `GET /api/starmap` → Public star map data
- `GET /api/commodities` → Public commodity data

#### Private Endpoints (Require scope validation)

#### Profile Endpoints (`/api/profile`)
- `GET /api/profile` → `profile:read` (authenticated user's profile)
- `PUT /api/profile` → `profile:write`
- `GET /api/profile/availability` → `profile:read`
- `PUT /api/profile/availability` → `profile:write`

#### Market Endpoints (`/api/market`)
- `GET /api/market/*` → `market:read`
- `POST /api/market/*` → `market:write`
- `PUT /api/market/*` → `market:write`
- `DELETE /api/market/*` → `market:write`

#### Orders Endpoints (`/api/orders`)
- `GET /api/orders/*` → `orders:read`
- `POST /api/orders/*` → `orders:write`
- `PUT /api/orders/*` → `orders:write`
- `DELETE /api/orders/*` → `orders:write`

#### Contractors Endpoints (`/api/contractors`)
- `GET /api/contractors/*` → `contractors:read`
- `POST /api/contractors/*` → `contractors:write`
- `PUT /api/contractors/*` → `contractors:write`
- `DELETE /api/contractors/*` → `contractors:write`

#### Services Endpoints (`/api/services`)
- `GET /api/services/*` → `services:read`
- `POST /api/services/*` → `services:write`
- `PUT /api/services/*` → `services:write`
- `DELETE /api/services/*` → `services:write`

#### Offers Endpoints (`/api/offers`)
- `GET /api/offers/*` → `offers:read`
- `POST /api/offers/*` → `offers:write`
- `PUT /api/offers/*` → `offers:write`
- `DELETE /api/offers/*` → `offers:write`

#### Chats Endpoints (`/api/chats`)
- `GET /api/chats/*` → `chats:read`
- `POST /api/chats/*` → `chats:write`
- `PUT /api/chats/*` → `chats:write`
- `DELETE /api/chats/*` → `chats:write`

#### Notifications Endpoints (`/api/notification`)
- `GET /api/notification/*` → `notifications:read`
- `POST /api/notification/*` → `notifications:write`
- `PUT /api/notification/*` → `notifications:write`
- `DELETE /api/notification/*` → `notifications:write`

#### Moderation Endpoints (`/api/moderation`)
- `GET /api/moderation/*` → `moderation:read`
- `POST /api/moderation/*` → `moderation:write`

#### Admin Endpoints (`/api/admin`)
- `GET /api/admin/*` → `admin` scope required
- `POST /api/admin/*` → `admin` scope required
- `PUT /api/admin/*` → `admin` scope required
- `DELETE /api/admin/*` → `admin` scope required

## Phase 3: Implementation Strategy

### Important Principle: Public vs Private Endpoints
- **Public endpoints**: Should remain public regardless of token permissions
- **Private endpoints**: Require authentication AND scope validation for tokens
- **Scope validation**: Only applies to private/authenticated endpoints

### Endpoint Categories:
1. **Public endpoints**: No authentication required, accessible to everyone
2. **Authenticated endpoints**: Require authentication (session OR token)
3. **Token-only endpoints**: Require token authentication (no session access)

### Step 1: Enhanced Middleware Creation
Create comprehensive middleware functions:

```typescript
// Enhanced scope validation with better error messages
export function requireScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthRequest
    
    // Skip validation for session-based auth (full access)
    if (authReq.authMethod === 'session') {
      return next()
    }
    
    // Token-based auth requires scope validation
    if (!authReq.token) {
      res.status(500).json({ 
        error: "Scope middleware used without token authentication" 
      })
      return
    }

    const userScopes = authReq.token.scopes
    const hasAllScopes = requiredScopes.every(scope =>
      userScopes.includes(scope) ||
      userScopes.includes("admin") ||
      userScopes.includes("full")
    )

    if (!hasAllScopes) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: requiredScopes,
        granted: userScopes,
        endpoint: req.path,
        method: req.method
      })
      return
    }

    next()
  }
}

// Convenience middleware for common patterns
export const requireProfileRead = requireScopes('profile:read')
export const requireProfileWrite = requireScopes('profile:write')
export const requireMarketRead = requireScopes('market:read')
export const requireMarketWrite = requireScopes('market:write')
export const requireOrdersRead = requireScopes('orders:read')
export const requireOrdersWrite = requireScopes('orders:write')
export const requireContractorsRead = requireScopes('contractors:read')
export const requireContractorsWrite = requireScopes('contractors:write')
export const requireServicesRead = requireScopes('services:read')
export const requireServicesWrite = requireScopes('services:write')
export const requireOffersRead = requireScopes('offers:read')
export const requireOffersWrite = requireScopes('offers:write')
export const requireChatsRead = requireScopes('chats:read')
export const requireChatsWrite = requireScopes('chats:write')
export const requireNotificationsRead = requireScopes('notifications:read')
export const requireNotificationsWrite = requireScopes('notifications:write')
export const requireModerationRead = requireScopes('moderation:read')
export const requireModerationWrite = requireScopes('moderation:write')
export const requireAdmin = requireScopes('admin')
```

### Step 2: Endpoint-by-Endpoint Implementation

#### Priority Order:
1. **Profile endpoints** (most commonly used)
2. **Market endpoints** (high traffic)
3. **Orders endpoints** (business critical)
4. **Contractors endpoints** (organization management)
5. **Services endpoints**
6. **Offers endpoints**
7. **Chats endpoints**
8. **Notifications endpoints**
9. **Moderation endpoints**
10. **Admin endpoints**

#### Implementation Pattern:
For each endpoint file:

1. **Import scope middleware**:
   ```typescript
   import { 
     requireProfileRead, 
     requireProfileWrite,
     requireScopes 
   } from "../../../middleware/auth.js"
   ```

2. **Add middleware to routes**:
   ```typescript
   // Before
   profileRouter.get("/", userAuthorized, async (req, res) => { ... })
   
   // After
   profileRouter.get("/", userAuthorized, requireProfileRead, async (req, res) => { ... })
   ```

3. **Handle special cases**:
   - Routes that need multiple scopes: `requireScopes('scope1', 'scope2')`
   - Routes that need contractor access: `requireContractorAccessFromParam()`
   - Routes that should be token-only: Add `requireTokenAuth` middleware

### Step 3: Testing Strategy

#### Automated Testing:
1. **Create test tokens** with different scope combinations
2. **Test each endpoint** with each token type
3. **Verify correct access/denial** for each scope
4. **Test contractor-specific access** restrictions

#### Test Cases:
- ✅ Token with `readonly` scope → Can read, cannot write
- ✅ Token with `profile:read` → Can read profile, cannot access market
- ✅ Token with `full` scope → Can access all non-admin endpoints
- ✅ Token with `admin` scope → Can access all endpoints
- ✅ Token with contractor restrictions → Can only access allowed contractors
- ❌ Token without required scope → Gets 403 error

### Step 4: Documentation

#### Create Permission Matrix:
| Endpoint | Method | Required Scopes | Contractor Access | Token Only |
|----------|--------|----------------|------------------|------------|
| `/api/profile` | GET | `profile:read` | No | No |
| `/api/profile` | PUT | `profile:write` | No | No |
| `/api/market` | GET | `market:read` | No | No |
| `/api/market` | POST | `market:write` | No | No |
| `/api/contractors/:id/members` | GET | `contractors:read` | Yes | No |
| `/api/admin/users` | GET | `admin` | No | No |

## Phase 4: Implementation Timeline

### Week 1: Foundation
- [ ] Create enhanced middleware functions
- [ ] Implement profile endpoints scope validation
- [ ] Test profile endpoints thoroughly

### Week 2: Core Features
- [ ] Implement market endpoints scope validation
- [ ] Implement orders endpoints scope validation
- [ ] Test market and orders endpoints

### Week 3: Organization Features
- [ ] Implement contractors endpoints scope validation
- [ ] Implement services endpoints scope validation
- [ ] Test contractor-specific access

### Week 4: Communication & Admin
- [ ] Implement offers, chats, notifications endpoints
- [ ] Implement moderation endpoints
- [ ] Implement admin endpoints

### Week 5: Testing & Documentation
- [ ] Comprehensive testing of all endpoints
- [ ] Create automated test suite
- [ ] Document complete permission matrix

## Phase 5: Security Considerations

### Token-Only Endpoints
Some endpoints should be token-only (no session access):
- API token management endpoints
- Webhook endpoints
- Third-party integration endpoints

### Contractor Access Control
Endpoints that access contractor-specific data should:
1. Check if token has access to the specific contractor
2. Filter results based on contractor access
3. Return appropriate error for unauthorized contractor access

### Rate Limiting
Consider different rate limits for:
- Session-based requests (normal limits)
- Token-based requests (higher limits for API usage)
- Admin token requests (highest limits)

## Success Criteria

- [ ] All endpoints have appropriate scope validation
- [ ] Token permissions work correctly for all scope combinations
- [ ] Contractor access restrictions work properly
- [ ] Session-based users are not affected
- [ ] Comprehensive test suite passes
- [ ] Documentation is complete and accurate
- [ ] Performance impact is minimal

## Risk Mitigation

### Breaking Changes
- Ensure session-based users continue to work
- Test thoroughly before deployment
- Have rollback plan ready

### Performance Impact
- Monitor response times after implementation
- Optimize middleware if needed
- Consider caching scope lookups

### Security Gaps
- Regular security audits
- Penetration testing
- Monitor for unauthorized access attempts