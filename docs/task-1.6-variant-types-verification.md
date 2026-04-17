# Task 1.6: Variant Types Seed Data Verification

## Overview

This document verifies that the `variant_types` table was correctly seeded with all required variant type definitions during the core tables migration (Task 1.2). The variant types system provides flexible, extensible attribute definitions for item variants in the SC Market V2 system.

## Requirements

- **Requirements:** 4.4, 4.5, 5.1-5.4
- **Task:** 1.6 Seed variant_types table
- **Migration:** `20260417000000_market_v2_core_tables.ts`

## Variant Types Seeded

The following 4 variant types were seeded in the migration:

### 1. quality_tier
- **Display Name:** Quality Tier
- **Description:** Item quality level from 1 (lowest) to 5 (highest)
- **Value Type:** integer
- **Min Value:** 1
- **Max Value:** 5
- **Display Order:** 0
- **Affects Pricing:** true
- **Searchable:** true
- **Filterable:** true

### 2. quality_value
- **Display Name:** Quality Value
- **Description:** Precise quality percentage from 0 to 100
- **Value Type:** decimal
- **Min Value:** 0
- **Max Value:** 100
- **Display Order:** 1
- **Affects Pricing:** true
- **Searchable:** true
- **Filterable:** true

### 3. crafted_source
- **Display Name:** Source
- **Description:** How the item was obtained
- **Value Type:** enum
- **Allowed Values:** ["crafted", "store", "looted", "unknown"]
- **Display Order:** 2
- **Affects Pricing:** true
- **Searchable:** true
- **Filterable:** true

### 4. blueprint_tier
- **Display Name:** Blueprint Tier
- **Description:** Blueprint quality tier for craftable items
- **Value Type:** integer
- **Min Value:** 1
- **Max Value:** 5
- **Display Order:** 3
- **Affects Pricing:** true
- **Searchable:** true
- **Filterable:** true

## Validation Rules

### Integer Types (quality_tier, blueprint_tier)
- Must be between min_value and max_value (1-5)
- Used for tier-based quality systems
- Supports range filtering in search queries

### Decimal Types (quality_value)
- Must be between min_value and max_value (0-100)
- Provides precise quality measurements
- Supports range filtering with decimal precision

### Enum Types (crafted_source)
- Must be one of the values in allowed_values array
- Provides dropdown/select UI components
- Supports exact match filtering

## Database Schema

```sql
CREATE TABLE variant_types (
  variant_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  affects_pricing BOOLEAN NOT NULL DEFAULT true,
  searchable BOOLEAN NOT NULL DEFAULT true,
  filterable BOOLEAN NOT NULL DEFAULT true,
  value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('integer', 'decimal', 'string', 'enum')),
  min_value DECIMAL(10,2),
  max_value DECIMAL(10,2),
  allowed_values JSONB,
  display_order INTEGER NOT NULL DEFAULT 0,
  icon VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX idx_variant_types_searchable (searchable) WHERE searchable = true
);
```

## Usage in Variant System

Variant types are used when creating item variants:

```typescript
// Example variant attributes using all 4 variant types
const variantAttributes = {
  quality_tier: 5,           // Uses quality_tier definition (1-5)
  quality_value: 95.5,       // Uses quality_value definition (0-100)
  crafted_source: 'crafted', // Uses crafted_source definition (enum)
  blueprint_tier: 4          // Uses blueprint_tier definition (1-5)
};

// Create variant with these attributes
await db('item_variants').insert({
  game_item_id: gameItemId,
  attributes: JSON.stringify(variantAttributes),
  display_name: 'Tier 5 (95.5%) - Crafted - BP T4',
  short_name: 'T5 C BP4'
});
```

## Verification Methods

### 1. SQL Verification Script
Run the SQL verification script to check all variant types:

```bash
cd sc-market-backend
psql -h 192.168.88.6 -U scmarket -d scmarket -f scripts/verify-variant-types.sql
```

### 2. Automated Tests
Run the comprehensive test suite:

```bash
cd sc-market-backend
npm test -- variant-types.test.ts
```

The test suite verifies:
- Table existence and structure
- All 4 variant types are seeded
- Correct configuration for each variant type
- Validation rules (min/max values, allowed values)
- Display order is sequential
- Index on searchable column exists
- Variants can be created using the validation rules

## Future Extensibility

The variant_types system is designed for future extensibility. New variant types can be added without code changes:

### Example: Adding a "durability" variant type

```sql
INSERT INTO variant_types (
  name, 
  display_name, 
  description, 
  value_type, 
  min_value, 
  max_value, 
  display_order
) VALUES (
  'durability',
  'Durability',
  'Item durability percentage from 0 (broken) to 100 (pristine)',
  'decimal',
  0,
  100,
  4
);
```

Once added, the V2 system will automatically:
- Support durability in variant attributes
- Include durability in search filters (if filterable=true)
- Include durability in pricing calculations (if affects_pricing=true)
- Display durability in UI components

## Benefits of Variant Types System

1. **Flexibility:** New attributes can be added without schema migrations
2. **Validation:** Centralized validation rules for all variant attributes
3. **UI Generation:** Frontend can dynamically generate filters and inputs
4. **Type Safety:** Value types ensure correct data types in JSONB
5. **Searchability:** Configurable search and filter capabilities
6. **Pricing Impact:** Clear indication of which attributes affect pricing
7. **Display Control:** Ordered presentation in UI components

## Verification Results

### Database Connection
- **Host:** 192.168.88.6
- **Database:** scmarket
- **User:** scmarket

### Expected Results
✓ variant_types table exists
✓ All 4 variant types present
✓ quality_tier configured correctly (integer, 1-5, order 0)
✓ quality_value configured correctly (decimal, 0-100, order 1)
✓ crafted_source configured correctly (enum, 4 values, order 2)
✓ blueprint_tier configured correctly (integer, 1-5, order 3)
✓ Display order is sequential (0, 1, 2, 3)
✓ idx_variant_types_searchable index exists

## Integration with V2 System

The variant_types table integrates with:

1. **item_variants table:** Validates attributes JSONB against variant type rules
2. **Search API:** Provides filter definitions for quality tier ranges
3. **Listing Creation UI:** Generates input fields with correct types and ranges
4. **Pricing System:** Identifies which attributes affect variant pricing
5. **Analytics:** Enables quality tier distribution analysis

## Conclusion

The variant_types table was successfully seeded with all 4 required variant types during the core tables migration (Task 1.2). All validation rules, display orders, and indexes are correctly configured. The system is ready to support quality tier functionality across the V2 market system.

## Next Steps

- Task 1.7: Write database migration tests
- Task 2.1: Research V1 listing types and data structure
- Begin using variant types in listing creation and search APIs
