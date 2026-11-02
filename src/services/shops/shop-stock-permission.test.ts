/**
 * The shop sidebar shows Stock to org members with Manage Stock, whose role
 * permission reads "Add, edit, and remove stock lots", but every stock-lot
 * write checked canManageShop (manage_market only), so those members got 403s.
 * Lot writes now check canManageShopStock: the owner, or manage_market or
 * manage_stock in the owning org. Listings themselves still need manage_market.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const h = vi.hoisted(() => ({ perms: new Set<string>() }))

vi.mock("../../api/routes/v1/util/permissions.js", () => ({
  has_permission: async (_org: string, _user: string, perm: string) => h.perms.has(perm),
  is_member: async () => true,
}))
vi.mock("../../api/routes/v1/contractors/database.js", () => ({ isContractorOwner: async () => false }))
vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: () => ({}) }))

import { canManageShop, canManageShopStock } from "./shop-permissions.service.js"

const orgShop = { shop_id: "s1", owner_user_id: null, owner_contractor_id: "org-1" }
const userShop = { shop_id: "s2", owner_user_id: "owner", owner_contractor_id: null }

describe("canManageShopStock", () => {
  beforeEach(() => {
    h.perms = new Set()
  })

  it("lets a Manage Stock member write the org shop's lots, but not manage the shop", async () => {
    h.perms = new Set(["manage_stock"])
    expect(await canManageShopStock(orgShop, "member")).toBe(true)
    expect(await canManageShop(orgShop, "member")).toBe(false)
  })

  it("lets a Manage Market member write lots", async () => {
    h.perms = new Set(["manage_market"])
    expect(await canManageShopStock(orgShop, "member")).toBe(true)
  })

  it("refuses an org member with neither permission", async () => {
    h.perms = new Set(["manage_orders"])
    expect(await canManageShopStock(orgShop, "member")).toBe(false)
  })

  it("on a user shop, only the owner", async () => {
    h.perms = new Set(["manage_market", "manage_stock"])
    expect(await canManageShopStock(userShop, "owner")).toBe(true)
    expect(await canManageShopStock(userShop, "someone-else")).toBe(false)
  })
})
