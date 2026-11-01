/**
 * createRateLimit: anonymous GET/HEAD from Cloudflare egress (our SSR and
 * bridge Pages Functions) share one larger bucket; everything else keeps its
 * normal bucket. The client IP is read as deployed (trust proxy 2 behind
 * Cloudflare -> Lightsail LB), so forged X-Forwarded-For entries can't reach
 * the larger bucket.
 */
import { describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock("../../clients/database/knex-db.js", () => ({
  database: { knex: {} },
  getKnex: () => {
    throw new Error("no DB in this test")
  },
}))
// Same limiter semantics, in memory instead of Postgres.
vi.mock("rate-limiter-flexible", async (importOriginal) => {
  const real = await importOriginal<typeof import("rate-limiter-flexible")>()
  class RateLimiterPostgres extends real.RateLimiterMemory {
    constructor(opts: Record<string, unknown>) {
      const { storeClient, storeType, insuranceLimiter, ...rest } = opts
      void storeClient
      void storeType
      void insuranceLimiter
      super(rest as never)
    }
  }
  return { ...real, RateLimiterPostgres }
})

const {
  CLOUDFLARE_ANONYMOUS_READ_LIMIT,
  createRateLimit,
  isCloudflareAnonymousRead,
  rateLimiters,
} = await import("./enhanced-ratelimiting.js")

const CF_EDGE = "172.70.1.1"
const CF_WORKER = "2a06:98c0:3600::103"
// One request costs the whole anonymous bucket (120), so the second 429s.
const ONE_SHOT = {
  anonymous: { points: 120 },
  authenticated: { points: 1 },
  admin: { points: 1 },
}

function deployed(user?: object) {
  const a = express()
  a.set("trust proxy", 2)
  a.use((req, _res, next) => {
    if (user) (req as { user?: object }).user = user
    next()
  })
  const limit = createRateLimit(ONE_SHOT)
  a.get("/r", limit, (_req, res) => res.json({ ok: true }))
  a.post("/w", limit, (_req, res) => res.json({ ok: true }))
  return a
}

describe("Cloudflare-egress anonymous read bucket", () => {
  it("production values: 1200/min shared, anonymous stays 120/min per IP", () => {
    expect(CLOUDFLARE_ANONYMOUS_READ_LIMIT).toEqual({
      points: 1200,
      duration: 60,
    })
    expect(rateLimiters.cloudflareAnonymousRead.points).toBe(1200)
    expect(rateLimiters.cloudflareAnonymousRead.duration).toBe(60)
    expect(rateLimiters.cloudflareAnonymousRead.blockDuration).toBe(0)
    expect(rateLimiters.anonymous.points).toBe(120)
    expect(rateLimiters.authenticated.points).toBe(500)
  })

  it("selects only anonymous GET/HEAD from a Cloudflare IP", () => {
    const req = (method: string, ip: string) => ({ method, ip }) as never
    expect(isCloudflareAnonymousRead(req("GET", CF_WORKER), "anonymous")).toBe(
      true,
    )
    expect(
      isCloudflareAnonymousRead(req("HEAD", "104.16.0.5"), "anonymous"),
    ).toBe(true)
    expect(isCloudflareAnonymousRead(req("POST", CF_WORKER), "anonymous")).toBe(
      false,
    )
    expect(
      isCloudflareAnonymousRead(req("GET", CF_WORKER), "authenticated"),
    ).toBe(false)
    expect(
      isCloudflareAnonymousRead(req("GET", "198.51.100.1"), "anonymous"),
    ).toBe(false)
  })

  it("Cloudflare-originated reads use the shared bucket, ordinary visitors their own", async () => {
    const a = deployed()
    for (const ip of [CF_WORKER, "104.16.0.5", CF_WORKER]) {
      // 120 points each, well inside 1200: not limited like a per-IP bucket.
      const r = await request(a)
        .get("/r")
        .set("X-Forwarded-For", `${ip}, ${CF_EDGE}`)
      expect(r.status).toBe(200)
    }
    const visitor = `198.51.100.40, ${CF_EDGE}`
    expect(
      (await request(a).get("/r").set("X-Forwarded-For", visitor)).status,
    ).toBe(200)
    expect(
      (await request(a).get("/r").set("X-Forwarded-For", visitor)).status,
    ).toBe(429)
  })

  it("the shared bucket is capped", async () => {
    // Shared across this file's tests (one module-level limiter): start empty.
    await rateLimiters.cloudflareAnonymousRead.delete("cloudflare")
    const a = deployed()
    const n = CLOUDFLARE_ANONYMOUS_READ_LIMIT.points / ONE_SHOT.anonymous.points
    let last = 0
    for (let i = 0; i <= n; i++) {
      last = (
        await request(a)
          .get("/r")
          .set("X-Forwarded-For", `${CF_WORKER}, ${CF_EDGE}`)
      ).status
      if (i < n) expect(last).toBe(200)
    }
    expect(last).toBe(429)
  })

  it("forging a Cloudflare IP in X-Forwarded-For does not reach the shared bucket", async () => {
    const a = deployed()
    const forged = `${CF_WORKER}, 198.51.100.50, ${CF_EDGE}`
    expect(
      (await request(a).get("/r").set("X-Forwarded-For", forged)).status,
    ).toBe(200)
    expect(
      (await request(a).get("/r").set("X-Forwarded-For", forged)).status,
    ).toBe(429)
  })

  it("writes from Cloudflare IPs keep the per-IP anonymous bucket", async () => {
    const a = deployed()
    const xff = `2a06:98c0:3600::104, ${CF_EDGE}`
    expect(
      (await request(a).post("/w").set("X-Forwarded-For", xff)).status,
    ).toBe(200)
    expect(
      (await request(a).post("/w").set("X-Forwarded-For", xff)).status,
    ).toBe(429)
  })

  it("authenticated requests from Cloudflare IPs keep their user bucket", async () => {
    const a = deployed({ user_id: "u-1", role: "user" })
    const r = await request(a)
      .get("/r")
      .set("X-Forwarded-For", `${CF_WORKER}, ${CF_EDGE}`)
    expect(r.status).toBe(200)
    expect(Number(r.headers["x-ratelimit-remaining"])).toBe(499)
  })
})
