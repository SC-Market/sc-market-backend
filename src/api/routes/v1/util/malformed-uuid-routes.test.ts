/**
 * Scanners request the OpenAPI path templates literally, e.g.
 * GET /api/contracts/{contract_id}` or /api/market/listings/{listing_id}`.
 * Those ids reach uuid columns; Postgres rejects the cast (22P02) and, in an
 * async v1 middleware, the rejection escaped Express 4 as an unhandled 500
 * (Bugsnag). Malformed ids must be a clean 404 before any query, through the
 * real routers as mounted.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import express from "express"
import request from "supertest"

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

const { knexFn } = vi.hoisted(() => ({ knexFn: vi.fn() }))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => knexFn,
  database: { knex: knexFn },
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { contractsRouter } = await import("../contracts/routes.js")
const { marketRouter } = await import("../market/routes.js")
const { ordersRouter } = await import("../orders/routes.js")
const { chatsRouter } = await import("../chats/routes.js")
const { offerRouter } = await import("../offers/routes.js")
const { notificationRouter } = await import("../notifications/routes.js")
const { servicesRouter } = await import("../services/routes.js")

function app() {
  const a = express()
  a.use(express.json())
  a.use("/api/contracts", contractsRouter)
  a.use("/api/market", marketRouter)
  a.use("/api/orders", ordersRouter)
  a.use("/api/chats", chatsRouter)
  a.use("/api/offer", offerRouter)
  a.use("/api/notification", notificationRouter)
  a.use("/api/services", servicesRouter)
  return a
}

const ID = "0b3f1c2a-1234-4abc-9def-0123456789ab"
const SCANNER_CONTRACT = "/api/contracts/%7Bcontract_id%7D%60"
const SCANNER_LISTING = "/api/market/listings/%7Blisting_id%7D%60"

/** A knex query builder stub whose terminal call resolves (or rejects) `result`. */
function builder(result: () => Promise<unknown>) {
  const b: Record<string, unknown> = {}
  for (const m of ["where", "andWhere", "select", "leftJoin", "join"]) {
    b[m] = vi.fn(() => b)
  }
  b.first = vi.fn(result)
  return b
}

beforeEach(() => {
  knexFn.mockReset()
  // Anything that reaches the database with a malformed id fails exactly
  // like Postgres does, so a missing guard shows up as a non-404.
  knexFn.mockImplementation(() => {
    throw Object.assign(new Error("invalid input syntax for type uuid"), {
      code: "22P02",
    })
  })
})

describe("GET /api/contracts/:contract_id", () => {
  it.each([SCANNER_CONTRACT, "/api/contracts/not-a-uuid"])(
    "answers 404 'Invalid public contract' for %s without querying",
    async (path) => {
      const res = await request(app()).get(path)
      expect(res.status).toBe(404)
      expect(res.body.error.message).toBe("Invalid public contract")
      expect(knexFn).not.toHaveBeenCalled()
    },
  )

  it("POST offers on a malformed contract id is 404 too", async () => {
    // userAuthorized runs first; without a user it answers 401, never 500.
    const res = await request(app())
      .post("/api/contracts/%7Bcontract_id%7D%60/offers")
      .send({})
    expect([401, 404]).toContain(res.status)
    expect(knexFn).not.toHaveBeenCalled()
  })

  it("a valid but unknown id still looks the contract up (404)", async () => {
    knexFn.mockImplementation(() => builder(async () => undefined))
    const res = await request(app()).get(`/api/contracts/${ID}`)
    expect(res.status).toBe(404)
    expect(res.body.error.message).toBe("Invalid public contract")
    expect(knexFn).toHaveBeenCalledWith("public_contracts")
  })

  it("other database errors answer the standard 500 shape instead of escaping", async () => {
    knexFn.mockImplementation(() =>
      builder(async () => {
        throw new Error("connection reset")
      }),
    )
    const res = await request(app()).get(`/api/contracts/${ID}`)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
    })
  })
})

describe("GET /api/market/listings/:listing_id", () => {
  it.each([SCANNER_LISTING, "/api/market/listings/not-a-uuid"])(
    "answers 404 for %s without querying",
    async (path) => {
      const res = await request(app()).get(path)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
      expect(res.body.error.message).toBe("Market listing not found")
      expect(knexFn).not.toHaveBeenCalled()
    },
  )
})

describe("other v1 routes with uuid path params", () => {
  it.each([
    ["GET", "/api/orders/%7Border_id%7D"],
    ["POST", "/api/orders/bad/reviews/bad/request-revision"],
    ["GET", "/api/chats/%7Bchat_id%7D"],
    ["GET", "/api/chats/orders/not-a-uuid"],
    ["GET", "/api/offer/%7Bsession_id%7D"],
    ["PATCH", "/api/notification/not-a-uuid"],
    ["GET", "/api/services/%7Bservice_id%7D"],
    ["GET", "/api/market/multiple/%7Bmultiple_id%7D"],
    ["GET", "/api/market/aggregate/%7Bgame_item_id%7D"],
  ])("%s %s answers 404 NOT_FOUND without querying", async (method, path) => {
    const req = request(app())
    const res = await (method === "GET"
      ? req.get(path)
      : req[method.toLowerCase() as "post" | "patch"](path).send({}))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
    expect(knexFn).not.toHaveBeenCalled()
  })
})

describe("uuid query filters", () => {
  it("GET /api/orders/search?shop_id=<bad> is not a 404/500", async () => {
    const res = await request(app()).get("/api/orders/search?shop_id=bad")
    // Auth runs before the filter guard: anonymous is 401; never a DB error.
    expect([400, 401]).toContain(res.status)
    expect(knexFn).not.toHaveBeenCalled()
  })
})
