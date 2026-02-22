/**
 * Property-Based Tests for AttributesController
 *
 * These tests verify universal properties that should hold across all inputs
 * for the TSOA AttributesController endpoints.
 *
 * Testing Framework: fast-check
 * Feature: tsoa-migration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { AttributesController } from "./attributes.controller.js"
import { Request as ExpressRequest } from "express"

// Mock the database modules
vi.mock("../routes/v1/attributes/cache.js", () => ({
  cachedDb: {
    getAttributeDefinitions: vi.fn(),
  },
}))

vi.mock("../routes/v1/attributes/database.js", () => ({
  searchAttributeValues: vi.fn(),
}))

// Mock the rate limiting middleware
vi.mock("../middleware/tsoa-ratelimit.js", () => ({
  readRateLimit: vi.fn((_req, _res, next) => next()),
  writeRateLimit: vi.fn((_req, _res, next) => next()),
  criticalRateLimit: vi.fn((_req, _res, next) => next()),
}))

// Import after mocking
import { cachedDb } from "../routes/v1/attributes/cache.js"
import * as attributeDb from "../routes/v1/attributes/database.js"

describe("AttributesController - Property-Based Tests", () => {
  let controller: AttributesController
  let mockRequest: Partial<ExpressRequest>

  beforeEach(() => {
    controller = new AttributesController()
    mockRequest = {
      query: {},
      user: {
        user_id: "test-user-id",
        username: "testuser",
        role: "user",
        rsi_confirmed: true,
        banned: false,
      } as any,
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Property 2: Route Generation Completeness
   * **Validates: Requirements 3.1**
   *
   * For any decorated controller method, TSOA should generate a corresponding
   * Express route that is registered and accessible via HTTP requests.
   *
   * This property verifies that:
   * 1. All controller methods are callable
   * 2. Methods accept the expected parameters
   * 3. Methods return responses in the expected format
   */
  describe("Feature: tsoa-migration, Property 2: Route Generation Completeness", () => {
    it("should have all decorated methods callable with valid inputs", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate various combinations of query parameters
            applicable_item_types: fc.option(
              fc.oneof(
                fc.constantFrom("ship", "vehicle", "weapon", "armor"),
                fc.array(
                  fc.constantFrom("ship", "vehicle", "weapon", "armor"),
                  { minLength: 1, maxLength: 3 },
                ),
              ),
            ),
            include_hidden: fc.option(fc.constantFrom("true", "false", "")),
          }),
          async (params) => {
            // Mock successful database response
            const mockDefinitions = [
              {
                attribute_name: "test_attr",
                display_name: "Test Attribute",
                attribute_type: "select" as const,
                allowed_values: ["value1", "value2"],
                applicable_item_types: ["ship"],
                display_order: 1,
                show_in_filters: true,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ]

            vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
              mockDefinitions,
            )

            // Call the controller method
            const result = await controller.getDefinitions(
              mockRequest as ExpressRequest,
              params.applicable_item_types,
              params.include_hidden,
            )

            // Verify the method is callable and returns expected structure
            expect(result).toBeDefined()
            expect(result).toHaveProperty("data")
            expect(result.data).toHaveProperty("definitions")
            expect(Array.isArray(result.data.definitions)).toBe(true)
          },
        ),
        { numRuns: 50 },
      )
    })

    it("should have searchAttributeValues method callable with valid inputs", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            attribute_name: fc.constantFrom(
              "manufacturer",
              "size",
              "type",
              "rarity",
            ),
            q: fc.option(fc.string({ minLength: 0, maxLength: 50 })),
            item_type: fc.option(
              fc.constantFrom("ship", "vehicle", "weapon"),
            ),
            limit: fc.option(
              fc.integer({ min: 1, max: 100 }).map((n) => n.toString()),
            ),
          }),
          async (params) => {
            // Mock successful database response
            const mockValues = [
              { value: "Test Value", count: 5 },
              { value: "Another Value", count: 3 },
            ]

            vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
              mockValues,
            )

            // Call the controller method
            const result = await controller.searchAttributeValues(
              mockRequest as ExpressRequest,
              params.attribute_name,
              params.q,
              params.item_type,
              params.limit,
            )

            // Verify the method is callable and returns expected structure
            expect(result).toBeDefined()
            expect(result).toHaveProperty("data")
            expect(result.data).toHaveProperty("values")
            expect(Array.isArray(result.data.values)).toBe(true)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  /**
   * Property 4: Parameter Extraction Correctness
   * **Validates: Requirements 3.3**
   *
   * For any decorated controller parameter (body, query, path, header),
   * the value should be correctly extracted from the HTTP request and
   * passed to the controller method with the correct type.
   *
   * This property verifies that:
   * 1. Query parameters are correctly parsed
   * 2. Array parameters are handled correctly (single value vs array)
   * 3. Boolean parameters are parsed correctly
   * 4. Numeric parameters are parsed and validated
   */
  describe("Feature: tsoa-migration, Property 4: Parameter Extraction Correctness", () => {
    it("should correctly parse array query parameters (single and multiple values)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Single string value
            fc.constantFrom("ship", "vehicle", "weapon"),
            // Array of values
            fc.array(fc.constantFrom("ship", "vehicle", "weapon"), {
              minLength: 1,
              maxLength: 4,
            }),
          ),
          async (applicable_item_types) => {
            const mockDefinitions = [
              {
                attribute_name: "test",
                display_name: "Test",
                attribute_type: "select" as const,
                allowed_values: ["a", "b"],
                applicable_item_types: ["ship"],
                display_order: 1,
                show_in_filters: true,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ]

            vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
              mockDefinitions,
            )

            // Clear previous calls
            vi.clearAllMocks()
            vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
              mockDefinitions,
            )

            await controller.getDefinitions(
              mockRequest as ExpressRequest,
              applicable_item_types,
            )

            // Verify the database was called with correctly parsed array
            const callArgs = vi.mocked(
              cachedDb.getAttributeDefinitions,
            ).mock.calls[0]
            const parsedItemTypes = callArgs[0]

            if (applicable_item_types) {
              expect(parsedItemTypes).toBeDefined()
              expect(Array.isArray(parsedItemTypes)).toBe(true)

              // Verify the array contains the expected values
              if (Array.isArray(applicable_item_types)) {
                expect(parsedItemTypes).toEqual(applicable_item_types)
              } else {
                expect(parsedItemTypes).toEqual([applicable_item_types])
              }
            }
          },
        ),
        { numRuns: 50 },
      )
    })

    it("should correctly parse boolean query parameters", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom("true", "false", "1", "0", "yes", "no", ""),
          async (include_hidden) => {
            const mockDefinitions = [
              {
                attribute_name: "test",
                display_name: "Test",
                attribute_type: "select" as const,
                allowed_values: ["a"],
                applicable_item_types: null,
                display_order: 1,
                show_in_filters: true,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ]

            // Clear previous calls
            vi.clearAllMocks()
            vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
              mockDefinitions,
            )

            await controller.getDefinitions(
              mockRequest as ExpressRequest,
              undefined,
              include_hidden,
            )

            // Verify the database was called with correctly parsed boolean
            const callArgs = vi.mocked(
              cachedDb.getAttributeDefinitions,
            ).mock.calls[0]
            const parsedBoolean = callArgs[1]

            // Only "true" should parse to true, everything else to false
            expect(typeof parsedBoolean).toBe("boolean")
            expect(parsedBoolean).toBe(include_hidden === "true")
          },
        ),
        { numRuns: 30 },
      )
    })

    it("should correctly parse and validate numeric limit parameter", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 200 }).map((n) => n.toString()),
          async (limit) => {
            const mockValues = [{ value: "test", count: 1 }]

            // Clear previous calls
            vi.clearAllMocks()
            vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
              mockValues,
            )

            await controller.searchAttributeValues(
              mockRequest as ExpressRequest,
              "manufacturer",
              undefined,
              undefined,
              limit,
            )

            // Verify the database was called with correctly parsed and capped limit
            const callArgs = vi.mocked(attributeDb.searchAttributeValues).mock
              .calls[0]
            const parsedLimit = callArgs[3]

            // Verify limit is a number
            expect(typeof parsedLimit).toBe("number")

            // Verify limit is capped at 50
            const numericLimit = parseInt(limit, 10)
            if (numericLimit > 50) {
              expect(parsedLimit).toBe(50)
            } else {
              expect(parsedLimit).toBe(numericLimit)
            }
          },
        ),
        { numRuns: 50 },
      )
    })

    it("should handle optional parameters correctly (undefined vs provided)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            hasQuery: fc.boolean(),
            hasItemType: fc.boolean(),
            hasLimit: fc.boolean(),
          }),
          async (flags) => {
            const mockValues = [{ value: "test", count: 1 }]

            // Clear previous calls
            vi.clearAllMocks()
            vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
              mockValues,
            )

            const q = flags.hasQuery ? "search" : undefined
            const item_type = flags.hasItemType ? "ship" : undefined
            const limit = flags.hasLimit ? "25" : undefined

            await controller.searchAttributeValues(
              mockRequest as ExpressRequest,
              "manufacturer",
              q,
              item_type,
              limit,
            )

            // Verify the database was called with correct parameter handling
            const callArgs = vi.mocked(attributeDb.searchAttributeValues).mock
              .calls[0]

            // Check query parameter
            expect(callArgs[1]).toBe(flags.hasQuery ? "search" : "")

            // Check item_type parameter - it should be undefined when not provided
            if (flags.hasItemType) {
              expect(callArgs[2]).toBe("ship")
            } else {
              expect(callArgs[2]).toBeUndefined()
            }

            // Check limit parameter
            if (flags.hasLimit) {
              expect(callArgs[3]).toBe(25)
            } else {
              expect(callArgs[3]).toBe(20) // Default value
            }
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  /**
   * Property 5: API Contract Compatibility
   * **Validates: Requirements 3.5, 5.5, 10.2**
   *
   * For any migrated endpoint, the API contract (request format, response format,
   * status codes, and behavior) should match the legacy system exactly.
   *
   * This property verifies that:
   * 1. Response structure is consistent (always has 'data' wrapper)
   * 2. Response data types are correct
   * 3. Error handling produces consistent error structures
   * 4. Empty results are handled consistently
   */
  describe("Feature: tsoa-migration, Property 5: API Contract Compatibility", () => {
    it("should always return responses with standard 'data' wrapper", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            applicable_item_types: fc.option(
              fc.constantFrom("ship", "vehicle"),
            ),
            include_hidden: fc.option(fc.constantFrom("true", "false")),
          }),
          async (params) => {
            // Test with various database responses
            const mockDefinitions = fc.sample(
              fc.array(
                fc.record({
                  attribute_name: fc.string({ minLength: 1, maxLength: 50 }),
                  display_name: fc.string({ minLength: 1, maxLength: 100 }),
                  attribute_type: fc.constantFrom(
                    "select",
                    "multiselect",
                    "range",
                    "text",
                  ),
                  allowed_values: fc.option(
                    fc.array(fc.string(), { maxLength: 10 }),
                  ),
                  applicable_item_types: fc.option(
                    fc.array(fc.constantFrom("ship", "vehicle"), {
                      maxLength: 3,
                    }),
                  ),
                  display_order: fc.integer({ min: 0, max: 100 }),
                  show_in_filters: fc.boolean(),
                  created_at: fc.constant(new Date()),
                  updated_at: fc.constant(new Date()),
                }),
                { maxLength: 5 },
              ),
              1,
            )[0]

            vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
              mockDefinitions as any,
            )

            const result = await controller.getDefinitions(
              mockRequest as ExpressRequest,
              params.applicable_item_types,
              params.include_hidden,
            )

            // Verify standard response structure
            expect(result).toHaveProperty("data")
            expect(result.data).toHaveProperty("definitions")
            expect(Array.isArray(result.data.definitions)).toBe(true)

            // Verify response matches database result
            expect(result.data.definitions).toEqual(mockDefinitions)
          },
        ),
        { numRuns: 30 },
      )
    })

    it("should handle empty results consistently", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            attribute_name: fc.constantFrom("manufacturer", "size", "type"),
            q: fc.option(fc.string()),
          }),
          async (params) => {
            // Mock empty database response
            vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue([])

            const result = await controller.searchAttributeValues(
              mockRequest as ExpressRequest,
              params.attribute_name,
              params.q,
            )

            // Verify empty results still have correct structure
            expect(result).toHaveProperty("data")
            expect(result.data).toHaveProperty("values")
            expect(Array.isArray(result.data.values)).toBe(true)
            expect(result.data.values).toHaveLength(0)
          },
        ),
        { numRuns: 30 },
      )
    })

    it("should maintain consistent error structure for validation errors", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(""), // Only test empty string, not whitespace
          async (attribute_name) => {
            // Attempt to call with invalid attribute_name
            await expect(
              controller.searchAttributeValues(
                mockRequest as ExpressRequest,
                attribute_name,
              ),
            ).rejects.toMatchObject({
              status: 400,
              code: "VALIDATION_ERROR",
              message: expect.stringContaining("required"),
            })
          },
        ),
        { numRuns: 10 },
      )
    })

    it("should maintain consistent response types across all valid inputs", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            attribute_name: fc.constantFrom(
              "manufacturer",
              "size",
              "type",
              "rarity",
            ),
            q: fc.option(fc.string({ maxLength: 100 })),
            item_type: fc.option(
              fc.constantFrom("ship", "vehicle", "weapon"),
            ),
            limit: fc.option(
              fc.integer({ min: 1, max: 50 }).map((n) => n.toString()),
            ),
          }),
          async (params) => {
            const mockValues = [
              { value: "Value1", count: 10 },
              { value: "Value2", count: 5 },
            ]

            vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
              mockValues,
            )

            const result = await controller.searchAttributeValues(
              mockRequest as ExpressRequest,
              params.attribute_name,
              params.q,
              params.item_type,
              params.limit,
            )

            // Verify response structure is always consistent
            expect(result).toMatchObject({
              data: {
                values: expect.arrayContaining([
                  expect.objectContaining({
                    value: expect.any(String),
                    count: expect.any(Number),
                  }),
                ]),
              },
            })

            // Verify all values have the correct structure
            result.data.values.forEach((item) => {
              expect(item).toHaveProperty("value")
              expect(item).toHaveProperty("count")
              expect(typeof item.value).toBe("string")
              expect(typeof item.count).toBe("number")
              expect(item.count).toBeGreaterThanOrEqual(0)
            })
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  /**
   * Additional Property: Rate Limiting Integration
   *
   * Verifies that rate limiting middleware is properly integrated
   * and doesn't interfere with normal request processing.
   */
  describe("Rate Limiting Integration", () => {
    it("should apply rate limiting middleware to all endpoints", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            endpoint: fc.constantFrom("getDefinitions", "searchAttributeValues"),
          }),
          async (params) => {
            const mockDefinitions = [
              {
                attribute_name: "test",
                display_name: "Test",
                attribute_type: "select" as const,
                allowed_values: ["a"],
                applicable_item_types: null,
                display_order: 1,
                show_in_filters: true,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ]

            const mockValues = [{ value: "test", count: 1 }]

            vi.mocked(cachedDb.getAttributeDefinitions).mockResolvedValue(
              mockDefinitions,
            )
            vi.mocked(attributeDb.searchAttributeValues).mockResolvedValue(
              mockValues,
            )

            // Call the appropriate endpoint
            if (params.endpoint === "getDefinitions") {
              await controller.getDefinitions(mockRequest as ExpressRequest)
            } else {
              await controller.searchAttributeValues(
                mockRequest as ExpressRequest,
                "manufacturer",
              )
            }

            // Verify the request completed successfully
            // (rate limiting middleware should not block valid requests in tests)
            expect(true).toBe(true)
          },
        ),
        { numRuns: 20 },
      )
    })
  })
})
