/**
 * TSOA Model Test Helpers
 * Utilities for testing TSOA models, validation, and type safety
 */

import { ApiResponse } from "../api/models/common.models.js"

/**
 * Validate that an object matches a TSOA model interface
 * This is a runtime type check helper
 */
export function validateModel<T>(
  obj: any,
  requiredFields: (keyof T)[],
  optionalFields?: (keyof T)[],
): obj is T {
  if (!obj || typeof obj !== "object") {
    return false
  }

  // Check required fields
  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new Error(`Missing required field: ${String(field)}`)
    }
  }

  // Check for unexpected fields
  const allFields = [
    ...requiredFields,
    ...(optionalFields || []),
  ] as string[]
  for (const key of Object.keys(obj)) {
    if (!allFields.includes(key)) {
      console.warn(`Unexpected field in model: ${key}`)
    }
  }

  return true
}

/**
 * Create a mock ApiResponse wrapper
 * TSOA responses are typically wrapped in { data: ... }
 */
export function createApiResponse<T>(data: T): ApiResponse<T> {
  return { data }
}

/**
 * Validate ApiResponse structure
 */
export function validateApiResponse<T>(
  response: any,
): response is ApiResponse<T> {
  if (!response || typeof response !== "object") {
    throw new Error("Response is not an object")
  }

  if (!("data" in response)) {
    throw new Error("Response missing 'data' property")
  }

  return true
}

/**
 * Create mock attribute definition data
 */
export function createMockAttributeDefinition(
  overrides?: Partial<any>,
): any {
  return {
    attribute_name: overrides?.attribute_name || "test_attribute",
    display_name: overrides?.display_name || "Test Attribute",
    attribute_type: overrides?.attribute_type || "select",
    allowed_values: overrides?.allowed_values || ["value1", "value2"],
    applicable_item_types: overrides?.applicable_item_types || ["Ship"],
    display_order: overrides?.display_order || 0,
    created_at: overrides?.created_at || new Date().toISOString(),
    updated_at: overrides?.updated_at || new Date().toISOString(),
  }
}

/**
 * Create mock commodity data
 */
export function createMockCommodity(overrides?: Partial<any>): any {
  return {
    id: overrides?.id || "test_commodity_id",
    name: overrides?.name || "Test Commodity",
    code: overrides?.code || "TEST",
    kind: overrides?.kind || "Agricultural",
    ...overrides,
  }
}

/**
 * Create mock market listing data
 */
