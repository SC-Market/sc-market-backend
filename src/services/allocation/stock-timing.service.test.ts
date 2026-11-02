/**
 * Stock subtraction timing on V2 orders (stock-timing.service.ts): the shop's
 * setting, read from the shop only, with an explicit default; and the policy
 * it makes with the allocation mode (every combination).
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../api/routes/v1/orders/database.js", () => ({
  getOrderSetting: vi.fn(),
}))

import {
  DEFAULT_STOCK_SUBTRACTION_TIMING,
  STOCK_SUBTRACTION_TIMINGS,
  getShopStockSubtractionTiming,
  getShopV2StockPolicy,
  isStockSubtractionTiming,
  v2StockPolicy,
  type StockSubtractionTiming,
} from "./stock-timing.service.js"
import type { AllocationMode } from "./allocation-mode.service.js"
import * as orderDb from "../../api/routes/v1/orders/database.js"

const getOrderSetting = orderDb.getOrderSetting as unknown as Mock

type Row = {
  entity_type: string
  entity_id: string
  setting_type: string
  message_content: string
  enabled: boolean
}

function settings(...rows: Row[]) {
  getOrderSetting.mockImplementation(
    async (entityType: string, entityId: string, settingType: string) =>
      rows.find(
        (r) =>
          r.entity_type === entityType &&
          r.entity_id === entityId &&
          r.setting_type === settingType,
      ) ?? null,
  )
}
const timing = (
  entity_type: string,
  entity_id: string,
  message_content: string,
  enabled = true,
): Row => ({
  entity_type,
  entity_id,
  setting_type: "stock_subtraction_timing",
  message_content,
  enabled,
})
const mode = (entity_id: string, message_content: string): Row => ({
  entity_type: "shop",
  entity_id,
  setting_type: "allocation_mode",
  message_content,
  enabled: true,
})

describe("getShopStockSubtractionTiming", () => {
  beforeEach(() => vi.clearAllMocks())

  it("defaults to 'on_accepted' (today's V2 behaviour) when the shop never set it", async () => {
    settings()
    expect(DEFAULT_STOCK_SUBTRACTION_TIMING).toBe("on_accepted")
    expect(await getShopStockSubtractionTiming("shop-1")).toBe("on_accepted")
  })

  it.each(["on_received", "dont_subtract", "on_accepted"])(
    "uses the shop's '%s'",
    async (value) => {
      settings(timing("shop", "shop-1", value))
      expect(await getShopStockSubtractionTiming("shop-1")).toBe(value)
    },
  )

  it("reads the shop only: the owning org's and user's rows are not consulted", async () => {
    settings(
      timing("contractor", "org-1", "dont_subtract"),
      timing("user", "user-1", "on_received"),
    )
    expect(await getShopStockSubtractionTiming("shop-1")).toBe("on_accepted")
    expect(getOrderSetting).toHaveBeenCalledTimes(1)
    expect(getOrderSetting).toHaveBeenCalledWith(
      "shop",
      "shop-1",
      "stock_subtraction_timing",
    )
  })

  it("a disabled or unrecognised setting is the default", async () => {
    settings(timing("shop", "shop-1", "dont_subtract", false))
    expect(await getShopStockSubtractionTiming("shop-1")).toBe("on_accepted")
    settings(timing("shop", "shop-1", "never"))
    expect(await getShopStockSubtractionTiming("shop-1")).toBe("on_accepted")
  })

  it("no shop: the default, without a query", async () => {
    expect(await getShopStockSubtractionTiming(null)).toBe("on_accepted")
    expect(await getShopStockSubtractionTiming(undefined)).toBe("on_accepted")
    expect(getOrderSetting).not.toHaveBeenCalled()
  })

  it("knows exactly the three values the setting has always had", () => {
    expect([...STOCK_SUBTRACTION_TIMINGS].sort()).toEqual([
      "dont_subtract",
      "on_accepted",
      "on_received",
    ])
    expect(isStockSubtractionTiming("on_received")).toBe(true)
    expect(isStockSubtractionTiming("ON_RECEIVED")).toBe(false)
    expect(isStockSubtractionTiming(undefined)).toBe(false)
  })
})

describe("v2StockPolicy (timing x allocation mode)", () => {
  const cases: Array<
    [StockSubtractionTiming, AllocationMode, boolean, boolean]
  > = [
    // timing, mode, hold when the offer arrives, allocate when the order is created
    ["on_accepted", "auto", false, true],
    ["on_accepted", "manual", false, false],
    ["on_accepted", "none", false, false],
    ["on_received", "auto", true, true],
    ["on_received", "manual", false, false],
    ["on_received", "none", false, false],
    ["dont_subtract", "auto", false, false],
    ["dont_subtract", "manual", false, false],
    ["dont_subtract", "none", false, false],
  ]

  it.each(cases)(
    "%s + %s: hold on offer %s, allocate on order %s",
    (t, m, hold, allocate) => {
      expect(v2StockPolicy(t, m)).toEqual({
        timing: t,
        allocation_mode: m,
        hold_on_offer: hold,
        allocate_on_order: allocate,
      })
    },
  )

  it("the default shop (no settings) is exactly the old V2 behaviour: allocate on order, no offer holds", () => {
    expect(v2StockPolicy("on_accepted", "auto")).toMatchObject({
      hold_on_offer: false,
      allocate_on_order: true,
    })
  })
})

describe("getShopV2StockPolicy", () => {
  beforeEach(() => vi.clearAllMocks())

  it("combines the shop's timing and allocation mode", async () => {
    settings(timing("shop", "shop-1", "on_received"), mode("shop-1", "auto"))
    expect(await getShopV2StockPolicy("shop-1")).toMatchObject({
      hold_on_offer: true,
      allocate_on_order: true,
    })

    settings(timing("shop", "shop-1", "dont_subtract"), mode("shop-1", "auto"))
    expect(await getShopV2StockPolicy("shop-1")).toMatchObject({
      hold_on_offer: false,
      allocate_on_order: false,
    })

    settings(timing("shop", "shop-1", "on_received"), mode("shop-1", "manual"))
    expect(await getShopV2StockPolicy("shop-1")).toMatchObject({
      hold_on_offer: false,
      allocate_on_order: false,
    })
  })

  it("a shop with no settings allocates on order (auto + on_accepted)", async () => {
    settings()
    expect(await getShopV2StockPolicy("shop-1")).toEqual({
      timing: "on_accepted",
      allocation_mode: "auto",
      hold_on_offer: false,
      allocate_on_order: true,
    })
  })
})
