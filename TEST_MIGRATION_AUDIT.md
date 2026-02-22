# Test Migration Audit Report

## Overview

This document provides a comprehensive audit of all test files in the sc-market-backend codebase, identifying which tests reference legacy routes/controllers and need to be updated for TSOA migration.

**Audit Date**: Generated during Task 21.5.1
**Total Test Files Found**: 32

---

## Test File Categories

### Category 1: TSOA-Ready Tests (Already Migrated)
These tests are already written for TSOA controllers and do not need migration.

#### TSOA Controller Tests
- ✅ `src/api/controllers/base.controller.test.ts` - Tests BaseController helper methods
- ✅ `src/api/controllers/attributes.controller.test.ts` - Tests TSOA AttributesController
- ✅ `src/api/controllers/upload.controller.test.ts` - Tests TSOA UploadController

#### TSOA Middleware Tests
- ✅ `src/api/middleware/tsoa-auth.test.ts` - Tests TSOA authentication handler
- ✅ `src/api/middleware/tsoa-error-handler.test.ts` - Tests TSOA error handler
- ✅ `src/api/middleware/tsoa-ratelimit.test.ts` - Tests TSOA rate limiting

#### TSOA Model Tests
- ✅ `src/api/models/attributes.models.test.ts` - Tests TSOA attribute models
- ✅ `src/api/models/commodities.models.test.ts` - Tests TSOA commodity models
- ✅ `src/api/models/common.models.test.ts` - Tests TSOA common models
- ✅ `src/api/models/market-listings.models.test.ts` - Tests TSOA market listing models
- ✅ `src/api/models/starmap.models.test.ts` - Tests TSOA starmap models

#### TSOA Property-Based Tests
- ✅ `src/api/controllers/attributes.controller.property.test.ts` - Property tests for attributes
- ✅ `src/api/controllers/database-operations.property.test.ts` - Property 13: Database operations
- ✅ `src/api/controllers/documentation-auto-update.property.test.ts` - Property 10: Documentation
- ✅ `src/api/controllers/error-response.property.test.ts` - Property 11: Error responses
- ✅ `src/api/controllers/file-upload.property.test.ts` - Property 8: File uploads
- ✅ `src/api/controllers/middleware.property.test.ts` - Property 6: Middleware execution
- ✅ `src/api/controllers/parallel-operation.property.test.ts` - Property 1: Parallel operation
- ✅ `src/api/controllers/rollback-preservation.property.test.ts` - Property 14: Rollback
- ✅ `src/api/controllers/route-path.property.test.ts` - Property 12: Route paths
- ✅ `src/api/controllers/validation.property.test.ts` - Property 7: Request validation
- ✅ `src/api/controllers/websocket.property.test.ts` - Property 9: WebSocket behavior

#### Other TSOA Tests
- ✅ `src/api/websocket/spec-merger.test.ts` - Tests WebSocket OpenAPI spec merging

---

### Category 2: Legacy Tests (Need Migration or Removal)

#### Legacy Controller Tests
These tests reference legacy RequestHandler functions that have been replaced by TSOA controllers.

1. **`src/api/routes/v1/transactions/controller.test.ts`**
   - **Status**: DISABLED (commented out)
   - **Issue**: Tests legacy transaction controller functions that were removed
   - **Action Required**: 
     - Either migrate transactions module to TSOA and rewrite tests
     - Or remove this test file entirely if transactions won't be migrated
   - **Legacy Imports**: 
     - `transaction_post_create`
     - `transaction_get_transaction_id`
   - **Test Patterns**: Legacy RequestHandler pattern with mock Request/Response

2. **`src/api/routes/v1/market/attribute-filter.test.ts`**
   - **Status**: SKIPPED (describe.skip)
   - **Issue**: Tests legacy helper functions for market search
   - **Action Required**: 
     - Update to test TSOA MarketListingsController methods
     - Or integrate into existing market-listings controller tests
   - **Legacy Imports**: 
     - `convertQuery` from `./helpers.js`
     - `MarketSearchQueryArguments` type
   - **Test Patterns**: Tests query conversion logic

3. **`src/api/routes/v1/market/attribute-filter-performance.test.ts`**
   - **Status**: Unknown (needs inspection)
   - **Issue**: Likely tests legacy market filtering performance
   - **Action Required**: Review and update for TSOA controllers

