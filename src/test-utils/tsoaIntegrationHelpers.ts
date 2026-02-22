/**
 * TSOA Integration Test Helpers
 * Utilities for testing TSOA routes end-to-end with HTTP requests
 */

import request from "supertest"
import { Express } from "express"
import { createTestServer } from "./testServer.js"
import { TestUserWithAuth } from "./testAuth.js"

/**
 * Create a test HTTP client for TSOA routes
 * This wraps supertest with TSOA-specific helpers
 */
export class TsoaTestClient {
  private app: Express
  private baseUrl: string

  constructor(app?: Express, baseUrl: string = "/api/v1") {
    this.app = app || createTestServer()
    this.baseUrl = baseUrl
  }

  /**
   * Make a GET request to a TSOA route
   */
  async get(
    path: string,
    options?: {
      query?: Record<string, any>
      headers?: Record<string, string>
      auth?: TestUserWithAuth
    },
  ) {
    const fullPath = `${this.baseUrl}${path}`
    let req = request(this.app).get(fullPath)

    if (options?.query) {
      req = req.query(options.query)
    }

    if (options?.headers) {
      req = req.set(options.headers)
    }

    if (options?.auth) {
      req = req.set("Authorization", `Bearer ${options.auth.token}`)
    }

    return req
  }

  /**
   * Make a POST request to a TSOA route
   */
  async post(
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>
      auth?: TestUserWithAuth
    },
  ) {
    const fullPath = `${this.baseUrl}${path}`
    let req = request(this.app).post(fullPath)

    if (body) {
      req = req.send(body)
    }

    if (options?.headers) {
      req = req.set(options.headers)
    }

    if (options?.auth) {
      req = req.set("Authorization", `Bearer ${options.auth.token}`)
    }

    return req
  }

  /**
   * Make a PUT request to a TSOA route
   */
  async put(
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>
      auth?: TestUserWithAuth
    },
  ) {
    const fullPath = `${this.baseUrl}${path}`
    let req = request(this.app).put(fullPath)

    if (body) {
      req = req.send(body)
    }

    if (options?.headers) {
      req = req.set(options.headers)
    }

    if (options?.auth) {
      req = req.set("Authorization", `Bearer ${options.auth.token}`)
    }

    return req
  }

  /**
   * Make a DELETE request to a TSOA route
   */
  async delete(
    path: string,
    options?: {
      headers?: Record<string, string>
      auth?: TestUserWithAuth
    },
  ) {
    const fullPath = `${this.baseUrl}${path}`
    let req = request(this.app).delete(fullPath)

    if (options?.headers) {
      req = req.set(options.headers)
    }

    if (options?.auth) {
      req = req.set("Authorization", `Bearer ${options.auth.token}`)
    }

    return req
  }

  /**
   * Make a PATCH request to a TSOA route
   */
  async patch(
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>
      auth?: TestUserWithAuth
    },
  ) {
    const fullPath = `${this.baseUrl}${path}`
    let req = request(this.app).patch(fullPath)

    if (body) {
      req = req.send(body)
    }

    if (options?.headers) {
      req = req.set(options.headers)
    }

    if (options?.auth) {
      req = req.set("Authorization", `Bearer ${options.auth.token}`)
    }

    return req
  }

  /**
   * Upload a file to a TSOA route
   */
  async uploadFile(
    path: string,
    fieldName: string,
    filePath: string,
    options?: {
      headers?: Record<string, string>
      auth?: TestUserWithAuth
      fields?: Record<string, any>
    },
  ) {
    const fullPath = `${this.baseUrl}${path}`
    let req = request(this.app).post(fullPath).attach(fieldName, filePath)

    if (options?.fields) {
      for (const [key, value] of Object.entries(options.fields)) {
        req = req.field(key, value)
      }
    }

    if (options?.headers) {
      req = req.set(options.headers)
    }

    if (options?.auth) {
      req = req.set("Authorization", `Bearer ${options.auth.token}`)
    }

    return req
  }
}

/**
 * Assert that an HTTP response is successful (2xx)
 */
export function assertSuccessResponse(response: request.Response): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Expected success response but got ${response.status}: ${JSON.stringify(response.body)}`,
    )
  }
}

/**
 * Assert that an HTTP response has a specific status code
 */
export function assertStatusCode(
  response: request.Response,
  expectedStatus: number,
): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus} but got ${response.status}: ${JSON.stringify(response.body)}`,
    )
  }
}

/**
 * Assert that an HTTP response has TSOA ApiResponse structure
 */
export function assertTsoaResponseStructure(response: request.Response): void {
  assertSuccessResponse(response)

  if (!response.body || typeof response.body !== "object") {
    throw new Error("Response body is not an object")
  }

  if (!("data" in response.body)) {
    throw new Error("Response body missing 'data' property")
  }
}

