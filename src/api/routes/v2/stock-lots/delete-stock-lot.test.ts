/**
 * DELETE /stock-lots/{id} returned 500 for every lot: the allocation check
 * joined stock_allocation_log on a non-existent `order_item_id` column. The
 * table has `order_id` (migrations/20260418200100_offer_market_items_v2_and_extras.ts).
 *
 * Named without "Controller" so it is not swept up by the vitest exclusion for
 * DB-backed v2 controller tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request as ExpressRequest } from "express"

const STOCK_ALLOCATION_LOG_COLUMNS = ["allocation_id", "order_id", "lot_id", "quantity_allocated", "allocated_by", "allocated_at"]

const h = vi.hoisted(() => ({
  deleted: [] as string[],
  openAllocation: false,
}))

vi.mock("../../../../clients/database/knex-db.js", () => {
  const knex: any = (table: string) => {
    const b: any = {
      join: (_t: string, left: string) => {
        const [alias, col] = left.split(".")
        if (alias === "sal" && !STOCK_ALLOCATION_LOG_COLUMNS.includes(col)) {
          throw new Error(`column sal.${col} does not exist`)
        }
        return b
      },
      where: () => b,
      whereIn: () => b,
      whereNotIn: () => b,
      select: () => b,
      first: async () => {
        if (table.startsWith("listing_item_lots")) return { lot_id: "lot-1", shop_id: "shop-1" }
        if (table.startsWith("stock_allocation_log")) return h.openAllocation ? { allocation_id: "a" } : undefined
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
