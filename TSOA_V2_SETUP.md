# TSOA V2 API Setup Guide

This document describes the TSOA framework setup for the Market V2 API, including type definitions, OpenAPI generation, and TypeScript client generation.

## Overview

The Market V2 API uses TSOA (TypeScript OpenAPI) for:
- Type-safe API endpoint definitions using decorators
- Automatic OpenAPI 3.0 specification generation
- Automatic route registration
- TypeScript client generation for frontend

## Directory Structure

```
sc-market-backend/
├── tsoa.json                           # TSOA configuration
├── src/api/routes/v2/
│   ├── types/
│   │   ├── market-v2-types.ts         # Domain types, request/response types
│   │   └── README.md                   # Type documentation
│   ├── generated/                      # Auto-generated (do not edit)
│   │   ├── routes.ts                   # Route registration
│   │   └── swagger.json                # OpenAPI 3.0 spec
│   ├── base/
│   │   └── BaseController.ts           # Base controller class
│   ├── middleware/
│   │   └── tsoa-auth.ts                # Authentication handler
│   └── [domain]/
│       └── [Domain]Controller.ts       # TSOA controllers
└── scripts/
    └── generate-v2-client.sh           # Client generation script

sc-market-frontend/
├── openapi-codegen.config.ts           # Client generation config
├── spec/
│   └── sc-market-v2.openapi.json       # Copied from backend
└── src/store/api/
    └── market-v2.ts                    # Generated TypeScript client
```

## Configuration

### TSOA Configuration (tsoa.json)

```json
{
  "entryFile": "src/server.ts",
  "noImplicitAdditionalProperties": "throw-on-extras",
  "controllerPathGlobs": ["src/api/routes/v2/**/*Controller.ts"],
  "spec": {
    "outputDirectory": "src/api/routes/v2/generated",
    "specVersion": 3,
    "basePath": "/api/v2"
  },
  "routes": {
    "routesDir": "src/api/routes/v2/generated",
    "middleware": "express",
    "authenticationModule": "src/api/routes/v2/middleware/tsoa-auth.ts"
  }
}
```

Key settings:
- `controllerPathGlobs`: Finds all `*Controller.ts` files in v2 directory
- `basePath`: All routes are prefixed with `/api/v2`
- `specVersion`: Generates OpenAPI 3.0 specification
- `authenticationModule`: Custom authentication handler

### Frontend Client Configuration

The frontend uses `@rtk-query/codegen-openapi` to generate RTK Query hooks from the OpenAPI spec.

Configuration in `sc-market-frontend/openapi-codegen.config.ts`:
- `/api/v2` endpoints → `src/store/api/market-v2.ts`
- Generates RTK Query hooks with TypeScript types

## Type Definitions

All V2 types are defined in `src/api/routes/v2/types/market-v2-types.ts`:

### Core Domain Types
- `Listing` - Unified listing table
- `ListingItem` - Items in listings
- `ItemVariant` - Variant combinations
- `StockLot` - Physical inventory
- `VariantPricing` - Per-variant prices
- `VariantType` - Variant definitions

### Request Types
- `SearchListingsRequest`
- `CreateListingRequest`
- `UpdateListingRequest`

### Response Types
- `SearchListingsResponse`
- `ListingDetailResponse`
- `VariantTypesResponse`
- `ErrorResponse`

## Creating a Controller

Example controller for listings:

```typescript
import { Controller, Get, Post, Route, Tags, Security, Body, Query, Path } from "tsoa"
import { BaseController } from "../base/BaseController.js"
import { 
  SearchListingsRequest,
  SearchListingsResponse,
  CreateListingRequest,
  ListingDetailResponse,
  Listing
} from "../types/market-v2-types.js"

@Route("listings")
@Tags("Listings V2")
export class ListingsV2Controller extends BaseController {
  
  /**
   * Search listings with filters
   * @summary Search market listings
   */
  @Get("search")
  public async searchListings(
    @Query() text?: string,
    @Query() game_item_id?: string,
    @Query() quality_tier_min?: number,
    @Query() quality_tier_max?: number,
    @Query() price_min?: number,
    @Query() price_max?: number,
    @Query() page: number = 1,
    @Query() page_size: number = 20
  ): Promise<SearchListingsResponse> {
    // Implementation
    return {
      listings: [],
      total: 0,
      page,
      page_size
    }
  }
  
  /**
   * Get listing detail with variant breakdown
   * @summary Get listing details
   */
  @Get("{listing_id}")
  public async getListingDetail(
    @Path() listing_id: string
  ): Promise<ListingDetailResponse> {
    // Implementation
    throw this.throwNotFound("Listing", listing_id)
  }
  
  /**
   * Create new listing with variants
   * @summary Create listing
   */
  @Post()
  @Security("jwt")
  public async createListing(
    @Body() request: CreateListingRequest
  ): Promise<Listing> {
    const userId = this.getUserId() // From BaseController
    // Implementation
    throw new Error("Not implemented")
  }
}
```

