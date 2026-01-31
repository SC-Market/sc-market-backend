import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock environment variables before any imports
process.env.AWS_REGION = "us-east-1"
process.env.IMAGE_LAMBDA_NAME = "test-lambda"
process.env.CDN_URL = "https://test-cdn.com"

// Mock the CDN module to prevent static initialization issues
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: {
    getFileLinkResource: vi.fn(),
  },
}))

// Mock the database modules before importing
vi.mock("../profiles/database.js", () => ({
  getUser: vi.fn().mockResolvedValue({ user_id: "test-user-id" }),
}))

vi.mock("../contractors/database.js", () => ({
  getContractor: vi
    .fn()
    .mockResolvedValue({ contractor_id: "test-contractor-id" }),
}))

import { convertQuery, parseComponentAttributes } from "./helpers.js"

describe("parseComponentAttributes", () => {
  describe("size parsing", () => {
    it("should parse 'size X' pattern", () => {
      const result = parseComponentAttributes("size 3")
      expect(result.size).toBe(3)
      expect(result.remainingText).toBe("")
    })

    it("should parse 'size class X' pattern", () => {
      const result = parseComponentAttributes("size class 2")
      expect(result.size).toBe(2)
      expect(result.remainingText).toBe("")
    })

    it("should parse size in mixed case", () => {
      const result = parseComponentAttributes("Size 4")
      expect(result.size).toBe(4)
      expect(result.remainingText).toBe("")
    })

    it("should parse size with surrounding text", () => {
      const result = parseComponentAttributes("quantum drive size 3 cooler")
      expect(result.size).toBe(3)
      expect(result.remainingText).toBe("quantum drive cooler")
    })

    it("should not parse size without space", () => {
      const result = parseComponentAttributes("size3")
      expect(result.size).toBeUndefined()
      expect(result.remainingText).toBe("size3")
    })
  })

  describe("grade parsing", () => {
    it("should parse 'grade X' pattern", () => {
      const result = parseComponentAttributes("grade A")
      expect(result.grade).toBe("A")
      expect(result.remainingText).toBe("")
    })

    it("should parse 'class X' pattern", () => {
      const result = parseComponentAttributes("class B")
      expect(result.grade).toBe("B")
      expect(result.remainingText).toBe("")
    })

    it("should parse grade in lowercase and convert to uppercase", () => {
      const result = parseComponentAttributes("grade a")
      expect(result.grade).toBe("A")
      expect(result.remainingText).toBe("")
    })

    it("should parse all valid grades A-D", () => {
      expect(parseComponentAttributes("grade A").grade).toBe("A")
      expect(parseComponentAttributes("grade B").grade).toBe("B")
      expect(parseComponentAttributes("grade C").grade).toBe("C")
      expect(parseComponentAttributes("grade D").grade).toBe("D")
    })

    it("should parse grade with surrounding text", () => {
      const result = parseComponentAttributes("quantum drive grade A cooler")
      expect(result.grade).toBe("A")
      expect(result.remainingText).toBe("quantum drive cooler")
    })

    it("should not parse invalid grades", () => {
      const result = parseComponentAttributes("grade E")
      expect(result.grade).toBeUndefined()
      expect(result.remainingText).toBe("grade E")
    })
  })

  describe("combined parsing", () => {
    it("should parse both size and grade", () => {
      const result = parseComponentAttributes("size 3 grade A")
      expect(result.size).toBe(3)
      expect(result.grade).toBe("A")
      expect(result.remainingText).toBe("")
    })

    it("should parse size and grade with other text", () => {
      const result = parseComponentAttributes("size 2 quantum drive grade B")
      expect(result.size).toBe(2)
      expect(result.grade).toBe("B")
      expect(result.remainingText).toBe("quantum drive")
    })

    it("should handle complex search queries", () => {
      const result = parseComponentAttributes(
        "looking for size 3 grade A quantum drive from crusader",
      )
      expect(result.size).toBe(3)
      expect(result.grade).toBe("A")
      expect(result.remainingText).toBe(
        "looking for quantum drive from crusader",
      )
    })
  })

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = parseComponentAttributes("")
      expect(result.size).toBeUndefined()
      expect(result.grade).toBeUndefined()
      expect(result.remainingText).toBe("")
    })

    it("should handle text with no attributes", () => {
      const result = parseComponentAttributes("quantum drive cooler")
      expect(result.size).toBeUndefined()
      expect(result.grade).toBeUndefined()
      expect(result.remainingText).toBe("quantum drive cooler")
    })

    it("should trim whitespace from remaining text", () => {
      const result = parseComponentAttributes("  size 3  quantum drive  ")
      expect(result.size).toBe(3)
      expect(result.remainingText).toBe("quantum drive")
    })
  })
})

