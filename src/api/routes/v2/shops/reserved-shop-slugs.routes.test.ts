/**
 * Every literal path segment that sits where a shop slug goes must be a
 * reserved shop slug (services/shops/reserved-shop-slugs.ts), or a shop could
 * take a slug whose URL resolves to that route instead of the shop.
 *
 * Reads the generated v2 route table (GET /shops/{slug} competes with
 * /shops/mine, /shops/by-owner, /shops/slug-availability...) and the v1
 * /api/shops router. Adding a route there without reserving its segment fails
 * here. The frontend checks its own route table against the same list, which
 * it reads from the ReservedShopSlug enum in the OpenAPI spec.
 */
import { beforeAll, describe, expect, it, vi } from "vitest"
import express from "express"
import { RESERVED_SHOP_SLUGS } from "../../../../services/shops/reserved-shop-slugs.js"

// The v1 router's rate limiter opens a Postgres store at import; routes only.
vi.mock("../../../middleware/enhanced-ratelimiting.js", () => ({
  readRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

interface Layer {
  route?: { path: string; methods: Record<string, boolean> }
}

function routePaths(stack: Layer[]): string[] {
  return stack.filter((layer) => layer.route).map((layer) => layer.route!.path)
}

describe("reserved shop slugs cover the route table", () => {
  let v2Paths: string[]
  let v1ShopPaths: string[]

  beforeAll(async () => {
    // Generated routes import the CDN client, which needs B2 credentials at load.
    process.env.B2_KEY_ID ||= "test-key-id"
    process.env.B2_APP_KEY ||= "test-app-key"

    const { RegisterRoutes } = await import("../generated/routes.js")
    const app = express()
    RegisterRoutes(app)
    v2Paths = routePaths(
      (app as unknown as { _router: { stack: Layer[] } })._router.stack,
    )

    const { shopRouter } = await import("../../v1/shops/routes.js")
    v1ShopPaths = routePaths(
      (shopRouter as unknown as { stack: Layer[] }).stack,
    )
  })

  it("still has the slug route this guards", () => {
    expect(v2Paths).toContain("/shops/:slug")
  })

  it("reserves every literal second segment of a v2 /shops route", () => {
    const segments = v2Paths
      .map((path) => path.split("/").filter(Boolean))
      .filter(
        (parts) =>
          parts[0] === "shops" &&
          parts.length >= 2 &&
          !parts[1].startsWith(":"),
      )
      .map((parts) => parts[1])
    expect(segments.length).toBeGreaterThan(0)
    expect(
      [...new Set(segments)].filter(
        (s) => !RESERVED_SHOP_SLUGS.has(s.toLowerCase()),
      ),
    ).toEqual([])
  })

  it("reserves every literal first segment of the v1 /api/shops router", () => {
    const segments = v1ShopPaths
      .map((path) => path.split("/").filter(Boolean)[0])
      .filter((s): s is string => !!s && !s.startsWith(":"))
    expect(segments.length).toBeGreaterThan(0)
    expect(
      [...new Set(segments)].filter(
        (s) => !RESERVED_SHOP_SLUGS.has(s.toLowerCase()),
      ),
    ).toEqual([])
  })
})
