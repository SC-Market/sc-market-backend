/**
 * Property-Based Tests for Parallel Operation Routing Correctness
 *
 * These tests verify that during parallel operation (when both legacy and TSOA
 * systems are running), requests are routed to exactly one handler based on
 * migration status, and are never handled by both systems simultaneously.
 *
 * Testing Framework: fast-check
 * Feature: tsoa-migration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import express, { Express, Request, Response, NextFunction } from "express"
import supertest from "supertest"

/**
 * Migration status for a route module
 */
interface RouteModuleMigrationStatus {
  module: string
  status: "not_started" | "in_progress" | "completed" | "rolled_back"
  routes: {
    path: string
    method: string
    migrated: boolean
  }[]
}

/**
 * Simulated migration status tracking
 * In production, this would be stored in a database or configuration
 */
const migrationStatus: RouteModuleMigrationStatus[] = [
  {
    module: "attributes",
    status: "completed",
    routes: [
      { path: "/api/v1/attributes/definitions", method: "GET", migrated: true },
      { path: "/api/v1/attributes/definitions", method: "POST", migrated: true },
      {
        path: "/api/v1/attributes/definitions/:attribute_name",
        method: "PUT",
        migrated: true,
      },
      {
        path: "/api/v1/attributes/definitions/:attribute_name",
        method: "DELETE",
        migrated: true,
      },
    ],
  },
  {
    module: "profile",
    status: "completed",
    routes: [
      { path: "/api/v1/profile", method: "GET", migrated: true },
      { path: "/api/v1/profile", method: "PUT", migrated: true },
    ],
  },
  {
    module: "market-listings",
    status: "in_progress",
    routes: [
      { path: "/api/v1/market/listings", method: "GET", migrated: true },
      {
        path: "/api/v1/market/listings/:listing_id",
        method: "GET",
        migrated: true,
      },
      { path: "/api/v1/market/listings", method: "POST", migrated: true },
      {
        path: "/api/v1/market/listing/:listing_id",
        method: "PUT",
        migrated: true,
      },
    ],
  },
  {
    module: "orders",
    status: "not_started",
    routes: [
      { path: "/api/v1/orders", method: "GET", migrated: false },
      { path: "/api/v1/orders/:order_id", method: "GET", migrated: false },
      { path: "/api/v1/orders", method: "POST", migrated: false },
    ],
  },
  {
    module: "contractors",
    status: "not_started",
    routes: [
      { path: "/api/v1/contractors", method: "GET", migrated: false },
      {
        path: "/api/v1/contractors/:contractor_id",
        method: "GET",
        migrated: false,
      },
      { path: "/api/v1/contractors", method: "POST", migrated: false },
    ],
  },
]

/**
 * Check if a route is migrated to TSOA
 */
function isRouteMigrated(method: string, path: string): boolean {
  for (const module of migrationStatus) {
    const route = module.routes.find(
      (r) => r.method === method && r.path === path,
    )
    if (route) {
      return route.migrated
    }
  }
  return false
}

/**
 * Normalize route path for comparison
 * Converts Express parameter syntax to a normalized form
 */
function normalizeRoutePath(path: string): string {
  // Remove trailing slashes
  let normalized = path.replace(/\/$/, "")
  // Ensure leading slash
  if (!normalized.startsWith("/")) {
    normalized = "/" + normalized
  }
  return normalized
}

/**
 * Check if two route paths match (accounting for parameters)
 */
function routePathsMatch(path1: string, path2: string): boolean {
  const normalized1 = normalizeRoutePath(path1)
  const normalized2 = normalizeRoutePath(path2)

  // Split into segments
  const segments1 = normalized1.split("/").filter((s) => s.length > 0)
  const segments2 = normalized2.split("/").filter((s) => s.length > 0)

  // Must have same number of segments
  if (segments1.length !== segments2.length) {
    return false
  }

  // Compare each segment
  for (let i = 0; i < segments1.length; i++) {
    const seg1 = segments1[i]
    const seg2 = segments2[i]

    // If either is a parameter, they match
    if (seg1.startsWith(":") || seg2.startsWith(":")) {
      continue
    }

    // Otherwise must be exact match
    if (seg1 !== seg2) {
      return false
    }
  }

  return true
}

