/**
 * Watchlist item management shared by the site (v2 /watchlist) and the
 * Discord bot (/threads/watchlist/*): validation, per-user cap, dedupe and
 * per-user scoping.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Knex } from "knex"
import {
  createFakeKnex,
  type FakeKnex,
} from "../../test-utils/fake-knex-tables.js"

vi.mock("./watchlist-prices.js", () => ({
  currentLowestPrices: vi.fn(async () => new Map<string, number>()),
}))

import {
  addWatchlistItem,
  listWatchlistItems,
  removeWatchlistItem,
  updateWatchlistItemPrice,
  validateMaxPrice,
  WATCHLIST_MAX_ITEMS,
  WatchlistError,
} from "./watchlist-items.service.js"
import { currentLowestPrices } from "./watchlist-prices.js"

const ITEM = "58891d96-ea38-4141-831d-eae17e17f7cf"
const OTHER_ITEM = "0f6b5f8e-3c55-4f5e-9a51-2b7a0b2c9d11"
const ALICE_WATCH = "aaaaaaaa-0000-4000-8000-000000000001"
const BOB_WATCH = "bbbbbbbb-0000-4000-8000-000000000002"

let db: FakeKnex
const knex = () => db as unknown as Knex

function seed() {
  db = createFakeKnex({
    game_items: [
      { id: ITEM, name: "Medical Supplies", image_url: "https://cdn/med.png" },
      { id: OTHER_ITEM, name: "Quantainium", image_url: null },
    ],
    watchlist_items: [
      {
        id: ALICE_WATCH,
        user_id: "alice",
        query: "Medical Supplies",
        game_item_id: ITEM,
        max_price: 25000,
        created_at: new Date("2026-10-01T00:00:00Z"),
        last_notified_at: null,
      },
      {
        id: BOB_WATCH,
        user_id: "bob",
        query: "Quantainium",
        game_item_id: OTHER_ITEM,
        max_price: 9000,
        created_at: new Date("2026-10-02T00:00:00Z"),
        last_notified_at: null,
      },
    ],
  })
}

async function rejection(p: Promise<unknown>): Promise<WatchlistError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(WatchlistError)
  return err as WatchlistError
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe("validateMaxPrice", () => {
  it.each([0, 1, -5, 2.5, Number.NaN, 2_147_483_648, "100", null])(
    "rejects %s",
    (value) => {
      expect(() => validateMaxPrice(value)).toThrow(WatchlistError)
    },
  )

  it("accepts whole numbers above the 1 aUEC placeholder price", () => {
    expect(validateMaxPrice(2)).toBe(2)
    expect(validateMaxPrice(25000)).toBe(25000)
  })
})

describe("addWatchlistItem", () => {
  it("stores an item watch with the game item's name as the query", async () => {
    const row = await addWatchlistItem(knex(), "bob", {
      game_item_id: ITEM,
      max_price: 30000,
    })
    expect(row).toMatchObject({
      query: "Medical Supplies",
      game_item_id: ITEM,
      max_price: 30000,
    })
    expect(
      db.tables.watchlist_items.filter((r) => r.user_id === "bob"),
    ).toHaveLength(2)
  })

  it("stores a trimmed free-text watch", async () => {
    const row = await addWatchlistItem(knex(), "bob", {
      query: "  Hammer   Pistol ",
      max_price: 500,
    })
    expect(row).toMatchObject({ query: "Hammer Pistol", game_item_id: null })
  })

  it("rejects an unknown or malformed game item", async () => {
    for (const game_item_id of [
      "11111111-1111-4111-8111-111111111111",
      "not-a-uuid",
    ]) {
      const err = await rejection(
        addWatchlistItem(knex(), "bob", { game_item_id, max_price: 10 }),
      )
      expect(err.code).toBe("unknown_item")
    }
  })

  it("rejects a target price of 1 aUEC or less", async () => {
    const err = await rejection(
      addWatchlistItem(knex(), "bob", { game_item_id: ITEM, max_price: 1 }),
    )
    expect(err).toMatchObject({ code: "invalid", field: "max_price" })
  })

  it("rejects an empty query without a game item", async () => {
    const err = await rejection(
      addWatchlistItem(knex(), "bob", { query: "   ", max_price: 10 }),
    )
    expect(err).toMatchObject({ code: "invalid", field: "query" })
  })

  it("rejects watching the same game item twice", async () => {
    const err = await rejection(
      addWatchlistItem(knex(), "alice", { game_item_id: ITEM, max_price: 5 }),
    )
    expect(err.code).toBe("duplicate")
    expect(err.status).toBe(409)
    expect(
      db.tables.watchlist_items.filter((r) => r.user_id === "alice"),
    ).toHaveLength(1)
  })

  it("rejects the same text query twice, ignoring case and spacing", async () => {
    await addWatchlistItem(knex(), "alice", {
      query: "Hammer Pistol",
      max_price: 500,
    })
    const err = await rejection(
      addWatchlistItem(knex(), "alice", {
        query: " hammer  PISTOL",
        max_price: 9,
      }),
    )
    expect(err.code).toBe("duplicate")
  })

  it("lets another user watch the same item", async () => {
    await expect(
      addWatchlistItem(knex(), "bob", { game_item_id: ITEM, max_price: 5 }),
    ).resolves.toMatchObject({ game_item_id: ITEM })
  })

  it(`caps a watchlist at ${WATCHLIST_MAX_ITEMS} items`, async () => {
    for (let i = 1; i < WATCHLIST_MAX_ITEMS; i++) {
      await addWatchlistItem(knex(), "alice", {
        query: `thing ${i}`,
        max_price: 10,
      })
    }
    expect(
      db.tables.watchlist_items.filter((r) => r.user_id === "alice"),
    ).toHaveLength(WATCHLIST_MAX_ITEMS)
    const err = await rejection(
      addWatchlistItem(knex(), "alice", { query: "one more", max_price: 10 }),
    )
    expect(err.code).toBe("limit")
    expect(
      db.tables.watchlist_items.filter((r) => r.user_id === "alice"),
    ).toHaveLength(WATCHLIST_MAX_ITEMS)
  })
})

describe("updateWatchlistItemPrice", () => {
  it("changes the owner's target price", async () => {
    const row = await updateWatchlistItemPrice(
      knex(),
      "alice",
      ALICE_WATCH,
      20000,
    )
    expect(row.max_price).toBe(20000)
  })

  it("cannot change another user's item", async () => {
    const err = await rejection(
      updateWatchlistItemPrice(knex(), "alice", BOB_WATCH, 2),
    )
    expect(err.code).toBe("not_found")
    expect(
      db.tables.watchlist_items.find((r) => r.id === BOB_WATCH)?.max_price,
    ).toBe(9000)
  })

  it("validates the new price", async () => {
    const err = await rejection(
      updateWatchlistItemPrice(knex(), "alice", ALICE_WATCH, 0),
    )
    expect(err.code).toBe("invalid")
  })

  it("treats a malformed id as not found", async () => {
    const err = await rejection(
      updateWatchlistItemPrice(knex(), "alice", "nope", 10),
    )
    expect(err.code).toBe("not_found")
  })
})

describe("removeWatchlistItem", () => {
  it("deletes the owner's item", async () => {
    await removeWatchlistItem(knex(), "alice", ALICE_WATCH)
    expect(db.tables.watchlist_items.map((r) => r.id)).toEqual([BOB_WATCH])
  })

  it("cannot delete another user's item", async () => {
    const err = await rejection(removeWatchlistItem(knex(), "alice", BOB_WATCH))
    expect(err.code).toBe("not_found")
    expect(db.tables.watchlist_items).toHaveLength(2)
  })
})

describe("listWatchlistItems", () => {
  it("returns only the user's items, with the item name, image and lowest price", async () => {
    vi.mocked(currentLowestPrices).mockResolvedValueOnce(
      new Map([[ALICE_WATCH, 21000]]),
    )
    const items = await listWatchlistItems(knex(), "alice")
    expect(items).toEqual([
      expect.objectContaining({
        id: ALICE_WATCH,
        item_name: "Medical Supplies",
        item_image_url: "https://cdn/med.png",
        max_price: 25000,
        current_lowest: 21000,
      }),
    ])
  })

  it("lists newest first", async () => {
    await addWatchlistItem(knex(), "alice", {
      query: "Hammer Pistol",
      max_price: 500,
    })
    const items = await listWatchlistItems(knex(), "alice")
    expect(items.map((i) => i.query)).toEqual([
      "Hammer Pistol",
      "Medical Supplies",
    ])
  })

  it("is empty for a user with no items", async () => {
    await expect(listWatchlistItems(knex(), "carol")).resolves.toEqual([])
  })
})
