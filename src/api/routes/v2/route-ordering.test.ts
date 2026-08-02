import { describe, it, expect, beforeAll } from "vitest"
import express from "express"

/**
 * Guards the literal-vs-{param} route ordering in the v2 controllers.
 *
 * Express matches routes in registration order and has no notion of path
 * specificity, and TSOA emits routes in the order the methods are declared in
 * the controller class. So declaring `@Get("{resource_id}")` above
 * `@Get("categories")` makes /game-data/resources/categories resolve into
 * getResource() with resource_id === "categories" — a silent failure that looks
 * like a database error, not a routing bug.
 *
 * These pairs were previously patched by hand-registering the literal paths in
 * api-router.ts before RegisterRoutes(). That workaround bypassed TSOA's
 * @Security middleware and its query-param binding, so it is gone; ordering is
 * now maintained in the controllers and asserted here instead.
 */
describe("v2 route ordering", () => {
  /** Registered routes in Express's matching order. */
  let routes: Array<{ method: string; path: string }>
  /** Paths of GET routes only, for the explicit pair assertions below. */
  let paths: string[]

  beforeAll(async () => {
    // The generated routes transitively import the CDN client, which throws at
    // module load if B2 credentials are absent. CI has no B2 secrets, so stub
    // them — this test never makes a CDN call.
    process.env.B2_KEY_ID ||= "test-key-id"
    process.env.B2_APP_KEY ||= "test-app-key"

    const { RegisterRoutes } = await import("./generated/routes.js")
    const app = express()
    RegisterRoutes(app)

    routes = (
      app as unknown as {
        _router: {
          stack: Array<{
            route?: { path: string; methods: Record<string, boolean> }
          }>
        }
      }
    )._router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map((method) => ({
          method,
          path: layer.route!.path,
        })),
      )

    paths = routes.filter((r) => r.method === "get").map((r) => r.path)
  })

  const pairs: Array<[literal: string, param: string]> = [
    ["/game-data/resources/categories", "/game-data/resources/:resource_id"],
    ["/game-data/missions/chains", "/game-data/missions/:mission_id"],
    [
      "/game-data/missions/reputation-ranks",
      "/game-data/missions/:mission_id",
    ],
    ["/game-data/missions/events", "/game-data/missions/:mission_id"],
    ["/game-data/blueprints/categories", "/game-data/blueprints/:blueprint_id"],
    ["/game-data/blueprints/inventory", "/game-data/blueprints/:blueprint_id"],
    ["/offers/search", "/offers/:sessionId"],
  ]

  it.each(pairs)("registers %s before %s", (literal, param) => {
    const literalIndex = paths.indexOf(literal)
    const paramIndex = paths.indexOf(param)

    expect(literalIndex, `${literal} is not registered`).toBeGreaterThanOrEqual(
      0,
    )
    expect(paramIndex, `${param} is not registered`).toBeGreaterThanOrEqual(0)
    expect(literalIndex).toBeLessThan(paramIndex)
  })

  it("has no parameterised route shadowing a literal sibling", () => {
    const segmentsOf = (path: string) => path.split("/").filter(Boolean)
    const shadowed = new Set<string>()

    // Compare within a single HTTP method: Express keeps every method in one
    // stack, but only dispatches a request to a layer whose method matches, so
    // POST /buy-orders/decline is not shadowed by GET /buy-orders/:id.
    routes.forEach((earlier, i) => {
      const earlierSegments = segmentsOf(earlier.path)

      routes.slice(i + 1).forEach((later) => {
        if (earlier.method !== later.method) return

        const laterSegments = segmentsOf(later.path)
        if (earlierSegments.length !== laterSegments.length) return

        let swallowsLiteral = false
        const matches = earlierSegments.every((segment, index) => {
          const other = laterSegments[index]
          if (!segment.startsWith(":")) return segment === other
          if (other.startsWith(":")) return segment === other
          swallowsLiteral = true
          return true
        })

        if (matches && swallowsLiteral) {
          shadowed.add(
            `${earlier.method.toUpperCase()} ${earlier.path} shadows ${later.path}`,
          )
        }
      })
    })

    expect([...shadowed]).toEqual([])
  })
})