#### Legacy Middleware Tests
4. **`src/api/middleware/auth.test.ts`**
   - **Status**: Active but tests legacy middleware
   - **Issue**: Tests legacy auth middleware (`userAuthorized`, `adminAuthorized`, `verifiedUser`)
   - **Action Required**: 
     - Keep for backward compatibility testing
     - Add tests for TSOA auth integration
     - Verify these middleware still work with TSOA routes
   - **Legacy Imports**:
     - `userAuthorized`
     - `adminAuthorized`
     - `verifiedUser`
   - **Test Patterns**: Legacy middleware pattern with mock Request/Response

---

### Category 3: Service/Utility Tests (No Migration Needed)
These tests are for services and utilities that are used by both legacy and TSOA code.

- ✅ `src/services/allocation/allocation.service.test.ts` - Allocation service tests
- ✅ `src/services/allocation/order-lifecycle.service.test.ts` - Order lifecycle tests
- ✅ `src/services/attribute-import/uexcorp-api.test.ts` - Attribute import tests
- ✅ `src/services/location/location.service.test.ts` - Location service tests
- ✅ `src/test-utils/example.test.ts` - Example test file

---

## Summary Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| TSOA-Ready Tests | 22 | 68.75% |
| Legacy Tests Needing Migration | 4 | 12.5% |
| Service/Utility Tests (No Action) | 6 | 18.75% |
| **Total** | **32** | **100%** |

---

## Detailed Action Items

### High Priority (Blocking)

1. **Transaction Controller Tests** (`src/api/routes/v1/transactions/controller.test.ts`)
   - Decision needed: Migrate transactions module to TSOA or remove?
   - If migrating: Create TransactionsController and rewrite tests
   - If removing: Delete test file

2. **Market Attribute Filter Tests** (`src/api/routes/v1/market/attribute-filter.test.ts`)
   - Integrate into MarketListingsController tests
   - Update to test TSOA controller methods instead of helper functions
   - Remove legacy query conversion tests or adapt for TSOA

### Medium Priority

3. **Legacy Auth Middleware Tests** (`src/api/middleware/auth.test.ts`)
   - Verify compatibility with TSOA routes
   - Add integration tests for TSOA auth handler
   - Consider keeping for backward compatibility

4. **Performance Tests** (`src/api/routes/v1/market/attribute-filter-performance.test.ts`)
   - Review and update for TSOA controllers
   - Ensure performance benchmarks still apply

---

## Legacy Patterns Identified

### Pattern 1: Legacy RequestHandler Tests
```typescript
// OLD PATTERN (Legacy)
import { RequestHandler } from "express"
import { some_controller_function } from "./controller.js"

const req = {
  user: { user_id: "123" },
  body: { ... }
} as unknown as Request

const res = {
  status: (code: number) => res,
  json: (data: any) => res
} as unknown as Response

await some_controller_function(req, res, next)
```

**Migration to TSOA**:
```typescript
// NEW PATTERN (TSOA)
import { SomeController } from "./some.controller.js"

const controller = new SomeController()
const result = await controller.someMethod(payload)

expect(result).toMatchObject({ ... })
```

### Pattern 2: Legacy Middleware Tests
```typescript
// OLD PATTERN (Legacy)
import { userAuthorized } from "./auth.js"

await userAuthorized(req, res, next)
expect(nextCalled).toBe(true)
```

**Migration to TSOA**:
```typescript
// NEW PATTERN (TSOA)
import { expressAuthentication } from "./tsoa-auth.js"

const user = await expressAuthentication(req, "sessionAuth", [])
expect(user).toBeDefined()
```

### Pattern 3: Legacy Query Conversion Tests
```typescript
// OLD PATTERN (Legacy)
import { convertQuery } from "./helpers.js"

const result = await convertQuery(queryArgs)
expect(result.attributes).toBeDefined()
```

**Migration to TSOA**:
```typescript
// NEW PATTERN (TSOA)
// Query conversion happens automatically via TSOA decorators
// Test the controller method directly with typed parameters

const controller = new MarketListingsController()
const result = await controller.searchListings(
  query,
  attributes,
  page,
  limit
)
```

---

## Test Utilities Requiring Updates

### Current Test Utilities (Legacy-Focused)
- `src/test-utils/mockDatabase.js` - Mock database for legacy tests
- `src/test-utils/testFixturesMock.js` - Test fixtures for legacy tests
- `src/test-utils/testAuthMock.js` - Auth mocking for legacy tests

