/**
 * Standing buy orders have a visibility: 'public', 'roster_only' (the buyer's
 * supplier roster) or 'private' (directed at one supplier).
 *
 * Regression: GET /buy-orders/{id} and GET /buy-orders/{id}/fulfillment-options
 * returned roster-only and private (directed) orders to anyone with the id,
 * anonymous visitors included. The lists hid private orders even from the
 * supplier they were directed at, who may fulfill them.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"
import { buyOrderVisibleTo } from "./buy-order-visibility.js"

const pg = knexFactory({ client: "pg" })
const sql = (viewer: string | undefined) =>
  pg("buy_orders_v2 as bo").where(buyOrderVisibleTo(pg, viewer, null)).toSQL()

describe("buyOrderVisibleTo", () => {
  it("anonymous visitors see public orders only", () => {
    const q = sql(undefined)
    expect(q.sql).toBe(
      'select * from "buy_orders_v2" as "bo" where ((NOT EXISTS (SELECT 1 FROM accounts _ta WHERE _ta.user_id = bo.buyer_id AND _ta.is_test)) and "bo"."visibility" = ?)',
    )
    expect(q.bindings).toEqual(["public"])
  })

  it("test accounts' buy orders are visible to test viewers only", () => {
    const q = sql("u1")
    expect(q.sql).toContain(
      "((NOT EXISTS (SELECT 1 FROM accounts _ta WHERE _ta.user_id = bo.buyer_id AND _ta.is_test)) OR EXISTS (SELECT 1 FROM accounts _tv WHERE _tv.user_id = ? AND _tv.is_test))",
    )
  })

  it("signed-in viewers also see their own, roster-only (on the roster) and private orders directed at them", () => {
    const q = sql("u1")
    expect(q.sql).toContain('"bo"."visibility" = ? or "bo"."buyer_id" = ?')
    expect(q.sql).toContain('"bo"."visibility" = ? and exists (select 1 from "supplier_relationships" as "sr"')
    expect(q.sql).toContain('"bo"."visibility" = ? and ("bo"."target_supplier_id" = ? or "bo"."target_supplier_contractor_id" in (select "contractor_id" from "contractor_members" where "user_id" = ?))')
    expect(q.bindings).toEqual(
      expect.arrayContaining(["public", "u1", "roster_only", "private"]),
    )
  })
})

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const { BuyOrdersV2Controller } = await import("./BuyOrdersV2Controller.js")
const ID = "11111111-2222-4333-8444-555555555555"
let tracker: Tracker

beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  // The visibility filter excludes the row: nothing comes back.
  tracker.on.select(() => true).response(undefined)
})

describe("buy order detail", () => {
  it("is a 404 for an order the viewer may not see", async () => {
    await expect(
      new BuyOrdersV2Controller().getBuyOrderDetail({ user: undefined } as never, ID),
    ).rejects.toMatchObject({ name: "NotFoundError" })
    const q = tracker.history.select[0]
    expect(q.sql).toMatch(/"bo"\."visibility" = (\?|\$\d+)/)
    expect(q.bindings).toContain("public")
  })

  it("applies the viewer's rule for signed-in users", async () => {
    await new BuyOrdersV2Controller()
      .getBuyOrderDetail({ user: { user_id: "u1", role: "user" } } as never, ID)
      .catch(() => undefined)
    const q = tracker.history.select[0]
    expect(q.sql).toContain("target_supplier_id")
    expect(q.bindings).toEqual(expect.arrayContaining(["u1", "private", "roster_only"]))
  })

  it("does not list fulfillment options for an order the seller may not see", async () => {
    await expect(
      new BuyOrdersV2Controller().getFulfillmentOptions(
        { user: { user_id: "u1", role: "user" } } as never,
        ID,
      ),
    ).rejects.toMatchObject({ name: "NotFoundError" })
    expect(tracker.history.select[0].sql).toContain("target_supplier_id")
  })
})
