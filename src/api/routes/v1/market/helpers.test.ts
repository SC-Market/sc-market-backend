import { describe, it, expect, vi, beforeEach } from "vitest"
import type { MarketSearchQueryArguments } from "./types.js"

// Mock all database dependencies before importing convertQuery
vi.mock("../profiles/database.js", () => ({
  getUser: vi.fn().mockResolvedValue({ user_id: "test-user-id" }),
}))

vi.mock("../contractors/database.js", () => ({
  getContractor: vi
    .fn()
    .mockResolvedValue({ contractor_id: "test-contractor-id" }),
}))

// Import after mocking
const { convertQuery } = await import("./helpers.js")

describe("convertQuery - attribute filter parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should parse component_size as integer array from single string", async () => {
    const result = await convertQuery({
      component_size: "3",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_size).toEqual([3])
  })

  it("should parse component_size as integer array from array of strings", async () => {
    const result = await convertQuery({
      component_size: ["2", "3", "4"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_size).toEqual([2, 3, 4])
  })

  it("should filter out invalid component_size values", async () => {
    const result = await convertQuery({
      component_size: ["2", "invalid", "3"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_size).toEqual([2, 3])
  })

  it("should set component_size to undefined if all values are invalid", async () => {
    const result = await convertQuery({
      component_size: ["invalid", "notanumber"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_size).toBeUndefined()
  })

  it("should parse component_grade as string array from single string", async () => {
    const result = await convertQuery({
      component_grade: "A",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_grade).toEqual(["A"])
  })

  it("should parse component_grade as string array from array", async () => {
    const result = await convertQuery({
      component_grade: ["A", "B", "C"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_grade).toEqual(["A", "B", "C"])
  })

  it("should parse component_class as string array from single string", async () => {
    const result = await convertQuery({
      component_class: "Military",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_class).toEqual(["Military"])
  })

  it("should parse component_class as string array from array", async () => {
    const result = await convertQuery({
      component_class: ["Military", "Stealth"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_class).toEqual(["Military", "Stealth"])
  })

  it("should parse manufacturer as string array from single string", async () => {
    const result = await convertQuery({
      manufacturer: "Crusader Industries",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.manufacturer).toEqual(["Crusader Industries"])
  })

  it("should parse manufacturer as string array from array", async () => {
    const result = await convertQuery({
      manufacturer: ["Crusader Industries", "RSI"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.manufacturer).toEqual(["Crusader Industries", "RSI"])
  })

  it("should parse component_type as string array from single string", async () => {
    const result = await convertQuery({
      component_type: "Quantum Drive",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_type).toEqual(["Quantum Drive"])
  })

  it("should parse component_type as string array from array", async () => {
    const result = await convertQuery({
      component_type: ["Quantum Drive", "Shield Generator"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_type).toEqual(["Quantum Drive", "Shield Generator"])
  })

  it("should parse armor_class as string array from single string", async () => {
    const result = await convertQuery({
      armor_class: "Heavy",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.armor_class).toEqual(["Heavy"])
  })

  it("should parse armor_class as string array from array", async () => {
    const result = await convertQuery({
      armor_class: ["Light", "Medium", "Heavy"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.armor_class).toEqual(["Light", "Medium", "Heavy"])
  })

  it("should parse color as string array from single string", async () => {
    const result = await convertQuery({
      color: "Red",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.color).toEqual(["Red"])
  })

  it("should parse color as string array from array", async () => {
    const result = await convertQuery({
      color: ["Red", "Blue", "Black"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.color).toEqual(["Red", "Blue", "Black"])
  })

  it("should handle multiple attribute filters simultaneously", async () => {
    const result = await convertQuery({
      component_size: ["2", "3"],
      component_grade: ["A", "B"],
      component_class: "Military",
      manufacturer: "Crusader Industries",
      component_type: "Quantum Drive",
      armor_class: "Heavy",
      color: ["Red", "Blue"],
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_size).toEqual([2, 3])
    expect(result.component_grade).toEqual(["A", "B"])
    expect(result.component_class).toEqual(["Military"])
    expect(result.manufacturer).toEqual(["Crusader Industries"])
    expect(result.component_type).toEqual(["Quantum Drive"])
    expect(result.armor_class).toEqual(["Heavy"])
    expect(result.color).toEqual(["Red", "Blue"])
  })

  it("should leave attribute filters undefined when not provided", async () => {
    const result = await convertQuery({
      query: "test",
    } as Partial<MarketSearchQueryArguments>)

    expect(result.component_size).toBeUndefined()
    expect(result.component_grade).toBeUndefined()
    expect(result.component_class).toBeUndefined()
    expect(result.manufacturer).toBeUndefined()
    expect(result.component_type).toBeUndefined()
    expect(result.armor_class).toBeUndefined()
    expect(result.color).toBeUndefined()
  })
})
