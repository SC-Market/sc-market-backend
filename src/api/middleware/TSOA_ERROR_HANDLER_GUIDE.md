# TSOA Error Handler Middleware

## Overview

The TSOA error handler middleware (`tsoa-error-handler.ts`) transforms TSOA-specific errors into the legacy error response format, ensuring backward compatibility with existing API clients during the TSOA migration.

## Purpose

During the migration from `@wesleytodd/openapi-express` to TSOA, we need to maintain consistent error response formats. This middleware ensures that:

1. TSOA validation errors match the legacy validation error format
2. Authentication errors return consistent 401 responses
3. Authorization errors return consistent 403 responses
4. Custom errors with status codes are properly formatted
5. All unhandled errors are logged and return 500 responses

## Error Transformations

### TSOA ValidateError → 400 Validation Error

```typescript
// TSOA throws ValidateError for request validation failures
// Transformed to:
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "fields": {
        "body.email": {
          "message": "Invalid email format",
          "value": "not-an-email"
        }
      }
    }
  }
}
```

### Authentication Errors → 401 Unauthorized

```typescript
// Errors from expressAuthentication:
// - "Not authenticated"
// - "No bearer token provided"
// - "Invalid or expired token"
// - "User is banned"

// Transformed to:
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Not authenticated"
  }
}
```

### Authorization Errors → 403 Forbidden

```typescript
// Errors from expressAuthentication:
// - "Admin access required"
// - "Insufficient permissions"

// Transformed to:
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin access required"
  }
}
```

### Custom Errors with Status Codes

```typescript
// Errors thrown from BaseController.handleError:
throw {
  status: 404,
  code: ErrorCode.NOT_FOUND,
  message: "Resource not found",
  details: { resource: "user", identifier: "123" }
}

// Transformed to:
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {
      "resource": "user",
      "identifier": "123"
    }
  }
}
```

### Unhandled Errors → 500 Internal Server Error

```typescript
// Any unhandled error
// Transformed to:
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Internal server error"
  }
}
```

## Usage

### Registering the Middleware

The error handler should be registered **after** TSOA routes are registered:

```typescript
import express from "express"
import { RegisterRoutes } from "./api/generated/routes.js"
import { tsoaErrorHandler } from "./api/middleware/tsoa-error-handler.js"

const app = express()

// Register TSOA routes
RegisterRoutes(app)

// Register TSOA error handler (must be after routes)
app.use(tsoaErrorHandler)

// Other error handlers can follow
```

### Controller Error Handling

Controllers should use `BaseController.handleError` to throw errors:

```typescript
import { Controller, Get, Route } from "tsoa"
import { BaseController, NotFoundError } from "./base.controller.js"

@Route("api/v1/users")
export class UsersController extends BaseController {
  @Get("{userId}")
  public async getUser(userId: string) {
    try {
      const user = await userService.getUser(userId)
      if (!user) {
        throw new NotFoundError("User not found")
      }
      return this.success({ user })
    } catch (error) {
      this.handleError(error, "getUser")
    }
  }
}
```

## Logging

All errors are logged with appropriate context:

- **Validation errors**: Logged as warnings with field details
- **Authentication errors**: Logged as warnings with auth context
- **Authorization errors**: Logged as warnings with user context
- **Custom errors**: Logged as warnings with status and code
- **Unhandled errors**: Logged as errors with full stack trace

Example log output:

```json
{
  "level": "warn",
  "message": "TSOA validation error",
  "fields": {
    "body.email": {
      "message": "Invalid email format",
      "value": "not-an-email"
    }
  },
  "path": "/api/v1/users",
  "method": "POST"
}
```

## Testing

The error handler has comprehensive test coverage in `tsoa-error-handler.test.ts`:

- ValidateError transformation
- Authentication error transformation
- Authorization error transformation
- Custom error transformation
- Unhandled error transformation
- Headers already sent handling
- Error response format consistency

Run tests:

```bash
npm test -- tsoa-error-handler.test.ts
```

## Requirements Validated

This middleware validates the following requirements from the TSOA migration spec:

- **Requirement 4.4**: Error handling middleware maintains existing error response formats
- **Requirement 11.1**: Validation errors return responses matching legacy format
- **Requirement 11.2**: Authentication errors return responses matching legacy format
- **Requirement 11.3**: Server errors return responses matching legacy format
- **Requirement 11.4**: Custom errors are transformed to expected format
- **Requirement 11.5**: TSOA error responses are customized to match legacy patterns

## Related Files

- `src/api/middleware/tsoa-error-handler.ts` - Error handler implementation
- `src/api/middleware/tsoa-error-handler.test.ts` - Test suite
- `src/api/middleware/tsoa-auth.ts` - Authentication handler (throws errors)
- `src/api/controllers/base.controller.ts` - Base controller with error handling
- `src/api/routes/v1/util/response.ts` - Legacy error response utilities
- `src/api/routes/v1/util/error-codes.ts` - Error code definitions
