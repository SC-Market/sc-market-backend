# Public Quantity Visibility Implementation

## Overview

This document describes the implementation of public quantity visibility based on the `stock_subtraction_timing` setting. This feature allows sellers to control when their stock appears as "unavailable" to buyers, independent of the physical allocation state.

## Requirements

- **Requirement 5.7**: The system shall respect the stock_subtraction_timing setting when calculating public quantity visibility, independent of physical allocation state
- **Requirement 12.1**: Organization settings shall provide stock_subtraction_timing options

## Stock Subtraction Timing Modes

### 1. `on_accepted` (Default)
- **Public sees**: Only available stock (not allocated)
- **Behavior**: When an order is created, the allocated stock is immediately hidden from public view
- **Use case**: Standard e-commerce behavior - prevent overselling

### 2. `on_received`
- **Public sees**: Available + reserved stock
- **Behavior**: Stock remains visible until an offer is received/accepted
- **Use case**: Sellers who want to show all stock until payment is confirmed

### 3. `dont_subtract`
- **Public sees**: Available + reserved stock (always)
- **Behavior**: Stock is never hidden from public view
- **Use case**: Sellers who want maximum visibility or handle inventory manually

## Implementation Details

### Database Layer

#### New Function: `get_public_quantity()`

```sql
CREATE OR REPLACE FUNCTION public.get_public_quantity(
    p_listing_id UUID,
    p_stock_subtraction_timing TEXT DEFAULT 'on_accepted'
) RETURNS INTEGER
```

This function calculates the public-facing quantity based on the setting:
- Gets available and reserved stock using existing functions
- Applies visibility logic based on the setting
- Returns the appropriate quantity for public display

#### Updated Trigger: `sync_listing_quantity()`

The trigger now:
1. Looks up the seller's `stock_subtraction_timing` setting (contractor takes precedence over user)
2. Calls `get_public_quantity()` with the appropriate setting
3. Updates `market_listings.quantity_available` accordingly

This ensures that `quantity_available` always reflects what the public should see.

#### New Trigger: `sync_listings_on_setting_change()`

When a seller changes their `stock_subtraction_timing` setting:
1. All their listings are automatically updated
2. The new visibility logic is applied immediately
3. No manual refresh needed

### Service Layer

#### StockLotService

Added new method:
```typescript
async getPublicQuantity(
  listingId: string,
  stockSubtractionTiming: "on_accepted" | "on_received" | "dont_subtract" = "on_accepted"
): Promise<number>
```

This method calls the database function and returns the public quantity.

### API Layer

#### Listing Detail Endpoint

When a seller views their own listing (`isPrivate = true`), the response now includes:

```typescript
{
  listing: {
    quantity_available: 10,  // Public-facing quantity
    stock_breakdown: {       // Only in private view
      available: 5,          // Not allocated
      reserved: 5            // Allocated to orders
    }
  }
}
```

This allows sellers to see:
- What the public sees (`quantity_available`)
- The actual breakdown of their stock (`stock_breakdown`)

## How It Works

### Example Scenario

A seller has:
- 10 units in stock
- 5 units allocated to pending orders
- `stock_subtraction_timing` set to `on_received`

**What happens:**

1. **Physical allocation**: 5 units are allocated when orders are created
2. **Public visibility**: Buyers still see 10 units available
3. **Seller view**: Seller sees:
   - `quantity_available: 10` (what public sees)
   - `stock_breakdown: { available: 5, reserved: 5 }` (actual state)

If the seller changes to `on_accepted`:
1. Trigger fires and updates all their listings
2. Public now sees 5 units available
3. Seller still sees the same breakdown

## Migration

The migration file `52-public-quantity-visibility.sql` includes:
1. New `get_public_quantity()` function
2. Updated `sync_listing_quantity()` trigger
3. New `sync_listings_on_setting_change()` trigger

Run this migration after the allocation mode settings migration (51).

## Testing

To test this feature:

1. Create a listing with stock
2. Create an order to allocate some stock
3. Check the public listing view - should show reduced quantity (default `on_accepted`)
4. Change `stock_subtraction_timing` to `on_received`
5. Check the public listing view - should now show full quantity
6. View as seller - should see stock breakdown in both cases

## Notes

- The `quantity_available` column in `market_listings` is kept in sync automatically
- The materialized view `market_search_materialized` uses this column, so search results are correct
- Physical allocation always happens on order creation, regardless of this setting
- This setting only controls **visibility**, not **allocation**
