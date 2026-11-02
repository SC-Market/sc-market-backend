/**
 * PUT /shops/{shopId}/storefront/directory: personal shops have no directory
 * setting (owner decision 2026-11-01: the directory lists orgs), so the
 * field is rejected for them; org shops keep it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../../../clients/database/knex-db.js", () => ({ getKnex: vi.fn() }))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  canManageShop: vi.fn(),
  getShopById: vi.fn(),
}))
vi.mock("../../../../services/storefront/directory.js", () => ({
  getShopDirectoryStatus: vi.fn(),
  setDirectoryShown: vi.fn(),
}))

const { ShopStorefrontV2Controller } = await import("./ShopStorefrontV2Controller.js")
const { canManageShop, getShopById } = await import("../../../../services/shops/shop-permissions.service.js")
const directory = await import("../../../../services/storefront/directory.js")

const USER = { user_id: "u1", role: "user" }
const SHOP_ID = "6f1c2b0e-8a7d-4c3b-9e2f-1a2b3c4d5e6f"
const STATUS = { show_in_directory: true, can_change: true, listed: true, reason: "listed" }

async function status(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return "ok"
  } catch (e: any) {
    return e.code ?? e.name ?? String(e)
  }
}
const put = (show: unknown) =>
  new ShopStorefrontV2Controller({ user: USER } as any).setShopStorefrontDirectory(
    SHOP_ID,
    { show_in_directory: show } as any,
    { user: USER } as any,
  )

beforeEach(() => {
  vi.clearAllMocks()
  ;(canManageShop as Mock).mockResolvedValue(true)
  ;(directory.getShopDirectoryStatus as Mock).mockResolvedValue(STATUS)
})

describe("PUT /shops/{shopId}/storefront/directory", () => {
  it("rejects the setting for a personal shop, on or off, and stores nothing", async () => {
    ;(getShopById as Mock).mockResolvedValue({ shop_id: SHOP_ID, status: "active", owner_user_id: "u1", owner_contractor_id: null })
    expect(await status(put(true))).toBe("ValidationError")
    expect(await status(put(false))).toBe("ValidationError")
    expect(directory.setDirectoryShown).not.toHaveBeenCalled()
  })

  it("sets it for an org shop", async () => {
    ;(getShopById as Mock).mockResolvedValue({ shop_id: SHOP_ID, status: "active", owner_user_id: null, owner_contractor_id: "c1" })
    expect(await status(put(false))).toBe("ok")
    expect(directory.setDirectoryShown).toHaveBeenCalledWith({ shop_id: SHOP_ID }, false, "u1")
  })
})
