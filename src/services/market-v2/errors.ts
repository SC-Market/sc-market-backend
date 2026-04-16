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
