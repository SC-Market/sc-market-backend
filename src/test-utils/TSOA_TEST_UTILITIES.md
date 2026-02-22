# TSOA Test Utilities Guide

This document describes the TSOA-specific test utilities available for testing TSOA controllers, models, and routes.

## Overview

The TSOA test utilities are organized into three main modules:

1. **tsoaTestHelpers.ts** - Controller and authentication testing
2. **tsoaModelHelpers.ts** - Model validation and mock data generation
3. **tsoaIntegrationHelpers.ts** - End-to-end HTTP testing

---

## 1. Controller Testing (`tsoaTestHelpers.ts`)

### Creating Mock Requests

#### Basic Mock Request
```typescript
import { createMockRequest } from "../test-utils/tsoaTestHelpers.js"

const request = createMockRequest({
  query: { page: "1", limit: "20" },
  params: { id: "123" },
  body: { name: "Test" }
})
```

#### Authenticated Request
```typescript
import { createAuthenticatedRequest } from "../test-utils/tsoaTestHelpers.js"

const { request, testUser } = await createAuthenticatedRequest({
  role: "user",
  rsi_confirmed: true
})

// Use request in controller tests
const controller = new SomeController()
const result = await controller.someMethod(request)
```

#### Admin Request
```typescript
import { createAdminRequest } from "../test-utils/tsoaTestHelpers.js"

const { request, testUser } = await createAdminRequest()

// Test admin-only endpoints
const controller = new AdminController()
const result = await controller.adminMethod(request)
```

#### Token Auth Request (with scopes)
```typescript
import { createTokenAuthRequest } from "../test-utils/tsoaTestHelpers.js"

const { request, testUser } = await createTokenAuthRequest(
  ["read", "write"], // scopes
  { role: "user" }    // user overrides
)
```

#### Session Auth Request
```typescript
import { createSessionAuthRequest } from "../test-utils/tsoaTestHelpers.js"

const { request, testUser } = await createSessionAuthRequest({
  role: "user"
})
```

### Testing Controller Methods

```typescript
import { testControllerMethod } from "../test-utils/tsoaTestHelpers.js"

const controller = new AttributesController()

const result = await testControllerMethod(
  () => controller.getDefinitions("Ship", false),
  { data: { definitions: expect.any(Array) } }
)
```

### Asserting TSOA Responses

```typescript
import { assertTsoaResponse, assertTsoaError } from "../test-utils/tsoaTestHelpers.js"

// Assert success response
assertTsoaResponse(response, {
  definitions: expect.any(Array)
})

// Assert error response
assertTsoaError(error, "VALIDATION_ERROR", "Invalid input")
```

### Testing Authentication

```typescript
import { testAuthentication } from "../test-utils/tsoaTestHelpers.js"

const { request } = await createAuthenticatedRequest()

const user = await testAuthentication(request, "sessionAuth", [])
expect(user).toBeDefined()
expect(user.user_id).toBe(testUser.user_id)
```

### Creating Query/Path Parameters

```typescript
import { 
  createQueryParams, 
  createPathParams,
  createPaginationParams,
  createSortParams 
} from "../test-utils/tsoaTestHelpers.js"

// Query parameters
const query = createQueryParams({
  search: "test",
  filters: ["active", "pending"],
  includeHidden: true
})

// Path parameters
const params = createPathParams({ id: "123", name: "test" })

// Pagination
const pagination = createPaginationParams(2, 50) // page 2, 50 items

// Sorting
const sort = createSortParams("created_at", "desc")
```

### File Upload Testing

```typescript
import { createMockFile } from "../test-utils/tsoaTestHelpers.js"

const file = createMockFile({
  originalname: "avatar.png",
  mimetype: "image/png",
  size: 2048,
  buffer: Buffer.from("fake image data")
})

const controller = new UploadController()
const result = await controller.uploadPhoto(file, request)
```

---

## 2. Model Testing (`tsoaModelHelpers.ts`)

### Validating Models

```typescript
import { validateModel } from "../test-utils/tsoaModelHelpers.js"

interface MyModel {
  id: string
  name: string
  optional?: string
}

const obj = { id: "123", name: "Test" }

const isValid = validateModel<MyModel>(
  obj,
  ["id", "name"],      // required fields
  ["optional"]         // optional fields
)
```

### Creating Mock Data

```typescript
import {
  createMockAttributeDefinition,
  createMockCommodity,
  createMockMarketListing,
  createMockProfile,
  createMockOrder,
  createMockContractor,
  createMockNotification,
  createMockComment,
  createMockService,
  createMockOffer,
  createMockToken
} from "../test-utils/tsoaModelHelpers.js"

// Create mock attribute definition
const attribute = createMockAttributeDefinition({
  attribute_name: "size",
  display_name: "Size",
  attribute_type: "select",
  allowed_values: ["1", "2", "3"]
})

// Create mock market listing
const listing = createMockMarketListing({
  title: "Test Listing",
  price: 5000,
  quantity_available: 10
})

// Create mock user profile
const profile = createMockProfile({
  username: "testuser",
  role: "admin"
})
```