export function createMockMarketListing(overrides?: Partial<any>): any {
  return {
    listing_id: overrides?.listing_id || "test_listing_id",
    listing_type: overrides?.listing_type || "sale",
    title: overrides?.title || "Test Listing",
    description: overrides?.description || "Test description",
    price: overrides?.price || 1000,
    quantity_available: overrides?.quantity_available || 10,
    status: overrides?.status || "active",
    user_id: overrides?.user_id || "test_user_id",
    contractor_id: overrides?.contractor_id || null,
    created_at: overrides?.created_at || new Date().toISOString(),
    updated_at: overrides?.updated_at || new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock user profile data
 */
export function createMockProfile(overrides?: Partial<any>): any {
  return {
    user_id: overrides?.user_id || "test_user_id",
    username: overrides?.username || "testuser",
    display_name: overrides?.display_name || "Test User",
    bio: overrides?.bio || null,
    avatar: overrides?.avatar || null,
    banner: overrides?.banner || null,
    rsi_confirmed: overrides?.rsi_confirmed ?? true,
    role: overrides?.role || "user",
    ...overrides,
  }
}

/**
 * Create mock order data
 */
export function createMockOrder(overrides?: Partial<any>): any {
  return {
    order_id: overrides?.order_id || "test_order_id",
    user_id: overrides?.user_id || "test_user_id",
    contractor_id: overrides?.contractor_id || null,
    status: overrides?.status || "pending",
    total: overrides?.total || 1000,
    created_at: overrides?.created_at || new Date().toISOString(),
    updated_at: overrides?.updated_at || new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock contractor data
 */
export function createMockContractor(overrides?: Partial<any>): any {
  return {
    contractor_id: overrides?.contractor_id || "test_contractor_id",
    spectrum_id: overrides?.spectrum_id || "TEST",
    name: overrides?.name || "Test Contractor",
    description: overrides?.description || null,
    avatar: overrides?.avatar || null,
    banner: overrides?.banner || null,
    ...overrides,
  }
}

/**
 * Create mock notification data
 */
export function createMockNotification(overrides?: Partial<any>): any {
  return {
    notification_id: overrides?.notification_id || "test_notification_id",
    user_id: overrides?.user_id || "test_user_id",
    type: overrides?.type || "info",
    title: overrides?.title || "Test Notification",
    message: overrides?.message || "Test message",
    read: overrides?.read ?? false,
    created_at: overrides?.created_at || new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock comment data
 */
export function createMockComment(overrides?: Partial<any>): any {
  return {
    comment_id: overrides?.comment_id || "test_comment_id",
    user_id: overrides?.user_id || "test_user_id",
    content: overrides?.content || "Test comment",
    created_at: overrides?.created_at || new Date().toISOString(),
    updated_at: overrides?.updated_at || new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock service data
 */
export function createMockService(overrides?: Partial<any>): any {
  return {
    service_id: overrides?.service_id || "test_service_id",
    title: overrides?.title || "Test Service",
    description: overrides?.description || "Test description",
    price: overrides?.price || 1000,
    contractor_id: overrides?.contractor_id || "test_contractor_id",
    created_at: overrides?.created_at || new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock offer data
 */
export function createMockOffer(overrides?: Partial<any>): any {
  return {
    offer_id: overrides?.offer_id || "test_offer_id",
    listing_id: overrides?.listing_id || "test_listing_id",
    user_id: overrides?.user_id || "test_user_id",
    price: overrides?.price || 1000,
    quantity: overrides?.quantity || 1,
    status: overrides?.status || "pending",
    created_at: overrides?.created_at || new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock API token data
 */
export function createMockToken(overrides?: Partial<any>): any {
  return {
    id: overrides?.id || "test_token_id",
    name: overrides?.name || "Test Token",
    scopes: overrides?.scopes || ["read", "write"],
    created_at: overrides?.created_at || new Date().toISOString(),
    last_used_at: overrides?.last_used_at || null,
    expires_at: overrides?.expires_at || null,
    ...overrides,
  }
}

/**
 * Validate that a response contains pagination metadata
 */
export function validatePaginationResponse(response: any): void {
  if (!response || typeof response !== "object") {
    throw new Error("Response is not an object")
  }

  if (!("data" in response)) {
    throw new Error("Response missing 'data' property")
  }

  const data = response.data

  // Check for common pagination fields
  const paginationFields = ["total", "page", "limit", "items"]
  const hasPagination = paginationFields.some((field) => field in data)

  if (!hasPagination) {
    console.warn("Response does not appear to have pagination metadata")
  }
}

/**
 * Validate that an array response contains the expected items
 */
export function validateArrayResponse<T>(
  response: any,
  expectedLength?: number,
  itemValidator?: (item: T) => boolean,
): void {
  validateApiResponse(response)

  const data = response.data

  if (!Array.isArray(data) && !("items" in data)) {
    throw new Error("Response data is not an array or does not contain 'items'")
  }

  const items = Array.isArray(data) ? data : data.items

  if (expectedLength !== undefined && items.length !== expectedLength) {
    throw new Error(
      `Expected ${expectedLength} items but got ${items.length}`,
    )
  }

  if (itemValidator) {
    for (let i = 0; i < items.length; i++) {
      if (!itemValidator(items[i])) {
        throw new Error(`Item at index ${i} failed validation`)
      }
    }
  }
}

/**
 * Create mock error response
 */
export function createMockErrorResponse(
  code: string,
  message: string,
  details?: any,
): any {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  }
}

/**
 * Validate error response structure
 */
export function validateErrorResponse(
  response: any,
  expectedCode?: string,
  expectedMessage?: string,
): void {
  if (!response || typeof response !== "object") {
    throw new Error("Response is not an object")
  }

  if (!("error" in response)) {
    throw new Error("Response missing 'error' property")
  }

  const error = response.error

  if (!("code" in error)) {
    throw new Error("Error missing 'code' property")
  }

  if (!("message" in error)) {
    throw new Error("Error missing 'message' property")
  }

  if (expectedCode && error.code !== expectedCode) {
    throw new Error(
      `Expected error code '${expectedCode}' but got '${error.code}'`,
    )
  }

  if (expectedMessage && error.message !== expectedMessage) {
    throw new Error(
      `Expected error message '${expectedMessage}' but got '${error.message}'`,
    )
  }
}
