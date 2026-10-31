/**
 * /api/public/prices: anonymous, read-only, edge-cacheable and rate limited
 * per IP; mounted outside every auth/session layer and outside the token-only
 * /api/public/v1 (design: drafts/price-oracle-design.md).
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

const {
  createPublicPricesRouter,
  PRICE_FEED_CACHE_CONTROL,
  PRICE_FEED_NOT_FOUND_CACHE_CONTROL,
  PRICE_FEED_RATE_LIMIT,
} = await import("./router.js")

const DOC = {
  item: { id: "x", slug: "1a2b3c4d--gun", name: "Gun", type: null },
  currency: "aUEC",
}
const INDEX = {
  date: "2026-10-31",
  as_of: "2026-10-31T06:00:00.000Z",
  currency: "aUEC" as const,
  count: 0,
  coverage: { none: 0, low: 0, medium: 0, high: 0 },
  items: [],
  methodology: { text: "m", rules: {} },
  attribution: "a",
}

function app() {
  const getPriceDocument = vi.fn(async (slug: string) =>
    slug.startsWith("1a2b3c4d") ? DOC : null,
  )
  const getPriceIndex = vi.fn(async () => INDEX)
  const a = express()
  a.set("trust proxy", true)
  a.use(
    "/api/public/prices",
    createPublicPricesRouter({ getPriceDocument, getPriceIndex } as never),
  )
  return { a, getPriceDocument, getPriceIndex }
}

describe("public price feed", () => {
  it("serves an item anonymously with edge-cache headers, CORS * and no cookie", async () => {
    const { a } = app()
    const res = await request(a).get("/api/public/prices/1a2b3c4d--gun.json")
    expect(res.status).toBe(200)
    expect(res.body).toEqual(DOC)
    expect(res.headers["cache-control"]).toBe(PRICE_FEED_CACHE_CONTROL)
    expect(res.headers["cache-control"]).toMatch(/s-maxage=\d+/)
    expect(res.headers["cache-control"]).toMatch(/stale-while-revalidate=\d+/)
    expect(res.headers["access-control-allow-origin"]).toBe("*")
    expect(res.headers["set-cookie"]).toBeUndefined()
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
  })

  it("serves the index as JSON, CSV and Markdown", async () => {
    const { a } = app()
    const json = await request(a).get("/api/public/prices/index.json")
    expect(json.status).toBe(200)
    expect(json.body.date).toBe("2026-10-31")
    const csv = await request(a).get("/api/public/prices/index.csv")
    expect(csv.headers["content-type"]).toMatch(/^text\/csv/)
    expect(csv.text.split("\n")[0]).toContain("slug,name,type,lowest_ask")
    const md = await request(a).get("/api/public/prices/index.md")
    expect(md.headers["content-type"]).toMatch(/^text\/markdown/)
    expect(md.text).toContain("# SC Market player listings: asking prices")
  })

  it("caches responses in process", async () => {
    const { a, getPriceDocument } = app()
    await request(a).get("/api/public/prices/1a2b3c4d--gun.json")
    await request(a).get("/api/public/prices/1a2b3c4d--gun.json")
    expect(getPriceDocument).toHaveBeenCalledTimes(1)
  })

  it("404s unknown items and malformed slugs with a short cache", async () => {
    const { a, getPriceDocument } = app()
    const res = await request(a).get("/api/public/prices/deadbeef--nope.json")
    expect(res.status).toBe(404)
    expect(res.headers["cache-control"]).toBe(
      PRICE_FEED_NOT_FOUND_CACHE_CONTROL,
    )
    const bad = await request(a).get("/api/public/prices/..%2Fetc.json")
    expect(bad.status).toBe(404)
    expect(getPriceDocument).toHaveBeenCalledTimes(1)
    expect((await request(a).get("/api/public/prices/whatever")).status).toBe(
      404,
    )
  })

  it("is read-only", async () => {
    const { a } = app()
    const res = await request(a).post("/api/public/prices/index.json").send({})
    expect(res.status).toBe(405)
  })

  it("rate limits per IP: 429 with Retry-After, never cached; other IPs unaffected", async () => {
    const { a } = app()
    const ip = "203.0.113.7"
    for (let i = 0; i < PRICE_FEED_RATE_LIMIT.points; i++) {
      const r = await request(a)
        .get("/api/public/prices/index.json")
        .set("X-Forwarded-For", ip)
      expect(r.status).toBe(200)
    }
    const over = await request(a)
      .get("/api/public/prices/index.json")
      .set("X-Forwarded-For", ip)
    expect(over.status).toBe(429)
    expect(Number(over.headers["retry-after"])).toBeGreaterThan(0)
    expect(over.headers["cache-control"]).toBe("no-store")
    expect(over.body.error.code).toBe("RATE_LIMIT_EXCEEDED")
    const other = await request(a)
      .get("/api/public/prices/index.json")
      .set("X-Forwarded-For", "203.0.113.8")
    expect(other.status).toBe(200)
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
    const mount = at(`app.use("/api/public/prices", publicPricesRouter)`)
    expect(mount).toBeLessThan(
      at(`app.use("/api/public/v1", publicApiV1Router)`),
    )
    expect(mount).toBeLessThan(at("app.use(refusePublicTokensElsewhere)"))
    expect(mount).toBeLessThan(at("app.use(sessionMiddleware)"))
    expect(mount).toBeLessThan(at("app.use(passport.initialize())"))
    expect(mount).toBeLessThan(at("app.use(populateUser)"))
    expect(server).not.toMatch(/\/api\/public\/v1\/prices/)
  })
})