/**
 * Assert that an HTTP response has TSOA error structure
 */
export function assertTsoaErrorStructure(
  response: request.Response,
  expectedCode?: string,
): void {
  if (!response.body || typeof response.body !== "object") {
    throw new Error("Response body is not an object")
  }

  if (!("error" in response.body)) {
    throw new Error("Response body missing 'error' property")
  }

  const error = response.body.error

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
}

/**
 * Test authentication flow for a TSOA route
 */
export async function testAuthenticationFlow(
  client: TsoaTestClient,
  path: string,
  method: "get" | "post" | "put" | "delete" = "get",
  body?: any,
): Promise<{
  unauthenticatedResponse: request.Response
  authenticatedResponse: request.Response
}> {
  // Test without authentication
  let unauthenticatedResponse: request.Response
  if (method === "get") {
    unauthenticatedResponse = await client.get(path)
  } else if (method === "post") {
    unauthenticatedResponse = await client.post(path, body)
  } else if (method === "put") {
    unauthenticatedResponse = await client.put(path, body)
  } else {
    unauthenticatedResponse = await client.delete(path)
  }

  // Should be 401 Unauthorized
  assertStatusCode(unauthenticatedResponse, 401)

  // Test with authentication
  const { createTestUserWithAuth } = await import("./testAuth.js")
  const testUser = await createTestUserWithAuth()

  let authenticatedResponse: request.Response
  if (method === "get") {
    authenticatedResponse = await client.get(path, { auth: testUser })
  } else if (method === "post") {
    authenticatedResponse = await client.post(path, body, { auth: testUser })
  } else if (method === "put") {
    authenticatedResponse = await client.put(path, body, { auth: testUser })
  } else {
    authenticatedResponse = await client.delete(path, { auth: testUser })
  }

  return {
    unauthenticatedResponse,
    authenticatedResponse,
  }
}

/**
 * Test rate limiting for a TSOA route
 */
export async function testRateLimiting(
  client: TsoaTestClient,
  path: string,
  maxRequests: number,
  method: "get" | "post" = "get",
  body?: any,
): Promise<{
  successfulRequests: number
  rateLimitedResponse: request.Response
}> {
  const { createTestUserWithAuth } = await import("./testAuth.js")
  const testUser = await createTestUserWithAuth()

  let successfulRequests = 0
  let rateLimitedResponse: request.Response | null = null

  // Make requests until rate limited
  for (let i = 0; i < maxRequests + 5; i++) {
    let response: request.Response
    if (method === "get") {
      response = await client.get(path, { auth: testUser })
    } else {
      response = await client.post(path, body, { auth: testUser })
    }

    if (response.status === 429) {
      rateLimitedResponse = response
      break
    } else if (response.status < 300) {
      successfulRequests++
    }
  }

  if (!rateLimitedResponse) {
    throw new Error("Rate limiting was not triggered")
  }

  return {
    successfulRequests,
    rateLimitedResponse,
  }
}

/**
 * Test pagination for a TSOA route
 */
export async function testPagination(
  client: TsoaTestClient,
  path: string,
  auth?: TestUserWithAuth,
): Promise<{
  page1: request.Response
  page2: request.Response
  totalItems: number
}> {
  // Get first page
  const page1 = await client.get(path, {
    query: { page: 1, limit: 10 },
    auth,
  })

  assertSuccessResponse(page1)
  assertTsoaResponseStructure(page1)

  // Get second page
  const page2 = await client.get(path, {
    query: { page: 2, limit: 10 },
    auth,
  })

  assertSuccessResponse(page2)
  assertTsoaResponseStructure(page2)

  // Extract total items
  const totalItems =
    page1.body.data.total || page1.body.data.items?.length || 0

  return {
    page1,
    page2,
    totalItems,
  }
}

/**
 * Test validation errors for a TSOA route
 */
export async function testValidationErrors(
  client: TsoaTestClient,
  path: string,
  invalidPayloads: any[],
  method: "post" | "put" = "post",
  auth?: TestUserWithAuth,
): Promise<request.Response[]> {
  const responses: request.Response[] = []

  for (const payload of invalidPayloads) {
    let response: request.Response
    if (method === "post") {
      response = await client.post(path, payload, { auth })
    } else {
      response = await client.put(path, payload, { auth })
    }

    // Should be 400 Bad Request or 422 Unprocessable Entity
    if (response.status !== 400 && response.status !== 422) {
      throw new Error(
        `Expected validation error (400/422) but got ${response.status}`,
      )
    }

    responses.push(response)
  }

  return responses
}
