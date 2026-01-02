/**
 * Standardized Response Types and Utilities
 * 
 * Provides consistent response formats for API endpoints.
 * All API responses should use these types and helper functions.
 */

import { ErrorCode } from "./error-codes.js"

// Re-export ErrorCode for convenience
export { ErrorCode }

export interface ValidationError {
  field: string
  message: string
  code?: string
}

export interface StandardErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, any>
    validationErrors?: ValidationError[]
  }
}

export interface StandardSuccessResponse<T> {
  data: T
}

export type APIResponse<T> = StandardSuccessResponse<T> | StandardErrorResponse

/**
 * Create a standardized success response
 */
export function createResponse<T>(data: T): StandardSuccessResponse<T> {
  return { data }
}

/**
 * Create a standardized error response
 * 
 * Supports both new format (code, message, ...) and legacy formats:
 * - createErrorResponse({ message: "..." })
 * - createErrorResponse({ error: "..." })
 * - createErrorResponse({ status: ..., message: "..." })
 */
export function createErrorResponse(
  codeOrOptions: ErrorCode | string | Record<string, any> | StandardErrorResponse,
  message?: string,
  details?: Record<string, any> | string, // Legacy: can be string
  validationErrors?: ValidationError[]
): StandardErrorResponse {
  // If already a StandardErrorResponse (nested call bug), return as-is
  if (typeof codeOrOptions === "object" && codeOrOptions !== null && "error" in codeOrOptions && typeof (codeOrOptions as any).error === "object") {
    return codeOrOptions as StandardErrorResponse
  }

  // Legacy format: createErrorResponse({ message: "..." }) or createErrorResponse({ error: "..." })
  if (typeof codeOrOptions === "object" && codeOrOptions !== null) {
    // If already a StandardErrorResponse, return as-is
    if ("error" in codeOrOptions && typeof (codeOrOptions as any).error === "object" && "code" in (codeOrOptions as any).error) {
      return codeOrOptions as StandardErrorResponse
    }
    
    const options = codeOrOptions as Record<string, any>
    const errorMessage = options.message || options.error || "An error occurred"
    const errorCode = options.code || ErrorCode.INTERNAL_SERVER_ERROR
    
    // Handle details - can be string or object in legacy format
    const detailsObj = options.details 
      ? (typeof options.details === "string" ? { message: options.details } : options.details)
      : undefined
    
    // Include any other properties in details (for backward compatibility)
    const otherProps: Record<string, any> = {}
    for (const key in options) {
      if (key !== "message" && key !== "error" && key !== "code" && key !== "status" && key !== "details") {
        otherProps[key] = options[key]
      }
    }
    
    return {
      error: {
        code: errorCode,
        message: errorMessage,
        ...(detailsObj && { details: detailsObj }),
        ...(Object.keys(otherProps).length > 0 && { details: { ...detailsObj, ...otherProps } }),
      },
    }
  }

  // New format: createErrorResponse(code, message, details?, validationErrors?)
  const code = codeOrOptions as ErrorCode | string
  const msg = message || "An error occurred"
  
  // Handle legacy: details can be a string
  const detailsObj = typeof details === "string" ? { message: details } : details
  
  return {
    error: {
      code,
      message: msg,
      ...(detailsObj && { details: detailsObj }),
      ...(validationErrors && { validationErrors }),
    },
  }
}

/**
 * Create a validation error response
 */
export function createValidationErrorResponse(
  message: string,
  validationErrors: ValidationError[]
): StandardErrorResponse {
  return createErrorResponse(ErrorCode.VALIDATION_ERROR, message, undefined, validationErrors)
}

/**
 * Create a not found error response
 */
export function createNotFoundErrorResponse(
  resource: string,
  identifier?: string
): StandardErrorResponse {
  return createErrorResponse(
    ErrorCode.NOT_FOUND,
    `${resource} not found${identifier ? `: ${identifier}` : ""}`,
    { resource, identifier }
  )
}

/**
 * Create an unauthorized error response
 */
export function createUnauthorizedErrorResponse(
  message: string = "Authentication required"
): StandardErrorResponse {
  return createErrorResponse(ErrorCode.UNAUTHORIZED, message)
}

/**
 * Create a forbidden error response
 */
export function createForbiddenErrorResponse(
  message: string = "You do not have permission to perform this action"
): StandardErrorResponse {
  return createErrorResponse(ErrorCode.FORBIDDEN, message)
}

/**
 * Create a conflict error response
 */
export function createConflictErrorResponse(
  message: string,
  details?: Record<string, any>
): StandardErrorResponse {
  return createErrorResponse(ErrorCode.CONFLICT, message, details)
}
