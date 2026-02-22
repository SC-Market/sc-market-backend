/**
 * Common Request/Response Models for TSOA Controllers
 *
 * These type definitions are used by TSOA controllers to define
 * request/response schemas in the OpenAPI spec. They match the
 * legacy response format for backward compatibility.
 *
 * NOTE: These are TypeScript type definitions for TSOA's OpenAPI
 * generation. The actual response creation still uses the utility
 * functions in src/api/routes/v1/util/response.ts (createResponse,
 * createErrorResponse, etc.). These types ensure TSOA generates
 * accurate OpenAPI documentation that matches the legacy format.
 */

/**
 * Standard API response wrapper
 * All successful API responses should use this format
 */
export interface ApiResponse<T> {
  data: T
}

/**
 * Validation error detail
 */
export interface ValidationErrorDetail {
  field: string
  message: string
  code?: string
}

/**
 * Standard error response
 * Used for all error responses (4xx and 5xx)
 */
export interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, any>
    validationErrors?: ValidationErrorDetail[]
  }
}

/**
 * Validation error response (400)
 * Used when request validation fails
 */
export interface ValidationErrorResponse {
  error: {
    code: "VALIDATION_ERROR"
    message: string
    details?: Record<string, any>
    validationErrors?: ValidationErrorDetail[]
  }
}

/**
 * Unauthorized error response (401)
 * Used when authentication is required but not provided or invalid
 */
export interface Unauthorized {
  error: {
    code: "UNAUTHORIZED"
    message: string
  }
}

/**
 * Forbidden error response (403)
 * Used when user is authenticated but lacks required permissions
 */
export interface Forbidden {
  error: {
    code: "FORBIDDEN"
    message: string
  }
}

/**
 * Not found error response (404)
 * Used when requested resource does not exist
 */
export interface NotFound {
  error: {
    code: "NOT_FOUND"
    message: string
    details?: {
      resource?: string
      identifier?: string
    }
  }
}

/**
 * Conflict error response (409)
 * Used when request conflicts with current state (e.g., duplicate resource)
 */
export interface Conflict {
  error: {
    code: "CONFLICT"
    message: string
    details?: Record<string, any>
  }
}

/**
 * Service unavailable error response (503)
 * Used when a required service is temporarily unavailable
 */
export interface ServiceUnavailable {
  error: {
    code: "SERVICE_UNAVAILABLE"
    message: string
  }
}

/**
 * Success message response
 * Used for operations that return a simple success message
 */
export interface SuccessMessageResponse extends ApiResponse<{ message: string }> {}

/**
 * Payment type enum
 * Used across orders, services, and other payment-related endpoints
 */
export type PaymentType = "one-time" | "hourly" | "daily"

/**
 * Minimal user information (API response format)
 * Used across multiple endpoints for user references
 */
export interface MinimalUser {
  username: string
  display_name: string
  avatar: string
}

/**
 * Database minimal user (what getMinimalUser actually returns)
 * Includes rating and badges for internal use
 */
export interface DBMinimalUser extends MinimalUser {
  rating?: any
  badges?: any
}

/**
 * Minimal contractor information
 * Used across multiple endpoints for contractor references
 */
export interface MinimalContractor {
  spectrum_id: string
  name: string
  avatar: string | null
}
