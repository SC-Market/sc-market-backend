/**
 * The shop's allocation_mode setting decides allocation; org/user settings
 * are not read (they used to be, which made the shop setting a no-op).
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../api/routes/v1/orders/database.js", () => ({
  getOrderSetting: vi.fn(),
}))

import { getShopAllocationMode } from "./allocation-mode.service.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"

const getOrderSetting = orderDb.getOrderSetting as unknown as Mock

type Row = { entity_type: string; entity_id: string; message_content: string; enabled: boolean }

function settings(...rows: Row[]) {
  getOrderSetting.mockImplementation(
    async (entityType: string, entityId: string, settingType: string) =>
      rows.find(
        (r) =>
          r.entity_type === entityType &&
          r.entity_id === entityId &&
          settingType === "allocation_mode",
      ) ?? null,
  )
}

describe("getShopAllocationMode", () => {
  beforeEach(() => vi.clearAllMocks())

  it("uses the mode saved on the shop", async () => {
    settings({ entity_type: "shop", entity_id: "shop-1", message_content: "manual", enabled: true })
    expect(await getShopAllocationMode("shop-1")).toBe("manual")
  })

  it("ignores the owning org's and user's settings", async () => {
    settings(
      { entity_type: "contractor", entity_id: "org-1", message_content: "manual", enabled: true },
      { entity_type: "user", entity_id: "user-1", message_content: "none", enabled: true },
    )
    expect(await getShopAllocationMode("shop-1")).toBe("auto")
    expect(getOrderSetting).toHaveBeenCalledTimes(1)
    expect(getOrderSetting).toHaveBeenCalledWith("shop", "shop-1", "allocation_mode")
  })

  it("is auto when the shop has no setting, a disabled one, or an unknown value", async () => {
    settings()
    expect(await getShopAllocationMode("shop-1")).toBe("auto")
    settings({ entity_type: "shop", entity_id: "shop-1", message_content: "manual", enabled: false })
    expect(await getShopAllocationMode("shop-1")).toBe("auto")
    settings({ entity_type: "shop", entity_id: "shop-1", message_content: "bogus", enabled: true })
    expect(await getShopAllocationMode("shop-1")).toBe("auto")
  })

  it("is auto for an order with no shop, without querying", async () => {
    expect(await getShopAllocationMode(null)).toBe("auto")
    expect(await getShopAllocationMode(undefined)).toBe("auto")
    expect(getOrderSetting).not.toHaveBeenCalled()
  })
})
