/**
 * DELETE /stock-lots/{id} returned 500 for every lot: the allocation check
 * joined stock_allocation_log on a non-existent `order_item_id` column. The
 * check now reads the V2 allocations (order_stock_allocations_v2): a lot with
 * units held for an open order can't be deleted.
 *
 * Named without "Controller" so it is not swept up by the vitest exclusion for
 * DB-backed v2 controller tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request as ExpressRequest } from "express"

const h = vi.hoisted(() => ({
  deleted: [] as string[],
  openAllocation: false,
}))

vi.mock("../../../../clients/database/knex-db.js", () => {
  const knex: any = (table: string) => {
    const b: any = {
      join: () => b,
      where: () => b,
      whereIn: () => b,
      whereNotIn: () => b,
      groupBy: () => b,
      select: () => b,
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        // SUM of active allocations per lot
        const rows = table === "order_stock_allocations_v2" && h.openAllocation ? [{ lot_id: "lot-1", allocated: 2 }] : []
        return Promise.resolve(rows).then(resolve, reject)
      },
      first: async () => {
        if (table.startsWith("listing_item_lots")) return { lot_id: "lot-1", shop_id: "shop-1" }
        return undefined
      },
      delete: async () => {
        h.deleted.push(table)
        return 1
      },
    }
    return b
  }
  knex.schema = { hasTable: async () => true }
  knex.raw = (sql: string) => sql
  return { getKnex: () => knex, database: { knex } }
})
vi.mock("../util/listing-permissions.js", () => ({ canModifyListing: async () => true }))
vi.mock("../../../../clients/cdn/cdn.js", () => ({ cdn: {} }))
vi.mock("../../../../services/audit/audit.service.js", () => ({ auditService: {} }))

import { StockLotsV2Controller } from "./StockLotsV2Controller.js"
import { ValidationError } from "../../v1/util/errors.js"

const req = { user: { user_id: "seller" } } as unknown as ExpressRequest

describe("DELETE /stock-lots/{id}", () => {
  beforeEach(() => {
    h.deleted = []
    h.openAllocation = false
  })

  it("deletes a lot with no open allocations", async () => {
    await expect(new StockLotsV2Controller().deleteStockLot("lot-1", req)).resolves.toEqual({
      message: "Stock lot deleted",
    })
    expect(h.deleted).toEqual(["listing_item_lots"])
  })

  it("refuses to delete a lot allocated to an open order", async () => {
    h.openAllocation = true
    await expect(new StockLotsV2Controller().deleteStockLot("lot-1", req)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(h.deleted).toEqual([])
  })
})
