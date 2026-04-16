# Market V2 Quick Start Guide

Quick reference for working with the Market V2 TSOA-based API.

## Quick Commands

```bash
# Backend: Generate OpenAPI spec and routes
cd sc-market-backend
npm run tsoa:generate

# Backend: Generate everything including frontend client
npm run generate:v2-client

# Frontend: Generate TypeScript client only
cd sc-market-frontend
npm run codegen:api
```

## File Locations

| What | Location |
|------|----------|
| Type definitions | `sc-market-backend/src/api/routes/v2/types/market-v2-types.ts` |
| Controllers | `sc-market-backend/src/api/routes/v2/[domain]/[Domain]Controller.ts` |
| Generated OpenAPI spec | `sc-market-backend/src/api/routes/v2/generated/swagger.json` |
| Generated routes | `sc-market-backend/src/api/routes/v2/generated/routes.ts` |
| Frontend client | `sc-market-frontend/src/store/api/market-v2.ts` |
| TSOA config | `sc-market-backend/tsoa.json` |

## Creating a New Endpoint

### 1. Define Types (if needed)

Add to `src/api/routes/v2/types/market-v2-types.ts`:

```typescript
export interface MyRequest {
  name: string;
  value: number;
}

export interface MyResponse {
  id: string;
  name: string;
  value: number;
}
```

### 2. Create Controller

Create `src/api/routes/v2/my-domain/MyDomainController.ts`:

```typescript
import { Controller, Get, Post, Route, Tags, Security, Body, Path } from "tsoa"
import { BaseController } from "../base/BaseController.js"
import { MyRequest, MyResponse } from "../types/market-v2-types.js"

@Route("my-domain")
@Tags("My Domain")
export class MyDomainController extends BaseController {
  
  @Get()
  public async getItems(): Promise<MyResponse[]> {
    return []
  }
  
  @Post()
  @Security("jwt")
  public async createItem(@Body() body: MyRequest): Promise<MyResponse> {
    const userId = this.getUserId()
    return { id: "123", ...body }
  }
  
  @Get("{id}")
  public async getItem(@Path() id: string): Promise<MyResponse> {
    return { id, name: "test", value: 0 }
  }
}
```

### 3. Generate Routes and Client

```bash
npm run generate:v2-client
```

### 4. Use in Frontend

```typescript
import { useGetItemsQuery, useCreateItemMutation } from "@/store/api/market-v2"

function MyComponent() {
  const { data, isLoading } = useGetItemsQuery()
  const [createItem] = useCreateItemMutation()
  
  const handleCreate = async () => {
    await createItem({ name: "Test", value: 100 })
  }
  
  return <div>{/* UI */}</div>
}
```

## Common Decorators

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@Route("path")` | Base path for controller | `@Route("listings")` |
| `@Tags("Name")` | OpenAPI tag grouping | `@Tags("Listings V2")` |
| `@Get()` | GET endpoint | `@Get()` or `@Get("{id}")` |
| `@Post()` | POST endpoint | `@Post()` |
| `@Put()` | PUT endpoint | `@Put("{id}")` |
| `@Delete()` | DELETE endpoint | `@Delete("{id}")` |
| `@Security("jwt")` | Require authentication | `@Security("jwt")` |
| `@Body()` | Request body parameter | `@Body() body: MyRequest` |
| `@Path()` | URL path parameter | `@Path() id: string` |
| `@Query()` | Query string parameter | `@Query() page: number` |

## Error Handling

```typescript
// 404 Not Found
throw this.throwNotFound("Resource", id)

// 401 Unauthorized
throw this.throwUnauthorized()

// 403 Forbidden
throw this.throwForbidden("Insufficient permissions")

// 400 Validation Error
throw this.throwValidationError("Invalid input", [
  { field: "name", message: "Name is required" }
])
```

## Authentication

Protected endpoints require `@Security("jwt")`:

```typescript
@Post()
@Security("jwt")
public async createItem(@Body() body: MyRequest): Promise<MyResponse> {
  const userId = this.getUserId() // Available after @Security
  // Implementation
}
```

## Testing Endpoints

### Using curl

```bash
# GET request
curl http://localhost:3001/api/v2/my-domain

# POST request with auth
curl -X POST http://localhost:3001/api/v2/my-domain \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"name":"test","value":100}'
```

### Using the API docs

Visit: http://localhost:3001/api/v2/docs

## Type Alignment Checklist

When creating new types, ensure they match:
- ✅ Database schema (migration files)
- ✅ Design document (`.kiro/specs/market-v2-parallel-system/design.md`)
- ✅ Requirements (`.kiro/specs/market-v2-parallel-system/requirements.md`)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Routes not generated | Run `npm run tsoa:generate` |
| Types not found | Check import paths use `.js` extension |
| Auth not working | Verify `@Security("jwt")` decorator |
| Client outdated | Run `npm run generate:v2-client` |
| 404 on endpoint | Check route is registered in `generated/routes.ts` |

## Next Steps

1. ✅ TSOA framework configured
2. ✅ Type definitions created
3. ✅ Client generation configured
4. ⏭️ Create controllers (Task 5+)
5. ⏭️ Implement business logic
6. ⏭️ Add tests

## Documentation

- Full setup guide: `TSOA_V2_SETUP.md`
- V2 API README: `src/api/routes/v2/README.md`
- Type definitions README: `src/api/routes/v2/types/README.md`
- Design document: `.kiro/specs/market-v2-parallel-system/design.md`
