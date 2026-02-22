/**
 * Property-Based Tests for Route Path Matching
 *
 * These tests verify that TSOA-generated route paths match the legacy route
 * paths exactly, character-for-character, ensuring API compatibility during migration.
 *
 * Testing Framework: fast-check
 * Feature: tsoa-migration
 */

import { describe, it, expect, beforeAll } from "vitest"
import fc from "fast-check"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

/**
 * Interface representing a route definition
 */
interface RouteDefinition {
  method: string
  path: string
  controller?: string
  handler?: string
}

/**
 * Parse TSOA-generated routes from routes.ts
 * TSOA generates a routes.ts file with route registrations
 */
function parseTsoaRoutes(): RouteDefinition[] {
  const routesPath = join(
    __dirname,
    "../generated/routes.ts",
  )

  if (!existsSync(routesPath)) {
    console.warn("TSOA routes file not found, skipping route path tests")
    return []
  }

  const routesContent = readFileSync(routesPath, "utf-8")
  const routes: RouteDefinition[] = []

  // Parse route registrations from TSOA-generated code
  // TSOA generates routes like:
  // app.get('/api/v1/attributes/definitions', ...middleware..., controller.method)
  // app.post('/api/v1/attributes/definitions', ...middleware..., controller.method)

  const routeRegex =
    /app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g

  let match
  while ((match = routeRegex.exec(routesContent)) !== null) {
    const [, method, path] = match
    routes.push({
      method: method.toUpperCase(),
      path,
    })
  }

  return routes
}

/**
 * Known legacy routes that have been migrated to TSOA
 * This mapping defines the expected route paths for migrated endpoints
 */
const MIGRATED_ROUTES: RouteDefinition[] = [
  // Attributes routes
  {
    method: "GET",
    path: "/api/v1/attributes/definitions",
    controller: "AttributesController",
    handler: "getDefinitions",
  },
  {
    method: "GET",
    path: "/api/v1/attributes/values/search",
    controller: "AttributesController",
    handler: "searchAttributeValues",
  },
  {
    method: "POST",
    path: "/api/v1/attributes/definitions",
    controller: "AttributesController",
    handler: "createDefinition",
  },
  {
    method: "PUT",
    path: "/api/v1/attributes/definitions/:attribute_name",
    controller: "AttributesController",
    handler: "updateDefinition",
  },
  {
    method: "DELETE",
    path: "/api/v1/attributes/definitions/:attribute_name",
    controller: "AttributesController",
    handler: "deleteDefinition",
  },
  {
    method: "PUT",
    path: "/api/v1/attributes/game-items/:game_item_id/attributes/:attribute_name",
    controller: "AttributesController",
    handler: "upsertGameItemAttribute",
  },
  {
    method: "DELETE",
    path: "/api/v1/attributes/game-items/:game_item_id/attributes/:attribute_name",
    controller: "AttributesController",
    handler: "deleteGameItemAttribute",
  },

  // Profile routes
  {
    method: "GET",
    path: "/api/v1/profile",
    controller: "ProfileController",
    handler: "getOwnProfile",
  },
  {
    method: "PUT",
    path: "/api/v1/profile",
    controller: "ProfileController",
    handler: "updateProfile",
  },
  {
    method: "GET",
    path: "/api/v1/profile/user/:username",
    controller: "ProfileController",
    handler: "getUserByUsername",
  },
  {
    method: "GET",
    path: "/api/v1/profile/search/:query",
    controller: "ProfileController",
    handler: "searchProfiles",
  },

  // Market Listings routes
  {
    method: "GET",
    path: "/api/v1/market/listings",
    controller: "MarketListingsController",
    handler: "searchListings",
  },
  {
    method: "GET",
    path: "/api/v1/market/listings/:listing_id",
    controller: "MarketListingsController",
    handler: "getListingDetails",
  },
  {
    method: "POST",
    path: "/api/v1/market/listings",
    controller: "MarketListingsController",
    handler: "createListing",
  },
  {
    method: "PUT",
    path: "/api/v1/market/listing/:listing_id",
    controller: "MarketListingsController",
    handler: "updateListing",
  },
  {
    method: "POST",
    path: "/api/v1/market/listings/stats",
    controller: "MarketListingsController",
    handler: "getListingStats",
  },
  {
    method: "POST",
    path: "/api/v1/market/listing/:listing_id/update_quantity",
    controller: "MarketListingsController",
    handler: "updateQuantity",
  },
  {
    method: "POST",
    path: "/api/v1/market/listing/:listing_id/refresh",
    controller: "MarketListingsController",
    handler: "refreshListing",
  },
  {
    method: "POST",
    path: "/api/v1/market/listings/:listing_id/views",
    controller: "MarketListingsController",
    handler: "trackView",
  },
]

