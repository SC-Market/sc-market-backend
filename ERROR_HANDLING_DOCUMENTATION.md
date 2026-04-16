# Market V2 Error Handling Documentation

## Overview

The Market V2 system uses a comprehensive, standardized error handling approach that provides consistent error responses across all API endpoints.

## Error Response Format

All errors follow the `StandardErrorResponse` format:

```typescript
interface StandardErrorResponse {
  error: {
    code: string              // Error code (e.g., "VALIDATION_ERROR")
    message: string           // Human-readable error message
    details?: Record<string, any>  // Additional context
    validationErrors?: ValidationError[]  // Field-level validation errors
  }
}
```

### Validation Error Format

```typescript
interface ValidationError {
  field: string    // Field name (e.g., "title", "price")
  message: string  // Error message for this field
  code?: string    // Validation rule that failed (e.g., "required", "min")
}
```

## Error Codes

Defined in `src/api/routes/v1/util/error-codes.ts`:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Database constraint violation |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

## Error Handler Middleware

Located in `src/api/middleware/error-handler.ts`:

### Features

1. **CORS Header Injection**: Ensures CORS headers are present even when routes crash
2. **OpenAPI Validation**: Converts AJV validation errors to user-friendly format
3. **Known Error Types**: Handles `ValidationError`, `NotFoundError`, `BusinessLogicError`
4. **Database Errors**: Detects and formats constraint violations
5. **Bugsnag Integration**: Automatically reports 500 errors
6. **Request Context Logging**: Logs errors with path, method, user_id

### Usage

The error handler is automatically applied to all routes. No manual setup required.

## Creating Error Responses

### Helper Functions

Located in `src/api/routes/v1/util/response.ts`:

#### 1. Generic Error Response

```typescript
import { createErrorResponse, ErrorCode } from '../util/response.js'

// Basic error
createErrorResponse(
  ErrorCode.VALIDATION_ERROR,
  "Invalid input"
)

// With details
createErrorResponse(
  ErrorCode.VALIDATION_ERROR,
  "Invalid input",
  { field: "price", value: -100 }
)

// With validation errors
createErrorResponse(
  ErrorCode.VALIDATION_ERROR,
  "Validation failed",
  undefined,
  [
    { field: "title", message: "Title is required" },
    { field: "price", message: "Price must be positive" }
  ]
)
```

#### 2. Validation Error Response

```typescript
import { createValidationErrorResponse } from '../util/response.js'

createValidationErrorResponse(
  "Request validation failed",
  [
    { field: "title", message: "Title is required", code: "required" },
    { field: "price", message: "Price must be >= 0", code: "min" }
  ]
)
```

#### 3. Not Found Error Response

```typescript
import { createNotFoundErrorResponse } from '../util/response.js'

// Basic
createNotFoundErrorResponse("Listing")

// With identifier
createNotFoundErrorResponse("Listing", listingId)
```

#### 4. Unauthorized Error Response

```typescript
import { createUnauthorizedErrorResponse } from '../util/response.js'

createUnauthorizedErrorResponse()
// or
createUnauthorizedErrorResponse("Please log in to continue")
```

#### 5. Forbidden Error Response

```typescript
import { createForbiddenErrorResponse } from '../util/response.js'

createForbiddenErrorResponse()
// or
createForbiddenErrorResponse("You cannot edit this listing")
```

#### 6. Conflict Error Response

```typescript
import { createConflictErrorResponse } from '../util/response.js'

createConflictErrorResponse(
  "Listing already exists",
  { existingId: "abc-123" }
)
```

## Throwing Custom Errors

### ValidationError

```typescript
import { ValidationError } from '../util/errors.js'

throw new ValidationError("Invalid input", [
  { field: "price", message: "Price must be positive" }
])
```

### NotFoundError

```typescript
import { NotFoundError } from '../util/errors.js'

throw new NotFoundError("Listing", listingId)
```

### BusinessLogicError

```typescript
import { BusinessLogicError } from '../util/errors.js'
import { ErrorCode } from '../util/error-codes.js'

throw new BusinessLogicError(
  ErrorCode.FORBIDDEN,
  "Cannot delete listing with active orders",
  { listingId, orderCount: 3 }
)
```

## Market V2 Specific Examples

### Listing Creation Validation

```typescript
// In ListingsV2Controller.ts
if (!request.title || request.title.trim().length === 0) {
  return res.status(400).json(
    createValidationErrorResponse(
      "Validation failed",
      [{ field: "title", message: "Title is required", code: "required" }]
    )
  )
}

if (request.base_price !== undefined && request.base_price < 0) {
  return res.status(400).json(
    createValidationErrorResponse(
      "Validation failed",
      [{ field: "base_price", message: "Price must be non-negative", code: "min" }]
    )
  )
}
```

### Listing Not Found

```typescript
// In ListingService.ts
const listing = await this.db('listings')
  .where({ listing_id: listingId })
  .first()

if (!listing) {
  throw new NotFoundError("Listing", listingId)
}
```

