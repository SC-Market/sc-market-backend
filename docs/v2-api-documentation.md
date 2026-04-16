# Market V2 API Documentation

**Version**: 2.0.0  
**Base URL**: `/api/v2`  
**Generated from**: OpenAPI 3.0 Specification

---

## Overview

The Market V2 API provides a comprehensive marketplace system with support for:
- **Unified listing model** - Single table replacing V1's 3-table structure
- **Flexible variant system** - JSONB-based attributes for quality tiers and crafting metadata
- **Per-variant pricing** - Different prices for different quality levels
- **Full-text search** - Fast PostgreSQL-based search with <50ms target
- **Quality tier filtering** - Filter by quality ranges (1-5)

---

## Authentication

**Status**: Currently no authentication required (development phase)

**Future**: Will require JWT token authentication via `Authorization: Bearer <token>` header.

---

## Error Responses

All endpoints return standardized error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "validationErrors": [
      {
        "field": "field_name",
        "message": "Field-specific error",
        "code": "validation_rule"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Database constraint violation |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

See [ERROR_HANDLING_DOCUMENTATION.md](../ERROR_HANDLING_DOCUMENTATION.md) for complete error handling details.

---

## Endpoints

### Health Check

#### `GET /health`

Check API health status.

**Response**: `200 OK`

```json
{
  "status": "ok",
  "version": "2.0.0",
  "timestamp": "2026-04-16T12:00:00.000Z"
}
```

---

### Variant Types

Variant types define the attributes that can be used when creating item variants (quality_tier, quality_value, crafted_source, blueprint_tier).

#### `GET /variant-types`

List all variant types with validation rules.

**Summary**: List all variant types

**Description**: Returns a list of all available variant types with their validation rules. Results are ordered by display_order for consistent UI presentation.

**Response**: `200 OK`

```json
{
  "variant_types": [
    {
      "variant_type_id": "uuid",
      "name": "quality_tier",
      "display_name": "Quality Tier",
      "description": "Item quality level from 1 (lowest) to 5 (highest)",
      "affects_pricing": true,
      "searchable": true,
      "filterable": true,
      "value_type": "integer",
      "min_value": 1,
      "max_value": 5,
      "allowed_values": ["1", "2", "3", "4", "5"],
      "display_order": 0,
      "icon": "star",
      "created_at": "2026-04-16T00:00:00.000Z"
    },
    {
      "variant_type_id": "uuid",
      "name": "quality_value",
      "display_name": "Quality Value",
      "description": "Precise quality percentage from 0 to 100",
      "affects_pricing": true,
      "searchable": false,
      "filterable": false,
      "value_type": "decimal",
      "min_value": 0,
      "max_value": 100,
      "allowed_values": null,
      "display_order": 1,
      "icon": "percent",
      "created_at": "2026-04-16T00:00:00.000Z"
    },
    {
      "variant_type_id": "uuid",
      "name": "crafted_source",
      "display_name": "Source",
      "description": "How the item was obtained",
      "affects_pricing": true,
      "searchable": true,
      "filterable": true,
      "value_type": "enum",
      "min_value": null,
      "max_value": null,
      "allowed_values": ["crafted", "store", "looted", "unknown"],
      "display_order": 2,
      "icon": "build",
      "created_at": "2026-04-16T00:00:00.000Z"
    }
  ]
}
```

**Field Descriptions**:

- `name`: Internal identifier (e.g., "quality_tier")
- `display_name`: User-facing label (e.g., "Quality Tier")
- `value_type`: Data type - `integer`, `decimal`, `string`, or `enum`
- `min_value`/`max_value`: Validation bounds for numeric types
- `allowed_values`: Valid enum values for enum types
- `affects_pricing`: Whether this attribute impacts pricing
- `searchable`: Whether this attribute can be searched
- `filterable`: Whether this attribute can be filtered in search

---

#### `GET /variant-types/{variant_type_id}`

Get variant type details by ID.

**Summary**: Get variant type details

**Parameters**:
- `variant_type_id` (path, required): Variant type ID to retrieve

**Response**: `200 OK`

```json
{
  "variant_type": {
    "variant_type_id": "uuid",
    "name": "quality_tier",
    "display_name": "Quality Tier",
    "description": "Item quality level from 1 (lowest) to 5 (highest)",
    "affects_pricing": true,
    "searchable": true,
    "filterable": true,
    "value_type": "integer",
    "min_value": 1,
    "max_value": 5,
    "allowed_values": ["1", "2", "3", "4", "5"],
    "display_order": 0,
    "icon": "star",
    "created_at": "2026-04-16T00:00:00.000Z"
  }
}
```

**Error Responses**:
- `404 NOT_FOUND`: Variant type not found

---

### Listings

#### `GET /listings/search`

Search active listings with filters.

**Summary**: Search market listings

**Description**: Searches active listings using full-text search, quality tier filters, price filters, and game item filters. Results are paginated and include price/quality ranges.

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `text` | string | No | - | Full-text search query |
| `game_item_id` | string | No | - | Filter by game item ID |
| `quality_tier_min` | number | No | - | Minimum quality tier (1-5) |
| `quality_tier_max` | number | No | - | Maximum quality tier (1-5) |
| `price_min` | number | No | - | Minimum price filter |
| `price_max` | number | No | - | Maximum price filter |
| `page` | number | No | 1 | Page number |
| `page_size` | number | No | 20 | Results per page (max: 100) |

**Response**: `200 OK`

```json
{
  "listings": [
    {
      "listing_id": "uuid",
      "title": "High Quality Weapons - Tier 4-5",
      "seller_name": "JohnDoe",
      "seller_rating": 4.8,
      "price_min": 50000,
      "price_max": 150000,
      "quantity_available": 25,
      "quality_tier_min": 4,
      "quality_tier_max": 5,
      "variant_count": 3,
      "created_at": "2026-04-15T10:30:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

**Field Descriptions**:

- `price_min`/`price_max`: Price range across all variants (in aUEC)
- `quality_tier_min`/`quality_tier_max`: Quality tier range across all variants
- `quantity_available`: Total quantity available across all variants
- `variant_count`: Number of unique variants in this listing
- `total`: Total number of listings matching filters
- `page`/`page_size`: Pagination metadata

**Example Requests**:

```bash
# Search for "weapon" with quality tier 4-5
GET /api/v2/listings/search?text=weapon&quality_tier_min=4

# Filter by game item and price range
GET /api/v2/listings/search?game_item_id=abc-123&price_min=10000&price_max=50000

# Paginated results
GET /api/v2/listings/search?page=2&page_size=50
```

**Performance**: Target <50ms response time for all search queries.

---

#### `GET /listings/{listing_id}`

Get listing detail with variant breakdown.

**Summary**: Get listing details

**Description**: Returns comprehensive listing information including seller details, game item info, and a breakdown of all variants with their attributes, quantities, and prices.

**Parameters**:
- `listing_id` (path, required): Listing ID to retrieve

**Response**: `200 OK`

```json
{
  "listing": {
    "listing_id": "uuid",
    "seller_id": "uuid",
    "seller_type": "user",
    "title": "High Quality Weapons - Tier 4-5",
    "description": "Premium crafted weapons with high quality tiers",
    "status": "active",
    "visibility": "public",
    "sale_type": "fixed",
    "listing_type": "single",
    "created_at": "2026-04-15T10:30:00.000Z",
    "updated_at": "2026-04-15T10:30:00.000Z",
    "expires_at": null
  },
  "seller": {
    "id": "uuid",
    "name": "JohnDoe",
    "type": "user",
    "rating": 4.8
  },
  "items": [
    {
      "item_id": "uuid",
      "game_item": {
        "game_item_id": "uuid",
        "name": "P4-AR Rifle",
        "type": "weapon",
        "icon_url": "https://example.com/icon.png"
      },
      "pricing_mode": "per_variant",
      "base_price": null,
      "variants": [
        {
          "variant_id": "uuid",
          "attributes": {
            "quality_tier": 5,
            "quality_value": 95.5,
            "crafted_source": "crafted"
          },
          "display_name": "Tier 5 (95.5%) - Crafted",
          "short_name": "T5 Crafted",
          "quantity": 5,
          "price": 150000,
          "locations": ["Port Olisar", "Area18"]
        },
        {
          "variant_id": "uuid",
          "attributes": {
            "quality_tier": 4,
            "quality_value": 80.0,
            "crafted_source": "crafted"
          },
          "display_name": "Tier 4 (80.0%) - Crafted",
          "short_name": "T4 Crafted",
          "quantity": 10,
          "price": 100000,
          "locations": ["Port Olisar"]
        }
      ]
    }
  ]
}
```

**Field Descriptions**:

- `listing.status`: `active`, `sold`, `expired`, or `cancelled`
- `listing.sale_type`: `fixed`, `auction`, or `negotiable`
- `listing.listing_type`: `single`, `bundle`, or `bulk`
- `pricing_mode`: `unified` (one price) or `per_variant` (different prices)
- `base_price`: Used when pricing_mode is `unified`
- `variants`: Array of available variants with attributes, quantities, and prices
- `locations`: Array of location names where this variant is available

**Error Responses**:
- `404 NOT_FOUND`: Listing not found

---

#### `POST /listings`

Create a new listing with variants.

**Summary**: Create listing

**Description**: Creates a listing with stock lots and variant pricing in a single atomic transaction. Supports both unified pricing (one price for all variants) and per-variant pricing.

**Request Body**:

```json
{
  "title": "High Quality Weapons - Tier 4-5",
  "description": "Premium crafted weapons with high quality tiers",
  "game_item_id": "uuid",
  "pricing_mode": "per_variant",
  "base_price": null,
  "lots": [
    {
      "quantity": 5,
      "variant_attributes": {
        "quality_tier": 5,
        "quality_value": 95.5,
        "crafted_source": "crafted"
      },
      "location_id": "uuid",
      "price": 150000
    },
    {
      "quantity": 10,
      "variant_attributes": {
        "quality_tier": 4,
        "quality_value": 80.0,
        "crafted_source": "crafted"
      },
      "location_id": "uuid",
      "price": 100000
    }
  ]
}
```

**Field Descriptions**:

- `title` (required): Listing title (max 500 characters)
- `description` (required): Listing description (markdown supported)
- `game_item_id` (required): Game item UUID
- `pricing_mode` (required): `unified` or `per_variant`
- `base_price` (required if unified): Price for all variants
- `lots` (required): Array of stock lots with variant attributes
  - `quantity` (required): Number of items in this lot
  - `variant_attributes` (required): Variant attributes object
    - `quality_tier`: Integer 1-5
    - `quality_value`: Decimal 0-100
    - `crafted_source`: `crafted`, `store`, `looted`, or `unknown`
    - `blueprint_tier`: Integer 1-5 (optional)
  - `location_id` (optional): Location UUID
  - `price` (required if per_variant): Price for this variant

**Response**: `200 OK`

```json
{
  "listing_id": "uuid",
  "seller_id": "uuid",
  "seller_type": "user",
  "title": "High Quality Weapons - Tier 4-5",
  "description": "Premium crafted weapons with high quality tiers",
  "status": "active",
  "visibility": "public",
  "sale_type": "fixed",
  "listing_type": "single",
  "created_at": "2026-04-15T10:30:00.000Z",
  "updated_at": "2026-04-15T10:30:00.000Z",
  "expires_at": null
}
```

**Error Responses**:

- `400 VALIDATION_ERROR`: Invalid request data
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Validation failed",
      "validationErrors": [
        {
          "field": "title",
          "message": "Title is required",
          "code": "required"
        },
        {
          "field": "lots[0].variant_attributes.quality_tier",
          "message": "Quality tier must be between 1 and 5",
          "code": "range"
        }
      ]
    }
  }
  ```

- `409 CONFLICT`: Database constraint violation (e.g., invalid game_item_id)

**Transaction Behavior**:

All operations (listing creation, variant creation, stock lot creation, pricing creation) are performed in a single atomic transaction. If any step fails, the entire transaction is rolled back.

---

## Data Models

### Listing

```typescript
interface Listing {
  listing_id: string;
  seller_id: string;
  seller_type: 'user' | 'contractor';
  title: string;
  description: string;
  status: 'active' | 'sold' | 'expired' | 'cancelled';
  visibility: 'public' | 'private' | 'unlisted';
  sale_type: 'fixed' | 'auction' | 'negotiable';
  listing_type: 'single' | 'bundle' | 'bulk';
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
  expires_at?: string; // ISO 8601 datetime
}
```

### Variant Attributes

```typescript
interface VariantAttributes {
  quality_tier?: number; // 1-5
  quality_value?: number; // 0-100
  crafted_source?: 'crafted' | 'store' | 'looted' | 'unknown';
  blueprint_tier?: number; // 1-5
  // Additional attributes can be added without schema changes
}
```

### Variant Type

```typescript
interface VariantType {
  variant_type_id: string;
  name: string;
  display_name: string;
  description?: string;
  affects_pricing: boolean;
  searchable: boolean;
  filterable: boolean;
  value_type: 'integer' | 'decimal' | 'string' | 'enum';
  min_value?: number;
  max_value?: number;
  allowed_values?: string[];
  display_order: number;
  icon?: string;
  created_at: string; // ISO 8601 datetime
}
```

---

## Rate Limiting

**Status**: Not currently implemented

**Future**: Will implement rate limiting with the following limits:
- 100 requests per minute per IP for search endpoints
- 20 requests per minute per IP for create/update endpoints

---

## Versioning

**Current Version**: 2.0.0

**API Versioning Strategy**: URL-based versioning (`/api/v2/`)

**Deprecation Policy**: V1 API will remain available until V2 is fully rolled out and stable. Deprecation notices will be provided at least 3 months before V1 shutdown.

---

## Performance

**Search Performance Target**: <50ms for 95th percentile

**Optimization Techniques**:
- PostgreSQL GIN indexes for full-text search
- Covering indexes for common filter combinations
- Denormalized `listing_search` view for fast queries
- Database triggers for real-time quantity computation

**Monitoring**: See [Monitoring and Alerting](#monitoring-and-alerting) section in troubleshooting guide.

---

## OpenAPI Specification

The complete OpenAPI 3.0 specification is available at:
- **File**: `src/api/routes/v2/generated/swagger.json`
- **Runtime**: `/api/v2/swagger.json` (when served)

Use this specification to:
- Generate client SDKs in any language
- Import into API testing tools (Postman, Insomnia)
- Generate interactive API documentation (Swagger UI, Redoc)

---

## Client SDK Generation

### TypeScript/JavaScript

The frontend uses auto-generated RTK Query clients:

```typescript
import { useSearchListingsQuery } from '@/api/generated/marketV2Api';

const { data, isLoading, error } = useSearchListingsQuery({
  text: 'weapon',
  quality_tier_min: 4,
  page: 1,
  page_size: 20
});
```

### Other Languages

Use OpenAPI Generator to create clients:

```bash
# Python
openapi-generator-cli generate -i swagger.json -g python -o ./client

# Java
openapi-generator-cli generate -i swagger.json -g java -o ./client

# Go
openapi-generator-cli generate -i swagger.json -g go -o ./client
```

---

## Support

For issues, questions, or feature requests:
- **Documentation**: See [troubleshooting guide](./v2-troubleshooting-guide.md)
- **Error Handling**: See [ERROR_HANDLING_DOCUMENTATION.md](../ERROR_HANDLING_DOCUMENTATION.md)
- **Migration**: See [v2-migration-guide.md](./v2-migration-guide.md)
