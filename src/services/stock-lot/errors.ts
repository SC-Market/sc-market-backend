/**
 * Stock Lot Error Classes
 *
 * Custom error classes for stock lot management operations.
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"

/**
 * Error thrown when insufficient stock is available
 * Requirements: 13.1, 13.2
 */
export class InsufficientStockError extends Error {
  public readonly code = ErrorCode.INSUFFICIENT_STOCK

  constructor(
    public readonly requested: number,
    public readonly available: number,
    public readonly listingId: string,
    public readonly options?: {
      canAddStock?: boolean
      canAllocateUnlisted?: boolean
      canReduceOrder?: boolean
      unlistedStock?: number
    },
  ) {
    super(`Insufficient stock: requested ${requested}, available ${available}`)
    this.name = "InsufficientStockError"
    Object.setPrototypeOf(this, InsufficientStockError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      requested: this.requested,
      available: this.available,
      shortfall: this.requested - this.available,
      listingId: this.listingId,
      options: this.options,
    }
  }
}

/**
 * Error thrown when quantity validation fails
 * Requirements: 13.3
 */
export class InvalidQuantityError extends Error {
  public readonly code = ErrorCode.INVALID_QUANTITY

  constructor(
    public readonly quantity: number,
    public readonly reason: string = "Quantity must be non-negative",
  ) {
    super(`Invalid quantity: ${quantity}. ${reason}`)
    this.name = "InvalidQuantityError"
    Object.setPrototypeOf(this, InvalidQuantityError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      quantity: this.quantity,
      reason: this.reason,
    }
  }
}

/**
 * Error thrown when allocation exceeds available stock
 * Requirements: 13.1, 13.2
 */
export class OverAllocationError extends Error {
  public readonly code = ErrorCode.OVER_ALLOCATION

  constructor(
    public readonly lotId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Cannot allocate ${requested} from lot ${lotId}. Only ${available} available.`,
    )
    this.name = "OverAllocationError"
    Object.setPrototypeOf(this, OverAllocationError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      lotId: this.lotId,
      requested: this.requested,
      available: this.available,
      shortfall: this.requested - this.available,
    }
  }
}

/**
 * Error thrown when character limits are exceeded
 * Requirements: 13.3, 2.4, 8.2
 */
export class CharacterLimitError extends Error {
  public readonly code = ErrorCode.CHARACTER_LIMIT_EXCEEDED

  constructor(
    public readonly field: string,
    public readonly currentLength: number,
    public readonly maxLength: number,
  ) {
    super(
      `${field} exceeds character limit: ${currentLength}/${maxLength} characters`,
    )
    this.name = "CharacterLimitError"
    Object.setPrototypeOf(this, CharacterLimitError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      field: this.field,
      currentLength: this.currentLength,
      maxLength: this.maxLength,
    }
  }
}

/**
 * Error thrown when concurrent modifications conflict
 * Requirements: 13.4
 */
export class ConcurrentModificationError extends Error {
  public readonly code = ErrorCode.CONCURRENT_MODIFICATION

  constructor(
    public readonly resourceId: string,
    public readonly resourceType: string = "resource",
    public readonly latestData?: any,
  ) {
    super(
      `${resourceType} ${resourceId} was modified by another operation. Please retry with latest data.`,
    )
    this.name = "ConcurrentModificationError"
    Object.setPrototypeOf(this, ConcurrentModificationError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      resourceId: this.resourceId,
      resourceType: this.resourceType,
      latestData: this.latestData,
      retryable: true,
    }
  }
}
