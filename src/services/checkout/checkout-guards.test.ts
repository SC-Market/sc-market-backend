/**
 * The shop blocklist (shop_blocklist) was never consulted, and the direct
 * purchase / POST /api/v2/orders paths skipped the cart's checkout checks.
 * All purchase paths now share these guards.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../shops/shop-permissions.service.js", () => ({
  isBlockedFromShop: vi.fn(),
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  isUserBlocked: vi.fn(),
}))
vi.mock("../../api/routes/v1/orders/helpers.js", () => ({
  validateAvailabilityRequirement: vi.fn(),
  validateOrderLimits: vi.fn(),
}))

const { isBlockedFromShop } =
  await import("../shops/shop-permissions.service.js")
const { isUserBlocked } =
  await import("../../api/routes/v1/profiles/database.js")
const { validateOrderLimits } =
  await import("../../api/routes/v1/orders/helpers.js")
const { assertBuyerMayCheckout, CheckoutRejectedError } =
  await import("./checkout-guards.js")

const orgShop = {
  shop_id: "s1",
  owner_user_id: null,
  owner_contractor_id: "org",
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(isBlockedFromShop as Mock).mockResolvedValue(false)
  ;(isUserBlocked as Mock).mockResolvedValue(false)
  ;(validateOrderLimits as Mock).mockResolvedValue(undefined)
})

describe("assertBuyerMayCheckout", () => {
  it("rejects a buyer on the shop's blocklist", async () => {
    ;(isBlockedFromShop as Mock).mockResolvedValue(true)
    await expect(
      assertBuyerMayCheckout("buyer", orgShop, 1, 100),
    ).rejects.toBeInstanceOf(CheckoutRejectedError)
    expect(isBlockedFromShop).toHaveBeenCalledWith("s1", "buyer")
  })

  it("rejects a buyer blocked by the owning org", async () => {
    ;(isUserBlocked as Mock).mockResolvedValue(true)
    await expect(
      assertBuyerMayCheckout("buyer", orgShop, 1, 100),
    ).rejects.toThrow(/blocked/)
  })

  it("rejects buying from your own shop", async () => {
    await expect(
      assertBuyerMayCheckout(
        "me",
        { shop_id: "s2", owner_user_id: "me", owner_contractor_id: null },
        1,
        1,
      ),
    ).rejects.toThrow(/own shop/)
  })

  it("rejects orders outside the seller's limits", async () => {
    ;(validateOrderLimits as Mock).mockRejectedValue(
      new Error("Minimum order is 10"),
    )
    await expect(
      assertBuyerMayCheckout("buyer", orgShop, 1, 1),
    ).rejects.toMatchObject({
      field: "order_limits",
      message: "Minimum order is 10",
    })
  })

  it("passes an allowed purchase", async () => {
    await expect(
      assertBuyerMayCheckout("buyer", orgShop, 1, 100),
    ).resolves.toBeUndefined()
  })
})
