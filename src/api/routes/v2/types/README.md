# Market V2 Types

This directory contains TypeScript type definitions for the Market V2 API.

## Files

- `market-v2-types.ts` - Core domain types, request/response types, and error types

## Type Categories

### Core Domain Types
- `Listing` - Unified listing table
- `ListingItem` - Items being sold in listings
- `ItemVariant` - Unique combinations of variant attributes
- `StockLot` - Physical inventory units
- `VariantPricing` - Per-variant pricing
- `VariantType` - Variant attribute definitions

### API Request Types
- `SearchListingsRequest` - Search with filters
- `CreateListingRequest` - Create new listing
- `UpdateListingRequest` - Update existing listing

### API Response Types
- `SearchListingsResponse` - Search results with pagination
- `ListingDetailResponse` - Listing detail with variant breakdown
- `VariantTypesResponse` - List of variant types
- `VariantTypeResponse` - Single variant type
- `ErrorResponse` - Standard error format

## Usage in Controllers

Import types in your TSOA controllers:

```typescript
import { Controller, Get, Post, Route, Tags, Body, Query } from "tsoa"
import { 
  SearchListingsRequest, 
  SearchListingsResponse,
  CreateListingRequest,
  Listing
} from "../types/market-v2-types.js"

@Route("listings")
@Tags("Listings V2")
export class ListingsV2Controller extends Controller {
  @Get("search")
  public async searchListings(
    @Query() text?: string,
    @Query() game_item_id?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20
  ): Promise<SearchListingsResponse> {
    // Implementation
  }
  
  @Post()
  public async createListing(
    @Body() request: CreateListingRequest
  ): Promise<Listing> {
    // Implementation
  }
}
```

## Type Alignment

These types match the database schema defined in:
- `migrations/20260416014900_market_v2_core_tables.ts`
- `.kiro/specs/market-v2-parallel-system/design.md`

When the database schema changes, update these types accordingly.

## Client Generation

The frontend TypeScript client is auto-generated from the OpenAPI spec:

1. Backend generates OpenAPI spec: `npm run tsoa:generate` (in sc-market-backend)
2. Frontend generates client: `npm run codegen:api` (in sc-market-frontend)

The generated client will be in `sc-market-frontend/src/store/api/market-v2.ts`
