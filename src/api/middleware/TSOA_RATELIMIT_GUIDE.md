# TSOA Rate Limiting Middleware Guide

This guide explains how to use the TSOA-compatible rate limiting middleware adapters in your TSOA controllers.

## Overview

The TSOA rate limiting adapters wrap the existing `enhanced-ratelimiting` middleware to work seamlessly with TSOA's `@Middlewares` decorator. This ensures that rate limiting behavior remains consistent between legacy routes and TSOA-migrated routes.

## Available Rate Limiters

### 1. `tsoaReadRateLimit`
**Use for:** GET endpoints that read data

**Limits:**
- Anonymous: 60 requests/minute
- Authenticated: 60 requests/minute  
- Admin: 60 requests/minute

**Example:**
```typescript
import { tsoaReadRateLimit } from "../middleware/tsoa-ratelimit"

@Route("api/v1/attributes")
export class AttributesController extends BaseController {
  @Get("definitions")
  @Middlewares(tsoaReadRateLimit)
  public async getDefinitions(): Promise<AttributeDefinitionsResponse> {
    // Implementation
  }
}
```

### 2. `tsoaWriteRateLimit`
**Use for:** POST, PUT, DELETE endpoints that modify data

**Limits:**
- Anonymous: 20 requests/minute (3 points per request)
- Authenticated: 60 requests/minute (1 point per request)
- Admin: 60 requests/minute (1 point per request)

**Example:**
```typescript
import { tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit"

@Route("api/v1/attributes")
export class AttributesController extends BaseController {
  @Post("definitions")
  @Security("sessionAuth", ["admin"])
  @Middlewares(tsoaWriteRateLimit)
  public async createDefinition(
    @Body() payload: CreateAttributeDefinitionPayload
  ): Promise<AttributeDefinitionResponse> {
    // Implementation
  }
}
```

### 3. `tsoaCriticalRateLimit`
**Use for:** Admin operations, bulk operations, expensive queries

**Limits:**
- Anonymous: 4 requests/minute (15 points per request)
- Authenticated: 4 requests/minute (15 points per request)
- Admin: 60 requests/minute (1 point per request)

**Example:**
```typescript
import { tsoaCriticalRateLimit } from "../middleware/tsoa-ratelimit"

@Route("api/v1/admin")
export class AdminController extends BaseController {
  @Post("bulk-import")
  @Security("sessionAuth", ["admin"])
  @Middlewares(tsoaCriticalRateLimit)
  public async bulkImport(
    @Body() payload: BulkImportPayload
  ): Promise<BulkImportResponse> {
    // Implementation
  }
}
```

### 4. `tsoaBulkRateLimit`
**Use for:** Endpoints that process multiple items at once

**Limits:**
- Anonymous: 4 requests/minute (15 points per request)
- Authenticated: 4 requests/minute (15 points per request)
- Admin: 60 requests/minute (1 point per request)

**Example:**
```typescript
import { tsoaBulkRateLimit } from "../middleware/tsoa-ratelimit"

@Route("api/v1/market")
export class MarketController extends BaseController {
  @Post("listings/bulk")
  @Security("sessionAuth")
  @Middlewares(tsoaBulkRateLimit)
  public async bulkCreateListings(
    @Body() payload: BulkListingsPayload
  ): Promise<BulkListingsResponse> {
    // Implementation
  }
}
```

### 5. `tsoaCommonWriteRateLimit`
**Use for:** Messages, acknowledgments, and other frequent write operations

**Limits:**
- Anonymous: 60 requests/minute (1 point per request)
- Authenticated: 120 requests/minute (0.5 points per request)
- Admin: 60 requests/minute (1 point per request)

**Example:**
```typescript
import { tsoaCommonWriteRateLimit } from "../middleware/tsoa-ratelimit"

@Route("api/v1/chats")
export class ChatsController extends BaseController {
  @Post("{chatId}/messages")
  @Security("sessionAuth")
  @Middlewares(tsoaCommonWriteRateLimit)
  public async sendMessage(
    @Path() chatId: string,
    @Body() payload: SendMessagePayload
  ): Promise<MessageResponse> {
    // Implementation
  }
}
```

### 6. `tsoaNotificationRateLimit`
**Use for:** Marking notifications as read, dismissing notifications

**Limits:**
- Anonymous: 60 requests/minute (1 point per request)
- Authenticated: 60 requests/minute (1 point per request)
- Admin: 60 requests/minute (1 point per request)

**Example:**
```typescript
import { tsoaNotificationRateLimit } from "../middleware/tsoa-ratelimit"

@Route("api/v1/notifications")
export class NotificationsController extends BaseController {
  @Put("{notificationId}/read")
  @Security("sessionAuth")
  @Middlewares(tsoaNotificationRateLimit)
  public async markAsRead(
    @Path() notificationId: string
  ): Promise<NotificationResponse> {
    // Implementation
  }
}
```

### 7. `tsoaListingUpdateRateLimit`
**Use for:** Market listing updates that need longer time windows

**Limits (hour-based):**
- Anonymous: 600 requests/hour (1 point per request)
- Authenticated: 600 requests/hour (1 point per request)
- Admin: 600 requests/hour (1 point per request)

**Example:**
```typescript
import { tsoaListingUpdateRateLimit } from "../middleware/tsoa-ratelimit"

@Route("api/v1/market")
export class MarketController extends BaseController {
  @Put("listings/{listingId}")
  @Security("sessionAuth")
  @Middlewares(tsoaListingUpdateRateLimit)
  public async updateListing(
    @Path() listingId: string,
    @Body() payload: UpdateListingPayload
  ): Promise<ListingResponse> {
    // Implementation
  }
}
```