### Creating API Responses

```typescript
import { createApiResponse } from "../test-utils/tsoaModelHelpers.js"

const response = createApiResponse({
  definitions: [attribute1, attribute2]
})

// Returns: { data: { definitions: [...] } }
```

### Validating Response Structures

```typescript
import {
  validateApiResponse,
  validatePaginationResponse,
  validateArrayResponse,
  validateErrorResponse
} from "../test-utils/tsoaModelHelpers.js"

// Validate API response structure
validateApiResponse(response)

// Validate pagination metadata
validatePaginationResponse(response)

// Validate array response
validateArrayResponse(
  response,
  10, // expected length
  (item) => item.id !== undefined // item validator
)

// Validate error response
validateErrorResponse(
  errorResponse,
  "VALIDATION_ERROR",
  "Invalid input"
)
```

### Creating Error Responses

```typescript
import { createMockErrorResponse } from "../test-utils/tsoaModelHelpers.js"

const error = createMockErrorResponse(
  "NOT_FOUND",
  "Resource not found",
  { resource: "listing", id: "123" }
)

// Returns: { error: { code: "NOT_FOUND", message: "...", details: {...} } }
```

---

## 3. Integration Testing (`tsoaIntegrationHelpers.ts`)

### Creating a Test Client

```typescript
import { TsoaTestClient } from "../test-utils/tsoaIntegrationHelpers.js"

const client = new TsoaTestClient()
// Uses default test server and base URL /api/v1

// Or with custom app
const customApp = createTestServer()
const client = new TsoaTestClient(customApp, "/api/v2")
```

### Making HTTP Requests

#### GET Request
```typescript
const response = await client.get("/attributes/definitions", {
  query: { applicable_item_types: "Ship" },
  auth: testUser
})

expect(response.status).toBe(200)
expect(response.body.data).toBeDefined()
```

#### POST Request
```typescript
const response = await client.post(
  "/attributes/definitions",
  {
    attribute_name: "test",
    display_name: "Test",
    attribute_type: "select"
  },
  { auth: adminUser }
)

expect(response.status).toBe(201)
```

#### PUT Request
```typescript
const response = await client.put(
  "/attributes/definitions/test",
  { display_name: "Updated Test" },
  { auth: adminUser }
)
```

#### DELETE Request
```typescript
const response = await client.delete(
  "/attributes/definitions/test",
  { auth: adminUser }
)
```

#### File Upload
```typescript
const response = await client.uploadFile(
  "/upload/photo",
  "photo",
  "./test-files/avatar.png",
  {
    auth: testUser,
    fields: { description: "My avatar" }
  }
)
```

### Asserting HTTP Responses

```typescript
import {
  assertSuccessResponse,
  assertStatusCode,
  assertTsoaResponseStructure,
  assertTsoaErrorStructure
} from "../test-utils/tsoaIntegrationHelpers.js"

// Assert success (2xx)
assertSuccessResponse(response)

// Assert specific status code
assertStatusCode(response, 201)

// Assert TSOA response structure
assertTsoaResponseStructure(response)

// Assert TSOA error structure
assertTsoaErrorStructure(response, "VALIDATION_ERROR")
```

### Testing Authentication Flow

```typescript
import { testAuthenticationFlow } from "../test-utils/tsoaIntegrationHelpers.js"

const { unauthenticatedResponse, authenticatedResponse } = 
  await testAuthenticationFlow(
    client,
    "/profile",
    "get"
  )

expect(unauthenticatedResponse.status).toBe(401)
expect(authenticatedResponse.status).toBe(200)
```

### Testing Rate Limiting

```typescript
import { testRateLimiting } from "../test-utils/tsoaIntegrationHelpers.js"

const { successfulRequests, rateLimitedResponse } = 
  await testRateLimiting(
    client,
    "/attributes/definitions",
    100, // max requests
    "get"
  )

expect(successfulRequests).toBeLessThanOrEqual(100)
expect(rateLimitedResponse.status).toBe(429)
```

### Testing Pagination

```typescript
import { testPagination } from "../test-utils/tsoaIntegrationHelpers.js"

const { page1, page2, totalItems } = await testPagination(
  client,
  "/market/listings",
  testUser
)

expect(page1.body.data.items).toHaveLength(10)
expect(page2.body.data.items).toHaveLength(10)
expect(totalItems).toBeGreaterThan(10)
```

### Testing Validation Errors

```typescript
import { testValidationErrors } from "../test-utils/tsoaIntegrationHelpers.js"

const invalidPayloads = [
  { /* missing required field */ },
  { attribute_name: "" /* empty string */ },
  { attribute_type: "invalid" /* invalid enum */ }
]

const responses = await testValidationErrors(
  client,
  "/attributes/definitions",
  invalidPayloads,
  "post",
  adminUser
)

responses.forEach(response => {
  expect(response.status).toBeOneOf([400, 422])
  assertTsoaErrorStructure(response, "VALIDATION_ERROR")
})
```