### Variant Validation

```typescript
// In VariantService.ts
const variantType = await this.db('variant_types')
  .where({ name: attributeName })
  .first()

if (!variantType) {
  throw new ValidationError(
    "Invalid variant attribute",
    [{ 
      field: `attributes.${attributeName}`, 
      message: `Unknown attribute type: ${attributeName}`,
      code: "invalid_type"
    }]
  )
}

if (variantType.value_type === 'integer' && !Number.isInteger(value)) {
  throw new ValidationError(
    "Invalid attribute value",
    [{ 
      field: `attributes.${attributeName}`, 
      message: `Value must be an integer`,
      code: "type"
    }]
  )
}
```

### Database Constraint Violations

```typescript
// Automatically handled by error handler middleware
// Foreign key violations return 409 Conflict
// Unique constraint violations return 409 Conflict
try {
  await this.db('listings').insert(listingData)
} catch (error) {
  // Error handler will detect constraint violations and format appropriately
  throw error
}
```

## Frontend Error Handling

### RTK Query Error Handling

```typescript
import { useCreateListingMutation } from '@/store/api/v2/market'

const [createListing, { isLoading, error }] = useCreateListingMutation()

// Error structure
if (error) {
  if ('status' in error) {
    // HTTP error
    if (error.status === 400 && error.data?.error?.validationErrors) {
      // Display field-level validation errors
      error.data.error.validationErrors.forEach(ve => {
        console.error(`${ve.field}: ${ve.message}`)
      })
    } else if (error.status === 404) {
      // Not found
      console.error(error.data?.error?.message || "Not found")
    } else {
      // Other HTTP error
      console.error(error.data?.error?.message || "Request failed")
    }
  } else {
    // Network error
    console.error("Network error")
  }
}
```

### Displaying Validation Errors

```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

try {
  await createListing({ createListingRequest: formData }).unwrap()
} catch (error: any) {
  if (error?.data?.error?.validationErrors) {
    const errors: Record<string, string> = {}
    error.data.error.validationErrors.forEach((ve: any) => {
      errors[ve.field] = ve.message
    })
    setFieldErrors(errors)
  }
}

// In JSX
<TextField
  error={!!fieldErrors.title}
  helperText={fieldErrors.title}
  // ...
/>
```

## Testing Error Responses

### Unit Test Example

```typescript
describe('Error Handling', () => {
  it('should return 400 for invalid input', async () => {
    const response = await request(app)
      .post('/api/v2/listings')
      .send({ title: '' })  // Invalid: empty title
      .expect(400)

    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('validation'),
        validationErrors: expect.arrayContaining([
          expect.objectContaining({
            field: 'title',
            message: expect.any(String)
          })
        ])
      }
    })
  })

  it('should return 404 for non-existent listing', async () => {
    const response = await request(app)
      .get('/api/v2/listings/non-existent-id')
      .expect(404)

    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: expect.stringContaining('Listing not found'),
        details: {
          resource: 'Listing',
          identifier: 'non-existent-id'
        }
      }
    })
  })
})
```

## Best Practices

1. **Use Specific Error Codes**: Choose the most appropriate error code for each situation
2. **Provide Context**: Include relevant details in the `details` field
3. **Field-Level Validation**: Use `validationErrors` array for form validation
4. **Consistent Messages**: Use clear, actionable error messages
5. **Don't Leak Sensitive Info**: Sanitize error messages in production
6. **Log Errors**: All errors are automatically logged with context
7. **Test Error Cases**: Write tests for all error scenarios

## Requirements Validation

### ✅ Requirement 28.1 - Validation Errors (400)
- Implemented via `createValidationErrorResponse`
- Field-level errors with `validationErrors` array
- Descriptive messages for each validation failure

### ✅ Requirement 28.2 - Not Found Errors (404)
- Implemented via `createNotFoundErrorResponse`
- Includes resource identifier in details

### ✅ Requirement 28.3 - Authorization Errors (403)
- Implemented via `createForbiddenErrorResponse`
- Clear permission requirement messages

### ✅ Requirement 28.4 - Server Errors (500)
- Implemented via error handler middleware
- Automatic Bugsnag reporting
- Full error details logged server-side

### ✅ Requirement 28.5 - Error Response Format
- Standardized `StandardErrorResponse` type
- Consistent structure across all endpoints
- Includes code, message, details, validationErrors

### ✅ Requirement 28.6 - Information Leakage Prevention
- Error messages sanitized in production
- Stack traces not exposed to clients
- Sensitive details logged server-side only

## Summary

The Market V2 error handling system provides:
- ✅ Consistent error response format
- ✅ Comprehensive error codes
- ✅ Field-level validation errors
- ✅ Automatic CORS header injection
- ✅ Bugsnag integration for monitoring
- ✅ Request context logging
- ✅ Type-safe error responses
- ✅ Frontend-friendly error structure

All requirements for Task 20 (Error Handling and Validation) are already implemented and operational.
