# Order Lifecycle Integration with Stock Allocation

## Overview

This document describes the integration of the granular stock tracking system with the order lifecycle. Stock allocations are now automatically managed when orders are created, cancelled, or fulfilled.

## Implementation

### Backend Services

#### OrderLifecycleService

Location: `src/services/allocation/order-lifecycle.service.ts`

This service provides the integration layer between orders and stock allocations:

- **allocateStockForOrder**: Automatically allocates stock when an order is created
- **releaseAllocationsForOrder**: Releases stock when an order is cancelled
- **consumeAllocationsForOrder**: Consumes stock when an order is fulfilled
- **getAllocationSummary**: Retrieves allocation details for an order

### Integration Points

#### 1. Order Creation (Requirement 6.1, 6.2, 6.3)

**Location**: `src/api/routes/v1/orders/helpers.ts` - `createOffer` function

When an order is created with market listings:
1. The order and offer are created in a transaction
2. After successful creation, stock is automatically allocated using FIFO strategy
3. If a contractor is specified, their allocation strategy is used
4. Partial allocations are handled gracefully - the order is still created
5. Allocation failures are logged but don't prevent order creation

**Behavior**:
- Uses FIFO (First In, First Out) allocation by default
- Respects contractor allocation strategies (FIFO or location priority)
- Handles insufficient stock gracefully with partial allocations
- Logs allocation results for monitoring

#### 2. Order Cancellation (Requirement 6.4)

**Location**: `src/api/routes/v1/orders/helpers.ts` - `handleStatusUpdate` function

When an order status is changed to "cancelled":
1. Existing cancellation logic runs (restore legacy stock if needed)
2. All active allocations for the order are released
3. Stock becomes available again for other orders
4. Allocation records are updated to "released" status for audit trail

**Behavior**:
- Releases all active allocations
- Stock immediately becomes available for new orders
- Maintains allocation records with "released" status
- Errors are logged but don't prevent cancellation

#### 3. Order Fulfillment (Requirement 6.5, 10.5)

**Location**: `src/api/routes/v1/orders/helpers.ts` - `handleStatusUpdate` function

When an order status is changed to "fulfilled":
1. All active allocations are consumed
2. Lot quantities are reduced by the allocated amounts
3. Allocation records are updated to "fulfilled" status
4. Order status is updated to fulfilled

**Behavior**:
- Consumes stock from allocated lots
- Reduces lot `quantity_total` by allocated amounts
- Maintains allocation records with "fulfilled" status for audit
- Errors are logged but don't prevent fulfillment

### Frontend Components

#### AllocationStatusDisplay

Location: `src/features/market/components/allocation/AllocationStatusDisplay.tsx`

A compact component that displays allocation status for an order:
- Shows total allocated quantity
- Indicates partial allocations with warning
- Displays different states: active, fulfilled, released
- Provides optional link to detailed allocation view

**Usage**:
```tsx
<AllocationStatusDisplay 
  orderId={order.order_id}
  orderQuantity={totalQuantity}
  compact={true}
  showDetailsLink={true}
/>
```

## Error Handling

All integration points handle errors gracefully:

1. **Allocation Failures**: Orders are still created even if allocation fails
2. **Insufficient Stock**: Partial allocations are created and logged
3. **Release Failures**: Cancellation proceeds even if release fails
4. **Consumption Failures**: Fulfillment proceeds even if consumption fails

All errors are logged with context for debugging and monitoring.

## Monitoring

Key log messages to monitor:

- `Stock allocated for order` - Successful allocation
- `Order created with partial stock allocation` - Partial allocation warning
- `Failed to allocate stock for order` - Allocation error
- `Stock allocations released for cancelled order` - Successful release
- `Stock allocations consumed for fulfilled order` - Successful consumption

## Database Impact

### Tables Modified

- `stock_allocations`: New records created, status updated
- `stock_lots`: `quantity_total` reduced on fulfillment

### Transactions

All allocation operations use database transactions to ensure consistency:
- Row-level locking prevents concurrent allocation conflicts
- Rollback on failure ensures data integrity

## API Endpoints

No new API endpoints were added. The integration uses existing endpoints:

- `POST /api/v1/orders` - Creates order and allocates stock
- `PUT /api/v1/orders/:order_id` - Updates status, releases/consumes allocations
- `GET /api/v1/orders/:order_id/allocations` - View allocations (existing)

## Testing

To test the integration:

1. **Order Creation**:
   - Create an order with market listings
   - Verify allocations are created
   - Check stock is reserved

2. **Order Cancellation**:
   - Cancel an order with allocations
   - Verify allocations are released
   - Check stock is available again

3. **Order Fulfillment**:
   - Fulfill an order with allocations
   - Verify allocations are consumed
   - Check lot quantities are reduced

## Future Enhancements

Potential improvements:

1. **Allocation Notifications**: Notify users of partial allocations
2. **Allocation UI**: Show allocation details in order views
3. **Reallocation**: Automatically reallocate when stock becomes available
4. **Allocation Reports**: Analytics on allocation efficiency

## Related Documentation

- [Stock Lot Service](../src/services/stock-lot/README.md)
- [Allocation Service](../src/services/allocation/README.md)
- [Granular Stock Tracking Spec](../../.kiro/specs/granular-stock-tracking/)

