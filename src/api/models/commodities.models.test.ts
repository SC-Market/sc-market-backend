import { describe, it, expect } from "vitest"
import type { Commodity, CommoditiesResponse } from "./commodities.models.js"

describe("Commodities Models", () => {
  describe("Commodity", () => {
    it("should have all required fields", () => {
      const commodity: Commodity = {
        id: 1,
        id_parent: null,
        name: "Agricium",
        code: "AGRI",
        slug: "agricium",
        kind: "Metal",
        weight_scu: 1,
        price_buy: 25.5,
        price_sell: 28.75,
        is_available: 1,
        is_available_live: 1,
        is_visible: 1,
        is_extractable: 1,
        is_mineral: 1,
        is_raw: 0,
        is_pure: 0,
        is_refined: 1,
        is_refinable: 0,
        is_harvestable: 0,
        is_buyable: 1,
        is_sellable: 1,
        is_temporary: 0,
        is_illegal: 0,
        is_volatile_qt: 0,
        is_volatile_time: 0,
        is_inert: 0,
        is_explosive: 0,
        is_buggy: 0,
        is_fuel: 0,
        wiki: "https://starcitizen.tools/Agricium",
        date_added: 1609459200,
        date_modified: 1640995200,
      }

      expect(commodity.id).toBe(1)
      expect(commodity.name).toBe("Agricium")
      expect(commodity.code).toBe("AGRI")
      expect(commodity.price_buy).toBe(25.5)
      expect(commodity.price_sell).toBe(28.75)
    })

    it("should allow null values for optional fields", () => {
      const commodity: Commodity = {
        id: 2,
        id_parent: null,
        name: "Test Commodity",
        code: "TEST",
        slug: "test",
        kind: null,
        weight_scu: null,
        price_buy: 10.0,
        price_sell: 12.0,
        is_available: 1,
        is_available_live: 1,
        is_visible: 1,
        is_extractable: 0,
        is_mineral: 0,
        is_raw: 0,
        is_pure: 0,
        is_refined: 0,
        is_refinable: 0,
        is_harvestable: 0,
        is_buyable: 1,
        is_sellable: 1,
        is_temporary: 0,
        is_illegal: 0,
        is_volatile_qt: 0,
        is_volatile_time: 0,
        is_inert: 0,
        is_explosive: 0,
        is_buggy: 0,
        is_fuel: 0,
        wiki: null,
        date_added: 1609459200,
        date_modified: 1640995200,
      }

      expect(commodity.id_parent).toBeNull()
      expect(commodity.kind).toBeNull()
      expect(commodity.weight_scu).toBeNull()
      expect(commodity.wiki).toBeNull()
    })
  })

  describe("CommoditiesResponse", () => {
    it("should wrap commodities in data property", () => {
      const response: CommoditiesResponse = {
        data: [
          {
            id: 1,
            id_parent: null,
            name: "Agricium",
            code: "AGRI",
            slug: "agricium",
            kind: "Metal",
            weight_scu: 1,
            price_buy: 25.5,
            price_sell: 28.75,
            is_available: 1,
            is_available_live: 1,
            is_visible: 1,
            is_extractable: 1,
            is_mineral: 1,
            is_raw: 0,
            is_pure: 0,
            is_refined: 1,
            is_refinable: 0,
            is_harvestable: 0,
            is_buyable: 1,
            is_sellable: 1,
            is_temporary: 0,
            is_illegal: 0,
            is_volatile_qt: 0,
            is_volatile_time: 0,
            is_inert: 0,
            is_explosive: 0,
            is_buggy: 0,
            is_fuel: 0,
            wiki: "https://starcitizen.tools/Agricium",
            date_added: 1609459200,
            date_modified: 1640995200,
          },
        ],
      }

      expect(response.data).toHaveLength(1)
      expect(response.data[0].name).toBe("Agricium")
    })

    it("should handle empty commodity list", () => {
      const response: CommoditiesResponse = {
        data: [],
      }

      expect(response.data).toHaveLength(0)
    })
  })
})
