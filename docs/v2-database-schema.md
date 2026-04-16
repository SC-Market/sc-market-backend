# Market V2 Database Schema Documentation

**Version**: 2.0.0  
**Migration System**: Knex.js  
**Database**: PostgreSQL 12+

---

## Overview

The Market V2 database schema implements a unified listing model with flexible variant support. Key improvements over V1:

- **Single listings table** replaces V1's 3-table structure (unique_listings, aggregate_listings, multiple_listings)
- **JSONB variant attributes** enable adding new attributes without schema migrations
- **Automatic quantity computation** via database triggers
- **Denormalized search view** for <50ms query performance
- **Full-text search** with PostgreSQL GIN indexes

---

## Table of Contents

1. [Core Tables](#core-tables)
2. [Database Triggers](#database-triggers)
3. [Views](#views)
4. [Indexes](#indexes)
5. [Entity Relationship Diagram](#entity-relationship-diagram)
6. [Migration System](#migration-system)

---

## Core Tables

### variant_types

**Purpose**: Defines available variant attribute types and validation rules.

**Migration**: `20260416014900_market_v2_core_tables.ts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| variant_type_id | UUID | No | gen_random_uuid() | Primary key |
| name | VARCHAR(100) | No | - | Internal identifier (e.g., "quality_tier") |
| display_name | VARCHAR(200) | No | - | User-facing label (e.g., "Quality Tier") |
| description | TEXT | Yes | - | Detailed description |
| affects_pricing | BOOLEAN | No | true | Whether this attribute impacts pricing |
| searchable | BOOLEAN | No | true | Whether this attribute can be searched |
| filterable | BOOLEAN | No | true | Whether this attribute can be filtered |
| value_type | ENUM | No | - | Data type: integer, decimal, string, enum |
| min_value | DECIMAL(10,2) | Yes | - | Minimum value for numeric types |
| max_value | DECIMAL(10,2) | Yes | - | Maximum value for numeric types |
| allowed_values | JSONB | Yes | - | Valid enum values for enum types |
| display_order | INTEGER | No | 0 | Display order in UI |
| icon | VARCHAR(100) | Yes | - | Icon identifier |
| created_at | TIMESTAMP | No | NOW() | Creation timestamp |

**Indexes**:
- `PRIMARY KEY (variant_type_id)`
- `UNIQUE (name)`
- `idx_variant_types_searchable` on `searchable` WHERE `searchable = true`

**Seeded Data**:
```sql
-- quality_tier: Integer 1-5
-- quality_value: Decimal 0-100
-- crafted_source: Enum (crafted, store, looted, unknown)
-- blueprint_tier: Integer 1-5
```

**Relationships**:
- Referenced by: `item_variants` (validation)

---

### listings

**Purpose**: Unified listing table replacing V1's 3-table structure.

**Migration**: `20260416014900_market_v2_core_tables.ts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| listing_id | UUID | No | gen_random_uuid() | Primary key |
| seller_id | UUID | No | - | User or contractor ID |
| seller_type | ENUM | No | - | 'user' or 'contractor' |
| title | VARCHAR(500) | No | - | Listing title |
| description | TEXT | Yes | - | Listing description (markdown) |
| status | ENUM | No | 'active' | active, sold, expired, cancelled |
| visibility | ENUM | No | 'public' | public, private, unlisted |
| sale_type | ENUM | No | 'fixed' | fixed, auction, negotiable |
| listing_type | ENUM | No | 'single' | single, bundle, bulk |
| created_at | TIMESTAMP | No | NOW() | Creation timestamp |
| updated_at | TIMESTAMP | No | NOW() | Last update timestamp |
| expires_at | TIMESTAMP | Yes | - | Expiration timestamp |

**Indexes**:
- `PRIMARY KEY (listing_id)`
- `idx_listings_seller` on `(seller_id, seller_type)`
- `idx_listings_status_created` on `(status, created_at)` WHERE `status = 'active'`
- `idx_listings_created_at_desc` on `created_at DESC` WHERE `status = 'active'`
- `idx_listings_search_vector` GIN index for full-text search

**Relationships**:
- Referenced by: `listing_items`
- References: `accounts.user_id` (seller_id when seller_type='user')
- References: `contractors.contractor_id` (seller_id when seller_type='contractor')

**Notes**:
- `listing_type` replaces V1's separate tables:
  - `single` = V1 unique_listings
  - `bundle` = V1 multiple_listings
  - `bulk` = V1 aggregate_listings

---

### listing_items

**Purpose**: Items being sold in listings with pricing configuration.

**Migration**: `20260416014900_market_v2_core_tables.ts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| item_id | UUID | No | gen_random_uuid() | Primary key |
| listing_id | UUID | No | - | Foreign key to listings |
| game_item_id | UUID | No | - | Foreign key to game_items |
| pricing_mode | ENUM | No | 'unified' | unified or per_variant |
| base_price | BIGINT | Yes | - | Price when pricing_mode='unified' |
| display_order | INTEGER | No | 0 | Display order for bundles |
| quantity_available | INTEGER | No | 0 | **Computed by trigger** |
| variant_count | INTEGER | No | 0 | **Computed by trigger** |

**Indexes**:
- `PRIMARY KEY (item_id)`
- `idx_listing_items_listing` on `listing_id`
- `idx_listing_items_game_item` on `game_item_id`

**Relationships**:
- References: `listings.listing_id` ON DELETE CASCADE
- References: `game_items.id` (game_item_id)
- Referenced by: `listing_item_lots`, `variant_pricing`

**Computed Fields**:
- `quantity_available`: Sum of `listing_item_lots.quantity_total` WHERE `listed = true`
- `variant_count`: Count of distinct `variant_id` in `listing_item_lots` WHERE `listed = true`
- Updated automatically by `trg_listing_item_lots_quantity` trigger

**Pricing Modes**:
- `unified`: All variants have same price (stored in `base_price`)
- `per_variant`: Each variant has different price (stored in `variant_pricing` table)

---

### item_variants

**Purpose**: Unique combinations of variant attributes for game items.

**Migration**: `20260416014900_market_v2_core_tables.ts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| variant_id | UUID | No | gen_random_uuid() | Primary key |
| game_item_id | UUID | No | - | Foreign key to game_items |
| attributes | JSONB | No | - | Variant attributes (flexible schema) |
| attributes_hash | VARCHAR(64) | No | **GENERATED** | SHA256 hash for deduplication |
| display_name | VARCHAR(200) | Yes | - | Human-readable name |
| short_name | VARCHAR(100) | Yes | - | Abbreviated name |
| base_price_modifier | DECIMAL(5,2) | Yes | - | Price multiplier (optional) |
| fixed_price_override | BIGINT | Yes | - | Fixed price override (optional) |
| created_at | TIMESTAMP | No | NOW() | Creation timestamp |

**Indexes**:
- `PRIMARY KEY (variant_id)`
- `UNIQUE (game_item_id, attributes_hash)`
- `idx_item_variants_game_item` on `game_item_id`
- `idx_item_variants_attributes` GIN index on `attributes`

**Relationships**:
- References: `game_items.id` (game_item_id)
- Referenced by: `listing_item_lots`, `variant_pricing`

**Attributes JSONB Structure**:
```json
{
  "quality_tier": 5,
  "quality_value": 95.5,
  "crafted_source": "crafted",
  "blueprint_tier": 3
}
```

**Deduplication**:
- `attributes_hash` is a generated column: `encode(digest(attributes::text, 'sha256'), 'hex')`
- Unique constraint on `(game_item_id, attributes_hash)` prevents duplicate variants
- Attribute order doesn't matter (normalized before hashing)

**Display Names**:
- `display_name`: "Tier 5 (95.5%) - Crafted"
- `short_name`: "T5 Crafted"
- Generated automatically by application code

---

### listing_item_lots

**Purpose**: Physical inventory units with specific variant attributes and locations.

**Migration**: `20260416014900_market_v2_core_tables.ts`

**Note**: This table is distinct from V1's `stock_lots` table which is tied to `market_listings`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| lot_id | UUID | No | gen_random_uuid() | Primary key |
| item_id | UUID | No | - | Foreign key to listing_items |
| variant_id | UUID | No | - | Foreign key to item_variants |
| quantity_total | INTEGER | No | - | Total quantity in this lot |
| location_id | UUID | Yes | - | Foreign key to locations |
| owner_id | UUID | Yes | - | Foreign key to accounts |
| listed | BOOLEAN | No | true | Whether lot is available for sale |
| notes | VARCHAR(1000) | Yes | - | Optional notes |
| crafted_by | UUID | Yes | - | Foreign key to accounts (crafter) |
| crafted_at | TIMESTAMP | Yes | - | Crafting timestamp |
| created_at | TIMESTAMP | No | NOW() | Creation timestamp |
| updated_at | TIMESTAMP | No | NOW() | Last update timestamp |

**Indexes**:
- `PRIMARY KEY (lot_id)`
- `idx_listing_item_lots_item` on `item_id`
- `idx_listing_item_lots_variant` on `variant_id`
- `idx_listing_item_lots_location` on `location_id`
- `idx_listing_item_lots_listed` on `listed` WHERE `listed = true`
- `idx_listing_item_lots_item_listed` on `(item_id, listed)`

**Relationships**:
- References: `listing_items.item_id` ON DELETE CASCADE
- References: `item_variants.variant_id`
- References: `locations.location_id` (location_id)
- References: `accounts.user_id` (owner_id, crafted_by)

**Constraints**:
- `CHECK (quantity_total >= 0)`

**Trigger Behavior**:
- INSERT/UPDATE/DELETE triggers `update_quantity_available()` function
- Updates `listing_items.quantity_available` and `variant_count`

---

### variant_pricing

**Purpose**: Per-variant pricing when pricing_mode = 'per_variant'.

**Migration**: `20260416014900_market_v2_core_tables.ts`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| pricing_id | UUID | No | gen_random_uuid() | Primary key |
| item_id | UUID | No | - | Foreign key to listing_items |
| variant_id | UUID | No | - | Foreign key to item_variants |
| price | BIGINT | No | - | Price for this variant (in aUEC) |
| created_at | TIMESTAMP | No | NOW() | Creation timestamp |
| updated_at | TIMESTAMP | No | NOW() | Last update timestamp |

**Indexes**:
- `PRIMARY KEY (pricing_id)`
- `UNIQUE (item_id, variant_id)`
- `idx_variant_pricing_item` on `item_id`

**Relationships**:
- References: `listing_items.item_id` ON DELETE CASCADE
- References: `item_variants.variant_id` ON DELETE CASCADE

**Usage**:
- Only populated when `listing_items.pricing_mode = 'per_variant'`
- When `pricing_mode = 'unified'`, use `listing_items.base_price` instead

---

## Database Triggers

### update_quantity_available()

**Purpose**: Automatically maintains `listing_items.quantity_available` and `variant_count` accuracy.

**Migration**: `20260416014954_market_v2_quantity_triggers.ts`

**Trigger**: `trg_listing_item_lots_quantity`

**Events**: AFTER INSERT OR UPDATE OR DELETE ON `listing_item_lots`

**Function Logic**:
```sql
UPDATE listing_items
SET 
  quantity_available = (
    SELECT COALESCE(SUM(quantity_total), 0)
    FROM listing_item_lots
    WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
      AND listed = true
  ),
  variant_count = (
    SELECT COUNT(DISTINCT variant_id)
    FROM listing_item_lots
    WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
      AND listed = true
  )
WHERE item_id = COALESCE(NEW.item_id, OLD.item_id);
```

**Behavior**:
- Recalculates `quantity_available` as sum of `quantity_total` WHERE `listed = true`
- Recalculates `variant_count` as count of distinct `variant_id` WHERE `listed = true`
- Executes on every INSERT, UPDATE, or DELETE to `listing_item_lots`
- Ensures real-time accuracy without application-level computation

**Performance**: O(n) where n = number of lots per item (typically <10)

---

## Views

### listing_search

**Purpose**: Denormalized view for fast search queries with computed price and quality ranges.

**Migration**: `20260416015032_market_v2_search_view.ts`

**Type**: Regular view (not materialized) for real-time data

**Columns**:

| Column | Type | Description |
|--------|------|-------------|
| listing_id | UUID | Listing ID |
| seller_id | UUID | Seller ID |
| seller_type | ENUM | 'user' or 'contractor' |
| title | VARCHAR(500) | Listing title |
| description | TEXT | Listing description |
| status | ENUM | Listing status |
| sale_type | ENUM | Sale type |
| listing_type | ENUM | Listing type |
| created_at | TIMESTAMP | Creation timestamp |
| item_id | UUID | Item ID |
| game_item_id | UUID | Game item ID |
| quantity_available | INTEGER | Total quantity available |
| variant_count | INTEGER | Number of variants |
| pricing_mode | ENUM | Pricing mode |
| base_price | BIGINT | Base price (if unified) |
| item_name | VARCHAR | Game item name |
| item_type | VARCHAR | Game item type |
| seller_name | VARCHAR | Seller username or contractor name |
| seller_rating | FLOAT | Seller average rating |
| **price_min** | BIGINT | **Minimum price across variants** |
| **price_max** | BIGINT | **Maximum price across variants** |
| **quality_tier_min** | INTEGER | **Minimum quality tier (1-5)** |
| **quality_tier_max** | INTEGER | **Maximum quality tier (1-5)** |
| **search_vector** | TSVECTOR | **Full-text search vector** |

**Computed Fields**:

**price_min / price_max**:
```sql
CASE 
  WHEN pricing_mode = 'unified' THEN base_price
  ELSE (SELECT MIN/MAX(price) FROM variant_pricing WHERE item_id = li.item_id)
END
```

**quality_tier_min / quality_tier_max**:
```sql
SELECT MIN/MAX((iv.attributes->>'quality_tier')::integer)
FROM listing_item_lots sl
JOIN item_variants iv ON sl.variant_id = iv.variant_id
WHERE sl.item_id = li.item_id AND sl.listed = true
```

**search_vector**:
```sql
setweight(to_tsvector('english', title), 'A') ||
setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
setweight(to_tsvector('english', item_name), 'A')
```

**Filters**:
- Only includes listings WHERE `status = 'active'`

**Performance**:
- Target: <50ms for all queries
- Optimized with GIN indexes on base tables
- No materialization needed for <200 active listings

**Usage Example**:
```sql
SELECT * FROM listing_search
WHERE search_vector @@ to_tsquery('english', 'weapon')
  AND quality_tier_min >= 4
  AND price_max <= 100000
ORDER BY created_at DESC
LIMIT 20;
```

---

## Indexes

### Full-Text Search Indexes

**idx_listings_search_vector** (GIN)
- **Table**: `listings`
- **Expression**: `to_tsvector('english', title) || to_tsvector('english', COALESCE(description, ''))`
- **Purpose**: Full-text search on listing title and description
- **Migration**: `20260416015059_market_v2_search_indexes.ts`

**idx_game_items_search_vector** (GIN)
- **Table**: `game_items`
- **Expression**: `to_tsvector('english', name)`
- **Purpose**: Full-text search on game item names
- **Migration**: `20260416015059_market_v2_search_indexes.ts`

### Filtering Indexes

**idx_listings_status_created** (B-tree, partial)
- **Table**: `listings`
- **Columns**: `(status, created_at DESC)`
- **Predicate**: `WHERE status = 'active'`
- **Purpose**: Fast queries for active listings sorted by date
- **Migration**: `20260416014900_market_v2_core_tables.ts`

**idx_listing_items_game_item** (B-tree)
- **Table**: `listing_items`
- **Columns**: `game_item_id`
- **Purpose**: Filter listings by game item
- **Migration**: `20260416014900_market_v2_core_tables.ts`

**idx_item_variants_attributes** (GIN)
- **Table**: `item_variants`
- **Columns**: `attributes`
- **Purpose**: JSONB queries on variant attributes
- **Migration**: `20260416014900_market_v2_core_tables.ts`

### Quantity Computation Indexes

**idx_listing_item_lots_item_listed** (B-tree, composite)
- **Table**: `listing_item_lots`
- **Columns**: `(item_id, listed)`
- **Purpose**: Efficient quantity computation in trigger
- **Migration**: `20260416015014_market_v2_indexes.ts`

**idx_listing_item_lots_listed** (B-tree, partial)
- **Table**: `listing_item_lots`
- **Columns**: `listed`
- **Predicate**: `WHERE listed = true`
- **Purpose**: Filter available lots
- **Migration**: `20260416014900_market_v2_core_tables.ts`

### Relationship Indexes

**idx_listings_seller** (B-tree, composite)
- **Table**: `listings`
- **Columns**: `(seller_id, seller_type)`
- **Purpose**: Query listings by seller
- **Migration**: `20260416014900_market_v2_core_tables.ts`

**idx_listing_items_listing** (B-tree)
- **Table**: `listing_items`
- **Columns**: `listing_id`
- **Purpose**: Join listings to items
- **Migration**: `20260416014900_market_v2_core_tables.ts`

**idx_listing_item_lots_variant** (B-tree)
- **Table**: `listing_item_lots`
- **Columns**: `variant_id`
- **Purpose**: Join lots to variants
- **Migration**: `20260416014900_market_v2_core_tables.ts`

---

## Entity Relationship Diagram

```
┌─────────────────┐
│  variant_types  │
│  (seed data)    │
└─────────────────┘
         │
         │ (validation)
         ▼
┌─────────────────┐       ┌─────────────────┐
│    listings     │──────▶│  listing_items  │
│  (unified)      │       │  (items sold)   │
└─────────────────┘       └─────────────────┘
         │                         │
         │                         ├──────────────┐
         │                         │              │
         │                         ▼              ▼
         │                ┌─────────────────┐  ┌──────────────────┐
         │                │ item_variants   │  │ variant_pricing  │
         │                │ (JSONB attrs)   │  │ (per-variant $)  │
         │                └─────────────────┘  └──────────────────┘
         │                         │
         │                         │
         │                         ▼
         │                ┌──────────────────────┐
         │                │ listing_item_lots    │
         │                │ (physical inventory) │
         │                └──────────────────────┘
         │                         │
         │                         │ (trigger)
         │                         ▼
         │                [update_quantity_available()]
         │                         │
         │                         ▼
         │                [listing_items.quantity_available]
         │
         ▼
┌─────────────────────────────────────────────┐
│           listing_search VIEW               │
│  (denormalized for fast queries)            │
│  - price_min, price_max                     │
│  - quality_tier_min, quality_tier_max       │
│  - search_vector (full-text)                │
└─────────────────────────────────────────────┘
```

**Key Relationships**:

1. **listings** → **listing_items** (1:N)
   - One listing can have multiple items (for bundles)

2. **listing_items** → **listing_item_lots** (1:N)
   - One item can have multiple lots (different variants/locations)

3. **listing_items** → **variant_pricing** (1:N)
   - One item can have multiple variant prices (when per_variant mode)

4. **item_variants** → **listing_item_lots** (1:N)
   - One variant can be used in multiple lots

5. **game_items** → **listing_items** (1:N)
   - One game item can be listed multiple times

6. **game_items** → **item_variants** (1:N)
   - One game item can have multiple variants

**Cascade Behavior**:
- Deleting a `listing` cascades to `listing_items`
- Deleting a `listing_item` cascades to `listing_item_lots` and `variant_pricing`
- Deleting an `item_variant` cascades to `listing_item_lots` and `variant_pricing`

---

## Migration System

### Knex.js Migrations

**Configuration**: `knexfile.ts`

**Migration Directory**: `migrations/`

**Tracking Table**: `knex_migrations`

### V2 Migrations

| Order | Migration File | Description |
|-------|----------------|-------------|
| 1 | `20260416014900_market_v2_core_tables.ts` | Core tables, enums, seed data |
| 2 | `20260416014954_market_v2_quantity_triggers.ts` | Quantity computation trigger |
| 3 | `20260416015014_market_v2_indexes.ts` | Additional optimization indexes |
| 4 | `20260416015032_market_v2_search_view.ts` | Denormalized search view |
| 5 | `20260416015059_market_v2_search_indexes.ts` | Full-text search indexes |
| 6 | `20260416030903_market_v2_feature_flags.ts` | Feature flag system |

### Migration Commands

```bash
# Create new migration
npm run migrate:make migration_name

# Apply all pending migrations
npm run migrate:latest

# Rollback last batch
npm run migrate:rollback

# Check migration status
npm run migrate:status
```

### Migration Best Practices

1. **Always test rollback**: Every `up()` must have a working `down()`
2. **Use transactions**: Knex wraps migrations in transactions automatically
3. **Add comments**: Use `table.comment()` and `COMMENT ON` for documentation
4. **Create indexes separately**: Large indexes in separate migrations for faster rollback
5. **Seed critical data**: Seed `variant_types` in core tables migration

### V1 Migrations

**Status**: Unchanged

V1 migrations (0-schema.sql through 61-order-alert-subscriptions.sql) remain as-is. V2 migrations start from the current database state and add new tables without modifying V1 tables.

---

## Performance Considerations

### Query Performance Targets

- **Search queries**: <50ms (95th percentile)
- **Listing detail**: <20ms
- **Listing creation**: <100ms (includes transaction)

### Optimization Techniques

1. **Denormalized view**: `listing_search` pre-computes price/quality ranges
2. **GIN indexes**: Full-text search on title, description, item name
3. **Partial indexes**: Only index active listings for common queries
4. **Composite indexes**: `(item_id, listed)` for trigger efficiency
5. **Database triggers**: Real-time quantity computation without application overhead

### Scaling Considerations

**Current Design**: Optimized for <200 active listings

**Future Scaling** (if needed):
- Materialize `listing_search` view with refresh triggers
- Add Redis caching layer for hot listings
- Partition `listing_item_lots` by listing_id
- Consider Elasticsearch for >1000 listings

---

## Data Integrity

### Constraints

**Foreign Keys**:
- All relationships enforced with `REFERENCES` constraints
- Cascade deletes prevent orphaned records

**Check Constraints**:
- `quantity_total >= 0` on `listing_item_lots`

**Unique Constraints**:
- `(game_item_id, attributes_hash)` on `item_variants` prevents duplicates
- `(item_id, variant_id)` on `variant_pricing` prevents duplicate prices

### Triggers

**update_quantity_available()**:
- Maintains `quantity_available` and `variant_count` accuracy
- Executes on every `listing_item_lots` change
- Prevents stale quantity data

### ACID Compliance

All listing creation operations use database transactions:
1. Insert `listing`
2. Insert `listing_items`
3. Get or create `item_variants`
4. Insert `listing_item_lots`
5. Insert `variant_pricing` (if per_variant mode)

If any step fails, entire transaction rolls back.

---

## Backup and Recovery

### Backup Strategy

**Full Backup**: Daily at 2 AM UTC

**Incremental Backup**: Every 6 hours

**Point-in-Time Recovery**: Enabled with WAL archiving

### Rollback Procedures

**Schema Rollback**:
```bash
# Rollback last migration batch
npm run migrate:rollback

# Rollback specific migration
npm run migrate:rollback --all
```

**Data Rollback**:
- Restore from backup
- V1 data remains unchanged (V2 is read-only from V1)

---

## Monitoring

### Key Metrics

**Query Performance**:
- `listing_search` query latency (p50, p95, p99)
- Slow query log (>50ms)

**Data Volume**:
- Active listings count
- Total variants count
- Average variants per listing

**Trigger Performance**:
- `update_quantity_available()` execution time
- Trigger invocation frequency

### Alerts

- Search query latency >50ms (p95)
- Trigger execution time >10ms
- Failed migrations
- Foreign key violations

---

## References

- [V2 API Documentation](./v2-api-documentation.md)
- [Migration Guide](./v2-migration-guide.md)
- [Troubleshooting Guide](./v2-troubleshooting-guide.md)
- [Error Handling Documentation](../ERROR_HANDLING_DOCUMENTATION.md)
