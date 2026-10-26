/**
 * Dead V1 market routes are unmounted rather than patched (the V1 market is
 * retired; nothing in the current frontend calls these). Unmounting is what
 * closes their holes, so the route table is the regression test.
 */

import { describe, it, expect, vi } from "vitest"
import type { Router } from "express"

vi.hoisted(() => {
  // The route modules import the CDN client, which needs B2 credentials.
  process.env.B2_KEY_ID ||= "test"
  process.env.B2_APP_KEY ||= "test"
})

// The routers build their Postgres-backed rate limiters at import; keep them
// in memory so nothing tries to reach a database.
vi.mock("rate-limiter-flexible", async (importOriginal) => {
  const original = await importOriginal<typeof import("rate-limiter-flexible")>()
  class RateLimiterPostgres extends original.RateLimiterMemory {
    constructor(opts: { points?: number; duration?: number }) {
      super({ points: opts.points, duration: opts.duration })
    }
  }
  return { ...original, RateLimiterPostgres }
})

type Layer = {
  route?: { path: string; methods: Record<string, boolean> }
  handle?: { stack?: Layer[] }
}

function routesOf(router: Router): string[] {
  const out: string[] = []
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) {
          out.push(`${m.toUpperCase()} ${layer.route.path}`)
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack)
      }
    }
  }
  walk((router as unknown as { stack: Layer[] }).stack)
  return out
}

const { marketRouter } = await import("./routes.js")
const { ordersRouter } = await import("../orders/routes.js")
const { contractorsRouter } = await import("../contractors/routes.js")

describe("removed V1 market routes", () => {
  const market = routesOf(marketRouter)
  const orders = routesOf(ordersRouter)
  const contractors = routesOf(contractorsRouter)

  it.each([
    "GET /lots",
    "PUT /listings/:listing_id/stock",
    "POST /listings/:listing_id/lots",
    "PATCH /lots/:lot_id",
    "DELETE /lots/:lot_id",
    "POST /lots/:lot_id/transfer",
  ])("market %s is gone", (route) => {
    expect(market).not.toContain(route)
  })

  it("org-wide allocations are gone", () => {
    expect(contractors).not.toContain("GET /:spectrum_id/allocations")
  })

  it("keeps the routes the frontend still uses", () => {
    expect(market).toContain("GET /listings/:listing_id/lots")
    expect(market).toContain("GET /locations")
    expect(market).toContain("POST /locations")
    expect(orders).toContain("GET /:order_id/allocations")
    expect(orders).toContain("POST /:order_id/allocations/manual")
  })
})
