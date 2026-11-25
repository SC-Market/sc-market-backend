/**
 * GET /api/market/user/:username used to call the throwing profileDb.getUser,
 * so an unknown username escaped the handler as a bubbled "Invalid user!"
 * (a 500 and a Bugsnag error) instead of reaching its 400 branch. An unknown
 * user is a missing resource: 404 NOT_FOUND in the standard error shape.
 *
 * GET /api/market/listings?user_seller=<unknown> answers the same 404.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(),
  database: { knex: vi.fn() },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock("../profiles/database.js", () => ({
  findUser: vi.fn(),
  getUser: vi.fn(),
}))
vi.mock("./database.js", () => ({
  getMarketUniqueListingsComplete: vi.fn(),
  getMarketMultipleListingsComplete: vi.fn(),
}))
vi.mock("../util/formatting.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  formatListingComplete: vi.fn(async (l: { listing_id: string }) => ({
    listing_id: l.listing_id,
  })),
}))

const profileDb = await import("../profiles/database.js")
const marketDb = await import("./database.js")
const { get_active_listings_by_user, search_listings } = await import(
  "./controller.js"
)

const findUser = profileDb.findUser as unknown as Mock
const getUser = profileDb.getUser as unknown as Mock
const uniques = marketDb.getMarketUniqueListingsComplete as unknown as Mock
const multiples = marketDb.getMarketMultipleListingsComplete as unknown as Mock

function app() {
  const a = express()
  a.get("/market/user/:username", get_active_listings_by_user)
  a.get("/market/listings", search_listings)
  return a
}

describe("GET /market/user/:username", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the active listings of a known user", async () => {
    findUser.mockResolvedValue({ user_id: "u-1", username: "alice" })
    uniques.mockResolvedValue([{ listing_id: "l-1" }])
    multiples.mockResolvedValue([{ listing_id: "l-2" }])

    const res = await request(app()).get("/market/user/alice")

    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ listing_id: "l-1" }, { listing_id: "l-2" }])
    expect(uniques).toHaveBeenCalledWith({
      status: "active",
      user_seller_id: "u-1",
    })
  })

  it("returns 404 NOT_FOUND for an unknown username", async () => {
    findUser.mockResolvedValue(null)

    const res = await request(app()).get("/market/user/nobody-here")

    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "User not found: nobody-here",
        details: { resource: "User", identifier: "nobody-here" },
      },
    })
    expect(getUser).not.toHaveBeenCalled()
    expect(uniques).not.toHaveBeenCalled()
  })

  it("returns the standard 500 shape when a lookup fails", async () => {
    findUser.mockRejectedValue(new Error("connection reset"))

    const res = await request(app()).get("/market/user/alice")

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR")
    expect(res.body.error.message).not.toContain("connection reset")
  })
})

describe("GET /market/listings?user_seller=", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 NOT_FOUND for an unknown seller username", async () => {
    findUser.mockResolvedValue(null)

    const res = await request(app()).get("/market/listings?user_seller=ghost")

    expect(res.status).toBe(404)
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      details: { resource: "User", identifier: "ghost" },
    })
  })
})
