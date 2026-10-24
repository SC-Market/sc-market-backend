/**
 * Tests for the V2 listing quick edits behind the Discord /stock and /price
 * commands. They must act on V2 tables (listings / listing_items /
 * listing_item_lots), apply the web endpoints' permission check
 * (canModifyListing), and refuse ambiguous edits instead of guessing.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Knex } from "knex"
import { createFakeKnex, type FakeKnex } from "../../test-utils/fake-knex-tables.js"

vi.mock("../../api/routes/v2/util/listing-permissions.js", () => ({
  canModifyListing: vi.fn(async () => true),
}))
vi.mock("./variant.service.js", () => ({
  getOrCreateVariant: vi.fn(async () => "variant-default"),
}))
vi.mock("../audit/audit.service.js", () => ({
  auditService: { log: vi.fn() },
}))

import { canModifyListing } from "../../api/routes/v2/util/listing-permissions.js"
import { getOrCreateVariant } from "./variant.service.js"
import {
  ListingQuickEditError,
  updateListingPrice,
  updateListingStock,
} from "./listing-quick-edit.service.js"

const canModify = canModifyListing as unknown as Mock

const LISTING = "listing-v2"
const ITEM = "item-1"
const USER = "user-1"

function seed(overrides: {
  status?: string
  items?: Record<string, unknown>[]
  lots?: Record<string, unknown>[]
} = {}): FakeKnex {
  return createFakeKnex({
    listings: [
      { listing_id: LISTING, shop_id: "shop-1", title: "Widget", status: overrides.status ?? "active" },
    ],
    listing_items: overrides.items ?? [
      { item_id: ITEM, listing_id: LISTING, game_item_id: "gi-1", pricing_mode: "unified", base_price: 100 },
    ],
    listing_item_lots: overrides.lots ?? [
      { lot_id: "lot-1", item_id: ITEM, quantity_total: 10, listed: true },
    ],
  })
}

const asKnex = (db: FakeKnex) => db as unknown as Knex

async function expectRejected(p: Promise<unknown>, status: number, message: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ListingQuickEditError)
  expect((err as ListingQuickEditError).status).toBe(status)
  expect((err as Error).message).toMatch(message)
}

describe("updateListingStock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canModify.mockResolvedValue(true)
  })

  it.each([
    ["set", 4, 4],
    ["add", 5, 15],
    ["sub", 3, 7],
  ] as const)("%s %i on a 10-unit lot leaves %i", async (operation, quantity, expected) => {
    const db = seed()
    const result = await updateListingStock(asKnex(db), {
      listingId: LISTING, userId: USER, operation, quantity,
    })
    expect(result).toEqual({ previous_quantity: 10, quantity: expected })
    expect(db.tables.listing_item_lots[0].quantity_total).toBe(expected)
  })

  it("rejects subtracting more than is in stock and leaves the lot unchanged", async () => {
    const db = seed()
    await expectRejected(
      updateListingStock(asKnex(db), { listingId: LISTING, userId: USER, operation: "sub", quantity: 11 }),
      400, /only 10 in stock/,
    )
    expect(db.tables.listing_item_lots[0].quantity_total).toBe(10)
  })

  it("404s for an id that isn't a V2 listing (e.g. a V1 market_listings id)", async () => {
    const db = seed()
    await expectRejected(
      updateListingStock(asKnex(db), { listingId: "v1-id", userId: USER, operation: "set", quantity: 1 }),
      404, /Listing not found/,
    )
  })

  it("403s when the user can't modify the listing, without touching stock", async () => {
    canModify.mockResolvedValue(false)
    const db = seed()
    await expectRejected(
      updateListingStock(asKnex(db), { listingId: LISTING, userId: "stranger", operation: "set", quantity: 99 }),
      403, /permission/,
    )
    expect(canModify).toHaveBeenCalledWith(expect.objectContaining({ shop_id: "shop-1" }), "stranger")
    expect(db.tables.listing_item_lots[0].quantity_total).toBe(10)
  })

  it.each(["sold", "cancelled"])("refuses a %s listing", async (status) => {
    await expectRejected(
      updateListingStock(asKnex(seed({ status })), { listingId: LISTING, userId: USER, operation: "set", quantity: 1 }),
      400, new RegExp(status),
    )
  })

  it("refuses a listing with several listed lots instead of guessing which to change", async () => {
    const db = seed({
      lots: [
        { lot_id: "lot-1", item_id: ITEM, quantity_total: 10, listed: true },
        { lot_id: "lot-2", item_id: ITEM, quantity_total: 5, listed: true },
      ],
    })
    await expectRejected(
      updateListingStock(asKnex(db), { listingId: LISTING, userId: USER, operation: "add", quantity: 1 }),
      400, /2 stock lots/,
    )
  })

  it("ignores unlisted lots when picking the lot to change", async () => {
    const db = seed({
      lots: [
        { lot_id: "lot-hidden", item_id: ITEM, quantity_total: 50, listed: false },
        { lot_id: "lot-1", item_id: ITEM, quantity_total: 10, listed: true },
      ],
    })
    await updateListingStock(asKnex(db), { listingId: LISTING, userId: USER, operation: "add", quantity: 2 })
    const byId = Object.fromEntries(db.tables.listing_item_lots.map((l) => [l.lot_id, l.quantity_total]))
    expect(byId).toEqual({ "lot-hidden": 50, "lot-1": 12 })
  })

  it("refuses bundle listings (more than one listing_item)", async () => {
    const db = seed({
      items: [
        { item_id: ITEM, listing_id: LISTING, game_item_id: null, pricing_mode: "unified" },
        { item_id: "item-2", listing_id: LISTING, game_item_id: null, pricing_mode: "unified" },
      ],
    })
    await expectRejected(
      updateListingStock(asKnex(db), { listingId: LISTING, userId: USER, operation: "set", quantity: 1 }),
      400, /bundle/,
    )
  })

  it("creates a listed lot with the default variant when the item has none", async () => {
    const db = seed({ lots: [] })
    const result = await updateListingStock(asKnex(db), {
      listingId: LISTING, userId: USER, operation: "add", quantity: 3,
    })
    expect(result).toEqual({ previous_quantity: 0, quantity: 3 })
    expect(getOrCreateVariant).toHaveBeenCalledWith("gi-1", {}, db)
    expect(db.tables.listing_item_lots).toEqual([
      expect.objectContaining({
        item_id: ITEM, listing_id: LISTING, variant_id: "variant-default",
        quantity_total: 3, listed: true, owner_id: USER, game_item_id: "gi-1",
      }),
    ])
  })

  it("does not create an empty lot for set 0 on an item without lots", async () => {
    const db = seed({ lots: [] })
    await updateListingStock(asKnex(db), { listingId: LISTING, userId: USER, operation: "set", quantity: 0 })
    expect(db.tables.listing_item_lots).toEqual([])
  })

  it.each([-1, 1.5, Number.NaN])("rejects quantity %s", async (quantity) => {
    await expectRejected(
      updateListingStock(asKnex(seed()), { listingId: LISTING, userId: USER, operation: "set", quantity }),
      400, /non-negative whole number/,
    )
  })

  it("rejects an unknown operation", async () => {
    await expectRejected(
      updateListingStock(asKnex(seed()), {
        listingId: LISTING, userId: USER, operation: "mul" as never, quantity: 1,
      }),
      400, /Invalid stock operation/,
    )
  })
})

describe("updateListingPrice", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canModify.mockResolvedValue(true)
  })

  it("sets base_price on the listing's unified-pricing item", async () => {
    const db = seed()
    const result = await updateListingPrice(asKnex(db), { listingId: LISTING, userId: USER, price: 250 })
    expect(result).toEqual({ title: "Widget" })
    expect(db.tables.listing_items[0].base_price).toBe(250)
    expect(db.tables.listings[0].updated_at).toBeInstanceOf(Date)
  })

  it("403s for a user who can't modify the listing (e.g. org member without manage_market)", async () => {
    canModify.mockResolvedValue(false)
    const db = seed()
    await expectRejected(
      updateListingPrice(asKnex(db), { listingId: LISTING, userId: "member", price: 1 }),
      403, /permission/,
    )
    expect(db.tables.listing_items[0].base_price).toBe(100)
  })

  it("refuses per-variant pricing listings", async () => {
    const db = seed({
      items: [{ item_id: ITEM, listing_id: LISTING, game_item_id: null, pricing_mode: "per_variant" }],
    })
    await expectRejected(
      updateListingPrice(asKnex(db), { listingId: LISTING, userId: USER, price: 5 }),
      400, /per variant/,
    )
  })

  it.each([0, -5, 2.5])("rejects price %s", async (price) => {
    await expectRejected(
      updateListingPrice(asKnex(seed()), { listingId: LISTING, userId: USER, price }),
      400, /greater than 0/,
    )
  })

  it("404s for an unknown listing", async () => {
    await expectRejected(
      updateListingPrice(asKnex(seed()), { listingId: "nope", userId: USER, price: 5 }),
      404, /not found/,
    )
  })
})