---

## Complete Test Examples

### Unit Test Example

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { AttributesController } from "./attributes.controller.js"
import { createAdminRequest } from "../test-utils/tsoaTestHelpers.js"
import { cleanupTestData } from "../test-utils/testFixtures.js"

describe("AttributesController", () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  it("should create attribute definition", async () => {
    const { request } = await createAdminRequest()
    const controller = new AttributesController()

    const result = await controller.createDefinition({
      attribute_name: "test_attr",
      display_name: "Test Attribute",
      attribute_type: "select",
      allowed_values: ["A", "B", "C"]
    })

    expect(result.data.definition).toBeDefined()
    expect(result.data.definition.attribute_name).toBe("test_attr")
  })

  it("should get attribute definitions", async () => {
    const { request } = await createAuthenticatedRequest()
    const controller = new AttributesController()

    const result = await controller.getDefinitions("Ship", false)

    expect(result.data.definitions).toBeInstanceOf(Array)
  })
})
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { TsoaTestClient } from "../test-utils/tsoaIntegrationHelpers.js"
import { createTestUserWithAuth } from "../test-utils/testAuth.js"
import { cleanupTestData } from "../test-utils/testFixtures.js"

describe("Attributes API Integration", () => {
  let client: TsoaTestClient
  let adminUser: any

  beforeEach(async () => {
    await cleanupTestData()
    client = new TsoaTestClient()
    adminUser = await createTestUserWithAuth({ role: "admin" })
  })

  it("should handle full CRUD flow", async () => {
    // Create
    const createResponse = await client.post(
      "/attributes/definitions",
      {
        attribute_name: "test_attr",
        display_name: "Test Attribute",
        attribute_type: "select",
        allowed_values: ["A", "B"]
      },
      { auth: adminUser }
    )
    expect(createResponse.status).toBe(201)

    // Read
    const getResponse = await client.get("/attributes/definitions")
    expect(getResponse.status).toBe(200)
    expect(getResponse.body.data.definitions).toContainEqual(
      expect.objectContaining({ attribute_name: "test_attr" })
    )

    // Update
    const updateResponse = await client.put(
      "/attributes/definitions/test_attr",
      { display_name: "Updated Test" },
      { auth: adminUser }
    )
    expect(updateResponse.status).toBe(200)

    // Delete
    const deleteResponse = await client.delete(
      "/attributes/definitions/test_attr",
      { auth: adminUser }
    )
    expect(deleteResponse.status).toBe(200)
  })
})
```

---

## Migration from Legacy Tests

### Before (Legacy Pattern)
```typescript
import { RequestHandler } from "express"
import { some_controller_function } from "./controller.js"

const req = {
  user: { user_id: "123" },
  body: { name: "Test" }
} as unknown as Request

const res = {
  status: (code: number) => res,
  json: (data: any) => res
} as unknown as Response

await some_controller_function(req, res, next)
```

### After (TSOA Pattern)
```typescript
import { SomeController } from "./some.controller.js"
import { createAuthenticatedRequest } from "../test-utils/tsoaTestHelpers.js"

const { request } = await createAuthenticatedRequest()
const controller = new SomeController()

const result = await controller.someMethod({ name: "Test" })

expect(result.data).toBeDefined()
```

---

## Best Practices

1. **Use Type-Safe Helpers**: Always use the typed helper functions instead of manually creating mock objects
2. **Clean Up Test Data**: Always call `cleanupTestData()` in `beforeEach` or `afterEach`
3. **Test Authentication**: Use `testAuthenticationFlow()` to verify auth requirements
4. **Test Validation**: Use `testValidationErrors()` to verify input validation
5. **Test Rate Limiting**: Use `testRateLimiting()` for endpoints with rate limits
6. **Assert Response Structure**: Always validate response structure with assertion helpers
7. **Use Integration Tests**: Test full HTTP flow for critical endpoints
8. **Mock External Services**: Use `mockServices.ts` to mock external dependencies

---

## Troubleshooting

### Issue: "Response missing 'data' property"
**Solution**: Ensure your controller returns `{ data: ... }` format

### Issue: "Expected ValidateError but got undefined"
**Solution**: TSOA validation happens before controller execution. Test via HTTP requests, not direct controller calls.

### Issue: "Authentication failed in tests"
**Solution**: Ensure you're using `createAuthenticatedRequest()` or passing `auth` option to HTTP client

### Issue: "Rate limiting not triggered"
**Solution**: Increase the number of requests or check rate limit configuration

---

## Additional Resources

- [TSOA Documentation](https://tsoa-community.github.io/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- Legacy Test Utilities: `testAuth.ts`, `testFixtures.ts`, `testDb.ts`