/**
 * Normalize route path for comparison
 * Converts TSOA parameter syntax to Express parameter syntax
 * TSOA uses {param} while Express uses :param
 */
function normalizeRoutePath(path: string): string {
  // Convert TSOA {param} syntax to Express :param syntax
  return path.replace(/\{([^}]+)\}/g, ":$1")
}

/**
 * Find a route in the TSOA-generated routes
 */
function findTsoaRoute(
  tsoaRoutes: RouteDefinition[],
  method: string,
  path: string,
): RouteDefinition | undefined {
  const normalizedPath = normalizeRoutePath(path)
  return tsoaRoutes.find(
    (route) =>
      route.method === method &&
      normalizeRoutePath(route.path) === normalizedPath,
  )
}

describe("Route Path Matching - Property-Based Tests", () => {
  let tsoaRoutes: RouteDefinition[] = []

  beforeAll(() => {
    tsoaRoutes = parseTsoaRoutes()
  })

  /**
   * Property 12: Route Path Matching
   * **Validates: Requirements 12.4**
   *
   * For any migrated endpoint, the generated route path should match the
   * legacy route path exactly, character-for-character.
   *
   * This property verifies that:
   * 1. All migrated routes exist in TSOA-generated routes
   * 2. Route paths match exactly (including parameter names)
   * 3. HTTP methods match exactly
   * 4. Path parameter syntax is correctly converted
   * 5. No extra or missing path segments
   * 6. Case sensitivity is preserved
   */
  describe("Feature: tsoa-migration, Property 12: Route Path Matching", () => {
    /**
     * Test: All migrated routes have matching TSOA routes
     */
    it("should generate TSOA routes that match legacy routes exactly", async () => {
      // Skip if TSOA routes haven't been generated yet
      if (tsoaRoutes.length === 0) {
        console.warn(
          "Skipping test: TSOA routes not generated. Run 'npm run tsoa:spec-and-routes' first.",
        )
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MIGRATED_ROUTES),
          async (legacyRoute) => {
            // Find the corresponding TSOA route
            const tsoaRoute = findTsoaRoute(
              tsoaRoutes,
              legacyRoute.method,
              legacyRoute.path,
            )

            // Verify TSOA route exists
            expect(tsoaRoute).toBeDefined()
            expect(tsoaRoute).not.toBeNull()

            if (!tsoaRoute) {
              throw new Error(
                `TSOA route not found for ${legacyRoute.method} ${legacyRoute.path}`,
              )
            }

            // Verify HTTP method matches exactly
            expect(tsoaRoute.method).toBe(legacyRoute.method)

            // Verify path matches exactly (after normalization)
            const normalizedLegacyPath = normalizeRoutePath(legacyRoute.path)
            const normalizedTsoaPath = normalizeRoutePath(tsoaRoute.path)
            expect(normalizedTsoaPath).toBe(normalizedLegacyPath)

            // Verify character-for-character match (case-sensitive)
            expect(normalizedTsoaPath).toStrictEqual(normalizedLegacyPath)
          },
        ),
        { numRuns: MIGRATED_ROUTES.length },
      )
    })

    /**
     * Test: Route paths preserve parameter names
     */
    it("should preserve parameter names in route paths", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            ...MIGRATED_ROUTES.filter((route) => route.path.includes(":")),
          ),
          async (legacyRoute) => {
            const tsoaRoute = findTsoaRoute(
              tsoaRoutes,
              legacyRoute.method,
              legacyRoute.path,
            )

            expect(tsoaRoute).toBeDefined()

            if (!tsoaRoute) {
              throw new Error(
                `TSOA route not found for ${legacyRoute.method} ${legacyRoute.path}`,
              )
            }

            // Extract parameter names from legacy route
            const legacyParams = legacyRoute.path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || []
            const legacyParamNames = legacyParams.map((p) => p.substring(1))

            // Extract parameter names from TSOA route
            const tsoaPath = normalizeRoutePath(tsoaRoute.path)
            const tsoaParams = tsoaPath.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || []
            const tsoaParamNames = tsoaParams.map((p) => p.substring(1))

            // Verify parameter names match exactly
            expect(tsoaParamNames).toEqual(legacyParamNames)

            // Verify parameter count matches
            expect(tsoaParamNames.length).toBe(legacyParamNames.length)

            // Verify each parameter name matches (case-sensitive)
            for (let i = 0; i < legacyParamNames.length; i++) {
              expect(tsoaParamNames[i]).toBe(legacyParamNames[i])
            }
          },
        ),
        {
          numRuns: MIGRATED_ROUTES.filter((route) => route.path.includes(":"))
            .length,
        },
      )
    })

    /**
     * Test: Route paths have correct number of segments
     */
    it("should generate routes with the same number of path segments", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MIGRATED_ROUTES),
          async (legacyRoute) => {
            const tsoaRoute = findTsoaRoute(
              tsoaRoutes,
              legacyRoute.method,
              legacyRoute.path,
            )

            expect(tsoaRoute).toBeDefined()

            if (!tsoaRoute) {
              throw new Error(
                `TSOA route not found for ${legacyRoute.method} ${legacyRoute.path}`,
              )
            }

            // Count path segments (split by /)
            const legacySegments = legacyRoute.path
              .split("/")
              .filter((s) => s.length > 0)
            const tsoaSegments = normalizeRoutePath(tsoaRoute.path)
              .split("/")
              .filter((s) => s.length > 0)

            // Verify segment count matches
            expect(tsoaSegments.length).toBe(legacySegments.length)

            // Verify each segment matches (or is a parameter)
            for (let i = 0; i < legacySegments.length; i++) {
              const legacySegment = legacySegments[i]
              const tsoaSegment = tsoaSegments[i]

              if (legacySegment.startsWith(":")) {
                // Parameter segment - verify TSOA also has parameter
                expect(tsoaSegment.startsWith(":")).toBe(true)
                // Verify parameter name matches
                expect(tsoaSegment).toBe(legacySegment)
              } else {
                // Static segment - verify exact match
                expect(tsoaSegment).toBe(legacySegment)
              }
            }
          },
        ),
        { numRuns: MIGRATED_ROUTES.length },
      )
    })

    /**
     * Test: Route paths preserve case sensitivity
     */
    it("should preserve case sensitivity in route paths", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MIGRATED_ROUTES),
          async (legacyRoute) => {
            const tsoaRoute = findTsoaRoute(
              tsoaRoutes,
              legacyRoute.method,
              legacyRoute.path,
            )

            expect(tsoaRoute).toBeDefined()

            if (!tsoaRoute) {
              throw new Error(
                `TSOA route not found for ${legacyRoute.method} ${legacyRoute.path}`,
              )
            }

            // Verify case-sensitive match
            const normalizedLegacyPath = normalizeRoutePath(legacyRoute.path)
            const normalizedTsoaPath = normalizeRoutePath(tsoaRoute.path)

            // Check each character matches (case-sensitive)
            for (let i = 0; i < normalizedLegacyPath.length; i++) {
              expect(normalizedTsoaPath[i]).toBe(normalizedLegacyPath[i])
            }
          },
        ),
        { numRuns: MIGRATED_ROUTES.length },
      )
    })

    /**
     * Test: Route paths have no trailing slashes
     */
    it("should not add or remove trailing slashes from route paths", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MIGRATED_ROUTES),
          async (legacyRoute) => {
            const tsoaRoute = findTsoaRoute(
              tsoaRoutes,
              legacyRoute.method,
              legacyRoute.path,
            )

            expect(tsoaRoute).toBeDefined()

            if (!tsoaRoute) {
              throw new Error(
                `TSOA route not found for ${legacyRoute.method} ${legacyRoute.path}`,
              )
            }

            const normalizedTsoaPath = normalizeRoutePath(tsoaRoute.path)

            // Verify trailing slash behavior matches
            const legacyHasTrailingSlash = legacyRoute.path.endsWith("/")
            const tsoaHasTrailingSlash = normalizedTsoaPath.endsWith("/")

            expect(tsoaHasTrailingSlash).toBe(legacyHasTrailingSlash)
          },
        ),
        { numRuns: MIGRATED_ROUTES.length },
      )
    })

    /**
     * Test: HTTP methods are uppercase
     */
    it("should use uppercase HTTP methods consistently", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MIGRATED_ROUTES),
          async (legacyRoute) => {
            const tsoaRoute = findTsoaRoute(
              tsoaRoutes,
              legacyRoute.method,
              legacyRoute.path,
            )

            expect(tsoaRoute).toBeDefined()

            if (!tsoaRoute) {
              throw new Error(
                `TSOA route not found for ${legacyRoute.method} ${legacyRoute.path}`,
              )
            }

            // Verify method is uppercase
            expect(tsoaRoute.method).toBe(tsoaRoute.method.toUpperCase())
            expect(tsoaRoute.method).toBe(legacyRoute.method)
          },
        ),
        { numRuns: MIGRATED_ROUTES.length },
      )
    })

    /**
     * Test: No duplicate routes exist
     */
    it("should not generate duplicate routes", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      // Create a set of route signatures (method + path)
      const routeSignatures = new Set<string>()
      const duplicates: string[] = []

      for (const route of tsoaRoutes) {
        const signature = `${route.method} ${normalizeRoutePath(route.path)}`

        if (routeSignatures.has(signature)) {
          duplicates.push(signature)
        } else {
          routeSignatures.add(signature)
        }
      }

      // Verify no duplicates exist
      expect(duplicates).toEqual([])
      expect(duplicates.length).toBe(0)
    })

    /**
     * Test: All migrated routes are present
     */
    it("should include all migrated routes in TSOA-generated routes", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      const missingRoutes: RouteDefinition[] = []

      for (const legacyRoute of MIGRATED_ROUTES) {
        const tsoaRoute = findTsoaRoute(
          tsoaRoutes,
          legacyRoute.method,
          legacyRoute.path,
        )

        if (!tsoaRoute) {
          missingRoutes.push(legacyRoute)
        }
      }

      // Verify no routes are missing
      if (missingRoutes.length > 0) {
        console.error("Missing routes:", missingRoutes)
      }

      expect(missingRoutes).toEqual([])
      expect(missingRoutes.length).toBe(0)
    })

    /**
     * Test: Route paths use consistent parameter syntax
     */
    it("should use consistent parameter syntax across all routes", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...tsoaRoutes.filter((r) => r.path.includes(":"))),
          async (route) => {
            const normalizedPath = normalizeRoutePath(route.path)

            // Verify all parameters use :param syntax (not {param})
            const hasColonParams = /:([a-zA-Z_][a-zA-Z0-9_]*)/.test(
              normalizedPath,
            )
            const hasBraceParams = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/.test(
              normalizedPath,
            )

            // After normalization, should only have colon params
            expect(hasColonParams || !normalizedPath.includes(":")).toBe(true)
            expect(hasBraceParams).toBe(false)
          },
        ),
        {
          numRuns: Math.min(
            20,
            tsoaRoutes.filter((r) => r.path.includes(":")).length,
          ),
        },
      )
    })

    /**
     * Test: Route paths don't have double slashes
     */
    it("should not generate routes with double slashes", async () => {
      if (tsoaRoutes.length === 0) {
        console.warn("Skipping test: TSOA routes not generated")
        return
      }

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...tsoaRoutes),
          async (route) => {
            const normalizedPath = normalizeRoutePath(route.path)

            // Verify no double slashes exist
            expect(normalizedPath.includes("//")).toBe(false)
          },
        ),
        { numRuns: Math.min(30, tsoaRoutes.length) },
      )
    })
  })

  /**
   * Additional tests for route path structure
   */
  describe("Route Path Structure Validation", () => {
    /**
     * Test: All routes start with /api/v1
     */
    it("should ensure all migrated routes start with /api/v1", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MIGRATED_ROUTES),
          async (route) => {
            expect(route.path.startsWith("/api/v1")).toBe(true)
          },
        ),
        { numRuns: MIGRATED_ROUTES.length },
      )
    })

    /**
     * Test: Parameter names follow naming conventions
     */
    it("should use snake_case for parameter names", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            ...MIGRATED_ROUTES.filter((route) => route.path.includes(":")),
          ),
          async (route) => {
            // Extract parameter names
            const params = route.path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g) || []
            const paramNames = params.map((p) => p.substring(1))

            // Verify each parameter name uses snake_case
            for (const paramName of paramNames) {
              // Should be lowercase with underscores
              expect(paramName).toMatch(/^[a-z][a-z0-9_]*$/)
              // Should not have consecutive underscores
              expect(paramName.includes("__")).toBe(false)
              // Should not start or end with underscore
              expect(paramName.startsWith("_")).toBe(false)
              expect(paramName.endsWith("_")).toBe(false)
            }
          },
        ),
        {
          numRuns: MIGRATED_ROUTES.filter((route) => route.path.includes(":"))
            .length,
        },
      )
    })

    /**
     * Test: Route paths use kebab-case for static segments
     */
    it("should use kebab-case for static path segments", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...MIGRATED_ROUTES),
          async (route) => {
            // Extract static segments (non-parameter segments)
            const segments = route.path
              .split("/")
              .filter((s) => s.length > 0 && !s.startsWith(":"))

            // Verify each static segment uses kebab-case or is a version number
            for (const segment of segments) {
              // Skip version segments like "v1"
              if (/^v\d+$/.test(segment)) {
                continue
              }

              // Should be lowercase with hyphens or underscores
              expect(segment).toMatch(/^[a-z][a-z0-9_-]*$/)
            }
          },
        ),
        { numRuns: MIGRATED_ROUTES.length },
      )
    })
  })
})
