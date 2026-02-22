import { describe, it, expect, vi, beforeAll } from "vitest"
import { AttributeFilter, type MarketSearchQueryArguments } from "./types.js"

// Set required environment variables before any imports
beforeAll(() => {
  process.env.AWS_REGION = "us-east-1"
  process.env.IMAGE_LAMBDA_NAME = "test-lambda"
  process.env.B2_KEY_ID = "test-key-id"
  process.env.B2_APP_KEY = "test-app-key"
  process.env.B2_BUCKET_ID = "test-bucket-id"
})

// Mock the logger before importing helpers
vi.mock("../../../../logger/logger.js", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock the database modules
vi.mock("../contractors/database.js", () => ({
  getContractor: vi.fn(),
}))

vi.mock("../profiles/database.js", () => ({
  getUser: vi.fn(),
}))

// Mock the CDN
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: {
    getFileLinkResource: vi.fn(),
  },
}))

describe("Attribute Filter Parsing", () => {
  it("should parse valid attribute filters from JSON string", async () => {
    // Import after mocks are set up
    const { convertQuery } = await import("./helpers.js")

    const queryArgs: Partial<MarketSearchQueryArguments> = {
      attributes: JSON.stringify([
        { name: "size", values: ["4", "5"], operator: "in" },
        { name: "class", values: ["Military"], operator: "eq" },
      ]),
      index: "0",
      page_size: "16",
      minCost: "0",
      quantityAvailable: "0",
      query: "",
      sort: "timestamp",
      seller_rating: "0",
    }

    const result = await convertQuery(queryArgs)

    expect(result.attributes).toBeDefined()
    expect(result.attributes).toHaveLength(2)
    expect(result.attributes![0]).toEqual({
      name: "size",
      values: ["4", "5"],
      operator: "in",
    })
    expect(result.attributes![1]).toEqual({
      name: "class",
      values: ["Military"],
      operator: "eq",
    })
  })

  it("should return null for invalid JSON", async () => {
    const { convertQuery } = await import("./helpers.js")

    const queryArgs: Partial<MarketSearchQueryArguments> = {
      attributes: "invalid json",
      index: "0",
      page_size: "16",
      minCost: "0",
      quantityAvailable: "0",
      query: "",
      sort: "timestamp",
      seller_rating: "0",
    }

    const result = await convertQuery(queryArgs)

    expect(result.attributes).toBeNull()
  })

  it("should return null for empty attributes", async () => {
    const { convertQuery } = await import("./helpers.js")

    const queryArgs: Partial<MarketSearchQueryArguments> = {
      attributes: null,
      index: "0",
      page_size: "16",
      minCost: "0",
      quantityAvailable: "0",
      query: "",
      sort: "timestamp",
      seller_rating: "0",
    }

    const result = await convertQuery(queryArgs)

    expect(result.attributes).toBeNull()
  })

  it("should filter out invalid attribute filters", async () => {
    const { convertQuery } = await import("./helpers.js")

    const queryArgs: Partial<MarketSearchQueryArguments> = {
      attributes: JSON.stringify([
        { name: "size", values: ["4", "5"], operator: "in" }, // valid
        { name: "class", values: [], operator: "eq" }, // invalid - empty values
        { name: 123, values: ["test"], operator: "in" }, // invalid - name not string
        { name: "grade", values: ["A"], operator: "invalid" }, // invalid - bad operator
      ]),
      index: "0",
      page_size: "16",
      minCost: "0",
      quantityAvailable: "0",
      query: "",
      sort: "timestamp",
      seller_rating: "0",
    }

    const result = await convertQuery(queryArgs)

    expect(result.attributes).toBeDefined()
    expect(result.attributes).toHaveLength(1)
    expect(result.attributes![0]).toEqual({
      name: "size",
      values: ["4", "5"],
      operator: "in",
    })
  })

  it("should handle single value filters", async () => {
    const { convertQuery } = await import("./helpers.js")

    const queryArgs: Partial<MarketSearchQueryArguments> = {
      attributes: JSON.stringify([
        { name: "manufacturer", values: ["Behring"], operator: "eq" },
      ]),
      index: "0",
      page_size: "16",
      minCost: "0",
      quantityAvailable: "0",
      query: "",
      sort: "timestamp",
      seller_rating: "0",
    }

    const result = await convertQuery(queryArgs)

    expect(result.attributes).toBeDefined()
    expect(result.attributes).toHaveLength(1)
    expect(result.attributes![0].values).toEqual(["Behring"])
  })
})