## Creating Custom Rate Limiters

If you need a custom rate limit configuration, use the `createTsoaRateLimit` or `createTsoaHourBasedRateLimit` functions:

### Minute-based Rate Limiter

```typescript
import { createTsoaRateLimit } from "../middleware/tsoa-ratelimit"

const customRateLimit = createTsoaRateLimit({
  anonymous: { points: 5 },      // 12 requests/minute
  authenticated: { points: 2 },  // 30 requests/minute
  admin: { points: 1 },          // 60 requests/minute
})

@Route("api/v1/custom")
export class CustomController extends BaseController {
  @Get("endpoint")
  @Middlewares(customRateLimit)
  public async customEndpoint(): Promise<CustomResponse> {
    // Implementation
  }
}
```

### Hour-based Rate Limiter

```typescript
import { createTsoaHourBasedRateLimit } from "../middleware/tsoa-ratelimit"

const customHourlyLimit = createTsoaHourBasedRateLimit({
  anonymous: { points: 2 },      // 300 requests/hour
  authenticated: { points: 1 },  // 600 requests/hour
  admin: { points: 1 },          // 600 requests/hour
})

@Route("api/v1/custom")
export class CustomController extends BaseController {
  @Post("expensive-operation")
  @Middlewares(customHourlyLimit)
  public async expensiveOperation(): Promise<OperationResponse> {
    // Implementation
  }
}
```

## Combining Multiple Middlewares

You can apply multiple middlewares to a single endpoint by using multiple `@Middlewares` decorators:

```typescript
import { tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit"
import { someOtherMiddleware } from "../middleware/other"

@Route("api/v1/example")
export class ExampleController extends BaseController {
  @Post("items")
  @Security("sessionAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Middlewares(someOtherMiddleware)
  public async createItem(
    @Body() payload: CreateItemPayload
  ): Promise<ItemResponse> {
    // Implementation
  }
}
```

## Rate Limit Response Format

When a rate limit is exceeded, the middleware returns a 429 status code with the following response format:

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Too many requests in the specified time window.",
  "retryAfter": 30,
  "limit": 60,
  "remaining": 0,
  "resetTime": 1234567890,
  "userTier": "authenticated",
  "endpoint": "/api/v1/example"
}
```

The response also includes the following headers:
- `X-RateLimit-Limit`: Maximum number of requests allowed
- `X-RateLimit-Remaining`: Number of requests remaining
- `X-RateLimit-Reset`: Unix timestamp when the rate limit resets
- `X-RateLimit-Retry-After`: Seconds to wait before retrying

## User Tiers

The rate limiting system recognizes three user tiers:

1. **Anonymous**: Unauthenticated users (identified by IP address)
2. **Authenticated**: Logged-in users (identified by user ID + IP address)
3. **Admin**: Users with admin role (identified by user ID + IP address)

The tier is automatically detected based on the request's authentication status and user role.

## Points System

Each rate limiter consumes a certain number of "points" per request:
- Lower points = more requests allowed per time window
- Higher points = fewer requests allowed per time window

For example:
- `points: 1` = 60 requests/minute (60 points / 60 seconds)
- `points: 3` = 20 requests/minute (60 points / 60 seconds)
- `points: 15` = 4 requests/minute (60 points / 60 seconds)

## Best Practices

1. **Choose the right limiter**: Use read limiters for GET endpoints, write limiters for POST/PUT/DELETE
2. **Apply to all endpoints**: Every TSOA controller method should have rate limiting
3. **Use critical limiters sparingly**: Only for truly expensive operations
4. **Test rate limits**: Verify that rate limits work as expected in staging
5. **Monitor rate limit hits**: Track 429 responses to identify potential issues
6. **Document custom limiters**: If you create custom rate limiters, document their purpose and limits

## Migration from Legacy Routes

When migrating from legacy routes to TSOA controllers, ensure you use the equivalent rate limiter:

| Legacy Middleware | TSOA Equivalent |
|------------------|-----------------|
| `readRateLimit` | `tsoaReadRateLimit` |
| `writeRateLimit` | `tsoaWriteRateLimit` |
| `criticalRateLimit` | `tsoaCriticalRateLimit` |
| `bulkRateLimit` | `tsoaBulkRateLimit` |
| `notificationRateLimit` | `tsoaNotificationRateLimit` |
| `commonWriteRateLimit` | `tsoaCommonWriteRateLimit` |
| `listingUpdateRateLimit` | `tsoaListingUpdateRateLimit` |

This ensures consistent rate limiting behavior across legacy and TSOA routes during the migration period.

## Troubleshooting

### Rate limiter not working
- Verify the middleware is imported correctly
- Check that `@Middlewares` decorator is applied to the method
- Ensure the database connection is working (rate limiters use PostgreSQL)

### Rate limits too strict/lenient
- Review the points configuration for your user tier
- Consider creating a custom rate limiter with adjusted points
- Check if the user tier detection is working correctly

### 429 responses in production
- Monitor rate limit metrics to identify patterns
- Consider increasing limits for specific endpoints
- Investigate if legitimate users are being rate limited
- Check for potential abuse or bot traffic

## Related Files

- `src/api/middleware/tsoa-ratelimit.ts` - TSOA adapter implementation
- `src/api/middleware/enhanced-ratelimiting.ts` - Underlying rate limiting logic
- `src/api/middleware/tsoa-ratelimit.test.ts` - Unit tests for adapters
