/**
 * HTTP-level tests for the bot-facing market routes in threads.ts:
 *   POST /market/quantity/:opt  (bot /stock set|add|sub)
 *   POST /market/price          (bot /price)
 *   POST /market/create         (bot /listing create) — shop/seller resolution
 *
 * The bot's listing picker returns V2 listing ids (listing_search), so these
 * routes must resolve them against V2 `listings` and edit V2
 * `listing_item_lots` / `listing_items`. Previously /market/quantity looked the
 * id up in V1 `market_listings`, so every call answered 400 "Invalid listing".
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import express from "express"
import request from "supertest"
import { createFakeKnex, type FakeKnex } from "../../test-utils/fake-knex-tables.js"

const state: { db: FakeKnex } = { db: createFakeKnex() }

vi.mock("../database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {},
}))
vi.mock("../database/transaction.js", () => ({
  withTransaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => cb(state.db)),
}))

vi.mock("../../api/routes/v1/orders/database.js", () => ({}))
vi.mock("../../api/routes/v1/chats/database.js", () => ({}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUserByDiscordId: vi.fn(),
}))
vi.mock("../../api/routes/v1/contractors/database.js", () => ({}))
vi.mock("../../api/routes/v1/market/database.js", () => ({}))
vi.mock("../../api/routes/v1/offers/database.js", () => ({}))
vi.mock("../../api/routes/v1/chats/serializers.js", () => ({}))
vi.mock("../../api/routes/v1/orders/helpers.js", () => ({}))
vi.mock("../../api/routes/v1/orders/serializers.js", () => ({}))
vi.mock("../../api/routes/v1/util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(async () => false),
}))
vi.mock("../messaging/websocket.js", () => ({ chatServer: {} }))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock("../../services/market-v2/variant.service.js", () => ({
  getOrCreateVariant: vi.fn(async () => "variant-default"),
}))
vi.mock("../../services/watchlist/watchlist.service.js", () => ({
  checkWatchlistMatches: vi.fn(async () => []),
}))
vi.mock("../../services/audit/audit.service.js", () => ({
  auditService: { log: vi.fn() },
}))

import { threadRouter } from "./threads.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"
import { checkWatchlistMatches } from "../../services/watchlist/watchlist.service.js"

const getUserByDiscordId = profileDb.getUserByDiscordId as unknown as Mock
const hasPermission = has_permission as unknown as Mock

const OWNER = { user_id: "owner-1", username: "owner" }
const ORG_MANAGER = { user_id: "manager-1", username: "manager" }
const STRANGER = { user_id: "stranger-1", username: "stranger" }
const usersByDiscord: Record<string, unknown> = {
  "d-owner": OWNER,
  "d-manager": ORG_MANAGER,
  "d-stranger": STRANGER,
}

function seed() {
  state.db = createFakeKnex({
    shops: [
      { shop_id: "shop-personal", owner_user_id: OWNER.user_id, owner_contractor_id: null, status: "active" },
      { shop_id: "shop-org", owner_user_id: null, owner_contractor_id: "org-1", status: "active" },
    ],
    contractors: [
      { contractor_id: "org-1", spectrum_id: "ORG" },
      { contractor_id: "org-noshop", spectrum_id: "NOSHOP" },
    ],
    listings: [
      { listing_id: "l-personal", shop_id: "shop-personal", title: "Widget", status: "active" },
      { listing_id: "l-org", shop_id: "shop-org", title: "Org Widget", status: "active" },
    ],
    listing_items: [
      { item_id: "i-personal", listing_id: "l-personal", game_item_id: null, pricing_mode: "unified", base_price: 100 },
      { item_id: "i-org", listing_id: "l-org", game_item_id: null, pricing_mode: "unified", base_price: 100 },
    ],
    game_items: [{ id: "58891d96-ea38-4141-831d-eae17e17f7cf", name: "Medical Supplies" }],
    listing_item_lots: [
      { lot_id: "lot-personal", item_id: "i-personal", quantity_total: 10, listed: true },
      { lot_id: "lot-org", item_id: "i-org", quantity_total: 10, listed: true },
    ],
  })
}

function app() {
  const a = express()
  a.use(express.json())
  a.use("/threads", threadRouter)
  return a
}

const lotQty = (lotId: string) =>
  state.db.tables.listing_item_lots.find((l) => l.lot_id === lotId)?.quantity_total

beforeEach(() => {
  vi.clearAllMocks()
  seed()
  getUserByDiscordId.mockImplementation(async (id: string) => usersByDiscord[id] ?? null)
  // manage_market in org-1 for the manager only
  hasPermission.mockImplementation(
    async (contractorId: string, userId: string, perm: string) =>
      contractorId === "org-1" && userId === ORG_MANAGER.user_id && perm === "manage_market",
  )
})

describe("POST /threads/market/quantity/:opt", () => {
  it("updates the V2 lot for the listing owner and reports the new quantity", async () => {
    const res = await request(app())
      .post("/threads/market/quantity/add")
      .send({ discord_id: "d-owner", listing_id: "l-personal", quantity: 5 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ result: "Success", previous_quantity: 10, quantity: 15 })
    expect(lotQty("lot-personal")).toBe(15)
  })

  it("lets an org member with manage_market edit the org shop's listing", async () => {
    const res = await request(app())
      .post("/threads/market/quantity/set")
      .send({ discord_id: "d-manager", listing_id: "l-org", quantity: 2 })

    expect(res.status).toBe(200)
    expect(lotQty("lot-org")).toBe(2)
  })

  it("403s with an error the bot shows when the user can't manage the listing", async () => {
    const res = await request(app())
      .post("/threads/market/quantity/set")
      .send({ discord_id: "d-stranger", listing_id: "l-org", quantity: 0 })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/permission/)
    expect(lotQty("lot-org")).toBe(10)
  })

  it("400s when subtracting below zero", async () => {
    const res = await request(app())
      .post("/threads/market/quantity/sub")
      .send({ discord_id: "d-owner", listing_id: "l-personal", quantity: 11 })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/only 10 in stock/)
    expect(lotQty("lot-personal")).toBe(10)
  })

  it("404s for an unknown listing id", async () => {
    const res = await request(app())
      .post("/threads/market/quantity/set")
      .send({ discord_id: "d-owner", listing_id: "not-a-v2-id", quantity: 1 })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe("Listing not found")
  })

  it("returns an error (not Success) for an unlinked Discord user", async () => {
    const res = await request(app())
      .post("/threads/market/quantity/set")
      .send({ discord_id: "d-unknown", listing_id: "l-personal", quantity: 1 })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Link your Discord account/)
    expect(lotQty("lot-personal")).toBe(10)
  })

  it("400s for an unknown operation", async () => {
    const res = await request(app())
      .post("/threads/market/quantity/mul")
      .send({ discord_id: "d-owner", listing_id: "l-personal", quantity: 2 })

    expect(res.status).toBe(400)
    expect(lotQty("lot-personal")).toBe(10)
  })
})

describe("POST /threads/market/price", () => {
  it("updates base_price for the owner and checks watchlists", async () => {
    const res = await request(app())
      .post("/threads/market/price")
      .send({ discord_id: "d-owner", listing_id: "l-personal", price: 250 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ result: "Success" })
    expect(state.db.tables.listing_items.find((i) => i.item_id === "i-personal")?.base_price).toBe(250)
    // Eligibility (visibility, price) is read from the DB after the commit.
    expect(checkWatchlistMatches).toHaveBeenCalledWith("l-personal")
  })

  it("403s for a user without manage_market on the org shop", async () => {
    const res = await request(app())
      .post("/threads/market/price")
      .send({ discord_id: "d-stranger", listing_id: "l-org", price: 1 })

    expect(res.status).toBe(403)
    expect(state.db.tables.listing_items.find((i) => i.item_id === "i-org")?.base_price).toBe(100)
    expect(checkWatchlistMatches).not.toHaveBeenCalled()
  })

  it("400s for a non-positive price", async () => {
    const res = await request(app())
      .post("/threads/market/price")
      .send({ discord_id: "d-owner", listing_id: "l-personal", price: 0 })

    expect(res.status).toBe(400)
  })
})

describe("POST /threads/market/create shop resolution", () => {
  const body = { title: "New thing", description: "", price: 10, quantity: 1 }

  it("creates in the personal shop with seller_id/seller_type (NOT NULL on V2 listings)", async () => {
    const res = await request(app())
      .post("/threads/market/create")
      .send({ ...body, discord_id: "d-owner" })

    expect(res.status).toBe(200)
    const created = state.db.tables.listings.find((l) => l.title === "New thing")
    expect(created).toMatchObject({
      shop_id: "shop-personal", seller_id: OWNER.user_id, seller_type: "user",
    })
    expect(res.body).toEqual({ result: "Success", listing_id: created?.listing_id })
  })

  it("creates in the org shop for a manage_market member", async () => {
    const res = await request(app())
      .post("/threads/market/create")
      .send({ ...body, discord_id: "d-manager", contractor_spectrum_id: "ORG" })

    expect(res.status).toBe(200)
    expect(state.db.tables.listings.find((l) => l.title === "New thing")).toMatchObject({
      shop_id: "shop-org", seller_id: "org-1", seller_type: "contractor",
    })
  })

  it("403s for an org the user can't manage, creating nothing", async () => {
    const res = await request(app())
      .post("/threads/market/create")
      .send({ ...body, discord_id: "d-owner", contractor_spectrum_id: "ORG" })

    expect(res.status).toBe(403)
    expect(state.db.tables.listings.find((l) => l.title === "New thing")).toBeUndefined()
  })

  it("errors instead of silently falling back to the personal shop when the org has no shop", async () => {
    const res = await request(app())
      .post("/threads/market/create")
      .send({ ...body, discord_id: "d-owner", contractor_spectrum_id: "NOSHOP" })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no active shop/)
    expect(state.db.tables.listings.find((l) => l.title === "New thing")).toBeUndefined()
  })

  it("404s for an unknown org", async () => {
    const res = await request(app())
      .post("/threads/market/create")
      .send({ ...body, discord_id: "d-owner", contractor_spectrum_id: "NOPE" })

    expect(res.status).toBe(404)
  })
})

describe("POST /threads/watchlist/add", () => {
  const ITEM_ID = "58891d96-ea38-4141-831d-eae17e17f7cf"

  it("stores the picked game item and uses its name as the query", async () => {
    const res = await request(app())
      .post("/threads/watchlist/add")
      .send({ discord_id: "d-owner", query: ITEM_ID, game_item_id: ITEM_ID, max_price: 25000 })

    expect(res.status).toBe(200)
    expect(state.db.tables.watchlist_items).toEqual([
      expect.objectContaining({
        user_id: OWNER.user_id,
        query: "Medical Supplies",
        game_item_id: ITEM_ID,
        max_price: 25000,
      }),
    ])
    expect(res.body.item).toMatchObject({ query: "Medical Supplies", game_item_id: ITEM_ID })
  })

  it("stores a free-text query as a text watch", async () => {
    const res = await request(app())
      .post("/threads/watchlist/add")
      .send({ discord_id: "d-owner", query: "  Medical Supplies ", max_price: 25000 })

    expect(res.status).toBe(200)
    expect(state.db.tables.watchlist_items[0]).toMatchObject({
      query: "Medical Supplies",
      game_item_id: null,
    })
  })

  it("400s for an unknown or malformed game item id", async () => {
    for (const game_item_id of ["11111111-1111-1111-1111-111111111111", "not-a-uuid"]) {
      const res = await request(app())
        .post("/threads/watchlist/add")
        .send({ discord_id: "d-owner", query: "x", game_item_id, max_price: 10 })
      expect(res.status).toBe(400)
    }
    expect(state.db.tables.watchlist_items ?? []).toHaveLength(0)
  })

  it("400s for a non-positive target price", async () => {
    const res = await request(app())
      .post("/threads/watchlist/add")
      .send({ discord_id: "d-owner", query: "Medical Supplies", max_price: 0 })
    expect(res.status).toBe(400)
  })
})
