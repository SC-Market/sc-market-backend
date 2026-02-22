import { describe, it, expect } from "vitest"
import type {
  StarmapRoute,
  StarmapObject,
  StarmapSearchResult,
  RouteResponse,
  ObjectResponse,
  SearchResponse,
} from "./starmap.models.js"

describe("Starmap Models", () => {
  describe("StarmapRoute", () => {
    it("should accept route data", () => {
      const route: StarmapRoute = {
        route: [
          { name: "Stanton", type: "system", distance: 0 },
          { name: "Pyro", type: "system", distance: 5.2 },
        ],
        total_distance: 5.2,
        jump_points: 1,
      }

      expect(route.route).toHaveLength(2)
      expect(route.total_distance).toBe(5.2)
    })
  })

  describe("StarmapObject", () => {
    it("should accept object data", () => {
      const obj: StarmapObject = {
        id: "stanton",
        name: "Stanton",
        type: "system",
        description: "A star system in the United Empire of Earth",
        affiliation: "UEE",
        habitable: true,
      }

      expect(obj.id).toBe("stanton")
      expect(obj.name).toBe("Stanton")
      expect(obj.type).toBe("system")
    })
  })

  describe("StarmapSearchResult", () => {
    it("should contain results array", () => {
      const searchResult: StarmapSearchResult = {
        results: [
          { id: "stanton", name: "Stanton", type: "system" },
          { id: "crusader", name: "Crusader", type: "planet" },
        ],
      }

      expect(searchResult.results).toHaveLength(2)
      expect(searchResult.results[0].name).toBe("Stanton")
    })

    it("should handle empty results", () => {
      const searchResult: StarmapSearchResult = {
        results: [],
      }

      expect(searchResult.results).toHaveLength(0)
    })
  })

  describe("RouteResponse", () => {
    it("should wrap route in data property", () => {
      const response: RouteResponse = {
        data: {
          route: [{ name: "Stanton", type: "system", distance: 0 }],
          total_distance: 0,
        },
      }

      expect(response.data).toBeDefined()
      expect(response.data.route).toHaveLength(1)
    })
  })

  describe("ObjectResponse", () => {
    it("should wrap object in data property", () => {
      const response: ObjectResponse = {
        data: {
          id: "stanton",
          name: "Stanton",
          type: "system",
        },
      }

      expect(response.data).toBeDefined()
      expect(response.data.id).toBe("stanton")
    })
  })

  describe("SearchResponse", () => {
    it("should wrap search results in data property", () => {
      const response: SearchResponse = {
        data: {
          results: [
            { id: "stanton", name: "Stanton", type: "system" },
          ],
        },
      }

      expect(response.data).toBeDefined()
      expect(response.data.results).toHaveLength(1)
    })
  })
})