describe("convertQuery - Component Filters", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("component_size parsing", () => {
    it("should parse single component_size as integer array", async () => {
      const result = await convertQuery({ component_size: "3" })
      expect(result.component_size).toEqual([3])
    })

    it("should parse multiple component_size values as integer array", async () => {
      const result = await convertQuery({ component_size: ["2", "3", "4"] })
      expect(result.component_size).toEqual([2, 3, 4])
    })

    it("should filter out invalid component_size values", async () => {
      const result = await convertQuery({
        component_size: ["2", "invalid", "3"],
      })
      expect(result.component_size).toEqual([2, 3])
    })

    it("should handle undefined component_size", async () => {
      const result = await convertQuery({})
      expect(result.component_size).toBeUndefined()
    })
  })

  describe("component_grade parsing", () => {
    it("should parse single component_grade as string array", async () => {
      const result = await convertQuery({ component_grade: "A" })
      expect(result.component_grade).toEqual(["A"])
    })

    it("should parse multiple component_grade values as string array", async () => {
      const result = await convertQuery({ component_grade: ["A", "B", "C"] })
      expect(result.component_grade).toEqual(["A", "B", "C"])
    })

    it("should handle undefined component_grade", async () => {
      const result = await convertQuery({})
      expect(result.component_grade).toBeUndefined()
    })
  })

  describe("component_class parsing", () => {
    it("should parse single component_class as string array", async () => {
      const result = await convertQuery({ component_class: "Military" })
      expect(result.component_class).toEqual(["Military"])
    })

    it("should parse multiple component_class values as string array", async () => {
      const result = await convertQuery({
        component_class: ["Military", "Stealth", "Industrial"],
      })
      expect(result.component_class).toEqual([
        "Military",
        "Stealth",
        "Industrial",
      ])
    })

    it("should handle undefined component_class", async () => {
      const result = await convertQuery({})
      expect(result.component_class).toBeUndefined()
    })
  })

  describe("manufacturer parsing", () => {
    it("should parse single manufacturer as string array", async () => {
      const result = await convertQuery({
        manufacturer: "Crusader Industries",
      })
      expect(result.manufacturer).toEqual(["Crusader Industries"])
    })

    it("should parse multiple manufacturer values as string array", async () => {
      const result = await convertQuery({
        manufacturer: ["Crusader Industries", "RSI", "Aegis Dynamics"],
      })
      expect(result.manufacturer).toEqual([
        "Crusader Industries",
        "RSI",
        "Aegis Dynamics",
      ])
    })

    it("should handle undefined manufacturer", async () => {
      const result = await convertQuery({})
      expect(result.manufacturer).toBeUndefined()
    })
  })

  describe("component_type parsing", () => {
    it("should parse single component_type as string array", async () => {
      const result = await convertQuery({ component_type: "Quantum Drive" })
      expect(result.component_type).toEqual(["Quantum Drive"])
    })

    it("should parse multiple component_type values as string array", async () => {
      const result = await convertQuery({
        component_type: ["Quantum Drive", "Shield Generator", "Cooler"],
      })
      expect(result.component_type).toEqual([
        "Quantum Drive",
        "Shield Generator",
        "Cooler",
      ])
    })

    it("should handle undefined component_type", async () => {
      const result = await convertQuery({})
      expect(result.component_type).toBeUndefined()
    })
  })

  describe("combined component filters", () => {
    it("should parse all component filters together", async () => {
      const result = await convertQuery({
        component_size: ["2", "3"],
        component_grade: ["A", "B"],
        component_class: "Military",
        manufacturer: "Crusader Industries",
        component_type: "Quantum Drive",
      })

      expect(result.component_size).toEqual([2, 3])
      expect(result.component_grade).toEqual(["A", "B"])
      expect(result.component_class).toEqual(["Military"])
      expect(result.manufacturer).toEqual(["Crusader Industries"])
      expect(result.component_type).toEqual(["Quantum Drive"])
    })

    it("should preserve other query parameters when component filters are present", async () => {
      const result = await convertQuery({
        component_size: "3",
        query: "test search",
        minCost: "100",
        maxCost: "500",
        item_type: "component",
      })

      expect(result.component_size).toEqual([3])
      expect(result.query).toBe("test search")
      expect(result.minCost).toBe(100)
      expect(result.maxCost).toBe(500)
      expect(result.item_type).toBe("component")
    })
  })

  describe("text search parsing integration", () => {
    it("should parse size from search text and add to component_size filter", async () => {
      const result = await convertQuery({ query: "size 3" })
      expect(result.component_size).toEqual([3])
      expect(result.query).toBe("")
    })

    it("should parse grade from search text and add to component_grade filter", async () => {
      const result = await convertQuery({ query: "grade A" })
      expect(result.component_grade).toEqual(["A"])
      expect(result.query).toBe("")
    })

    it("should parse both size and grade from search text", async () => {
      const result = await convertQuery({ query: "size 3 grade A" })
      expect(result.component_size).toEqual([3])
      expect(result.component_grade).toEqual(["A"])
      expect(result.query).toBe("")
    })

    it("should combine parsed size with explicit component_size filter", async () => {
      const result = await convertQuery({
        query: "size 3",
        component_size: "2",
      })
      expect(result.component_size).toEqual([2, 3])
      expect(result.query).toBe("")
    })

    it("should combine parsed grade with explicit component_grade filter", async () => {
      const result = await convertQuery({
        query: "grade A",
        component_grade: "B",
      })
      expect(result.component_grade).toEqual(["B", "A"])
      expect(result.query).toBe("")
    })

    it("should not duplicate size if already in filter", async () => {
      const result = await convertQuery({
        query: "size 3",
        component_size: "3",
      })
      expect(result.component_size).toEqual([3])
      expect(result.query).toBe("")
    })

    it("should not duplicate grade if already in filter", async () => {
      const result = await convertQuery({
        query: "grade A",
        component_grade: "A",
      })
      expect(result.component_grade).toEqual(["A"])
      expect(result.query).toBe("")
    })

    it("should use remaining text for full-text search", async () => {
      const result = await convertQuery({
        query: "size 3 quantum drive grade A cooler",
      })
      expect(result.component_size).toEqual([3])
      expect(result.component_grade).toEqual(["A"])
      expect(result.query).toBe("quantum drive cooler")
    })

    it("should handle complex search with item type", async () => {
      const result = await convertQuery({
        query: "size 2 cooler",
        item_type: "component",
      })
      expect(result.component_size).toEqual([2])
      expect(result.query).toBe("cooler")
      expect(result.item_type).toBe("component")
    })

    it("should handle search with grade and item type", async () => {
      const result = await convertQuery({
        query: "grade B quantum drive",
        item_type: "component",
      })
      expect(result.component_grade).toEqual(["B"])
      expect(result.query).toBe("quantum drive")
      expect(result.item_type).toBe("component")
    })
  })
})
