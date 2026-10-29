/**
 * v2 writes that act for an org through ids the token org check can't see
 * (a supplier relationship id, a wishlist's organization_id) let a token act
 * for an org it wasn't granted. They now check the grant themselves.
 *
 * Also: GET /orders/by-listing/{id}, /listings/inventory-summary and
 * /game-data/blueprints/inventory never received the request (no @Request
 * parameter), so getUserId() found no user and every call was a 401.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => {
  process.env.B2_KEY_ID ||= "test"
  process.env.B2_APP_KEY ||= "test"
  return { db: null as unknown }
})
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const { SuppliersV2Controller } = await import("../suppliers/SuppliersV2Controller.js")
const { WishlistsController } = await import("../game-data/wishlists/WishlistsController.js")
const { OrdersV2Controller } = await import("../orders/OrdersV2Controller.js")
const { ListingsV2Controller } = await import("../listings/ListingsV2Controller.js")
const { BlueprintsController } = await import("../game-data/blueprints/BlueprintsController.js")

let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
})

const user = { user_id: "me", role: "user", rsi_confirmed: true }
type Who = "session" | "no-org" | "org-1"
const req = (who: Who) =>
  ({
    user,
    __tokenInfo:
      who === "session"
        ? undefined
        : { id: "t", name: "t", scopes: ["market:write"], contractor_ids: who === "org-1" ? ["org-1"] : [] },
  }) as never

describe("DELETE /suppliers/{id} of an org's roster", () => {
  beforeEach(() => {
    tracker.on
      .select(/from "supplier_relationships"/)
      .response([{ relationship_id: "r1", aggregator_id: null, aggregator_contractor_id: "org-1" }])
    tracker.on.select(/from "contractor_members"/).response([{ contractor_id: "org-1", user_id: "me" }])
    tracker.on.delete(/supplier_relationships/).response(1)
  })

  it("refuses a token not granted the org", async () => {
    await expect(new SuppliersV2Controller().removeSupplier("r1", req("no-org"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Token does not have access to this contractor",
    })
    expect(tracker.history.delete).toHaveLength(0)
  })

  it("works for a granted token and for sessions", async () => {
    for (const who of ["org-1", "session"] as const) {
      expect(await new SuppliersV2Controller().removeSupplier("r1", req(who))).toEqual({ success: true })
    }
  })
})

describe("POST /game-data/wishlists for an org", () => {
  beforeEach(() => {
    tracker.on.select(/from "contractor_members"/).response([{ contractor_id: "org-1", user_id: "me" }])
    tracker.on.insert(/wishlists/).response([
      { wishlist_id: "w1", user_id: "me", organization_id: "org-1", created_at: new Date(), updated_at: new Date() },
    ])
  })
  const body = { wishlist_name: "Org list", organization_id: "org-1", is_collaborative: true, is_public: false }

  it("refuses a token not granted the org", async () => {
    await expect(new WishlistsController().createWishlist(body, req("no-org"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(tracker.history.insert).toHaveLength(0)
  })

  it("refuses users who aren't members of the org", async () => {
    tracker.reset()
    tracker.on.select(/from "contractor_members"/).response([])
    await expect(new WishlistsController().createWishlist(body, req("session"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("works for members: granted tokens and sessions", async () => {
    for (const who of ["org-1", "session"] as const) {
      const w = await new WishlistsController().createWishlist(body, req(who))
      expect(w).toMatchObject({ wishlist_id: "w1" })
    }
  })
})

describe("endpoints that never saw the signed-in user", () => {
  beforeEach(() => {
    tracker.on.select(() => true).response([])
  })

  it("GET /orders/by-listing/{id} reads the user (404 for an unknown listing, not 401)", async () => {
    await expect(new OrdersV2Controller().getOrdersByListing("l1", req("session"))).rejects.toMatchObject({
      name: "NotFoundError",
    })
  })

  it("GET /listings/inventory-summary reads the user", async () => {
    await expect(new ListingsV2Controller().getInventorySummary(undefined, req("session"))).resolves.toEqual({
      materials: [],
    })
  })

  it("GET /game-data/blueprints/inventory reads the user (gets past auth)", async () => {
    // With no game version in the (empty) database it stops at a 404, after
    // authentication: before, every call was a 401.
    await expect(
      new BlueprintsController().getUserBlueprintInventory(
        undefined,
        undefined,
        undefined,
        "acquisition_date",
        "desc",
        1,
        50,
        req("session"),
      ),
    ).rejects.toMatchObject({ name: "NotFoundError" })
  })
})