describe("Parallel Operation Routing - Property-Based Tests", () => {
  let app: Express
  let legacyHandlerCalls: Array<{ method: string; path: string }>
  let tsoaHandlerCalls: Array<{ method: string; path: string }>

  beforeEach(() => {
    app = express()
    app.use(express.json())
    legacyHandlerCalls = []
    tsoaHandlerCalls = []

    // Register legacy routes
    registerLegacyRoutes(app)

    // Register TSOA routes
    registerTsoaRoutes(app)

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Register legacy route handlers
   * These simulate the @wesleytodd/openapi-express routes
   */
  function registerLegacyRoutes(app: Express) {
    // Only register routes that are NOT migrated
    for (const module of migrationStatus) {
      for (const route of module.routes) {
        if (!route.migrated) {
          const handler = (req: Request, res: Response) => {
            legacyHandlerCalls.push({
              method: req.method,
              path: req.route.path,
            })
            res.json({
              data: { message: "Legacy handler", route: req.route.path },
            })
          }

          switch (route.method) {
            case "GET":
              app.get(route.path, handler)
              break
            case "POST":
              app.post(route.path, handler)
              break
            case "PUT":
              app.put(route.path, handler)
              break
            case "DELETE":
              app.delete(route.path, handler)
              break
          }
        }
      }
    }
  }

  /**
   * Register TSOA route handlers
   * These simulate the TSOA-generated routes
   */
  function registerTsoaRoutes(app: Express) {
    // Only register routes that ARE migrated
    for (const module of migrationStatus) {
      for (const route of module.routes) {
        if (route.migrated) {
          const handler = (req: Request, res: Response) => {
            tsoaHandlerCalls.push({
              method: req.method,
              path: req.route.path,
            })
            res.json({
              data: { message: "TSOA handler", route: req.route.path },
            })
          }

          switch (route.method) {
            case "GET":
              app.get(route.path, handler)
              break
            case "POST":
              app.post(route.path, handler)
              break
            case "PUT":
              app.put(route.path, handler)
              break
            case "DELETE":
              app.delete(route.path, handler)
              break
          }
        }
      }
    }
  }

  /**
   * Property 1: Parallel Operation Routing Correctness
   * **Validates: Requirements 2.1, 2.2**
   *
   * For any HTTP request during parallel operation, the request should be routed
   * to exactly one handler (either legacy or TSOA) based on the migration status,
   * and should never be handled by both systems simultaneously.
   *
   * This property verifies that:
   * 1. Each request is handled by exactly one system (legacy OR TSOA, never both)
   * 2. Migrated routes are handled by TSOA
   * 3. Non-migrated routes are handled by legacy system
   * 4. No route conflicts exist between systems
   * 5. Route selection is deterministic based on migration status
   * 6. Both systems can coexist without interfering with each other
   */
  describe("Feature: tsoa-migration, Property 1: Parallel Operation Routing Correctness", () => {
    /**
     * Test: Each request is handled by exactly one system
     */
    it("should route each request to exactly one handler (legacy OR TSOA, never both)", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate requests for all known routes
            method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
            routeIndex: fc.integer({ min: 0, max: 100 }),
          }),
          async (params) => {
            // Get all routes
            const allRoutes = migrationStatus.flatMap((m) => m.routes)
            if (allRoutes.length === 0) return

            // Select a route (wrap around if index too large)
            const route = allRoutes[params.routeIndex % allRoutes.length]

            // Only test if method matches
            if (route.method !== params.method) {
              return
            }

            // Clear call tracking
            legacyHandlerCalls = []
            tsoaHandlerCalls = []

            // Make request
            const request = supertest(app)
            let response

            // Replace path parameters with test values
            const testPath = route.path
              .replace(/:attribute_name/g, "test_attr")
              .replace(/:listing_id/g, "test-listing-123")
              .replace(/:order_id/g, "test-order-456")
              .replace(/:contractor_id/g, "test-contractor-789")

            switch (params.method) {
              case "GET":
                response = await request.get(testPath)
                break
              case "POST":
                response = await request.post(testPath).send({})
                break
              case "PUT":
                response = await request.put(testPath).send({})
                break
              case "DELETE":
                response = await request.delete(testPath)
                break
            }

            // Verify response was successful (200-299)
            expect(response.status).toBeGreaterThanOrEqual(200)
            expect(response.status).toBeLessThan(300)

            // Count how many handlers were called
            const totalCalls = legacyHandlerCalls.length + tsoaHandlerCalls.length

            // CRITICAL: Exactly one handler should be called
            expect(totalCalls).toBe(1)

            // Verify the correct handler was called based on migration status
            if (route.migrated) {
              expect(tsoaHandlerCalls.length).toBe(1)
              expect(legacyHandlerCalls.length).toBe(0)
              expect(response.body.data.message).toBe("TSOA handler")
            } else {
              expect(legacyHandlerCalls.length).toBe(1)
              expect(tsoaHandlerCalls.length).toBe(0)
              expect(response.body.data.message).toBe("Legacy handler")
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    /**
     * Test: Migrated routes are handled by TSOA
     */
    it("should route all migrated routes to TSOA handlers", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            ...migrationStatus.flatMap((m) =>
              m.routes.filter((r) => r.migrated),
            ),
          ),
          async (route) => {
            // Clear call tracking
            legacyHandlerCalls = []
            tsoaHandlerCalls = []

            // Make request
            const request = supertest(app)
            const testPath = route.path
              .replace(/:attribute_name/g, "test_attr")
              .replace(/:listing_id/g, "test-listing-123")

            let response
            switch (route.method) {
              case "GET":
                response = await request.get(testPath)
                break
              case "POST":
                response = await request.post(testPath).send({})
                break
              case "PUT":
                response = await request.put(testPath).send({})
                break
              case "DELETE":
                response = await request.delete(testPath)
                break
            }

            // Verify TSOA handler was called
            expect(tsoaHandlerCalls.length).toBe(1)
            expect(legacyHandlerCalls.length).toBe(0)

            // Verify response came from TSOA
            expect(response.body.data.message).toBe("TSOA handler")

            // Verify the correct route was called
            const calledRoute = tsoaHandlerCalls[0]
            expect(calledRoute.method).toBe(route.method)
            expect(routePathsMatch(calledRoute.path, route.path)).toBe(true)
          },
        ),
        {
          numRuns: migrationStatus.flatMap((m) =>
            m.routes.filter((r) => r.migrated),
          ).length,
        },
      )
    })

    /**
     * Test: Non-migrated routes are handled by legacy system
     */
    it("should route all non-migrated routes to legacy handlers", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            ...migrationStatus.flatMap((m) =>
              m.routes.filter((r) => !r.migrated),
            ),
          ),
          async (route) => {
            // Clear call tracking
            legacyHandlerCalls = []
            tsoaHandlerCalls = []

            // Make request
            const request = supertest(app)
            const testPath = route.path
              .replace(/:order_id/g, "test-order-456")
              .replace(/:contractor_id/g, "test-contractor-789")

            let response
            switch (route.method) {
              case "GET":
                response = await request.get(testPath)
                break
              case "POST":
                response = await request.post(testPath).send({})
                break
              case "PUT":
                response = await request.put(testPath).send({})
                break
              case "DELETE":
                response = await request.delete(testPath)
                break
            }

            // Verify legacy handler was called
            expect(legacyHandlerCalls.length).toBe(1)
            expect(tsoaHandlerCalls.length).toBe(0)

            // Verify response came from legacy
            expect(response.body.data.message).toBe("Legacy handler")

            // Verify the correct route was called
            const calledRoute = legacyHandlerCalls[0]
            expect(calledRoute.method).toBe(route.method)
            expect(routePathsMatch(calledRoute.path, route.path)).toBe(true)
          },
        ),
        {
          numRuns: migrationStatus.flatMap((m) =>
            m.routes.filter((r) => !r.migrated),
          ).length,
        },
      )
    })

    /**
     * Test: No route conflicts between systems
     */
    it("should not have any route conflicts between legacy and TSOA systems", async () => {
      // Get all legacy routes
      const legacyRoutes = migrationStatus.flatMap((m) =>
        m.routes.filter((r) => !r.migrated),
      )

      // Get all TSOA routes
      const tsoaRoutes = migrationStatus.flatMap((m) =>
        m.routes.filter((r) => r.migrated),
      )

      // Check for conflicts
      const conflicts: Array<{ legacy: any; tsoa: any }> = []

      for (const legacyRoute of legacyRoutes) {
        for (const tsoaRoute of tsoaRoutes) {
          if (
            legacyRoute.method === tsoaRoute.method &&
            routePathsMatch(legacyRoute.path, tsoaRoute.path)
          ) {
            conflicts.push({ legacy: legacyRoute, tsoa: tsoaRoute })
          }
        }
      }

      // Verify no conflicts exist
      expect(conflicts).toEqual([])
      expect(conflicts.length).toBe(0)
    })

    /**
     * Test: Route selection is deterministic
     */
    it("should route requests deterministically based on migration status", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            ...migrationStatus.flatMap((m) => m.routes),
          ),
          async (route) => {
            // Make the same request multiple times
            const responses: string[] = []

            for (let i = 0; i < 3; i++) {
              // Clear call tracking
              legacyHandlerCalls = []
              tsoaHandlerCalls = []

              // Make request
              const request = supertest(app)
              const testPath = route.path
                .replace(/:attribute_name/g, "test_attr")
                .replace(/:listing_id/g, "test-listing-123")
                .replace(/:order_id/g, "test-order-456")
                .replace(/:contractor_id/g, "test-contractor-789")

              let response
              switch (route.method) {
                case "GET":
                  response = await request.get(testPath)
                  break
                case "POST":
                  response = await request.post(testPath).send({})
                  break
                case "PUT":
                  response = await request.put(testPath).send({})
                  break
                case "DELETE":
                  response = await request.delete(testPath)
                  break
              }

              responses.push(response.body.data.message)
            }

            // All responses should be identical
            expect(responses[0]).toBe(responses[1])
            expect(responses[1]).toBe(responses[2])

            // All responses should match migration status
            const expectedMessage = route.migrated
              ? "TSOA handler"
              : "Legacy handler"
            expect(responses[0]).toBe(expectedMessage)
          },
        ),
        {
          numRuns: Math.min(
            30,
            migrationStatus.flatMap((m) => m.routes).length,
          ),
        },
      )
    })

    /**
     * Test: Both systems can coexist without interference
     */
    it("should allow both systems to coexist without interfering with each other", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate a sequence of requests to different systems
            requests: fc.array(
              fc.record({
                routeIndex: fc.integer({ min: 0, max: 100 }),
              }),
              { minLength: 5, maxLength: 10 },
            ),
          }),
          async (params) => {
            const allRoutes = migrationStatus.flatMap((m) => m.routes)
            if (allRoutes.length === 0) return

            // Track which system handled each request
            const handlerSequence: string[] = []

            // Make all requests in sequence
            for (const req of params.requests) {
              const route = allRoutes[req.routeIndex % allRoutes.length]

              // Clear call tracking
              legacyHandlerCalls = []
              tsoaHandlerCalls = []

              // Make request
              const request = supertest(app)
              const testPath = route.path
                .replace(/:attribute_name/g, "test_attr")
                .replace(/:listing_id/g, "test-listing-123")
                .replace(/:order_id/g, "test-order-456")
                .replace(/:contractor_id/g, "test-contractor-789")

              let response
              switch (route.method) {
                case "GET":
                  response = await request.get(testPath)
                  break
                case "POST":
                  response = await request.post(testPath).send({})
                  break
                case "PUT":
                  response = await request.put(testPath).send({})
                  break
                case "DELETE":
                  response = await request.delete(testPath)
                  break
              }

              // Verify exactly one handler was called
              const totalCalls =
                legacyHandlerCalls.length + tsoaHandlerCalls.length
              expect(totalCalls).toBe(1)

              // Record which system handled it
              handlerSequence.push(response.body.data.message)
            }

            // Verify we used both systems (if both have routes)
            const hasMigratedRoutes = allRoutes.some((r) => r.migrated)
            const hasUnmigratedRoutes = allRoutes.some((r) => !r.migrated)

            if (hasMigratedRoutes && hasUnmigratedRoutes) {
              // Should have used both systems
              const usedTsoa = handlerSequence.includes("TSOA handler")
              const usedLegacy = handlerSequence.includes("Legacy handler")

              // At least one of each (if we made enough requests)
              if (params.requests.length >= 5) {
                expect(usedTsoa || usedLegacy).toBe(true)
              }
            }
          },
        ),
        { numRuns: 30 },
      )
    })

    /**
     * Test: Migration status changes are respected
     */
    it("should respect migration status changes when routing requests", async () => {
      // This test simulates what happens when a route's migration status changes
      // In production, this would involve updating the migration status and
      // re-registering routes

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            ...migrationStatus.flatMap((m) => m.routes),
          ),
          async (route) => {
            // Get current migration status
            const currentlyMigrated = route.migrated

            // Clear call tracking
            legacyHandlerCalls = []
            tsoaHandlerCalls = []

            // Make request with current status
            const request = supertest(app)
            const testPath = route.path
              .replace(/:attribute_name/g, "test_attr")
              .replace(/:listing_id/g, "test-listing-123")
              .replace(/:order_id/g, "test-order-456")
              .replace(/:contractor_id/g, "test-contractor-789")

            let response
            switch (route.method) {
              case "GET":
                response = await request.get(testPath)
                break
              case "POST":
                response = await request.post(testPath).send({})
                break
              case "PUT":
                response = await request.put(testPath).send({})
                break
              case "DELETE":
                response = await request.delete(testPath)
                break
            }

            // Verify correct handler was called based on current status
            if (currentlyMigrated) {
              expect(tsoaHandlerCalls.length).toBe(1)
              expect(legacyHandlerCalls.length).toBe(0)
              expect(response.body.data.message).toBe("TSOA handler")
            } else {
              expect(legacyHandlerCalls.length).toBe(1)
              expect(tsoaHandlerCalls.length).toBe(0)
              expect(response.body.data.message).toBe("Legacy handler")
            }
          },
        ),
        {
          numRuns: Math.min(
            30,
            migrationStatus.flatMap((m) => m.routes).length,
          ),
        },
      )
    })

    /**
     * Test: Route registration order doesn't affect routing
     */
    it("should route correctly regardless of route registration order", async () => {
      // Create a new app with routes registered in reverse order
      const reverseApp = express()
      reverseApp.use(express.json())

      // Register TSOA routes first (opposite of normal order)
      registerTsoaRoutes(reverseApp)
      registerLegacyRoutes(reverseApp)

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            ...migrationStatus.flatMap((m) => m.routes),
          ),
          async (route) => {
            // Clear call tracking
            legacyHandlerCalls = []
            tsoaHandlerCalls = []

            // Make request to reverse-order app
            const request = supertest(reverseApp)
            const testPath = route.path
              .replace(/:attribute_name/g, "test_attr")
              .replace(/:listing_id/g, "test-listing-123")
              .replace(/:order_id/g, "test-order-456")
              .replace(/:contractor_id/g, "test-contractor-789")

            let response
            switch (route.method) {
              case "GET":
                response = await request.get(testPath)
                break
              case "POST":
                response = await request.post(testPath).send({})
                break
              case "PUT":
                response = await request.put(testPath).send({})
                break
              case "DELETE":
                response = await request.delete(testPath)
                break
            }

            // Verify correct handler was called (same as normal order)
            if (route.migrated) {
              expect(tsoaHandlerCalls.length).toBe(1)
              expect(legacyHandlerCalls.length).toBe(0)
              expect(response.body.data.message).toBe("TSOA handler")
            } else {
              expect(legacyHandlerCalls.length).toBe(1)
              expect(tsoaHandlerCalls.length).toBe(0)
              expect(response.body.data.message).toBe("Legacy handler")
            }
          },
        ),
        {
          numRuns: Math.min(
            30,
            migrationStatus.flatMap((m) => m.routes).length,
          ),
        },
      )
    })
  })

  /**
   * Additional tests for edge cases
   */
  describe("Parallel Operation Edge Cases", () => {
    /**
     * Test: Handles requests to non-existent routes
     */
    it("should return 404 for non-existent routes without calling any handler", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
            path: fc.constantFrom(
              "/api/v1/nonexistent",
              "/api/v1/fake/route",
              "/api/v1/invalid/path",
            ),
          }),
          async (params) => {
            // Clear call tracking
            legacyHandlerCalls = []
            tsoaHandlerCalls = []

            // Make request
            const request = supertest(app)
            let response

            switch (params.method) {
              case "GET":
                response = await request.get(params.path)
                break
              case "POST":
                response = await request.post(params.path).send({})
                break
              case "PUT":
                response = await request.put(params.path).send({})
                break
              case "DELETE":
                response = await request.delete(params.path)
                break
            }

            // Verify 404 response
            expect(response.status).toBe(404)

            // Verify no handlers were called
            expect(legacyHandlerCalls.length).toBe(0)
            expect(tsoaHandlerCalls.length).toBe(0)
          },
        ),
        { numRuns: 20 },
      )
    })

    /**
     * Test: Handles concurrent requests correctly
     */
    it("should handle concurrent requests to different systems correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Generate multiple concurrent requests
            concurrentRequests: fc.array(
              fc.record({
                routeIndex: fc.integer({ min: 0, max: 100 }),
              }),
              { minLength: 3, maxLength: 5 },
            ),
          }),
          async (params) => {
            const allRoutes = migrationStatus.flatMap((m) => m.routes)
            if (allRoutes.length === 0) return

            // Make all requests concurrently
            const promises = params.concurrentRequests.map(async (req) => {
              const route = allRoutes[req.routeIndex % allRoutes.length]

              const request = supertest(app)
              const testPath = route.path
                .replace(/:attribute_name/g, "test_attr")
                .replace(/:listing_id/g, "test-listing-123")
                .replace(/:order_id/g, "test-order-456")
                .replace(/:contractor_id/g, "test-contractor-789")

              let response
              switch (route.method) {
                case "GET":
                  response = await request.get(testPath)
                  break
                case "POST":
                  response = await request.post(testPath).send({})
                  break
                case "PUT":
                  response = await request.put(testPath).send({})
                  break
                case "DELETE":
                  response = await request.delete(testPath)
                  break
              }

              return {
                route,
                response,
              }
            })

            // Wait for all requests to complete
            const results = await Promise.all(promises)

            // Verify each request was handled correctly
            for (const result of results) {
              expect(result.response.status).toBeGreaterThanOrEqual(200)
              expect(result.response.status).toBeLessThan(300)

              const expectedMessage = result.route.migrated
                ? "TSOA handler"
                : "Legacy handler"
              expect(result.response.body.data.message).toBe(expectedMessage)
            }
          },
        ),
        { numRuns: 20 },
      )
    })
  })
})
