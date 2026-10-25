/**
 * End-to-end (real v2 router: short-slug middleware -> TSOA routes -> error
 * handlers) checks that malformed ids are answered 4xx without reaching
 * Postgres, while resolvable short-slugs still work.
 *
 * - POST /listings/{id}/views with id "stock" (from the bare /market/stock
 *   frontend URL matching /market/:id) used to bind "stock" to the uuid column
 *   -> 22P02 -> 500.
 * - POST /buy-orders/{id}/fulfill with listing_id "" did the same.
 *
 * Named without "Controller" so it is not swept up by the vitest exclusion for
 * DB-backed v2 controller tests.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import express from "express"
import request from "supertest"
import type { User } from "../v1/api-models.js"

const h = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  /** Row returned by `.first()` per table (null = not found). */
  rows: {} as Record<string, unknown>,
}))

vi.mock("../../../clients/database/knex-db.js", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {}
    for (const method of [
      "where",
      "whereRaw",
      "whereIn",
      "select",
      "join",
      "orderBy",
      "limit",
    ]) {
      b[method] = (...args: unknown[]) => {
        h.calls.push({ table, method, args })
        return b
      }
    }
    b.first = () => {
      h.calls.push({ table, method: "first", args: [] })
      return Promise.resolve(h.rows[table] ?? null)
    }
    return b
  }
  const knex = Object.assign((table: string) => builder(table), {
    raw: () => ({}),
    fn: { now: () => "now()" },
    schema: { hasTable: async () => false },
  })
  return { getKnex: () => knex, database: { knex } }
})

vi.mock("../../../clients/database/transaction.js", async () => {
  const { getKnex } = await import("../../../clients/database/knex-db.js")
  return {
    withTransaction: (cb: (trx: unknown) => Promise<unknown>) => cb(getKnex()),
  }
})

const LISTING_UUID = "abcdef12-3456-4789-8abc-def012345678"
const VARIANT_UUID = "11111111-2222-4333-8444-555555555555"
const BUY_ORDER_UUID = "99999999-8888-4777-8666-555555555555"
const SHORT_SLUG = "abcdef12--some-listing-title"

const VERIFIED_USER = {
  user_id: "00000000-0000-0000-0000-000000000001",
  username: "tester",
  role: "user",
  banned: false,
  rsi_confirmed: true,
} as User

let app: express.Express

beforeAll(async () => {
  // The generated routes transitively import the CDN client, which throws at
  // module load without B2 credentials (see route-ordering.test.ts).
  process.env.B2_KEY_ID ||= "test-key-id"
  process.env.B2_APP_KEY ||= "test-app-key"

  const { apiV2Router } = await import("./api-router.js")
  const { errorHandler } = await import("../../middleware/error-handler.js")
  app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.header("x-test-user")) req.user = VERIFIED_USER
    next()
  })
  app.use("/api/v2", apiV2Router)
  app.use(errorHandler)
})

beforeEach(() => {
  h.calls.length = 0
  h.rows = {}
})

const queriedTables = () => [...new Set(h.calls.map((c) => c.table))]

describe("POST /api/v2/listings/{id}/views", () => {
  it.each(["stock", "does-not-exist", "123"])(
    "%s -> 404 without querying",
    async (id) => {
      const res = await request(app).post(`/api/v2/listings/${id}/views`)

      expect(res.status).toBe(404)
      expect(res.body?.error?.code).toBe("NOT_FOUND")
      expect(h.calls).toEqual([])
    },
  )

  it("a resolvable short-slug still tracks the view against the full UUID", async () => {
    h.rows.listings = { listing_id: LISTING_UUID }

    const res = await request(app).post(`/api/v2/listings/${SHORT_SLUG}/views`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ views: 0 })
    // Middleware resolved the prefix with a range query...
    expect(h.calls).toContainEqual({
      table: "listings",
      method: "whereRaw",
      args: [
        "listing_id BETWEEN ?::uuid AND ?::uuid",
        [
          "abcdef12-0000-0000-0000-000000000000",
          "abcdef12-ffff-ffff-ffff-ffffffffffff",
        ],
      ],
    })
    // ...and the controller looked the listing up by the resolved UUID.
    expect(h.calls).toContainEqual({
      table: "listings",
      method: "where",
      args: ["listing_id", LISTING_UUID],
    })
  })

  it("a bare 8-hex prefix also resolves", async () => {
    h.rows.listings = { listing_id: LISTING_UUID }

    const res = await request(app).post(`/api/v2/listings/abcdef12/views`)

    expect(res.status).toBe(200)
  })

  it("an unresolvable short-slug -> 404", async () => {
    h.rows.listings = null

    const res = await request(app).post(`/api/v2/listings/${SHORT_SLUG}/views`)

    expect(res.status).toBe(404)
  })
})

describe("POST /api/v2/buy-orders/{id}/fulfill", () => {
  const fulfill = (body: Record<string, unknown>, id = BUY_ORDER_UUID) =>
    request(app)
      .post(`/api/v2/buy-orders/${id}/fulfill`)
      .set("x-test-user", "verified")
      .send(body)

  it.each([
    [{ listing_id: "", variant_id: VARIANT_UUID }, "listing_id", "is required"],
    [{ listing_id: "   ", variant_id: VARIANT_UUID }, "listing_id", "is required"],
    [
      { listing_id: "not-a-uuid", variant_id: VARIANT_UUID },
      "listing_id",
      "must be a valid UUID",
    ],
    [{ listing_id: LISTING_UUID, variant_id: "" }, "variant_id", "is required"],
    [
      { listing_id: LISTING_UUID, variant_id: "nope" },
      "variant_id",
      "must be a valid UUID",
    ],
  ])("%j -> 400 on %s without querying", async (body, field, message) => {
    const res = await fulfill(body)

    expect(res.status).toBe(400)
    expect(res.body?.error?.code).toBe("VALIDATION_ERROR")
    expect(res.body?.error?.validationErrors).toContainEqual(
      expect.objectContaining({ field, message: `${field} ${message}` }),
    )
    expect(h.calls).toEqual([])
  })

  it("a malformed buy order id -> 404 without querying", async () => {
    const res = await fulfill(
      { listing_id: LISTING_UUID, variant_id: VARIANT_UUID },
      "stock",
    )

    expect(res.status).toBe(404)
    expect(h.calls).toEqual([])
  })

  it("valid UUIDs pass validation and reach the buy order lookup", async () => {
    const res = await fulfill({
      listing_id: LISTING_UUID,
      variant_id: VARIANT_UUID,
    })

    // Buy order not found in the fake DB -> 404 from the controller, not 400.
    expect(res.status).toBe(404)
    expect(queriedTables()).toEqual(["buy_orders_v2"])
  })

  it("a resolvable listing_id short-slug is resolved by the middleware and accepted", async () => {
    h.rows.listings = { listing_id: LISTING_UUID }

    const res = await fulfill({ listing_id: SHORT_SLUG, variant_id: VARIANT_UUID })

    expect(res.status).toBe(404) // buy order lookup, i.e. validation passed
    expect(queriedTables()).toEqual(["listings", "buy_orders_v2"])
  })

  it("an unresolvable listing_id short-slug -> 400", async () => {
    h.rows.listings = null

    const res = await fulfill({ listing_id: SHORT_SLUG, variant_id: VARIANT_UUID })

    expect(res.status).toBe(400)
    expect(res.body?.error?.validationErrors).toContainEqual(
      expect.objectContaining({ field: "listing_id" }),
    )
    expect(queriedTables()).toEqual(["listings"]) // only the slug lookup
  })
})