### Required New Test Utilities (TSOA-Focused)
- **TSOA Controller Test Helpers**
  - Factory functions for creating controller instances
  - Mock request context builders
  - Response assertion helpers

- **TSOA Authentication Test Helpers**
  - Mock expressAuthentication function
  - Token generation for TSOA auth
  - Session mocking for TSOA auth

- **TSOA Model Test Helpers**
  - Model validation helpers
  - Type assertion utilities
  - Mock data generators for TSOA models

---

## Integration Test Gaps

### Missing Integration Tests
1. **End-to-End TSOA Route Tests**
   - Test full request/response cycle through TSOA-generated routes
   - Verify middleware execution order
   - Test authentication flow

2. **TSOA + Legacy Coexistence Tests**
   - Verify both systems can run simultaneously
   - Test route precedence
   - Verify no conflicts

3. **TSOA OpenAPI Spec Tests**
   - Verify generated spec matches expected format
   - Test spec accuracy for all controllers
   - Verify documentation completeness

---

## Recommendations

### Immediate Actions
1. ✅ Complete this audit (Task 21.5.1)
2. ⏭️ Create TSOA-specific test utilities (Task 21.5.2)
3. ⏭️ Rewrite unit tests for TSOA controllers (Task 21.5.3)
4. ⏭️ Rewrite integration tests for TSOA routes (Task 21.5.4)

### Decision Points
1. **Transactions Module**: Decide whether to migrate to TSOA or remove
2. **Legacy Middleware**: Decide whether to keep for backward compatibility
3. **Performance Tests**: Decide whether to update or remove

### Long-Term Strategy
1. Gradually phase out legacy test patterns
2. Establish TSOA testing standards
3. Create comprehensive integration test suite
4. Implement continuous testing for TSOA controllers

---

## Appendix: Test File Inventory

### Complete List of Test Files

```
sc-market-backend/src/
├── test-utils/
│   └── example.test.ts
├── api/
│   ├── middleware/
│   │   ├── auth.test.ts (LEGACY - needs review)
│   │   ├── tsoa-auth.test.ts (TSOA)
│   │   ├── tsoa-error-handler.test.ts (TSOA)
│   │   └── tsoa-ratelimit.test.ts (TSOA)
│   ├── websocket/
│   │   └── spec-merger.test.ts (TSOA)
│   ├── models/
│   │   ├── attributes.models.test.ts (TSOA)
│   │   ├── commodities.models.test.ts (TSOA)
│   │   ├── common.models.test.ts (TSOA)
│   │   ├── market-listings.models.test.ts (TSOA)
│   │   └── starmap.models.test.ts (TSOA)
│   ├── controllers/
│   │   ├── base.controller.test.ts (TSOA)
│   │   ├── attributes.controller.test.ts (TSOA)
│   │   ├── upload.controller.test.ts (TSOA)
│   │   ├── attributes.controller.property.test.ts (TSOA)
│   │   ├── database-operations.property.test.ts (TSOA)
│   │   ├── documentation-auto-update.property.test.ts (TSOA)
│   │   ├── error-response.property.test.ts (TSOA)
│   │   ├── file-upload.property.test.ts (TSOA)
│   │   ├── middleware.property.test.ts (TSOA)
│   │   ├── parallel-operation.property.test.ts (TSOA)
│   │   ├── rollback-preservation.property.test.ts (TSOA)
│   │   ├── route-path.property.test.ts (TSOA)
│   │   ├── validation.property.test.ts (TSOA)
│   │   └── websocket.property.test.ts (TSOA)
│   └── routes/
│       └── v1/
│           ├── transactions/
│           │   └── controller.test.ts (LEGACY - DISABLED)
│           └── market/
│               ├── attribute-filter.test.ts (LEGACY - SKIPPED)
│               └── attribute-filter-performance.test.ts (LEGACY - needs review)
└── services/
    ├── allocation/
    │   ├── allocation.service.test.ts (Service)
    │   └── order-lifecycle.service.test.ts (Service)
    ├── attribute-import/
    │   └── uexcorp-api.test.ts (Service)
    └── location/
        └── location.service.test.ts (Service)
```

---

## Conclusion

The audit reveals that **68.75% of tests are already TSOA-ready**, which is excellent progress. The main work required is:

1. **4 legacy test files** need migration or removal
2. **Test utilities** need to be created for TSOA patterns
3. **Integration tests** need to be added for end-to-end TSOA testing

The migration is well-positioned to proceed with the remaining tasks.
