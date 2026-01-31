import { describe, it, expect, beforeEach, vi } from "vitest"
import { get_item_attributes } from "./controller.js"
import { database } from "../../../../clients/database/knex-db.js"
import { gameItemAttributesService } from "../../../../services/game-items/game-item-attributes.service.js"
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

vi.mock("../../../../services/game-items/game-item-attributes.service.js", () => ({
  gameItemAttributesService: {
    getAttributes: vi.fn(),
  },
}))

vi.mock("../../../../logger/logger.js", () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe("get_item_attributes", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonMock: ReturnType<typeof vi.fn>
  let statusMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockReq = {
      params: {},
    }
    jsonMock = vi.fn()
    statusMock = vi.fn().mockReturnValue({ json: jsonMock })
    mockRes = {
      json: jsonMock as any,
      status: statusMock as any,
    }
  })

  it("should return all attributes for a valid game item", async () => {
    const gameItemId = 123
    mockReq.params = { game_item_id: String(gameItemId) }

    // Mock game item exists
    ;(database.knex as any).mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: gameItemId, name: "Test Item" }),
    }))

    // Mock attributes
    const mockAttributes = {
      component_size: "3",
      component_grade: "A",
      manufacturer: "Crusader Industries",
      component_type: "Quantum Drive",
    }
    ;(gameItemAttributesService.getAttributes as any).mockResolvedValue(
      mockAttributes,
    )

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith({
      data: mockAttributes,
    })
  })

  it("should return empty object for game item with no attributes", async () => {
    const gameItemId = 456
    mockReq.params = { game_item_id: String(gameItemId) }

    // Mock game item exists
    ;(database.knex as any).mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: gameItemId, name: "Test Item" }),
    }))

    // Mock empty attributes
    ;(gameItemAttributesService.getAttributes as any).mockResolvedValue({})

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(jsonMock).toHaveBeenCalledWith({
      data: {},
    })
  })

  it("should return 404 for non-existent game item", async () => {
    const gameItemId = 999999
    mockReq.params = { game_item_id: String(gameItemId) }

    // Mock game item not found
    ;(database.knex as any).mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(undefined),
    }))

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(404)
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        message: "Game item not found",
        code: "NOT_FOUND",
      },
    })
  })

  it("should return 400 for invalid game_item_id", async () => {
    mockReq.params = { game_item_id: "invalid" }

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        message: "Invalid game_item_id parameter",
        code: "VALIDATION_ERROR",
      },
    })
  })

  it("should return 400 for negative game_item_id", async () => {
    mockReq.params = { game_item_id: "-1" }

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        message: "Invalid game_item_id parameter",
        code: "VALIDATION_ERROR",
      },
    })
  })

  it("should return 400 for zero game_item_id", async () => {
    mockReq.params = { game_item_id: "0" }

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(400)
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        message: "Invalid game_item_id parameter",
        code: "VALIDATION_ERROR",
      },
    })
  })

  it("should handle database errors gracefully", async () => {
    const gameItemId = 123
    mockReq.params = { game_item_id: String(gameItemId) }

    // Mock database error
    ;(database.knex as any).mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockRejectedValue(new Error("Database error")),
    }))

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(500)
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        message: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      },
    })
  })

  it("should handle service errors gracefully", async () => {
    const gameItemId = 123
    mockReq.params = { game_item_id: String(gameItemId) }

    // Mock game item exists
    ;(database.knex as any).mockImplementation(() => ({
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: gameItemId, name: "Test Item" }),
    }))

    // Mock service error
    ;(gameItemAttributesService.getAttributes as any).mockRejectedValue(
      new Error("Service error"),
    )

    await get_item_attributes(mockReq as Request, mockRes as Response, vi.fn())

    expect(statusMock).toHaveBeenCalledWith(500)
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        message: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      },
    })
  })
})