## NPM Scripts

### Backend (sc-market-backend)

```bash
# Generate OpenAPI spec only
npm run tsoa:spec

# Generate route registration only
npm run tsoa:routes

# Generate both spec and routes
npm run tsoa:generate

# Generate spec, routes, and frontend client (all-in-one)
npm run generate:v2-client
```

### Frontend (sc-market-frontend)

```bash
# Generate TypeScript client from OpenAPI spec
npm run codegen:api
```

## Workflow

### 1. Create/Update Controller

```bash
# Create new controller
touch src/api/routes/v2/listings/ListingsV2Controller.ts

# Edit controller with TSOA decorators
```

### 2. Generate OpenAPI Spec and Routes

```bash
cd sc-market-backend
npm run tsoa:generate
```

This generates:
- `src/api/routes/v2/generated/swagger.json` - OpenAPI 3.0 spec
- `src/api/routes/v2/generated/routes.ts` - Route registration

### 3. Generate Frontend Client

Option A: Use the all-in-one script (recommended):
```bash
cd sc-market-backend
npm run generate:v2-client
```

Option B: Manual steps:
```bash
# Copy OpenAPI spec to frontend
cp sc-market-backend/src/api/routes/v2/generated/swagger.json \
   sc-market-frontend/spec/sc-market-v2.openapi.json

# Generate client
cd sc-market-frontend
npm run codegen:api
```

### 4. Use Generated Client in Frontend

```typescript
import { useSearchListingsQuery } from "@/store/api/market-v2"

function ListingSearch() {
  const { data, isLoading, error } = useSearchListingsQuery({
    text: "Aurora",
    page: 1,
    page_size: 20
  })
  
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  
  return (
    <div>
      {data?.listings.map(listing => (
        <div key={listing.listing_id}>{listing.title}</div>
      ))}
    </div>
  )
}
```

## Authentication

Use `@Security("jwt")` decorator for protected endpoints:

```typescript
@Post()
@Security("jwt")
public async createListing(@Body() request: CreateListingRequest): Promise<Listing> {
  const userId = this.getUserId() // Throws if not authenticated
  // Implementation
}
```

The authentication handler in `middleware/tsoa-auth.ts` supports:
- Session-based authentication (Passport.js)
- JWT token authentication (Bearer tokens)
- Scope validation for token-based auth

## Error Handling

Use helper methods from `BaseController`:

```typescript
// 404 Not Found
throw this.throwNotFound("Listing", listing_id)

// 401 Unauthorized
throw this.throwUnauthorized("Authentication required")

// 403 Forbidden
throw this.throwForbidden("Insufficient permissions")

// 400 Validation Error
throw this.throwValidationError("Invalid request", [
  { field: "title", message: "Title is required" }
])

// Custom business error
throw this.throwBusinessError("LISTING_EXPIRED", "This listing has expired")
```

## API Documentation

The OpenAPI spec is automatically served at:
- OpenAPI JSON: `http://localhost:3001/api/v2/openapi.json`
- Scalar UI: `http://localhost:3001/api/v2/docs`

## Testing

Test controllers using the generated types:

```typescript
import { describe, it, expect } from "vitest"
import { ListingsV2Controller } from "./ListingsV2Controller"
import type { CreateListingRequest } from "../types/market-v2-types"

describe("ListingsV2Controller", () => {
  it("should create listing", async () => {
    const controller = new ListingsV2Controller()
    const request: CreateListingRequest = {
      title: "Test Listing",
      description: "Test",
      game_item_id: "123",
      pricing_mode: "unified",
      base_price: 1000,
      lots: []
    }
    
    const result = await controller.createListing(request)
    expect(result.title).toBe("Test Listing")
  })
})
```

## Troubleshooting

### Routes not generated
- Check `controllerPathGlobs` in `tsoa.json`
- Ensure controller files end with `Controller.ts`
- Run `npm run tsoa:generate` to regenerate

### Types not matching database
- Update types in `src/api/routes/v2/types/market-v2-types.ts`
- Ensure types match migration files
- Regenerate OpenAPI spec

### Frontend client not updated
- Ensure OpenAPI spec is copied to frontend
- Run `npm run codegen:api` in frontend
- Check `openapi-codegen.config.ts` configuration

### Authentication not working
- Check `@Security("jwt")` decorator is present
- Verify `middleware/tsoa-auth.ts` is configured
- Check request includes valid JWT token or session

## References

- [TSOA Documentation](https://tsoa-community.github.io/docs/)
- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [RTK Query Codegen](https://redux-toolkit.js.org/rtk-query/usage/code-generation)
- [Market V2 Design Document](.kiro/specs/market-v2-parallel-system/design.md)
