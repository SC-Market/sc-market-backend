/**
 * /api/public/items: the acquisition document without listing references,
 * anonymous, read-only, edge-cacheable, rate limited per IP, licensed.
 */
import { describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

vi.mock("../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock("../../../clients/database/knex-db.js", () => ({
  getKnex: () => {
    throw new Error("no DB in this test")
  },
  database: {},
}))

const { createPublicItemsRouter } = await import("./router.js")
const {
  PRICE_FEED_CACHE_CONTROL,
  PRICE_FEED_NOT_FOUND_CACHE_CONTROL,
  PRICE_FEED_RATE_LIMIT,
} = await import("../public-prices/router.js")

const LISTING = "e0000000-0000-4000-8000-000000000001"
const DOC = {
  feed: { dataset: "items", version: 1 },
  item: { id: "x", slug: "1a2b3c4d--gun", name: "Gun", type: null },
  as_of: "2026-10-31T12:00:00.000Z",
  listings: {
    count: 1,
    seller_count: 1,
    quantity_available: 2,
    lowest_ask: 5000,
    page: "https://sc-market.space/market/aggregate/1a2b3c4d--gun",
    top: [
      {
        listing_id: LISTING,
        slug: "e0000000--gun",
        title: "Gun",
        price: 5000,
        quantity_available: 2,
        sale_type: "fixed",
      },
    ],
  },
}

function app() {
  const getAcquisitionDocument = vi.fn(async (slug: string) =>
    slug.startsWith("1a2b3c4d") ? (DOC as never) : null,
  )
  const a = express()
  a.set("trust proxy", true)
  a.use(
    "/api/public/items",
    createPublicItemsRouter({ getAcquisitionDocument }),
  )
  return { a, getAcquisitionDocument }
}

describe("public item feed", () => {
  it("serves the document without listing references, anonymously, edge-cacheable and licensed", async () => {
    const { a, getAcquisitionDocument } = app()
    const res = await request(a).get("/api/public/items/1A2B3C4D--Gun.json")
    expect(res.status).toBe(200)
    expect(getAcquisitionDocument).toHaveBeenCalledWith("1a2b3c4d--gun")
    expect(res.body.listings).toEqual({
      count: 1,
      seller_count: 1,
      quantity_available: 2,
      lowest_ask: 5000,
      page: "https://sc-market.space/market/aggregate/1a2b3c4d--gun",
    })
    expect(res.text).not.toContain(LISTING)
    expect(res.text).not.toContain("e0000000--gun")
    expect(res.headers["cache-control"]).toBe(PRICE_FEED_CACHE_CONTROL)
    expect(res.headers["access-control-allow-origin"]).toBe("*")
    expect(res.headers["link"]).toBe(
      '<https://creativecommons.org/licenses/by/4.0/>; rel="license"',
    )
    expect(res.headers["set-cookie"]).toBeUndefined()
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
  })

  it("404s unknown items, malformed slugs and other paths with a short cache", async () => {
    const { a, getAcquisitionDocument } = app()
    const res = await request(a).get("/api/public/items/deadbeef--nope.json")
    expect(res.status).toBe(404)
    expect(res.headers["cache-control"]).toBe(
      PRICE_FEED_NOT_FOUND_CACHE_CONTROL,
    )
    expect(
      (await request(a).get("/api/public/items/..%2Fetc.json")).status,
    ).toBe(404)
    expect((await request(a).get("/api/public/items/index.json")).status).toBe(
      404,
    )
    expect((await request(a).get("/api/public/items/whatever")).status).toBe(
      404,
    )
    expect(getAcquisitionDocument).toHaveBeenCalledTimes(1)
  })

  it("is read-only", async () => {
    const { a } = app()
    expect(
      (await request(a).post("/api/public/items/1a2b3c4d.json").send({}))
        .status,
    ).toBe(405)
  })

  it("answers 500 uncached when the document fails", async () => {
    const a = express()
    a.use(
      "/api/public/items",
      createPublicItemsRouter({
        getAcquisitionDocument: vi.fn(async () => {
          throw new Error("db down")
        }),
      }),
    )
    const res = await request(a).get("/api/public/items/1a2b3c4d.json")
    expect(res.status).toBe(500)
    expect(res.headers["cache-control"]).toBe("no-store")
  })

  it("rate limits per IP: 429 with Retry-After, never cached", async () => {
    const { a } = app()
    const ip = "203.0.113.9"
    for (let i = 0; i < PRICE_FEED_RATE_LIMIT.points; i++) {
      const r = await request(a)
        .get("/api/public/items/1a2b3c4d.json")
        .set("X-Forwarded-For", ip)
      expect(r.status).toBe(200)
    }
    const over = await request(a)
      .get("/api/public/items/1a2b3c4d.json")
      .set("X-Forwarded-For", ip)
    expect(over.status).toBe(429)
    expect(Number(over.headers["retry-after"])).toBeGreaterThan(0)
    expect(over.headers["cache-control"]).toBe("no-store")
  })
})

describe("server.ts mount", () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const server = readFileSync(join(here, "../../../server.ts"), "utf-8")
  const at = (s: string) => {
    const i = server.indexOf(s)
    expect(i, s).toBeGreaterThan(-1)
    return i
  }

  it("is mounted on its own path, before the token guard, sessions and auth", () => {
    const mount = at(`app.use("/api/public/items", publicItemsRouter)`)
    expect(mount).toBeLessThan(
      at(`app.use("/api/public/v1", publicApiV1Router)`),
    )
    expect(mount).toBeLessThan(at("app.use(refusePublicTokensElsewhere)"))
    expect(mount).toBeLessThan(at("app.use(sessionMiddleware)"))
    expect(mount).toBeLessThan(at("app.use(passport.initialize())"))
    expect(mount).toBeLessThan(at("app.use(populateUser)"))
  })
})
