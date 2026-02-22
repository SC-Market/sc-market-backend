/**
 * TSOA-specific test utilities and helpers
 * These utilities help test TSOA controllers, authentication, and models
 */

import { Request } from "express"
import { User } from "../api/routes/v1/api-models.js"
import { createTestUserWithAuth, TestUserWithAuth } from "./testAuth.js"
import { TestUser } from "./testFixtures.js"

/**
 * Create a mock Express Request for TSOA controller testing
 * TSOA controllers receive the full Express Request object
 */
export function createMockRequest(overrides?: Partial<Request>): Request {
  const mockRequest: Partial<Request> = {
    headers: {},
    query: {},
    params: {},
    body: {},
    ip: "127.0.0.1",
    isAuthenticated: function(this: Request): this is Express.AuthenticatedRequest {
      return false
    },
    ...overrides,
  }

  return mockRequest as Request
}

/**
 * Create a mock authenticated Request for TSOA controller testing
 * This simulates a request that has passed through authentication
 */
export async function createAuthenticatedRequest(
  userOverrides?: Partial<User>,
  requestOverrides?: Partial<Request>,
): Promise<{ request: Request; testUser: TestUserWithAuth }> {
  const testUser = await createTestUserWithAuth(userOverrides as Partial<TestUser>)

  const request = createMockRequest({
    user: {
      user_id: testUser.user_id,
      username: testUser.username,
      role: userOverrides?.role || "user",
      banned: false,
      rsi_confirmed: userOverrides?.rsi_confirmed ?? true,
      balance: "0", // balance is a string in User type
      ...userOverrides,
    } as User,
    headers: {
      authorization: `Bearer ${testUser.token}`,
    },
    isAuthenticated: function(this: Request): this is Express.AuthenticatedRequest {
      return true
    },
    ...requestOverrides,
  })

  // Mark as token auth
  ;(request as any).authMethod = "token"

  return { request, testUser }
}

/**
 * Create a mock admin Request for TSOA controller testing
 */
export async function createAdminRequest(
  requestOverrides?: Partial<Request>,
): Promise<{ request: Request; testUser: TestUserWithAuth }> {
  return createAuthenticatedRequest(
    { role: "admin" },
    requestOverrides,
  )
}

/**
 * Create a mock Request with token authentication
 * This simulates token-based auth with scopes
 */
export async function createTokenAuthRequest(
  scopes: string[] = ["read", "write"],
  userOverrides?: Partial<User>,
  requestOverrides?: Partial<Request>,
): Promise<{ request: Request; testUser: TestUserWithAuth }> {
  const { request, testUser } = await createAuthenticatedRequest(
    userOverrides,
    requestOverrides,
  )

  // Add token info
  ;(request as any).token = {
    scopes,
    user_id: testUser.user_id,
  }
  ;(request as any).authMethod = "token"

  return { request, testUser }
}

/**
 * Create a mock Request with session authentication
 * This simulates session-based auth
 */
export async function createSessionAuthRequest(
  userOverrides?: Partial<User>,
  requestOverrides?: Partial<Request>,
): Promise<{ request: Request; testUser: TestUserWithAuth }> {
  const { request, testUser } = await createAuthenticatedRequest(
    userOverrides,
    requestOverrides,
  )

  // Mark as session auth
  ;(request as any).authMethod = "session"
  ;(request as any).session = {
    passport: {
      user: testUser.user_id,
    },
  }

  return { request, testUser }
}

/**
 * Assert that a TSOA response matches the expected format
 * TSOA responses are typically wrapped in { data: ... }
 */
export function assertTsoaResponse<T>(
  response: any,
  expectedData: Partial<T>,
): void {
  if (!response || typeof response !== "object") {
    throw new Error("Response is not an object")
  }

  if (!("data" in response)) {
    throw new Error("Response does not have 'data' property")
  }

  const data = response.data

  for (const [key, value] of Object.entries(expectedData)) {
    if (!(key in data)) {
      throw new Error(`Response data missing key: ${key}`)
    }

    if (typeof value === "object" && value !== null) {
      // Deep comparison for objects
      if (JSON.stringify(data[key]) !== JSON.stringify(value)) {
        throw new Error(
          `Response data[${key}] does not match. Expected: ${JSON.stringify(value)}, Got: ${JSON.stringify(data[key])}`,
        )
      }
    } else if (data[key] !== value) {
      throw new Error(
        `Response data[${key}] does not match. Expected: ${value}, Got: ${data[key]}`,
      )
    }
  }
}

