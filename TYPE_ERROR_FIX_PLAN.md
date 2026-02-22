# Type Error Fix Plan

## Strategy

Fix all 126 TypeScript compilation errors systematically by category.

## Error Categories & Fix Approach

### 1. Test Utility Type Predicates (3 errors)
**Files**: `src/test-utils/tsoaTestHelpers.ts`
**Issue**: Mock `isAuthenticated` returns boolean instead of type predicate
**Fix**: Create proper type predicate function

### 2. Property Test Generator Types (59 errors)
**Files**: Multiple property test files
**Issue**: Generators produce types that don't match controller signatures
**Fix**: Add type assertions or update generators

### 3. OpenAPI Spec Type Assertions (10 errors)
**Files**: `documentation-auto-update.property.test.ts`, `rollback-preservation.property.test.ts`
**Issue**: OpenAPI spec objects typed as `unknown`
**Fix**: Add type assertions for OpenAPI types

### 4. Mock User Objects (16 errors)
**Files**: `database-operations.property.test.ts`
**Issue**: Mock users missing required properties
**Fix**: Create complete mock user objects

### 5. Legacy Route Imports (2 errors)
**Files**: `src/api/routes/v1/admin/*.ts`
**Issue**: Importing removed `openapi.js` file
**Fix**: Remove or update imports

### 6. Other Type Safety Issues (36 errors)
**Files**: Various
**Issue**: Null checks, readonly arrays, etc.
**Fix**: Add null checks, fix array mutability

## Execution Order

1. Fix test utilities (foundation)
2. Fix legacy route imports (blocking)
3. Fix mock user objects (common pattern)
4. Fix OpenAPI type assertions (common pattern)
5. Fix property test generators (bulk of errors)
6. Fix remaining type safety issues

## Estimated Time

- Test utilities: 15 minutes
- Legacy imports: 10 minutes
- Mock users: 30 minutes
- OpenAPI assertions: 20 minutes
- Property generators: 60 minutes
- Remaining issues: 45 minutes
- **Total**: ~3 hours

## Progress Tracking

- [ ] Test utility type predicates
- [ ] Legacy route imports
- [ ] Mock user objects
- [ ] OpenAPI type assertions
- [ ] Property test generators
- [ ] Remaining type safety issues
