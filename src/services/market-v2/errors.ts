/**
 * Market V2 Error Classes
 *
 * Custom error types for variant management operations.
 */

import { ValidationError } from "./types.js"

/**
 * Error thrown when variant attribute validation fails
 */
export class VariantValidationError extends Error {
  public readonly errors: ValidationError[]

  constructor(errors: ValidationError[]) {
    const errorMessages = errors.map((e) => `${e.attribute}: ${e.message}`).join("; ")
    super(`Variant validation failed: ${errorMessages}`)
    this.name = "VariantValidationError"
    this.errors = errors
  }
}

/**
 * Error thrown when a variant type is not found
 */
export class VariantTypeNotFoundError extends Error {
  public readonly variantTypeName: string

  constructor(variantTypeName: string) {
    super(`Variant type not found: ${variantTypeName}`)
    this.name = "VariantTypeNotFoundError"
    this.variantTypeName = variantTypeName
  }
}

/**
 * Error thrown when variant attribute normalization fails
 */
export class AttributeNormalizationError extends Error {
  public readonly attributes: Record<string, any>

  constructor(attributes: Record<string, any>, message: string) {
    super(`Attribute normalization failed: ${message}`)
    this.name = "AttributeNormalizationError"
    this.attributes = attributes
  }
}

/**
 * Error thrown when insufficient stock is available for allocation
 */
export class InsufficientStockError extends Error {
  public readonly variantId: string
  public readonly requestedQuantity: number
  public readonly availableQuantity: number

  constructor(variantId: string, requestedQuantity: number, availableQuantity: number) {
    super(
      `Insufficient stock for variant ${variantId}: requested ${requestedQuantity}, available ${availableQuantity}`
    )
    this.name = "InsufficientStockError"
    this.variantId = variantId
    this.requestedQuantity = requestedQuantity
    this.availableQuantity = availableQuantity
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotFoundError"
  }
}

/**
 * Error thrown when a resource already exists (conflict)
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConflictError"
  }
}

/**
 * Error thrown when validation fails
 */
export class CartValidationError extends Error {
  public readonly details?: Record<string, any>

  constructor(message: string, details?: Record<string, any>) {
    super(message)
    this.name = "CartValidationError"
    this.details = details
  }
}

/**
 * Error thrown when order validation fails
 */
export class OrderValidationError extends Error {
  public readonly details?: Record<string, any>

  constructor(message: string, details?: Record<string, any>) {
    super(message)
    this.name = "OrderValidationError"
    this.details = details
  }
}