/**
 * Assert that a TSOA error response matches the expected format
 * TSOA errors are typically { error: { code, message, ... } }
 */
export function assertTsoaError(
  error: any,
  expectedCode?: string,
  expectedMessage?: string,
): void {
  if (!error || typeof error !== "object") {
    throw new Error("Error is not an object")
  }

  if (!("error" in error)) {
    throw new Error("Error does not have 'error' property")
  }

  const errorObj = error.error

  if (expectedCode && errorObj.code !== expectedCode) {
    throw new Error(
      `Error code does not match. Expected: ${expectedCode}, Got: ${errorObj.code}`,
    )
  }

  if (expectedMessage && errorObj.message !== expectedMessage) {
    throw new Error(
      `Error message does not match. Expected: ${expectedMessage}, Got: ${errorObj.message}`,
    )
  }
}

/**
 * Create a mock file for file upload testing
 * This simulates a multer file object
 */
export function createMockFile(
  overrides?: Partial<Express.Multer.File>,
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "test.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    size: 1024,
    buffer: Buffer.from("fake image data"),
    destination: "/tmp",
    filename: "test.jpg",
    path: "/tmp/test.jpg",
    stream: null as any,
    ...overrides,
  }
}

/**
 * Helper to test TSOA controller methods
 * This wraps controller method calls and provides better error messages
 */
export async function testControllerMethod<T>(
  methodCall: () => Promise<T>,
  expectedResult?: Partial<T>,
): Promise<T> {
  try {
    const result = await methodCall()

    if (expectedResult) {
      for (const [key, value] of Object.entries(expectedResult)) {
        if (!(key in (result as any))) {
          throw new Error(`Result missing key: ${key}`)
        }

        if ((result as any)[key] !== value) {
          throw new Error(
            `Result[${key}] does not match. Expected: ${value}, Got: ${(result as any)[key]}`,
          )
        }
      }
    }

    return result
  } catch (error) {
    // Re-throw with better error message
    if (error instanceof Error) {
      throw new Error(`Controller method failed: ${error.message}`)
    }
    throw error
  }
}

/**
 * Helper to test TSOA authentication
 * This tests the expressAuthentication function
 */
export async function testAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<User> {
  const { expressAuthentication } = await import(
    "../api/middleware/tsoa-auth.js"
  )

  return expressAuthentication(request, securityName, scopes)
}

/**
 * Create mock query parameters for TSOA controller testing
 * TSOA automatically parses query parameters, this helper creates them
 */
export function createQueryParams(params: Record<string, any>): Record<string, string> {
  const queryParams: Record<string, string> = {}

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        queryParams[key] = JSON.stringify(value)
      } else if (typeof value === "object") {
        queryParams[key] = JSON.stringify(value)
      } else {
        queryParams[key] = String(value)
      }
    }
  }

  return queryParams
}

/**
 * Create mock path parameters for TSOA controller testing
 */
export function createPathParams(params: Record<string, string>): Record<string, string> {
  return { ...params }
}

/**
 * Helper to test TSOA validation errors
 * TSOA throws ValidateError for validation failures
 */
export function assertValidationError(
  error: any,
  expectedFields?: string[],
): void {
  if (!error || error.name !== "ValidateError") {
    throw new Error("Expected ValidateError but got: " + error?.name)
  }

  if (expectedFields) {
    const errorFields = Object.keys(error.fields || {})
    for (const field of expectedFields) {
      if (!errorFields.includes(field)) {
        throw new Error(`Expected validation error for field: ${field}`)
      }
    }
  }
}

/**
 * Helper to create mock pagination parameters
 */
export function createPaginationParams(
  page: number = 1,
  limit: number = 20,
): { page: string; limit: string } {
  return {
    page: String(page),
    limit: String(limit),
  }
}

/**
 * Helper to create mock sort parameters
 */
export function createSortParams(
  sortBy: string,
  sortOrder: "asc" | "desc" = "asc",
): { sort_by: string; sort_order: string } {
  return {
    sort_by: sortBy,
    sort_order: sortOrder,
  }
}
