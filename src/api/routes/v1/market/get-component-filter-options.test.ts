import { describe, it, expect, beforeEach, vi } from "vitest"
import { get_component_filter_options } from "./controller.js"
import { database } from "../../../../clients/database/knex-db.js"
import { Request, Response } from "express"

// Mock AWS clients before importing controller
vi.mock("../../../../clients/image-lambda/image-lambda.js", () => ({
  ImageLambda: class MockImageLambda {},
}))

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: {
    verifyExternalResource: vi.fn(),
    createExternalResource: vi.fn(),
    getFileLinkResource: vi.fn(),
    removeResource: vi.fn(),
    uploadFile: vi.fn(),
  },
}))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: {
    knex: vi.fn(),
  },
}))

vi.mock("../../../../logger/logger.js", () => ({
  default: {
    error: vi.fn(),
  },
}))

describe("get_component_filter_options", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonMock: ReturnType<typeof vi.fn>
  let statusMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockReq = {}
    jsonMock = vi.fn()
    statusMock = vi.fn().mockReturnValue({ json: jsonMock })
    mockRes = {
      json: jsonMock as any,
      status: statusMock as any,
    }
  })

  it("should return all available filter options", async () => {
    // Mock database queries for each attribute
    const mockQueries = {
      component_size: [
        { attribute_value: "1" },
        { attribute_value: "2" },
        { attribute_value: "3" },
      ],
      component_grade: [
        { attribute_value: "A" },
        { attribute_value: "B" },
        { attribute_value: "C" },
      ],
      component_class: [
        { attribute_value: "Military" },
        { attribute_value: "Stealth" },
      ],
      manufacturer: [
        { attribute_value: "Crusader Industries" },
        { attribute_value: "Aegis Dynamics" },
      ],
      component_type: [
        { attribute_value: "Quantum Drive" },
        { attribute_value: "Shield Generator" },
      ],
      armor_class: [
        { attribute_value: "Light" },
        { attribute_value: "Heavy" },
      ],
      color: [{ attribute_value: "Red" }, { attribute_value: "Blue" }],
    }

    // Track which query we're on
    let queryIndex = 0
    const queryOrder = [
      "component_size",
      "component_grade",
      "component_class",
      "manufacturer",
      "component_type",
      "armor_class",
      "color",
    ]

    // Mock database calls in sequence
    ;(database.knex as any).mockImplementation((table: string) => {
      if (table === "game_item_attributes") {
        return {
          distinct: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          whereNotNull: vi.fn().mockReturnThis(),
          orderBy: vi.fn(() => {
            const key = queryOrder[queryIndex] as keyof typeof mockQueries
            const data = mockQueries[key] || []
            queryIndex++
            return Promise.resolve(data)
          }),
        }
      }
      return {
        distinct: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        whereNotNull: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }
    })

    await get_component_filter_options(
      mockReq as Request,
      mockRes as Response,
      vi.fn(),
    )

    expect(jsonMock).toHaveBeenCalledWith({
      data: {
        component_size: ["1", "2", "3"],
        component_grade: ["A", "B", "C"],
        component_class: ["Military", "Stealth"],
        manufacturer: ["Crusader Industries", "Aegis Dynamics"],
        component_type: ["Quantum Drive", "Shield Generator"],
        armor_class: ["Light", "Heavy"],
        color: ["Red", "Blue"],
      },
    })
  })

  it("should return empty arrays when no attributes exist", async () => {
    // Mock empty results
    ;(database.knex as any).mockImplementation(() => ({
      distinct: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereNotNull: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([]),
    }))

    await get_component_filter_options(
      mockReq as Request,
      mockRes as Response,
      vi.fn(),
    )

    expect(jsonMock).toHaveBeenCalledWith({
      data: {
        component_size: [],
        component_grade: [],
        component_class: [],
        manufacturer: [],
        component_type: [],
        armor_class: [],
        color: [],
      },
    })
  })

  it("should handle database errors gracefully", async () => {
    ;(database as any).mockImplementation(() => ({
      distinct: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereNotNull: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockRejectedValue(new Error("Database error")),
    }))

    await get_component_filter_options(
      mockReq as Request,
      mockRes as Response,
      vi.fn(),
    )

    expect(statusMock).toHaveBeenCalledWith(500)
    expect(jsonMock).toHaveBeenCalledWith({
      error: { 
        message: "Internal server error",
        code: "INTERNAL_SERVER_ERROR"
      },
    })
  })
})
