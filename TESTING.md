# Backend Testing Guide

This guide explains how to write and run tests for the SC Market backend.

## Setup

### Prerequisites

1. **Test Database**: You need a separate PostgreSQL database for testing. Set the `TEST_DATABASE_NAME` environment variable (defaults to `scmarket_test`).

2. **Environment Variables**: Create a `.env.test` file or set the following:
   ```bash
   TEST_DATABASE_NAME=scmarket_test
   DATABASE_HOST=localhost
   DATABASE_USER=postgres
   DATABASE_PASS='{"password":"your_password"}'
   DATABASE_PORT=5432
   ```

### Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with UI
yarn test:ui

# Run tests with coverage
yarn test:coverage

# Run tests in CI mode
yarn test:ci
```

## Writing Tests

### Test Structure

Tests should be placed next to the code they test, with a `.test.ts` or `.spec.ts` extension:

```
src/
  api/
    routes/
      v1/
        orders/
          controller.ts
          controller.test.ts
```

### Basic Test Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  beginTransaction,
  rollbackTransaction,
} from "../../../test-utils/testDb.js"
import { createTestUser } from "../../../test-utils/testFixtures.js"

describe("My Feature", () => {
  beforeEach(async () => {
    await beginTransaction()
  })

  afterEach(async () => {
    await rollbackTransaction()
  })

  it("should do something", async () => {
    const user = await createTestUser()
    expect(user).toBeDefined()
  })
})
```

### Test Utilities

#### Database Utilities (`test-utils/testDb.ts`)

- `getTestDatabase()` - Get the test database instance
- `getTestKnex()` - Get the Knex instance for raw queries
- `setupTestDb()` - Set up test database (run migrations)
- `teardownTestDb()` - Clean up test database
- `beginTransaction()` - Start a test transaction (for isolation)
- `rollbackTransaction()` - Rollback test transaction
- `truncateTables(tables)` - Clean specific tables
- `resetDatabase()` - Reset entire test database

#### Test Fixtures (`test-utils/testFixtures.ts`)

- `createTestUser(overrides?)` - Create a test user
- `createTestContractor(overrides?)` - Create a test contractor
- `createTestOrder(overrides?)` - Create a test order
- `createTestTransaction(overrides?)` - Create a test transaction
- `cleanupTestData()` - Clean up all test data

#### Authentication Utilities (`test-utils/testAuth.ts`)

- `createTestUserWithAuth(overrides?)` - Create user with API token
- `getAuthHeaders(user)` - Get authorization headers for requests
- `createAdminUser(overrides?)` - Create admin user
- `createOwnerUser(contractorId, overrides?)` - Create owner user

#### Server Utilities (`test-utils/testServer.ts`)

- `createTestServer()` - Create Express app with all routes
- `createMinimalTestServer()` - Create minimal Express app

### Integration Test Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createTestServer } from "../../test-utils/testServer.js"
import {
  createTestUserWithAuth,
  getAuthHeaders,
} from "../../test-utils/testAuth.js"
import {
  beginTransaction,
  rollbackTransaction,
} from "../../test-utils/testDb.js"

describe("POST /api/v1/orders", () => {
  let app: Express

  beforeEach(async () => {
    app = createTestServer()
    await beginTransaction()
  })

  afterEach(async () => {
    await rollbackTransaction()
  })

  it("should create an order", async () => {
    const user = await createTestUserWithAuth()

    const response = await request(app)
      .post("/api/v1/orders")
      .set(getAuthHeaders(user))
      .send({
        // order data
      })
      .expect(200)

    expect(response.body).toHaveProperty("order_id")
  })
})
```

### Test Isolation

Use database transactions for test isolation:

```typescript
beforeEach(async () => {
  await beginTransaction()
})

afterEach(async () => {
  await rollbackTransaction()
})
```

This ensures each test starts with a clean state and all changes are rolled back after the test.

## Best Practices

1. **Always use transactions** for test isolation
2. **Use test fixtures** instead of hardcoding test data
3. **Clean up after tests** using `rollbackTransaction()` or `truncateTables()`
4. **Mock external services** (AWS, Discord, etc.) using `mockServices.ts`
5. **Test both success and error cases**
6. **Use descriptive test names** that explain what is being tested
7. **Follow AAA pattern**: Arrange, Act, Assert
8. **Run `yarn prettier`** after making changes

## Coverage Goals

- **Critical paths**: 80%+ coverage
  - Authentication middleware
  - Financial transactions
  - Order processing
  - Database query helpers
- **Important areas**: 70%+ coverage
  - API controllers
  - Business logic
  - Services
- **General code**: 60%+ coverage
  - Utilities
  - Helpers
  - Middleware

## Troubleshooting

### Database Connection Issues

- Ensure the test database exists
- Check environment variables are set correctly
- Verify database credentials

### Test Failures

- Check that transactions are being rolled back properly
- Verify test data is being created correctly
- Check for race conditions in concurrent tests

### Coverage Issues

- Ensure all test files are in the correct location
- Check that coverage exclusions are correct
- Verify test files are being discovered by Vitest

## Next Steps

See `.plans/backend-testing/` for the full testing implementation plan.
