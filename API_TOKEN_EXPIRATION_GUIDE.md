# API Token Expiration Management Guide

This guide covers all aspects of API token expiration in the SC Market platform.

## Overview

API tokens support optional expiration dates to enhance security and provide automatic cleanup of unused tokens. Expired tokens are automatically rejected during authentication.

## Expiration Features

### 1. **Optional Expiration**
- Tokens can be created with or without expiration dates
- `expires_at` field in database can be `NULL` for non-expiring tokens
- Expiration is enforced during token validation

### 2. **Automatic Validation**
- Every API request with a token checks expiration
- Expired tokens return `401 Unauthorized` with "Invalid or expired token"
- No additional middleware needed - built into authentication

### 3. **Flexible Expiration Management**
- Extend expiration dates for existing tokens
- View expiration status and statistics
- Bulk cleanup of expired tokens

## API Endpoints

### Create Token with Expiration
```http
POST /api/tokens
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "name": "Market Bot",
  "description": "Automated market operations",
  "scopes": ["market:read", "market:write"],
  "expires_at": "2024-12-31T23:59:59Z"
}
```

### Create Non-Expiring Token
```http
POST /api/tokens
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "name": "Long-term Integration",
  "description": "Permanent API access",
  "scopes": ["market:read"],
  "expires_at": null
}
```

### Extend Token Expiration
```http
POST /api/tokens/{token_id}/extend
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "expires_at": "2025-06-30T23:59:59Z"
}
```

### Get Token Statistics
```http
GET /api/tokens/{token_id}/stats
Authorization: Bearer <session_token>
```

**Response:**
```json
{
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Market Bot",
    "created_at": "2024-01-15T10:30:00Z",
    "last_used_at": "2024-01-20T14:22:00Z",
    "expires_at": "2024-12-31T23:59:59Z",
    "is_expired": false,
    "days_since_creation": 5,
    "days_since_last_use": 0,
    "days_until_expiration": 346
  }
}
```

## Expiration Policies

### 1. **Default Expiration Recommendations**
- **Short-term tokens**: 30-90 days (testing, temporary access)
- **Medium-term tokens**: 6-12 months (production integrations)
- **Long-term tokens**: 1-2 years (trusted partners)
- **Non-expiring**: Only for critical system integrations

### 2. **Security Considerations**
- Shorter expiration = better security
- Longer expiration = better user experience
- Balance based on use case and risk tolerance

### 3. **Admin Token Expiration**
- Admin tokens should have shorter expiration periods
- Consider 30-90 days maximum for admin access
- Require regular renewal for admin privileges

## Database Schema

```sql
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMP,  -- NULL = non-expiring
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Cleanup and Maintenance

### 1. **Automatic Cleanup Script**
```bash
# Run cleanup manually
node scripts/cleanup-expired-tokens.js

# Dry run to see what would be deleted
node scripts/cleanup-expired-tokens.js --dry-run
```

### 2. **Scheduled Cleanup (Cron)**
```bash
# Add to crontab for daily cleanup at 2 AM
0 2 * * * cd /path/to/sc-market-backend && node scripts/cleanup-expired-tokens.js
```

### 3. **What Gets Cleaned Up**
- Expired tokens (past `expires_at` date)
- Very old unused tokens (created >1 year ago, never used)
- Orphaned tokens (user deleted but tokens remain)

## Error Handling

### 1. **Expired Token Response**
```json
{
  "error": "Invalid or expired token"
}
```

### 2. **Invalid Expiration Date**
```json
{
  "error": "Invalid expiration date"
}
```

### 3. **Missing Expiration for Extension**
```json
{
  "error": "expires_at is required"
}
```

## Best Practices

### 1. **Token Creation**
- Always set reasonable expiration dates
- Document expiration policy for your application
- Use shorter expiration for sensitive operations

### 2. **Token Management**
- Monitor token usage statistics
- Extend expiration before tokens expire
- Revoke unused tokens promptly

### 3. **Application Integration**
- Handle expiration errors gracefully
- Implement token refresh logic
- Notify users before tokens expire

### 4. **Security**
- Use shorter expiration for admin tokens
- Regularly audit token usage
- Implement rate limiting on token creation

## Example Integration

### JavaScript Token Management
```javascript
class TokenManager {
  constructor(baseUrl, sessionToken) {
    this.baseUrl = baseUrl
    this.sessionToken = sessionToken
  }

  async createToken(name, scopes, expiresInDays = 90) {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)
    
    const response = await fetch(`${this.baseUrl}/api/tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        scopes,
        expires_at: expiresAt.toISOString()
      })
    })
    
    return response.json()
  }

  async extendToken(tokenId, expiresInDays = 90) {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)
    
    const response = await fetch(`${this.baseUrl}/api/tokens/${tokenId}/extend`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expires_at: expiresAt.toISOString()
      })
    })
    
    return response.json()
  }

  async checkTokenStatus(tokenId) {
    const response = await fetch(`${this.baseUrl}/api/tokens/${tokenId}/stats`, {
      headers: {
        'Authorization': `Bearer ${this.sessionToken}`
      }
    })
    
    return response.json()
  }

  async makeApiCall(endpoint, token) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    if (response.status === 401) {
      throw new Error('Token expired or invalid')
    }
    
    return response.json()
  }
}
```

## Monitoring and Alerts

### 1. **Token Expiration Monitoring**
- Track tokens expiring in next 7 days
- Alert users about upcoming expirations
- Monitor token usage patterns

### 2. **Cleanup Monitoring**
- Log cleanup operations
- Track cleanup statistics
- Monitor for cleanup failures

### 3. **Security Monitoring**
- Alert on unusual token creation patterns
- Monitor for expired token usage attempts
- Track token revocation events

## Future Enhancements

### 1. **Automatic Renewal**
- Implement automatic token renewal
- Background job to extend active tokens
- User notification system for renewals

### 2. **Expiration Policies**
- Per-user expiration policies
- Per-scope expiration rules
- Organization-level token policies

### 3. **Advanced Cleanup**
- Soft deletion of expired tokens
- Token archival system
- Detailed cleanup reporting

This comprehensive expiration system provides security, flexibility, and ease of management for API tokens while maintaining a good user experience.