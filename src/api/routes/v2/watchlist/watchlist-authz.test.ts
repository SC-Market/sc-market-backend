/**
 * /api/v2/watchlist is scoped to the signed-in user: nobody can list, edit or
 * remove another user's watches, and rejections map to the right API errors.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request as ExpressRequest } from "express"
import {
  createFakeKnex,
  type FakeKnex,
} from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown as FakeKnex }))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: {},
}))
vi.mock("../../../../services/watchlist/watchlist-prices.js", () => ({
  currentLowestPrices: vi.fn(async () => new Map<string, number>()),
}))

const { WatchlistV2Controller } = await import("./WatchlistV2Controller.js")
const { NotFoundError, ValidationError } =
  await import("../../v1/util/errors.js")

const ITEM = "58891d96-ea38-4141-831d-eae17e17f7cf"
const BOB_WATCH = "bbbbbbbb-0000-4000-8000-000000000002"

function as(user_id?: string): ExpressRequest {
  return {
    user: user_id ? { user_id, role: "user" } : undefined,
  } as unknown as ExpressRequest
}

beforeEach(() => {
  h.db = createFakeKnex({
    game_items: [{ id: ITEM, name: "Medical Supplies", image_url: null }],
    watchlist_items: [
      {
        id: BOB_WATCH,
        user_id: "bob",
        query: "Medical Supplies",
        game_item_id: ITEM,
        max_price: 9000,
        created_at: new Date("2026-10-02T00:00:00Z"),
        last_notified_at: null,
      },
    ],
  })
})

const controller = () => new WatchlistV2Controller()

describe("watchlist authz", () => {
  it("requires a signed-in user", async () => {
    await expect(controller().getWatchlist(as())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    await expect(
      controller().addWatchlistItem(
        { game_item_id: ITEM, max_price: 10 },
        as(),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(h.db.tables.watchlist_items).toHaveLength(1)
  })

  it("lists only the caller's own items", async () => {
    await expect(controller().getWatchlist(as("alice"))).resolves.toEqual({
      items: [],
      max_items: 50,
    })
    const bob = await controller().getWatchlist(as("bob"))
    expect(bob.items.map((i) => i.id)).toEqual([BOB_WATCH])
    expect(bob.items[0]).toMatchObject({
      item_name: "Medical Supplies",
      created_at: "2026-10-02T00:00:00.000Z",
      last_notified_at: null,
    })
  })

  it("cannot edit another user's item", async () => {
    await expect(
      controller().updateWatchlistItem(
        BOB_WATCH,
        { max_price: 2 },
        as("alice"),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(h.db.tables.watchlist_items[0].max_price).toBe(9000)
  })

  it("cannot remove another user's item", async () => {
    await expect(
      controller().removeWatchlistItem(BOB_WATCH, as("alice")),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(h.db.tables.watchlist_items).toHaveLength(1)
  })

  it("lets the owner edit and remove their item", async () => {
    const updated = await controller().updateWatchlistItem(
      BOB_WATCH,
      { max_price: 8000 },
      as("bob"),
    )
    expect(updated.max_price).toBe(8000)
    await expect(
      controller().removeWatchlistItem(BOB_WATCH, as("bob")),
    ).resolves.toEqual({
      success: true,
    })
    expect(h.db.tables.watchlist_items).toHaveLength(0)
  })

  it("adds to the caller's own list, whatever the body says", async () => {
    const body = { game_item_id: ITEM, max_price: 10, user_id: "bob" } as never
    const item = await controller().addWatchlistItem(body, as("alice"))
    expect(item).toMatchObject({
      game_item_id: ITEM,
      item_name: "Medical Supplies",
    })
    expect(
      h.db.tables.watchlist_items.find((r) => r.id === item.id)?.user_id,
    ).toBe("alice")
  })
})

describe("watchlist errors", () => {
  it("409s on a duplicate item", async () => {
    await expect(
      controller().addWatchlistItem(
        { game_item_id: ITEM, max_price: 10 },
        as("bob"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("400s on a bad price or unknown item", async () => {
    await expect(
      controller().addWatchlistItem(
        { game_item_id: ITEM, max_price: 1 },
        as("alice"),
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      controller().addWatchlistItem(
        { game_item_id: "11111111-1111-4111-8111-111111111111", max_price: 10 },
        as("alice"),
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it("400s once the list is full", async () => {
    for (let i = 0; i < 49; i++) {
      await controller().addWatchlistItem(
        { query: `thing ${i}`, max_price: 10 },
        as("bob"),
      )
    }
    await expect(
      controller().addWatchlistItem(
        { query: "one more", max_price: 10 },
        as("bob"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
  })
})
