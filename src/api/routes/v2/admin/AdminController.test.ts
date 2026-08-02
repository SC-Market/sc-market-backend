/**
 * Admin Controller Tests
 *
 * Tests for admin endpoints including game data import.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { AdminController } from "./AdminController.js"
import {
  gameDataImportService,
  type ImportStats,
} from "../../../../services/game-data/import.service.js"
import { Request as ExpressRequest } from "express"
import type { User } from "../../v1/api-models.js"
import * as fs from "fs"
import * as path from "path"

// Mock dependencies
vi.mock("../../../../services/game-data/import.service.js")
vi.mock("../../../../clients/database/knex-db.js")
vi.mock("../../../../logger/logger.js")
vi.mock("fs")
vi.mock("child_process")

/**
 * The controller reads the multer-populated `file` off the request, so model
 * the request the tests build as carrying it.
 */
type MockRequest = Partial<ExpressRequest> & {
  file?: Express.Multer.File
}

/**
 * ImportStats with every counter zeroed. Spread this in fixtures so adding a
 * field to ImportStats does not silently leave mocks incomplete.
 */
const emptyImportStats: ImportStats = {
  totalP4KItems: 0,
  validP4KItems: 0,
  existingDBItems: 0,
  matched: 0,
  matchedExact: 0,
  matchedCStoneUUID: 0,
  matchedFuzzy: 0,
  inserted: 0,
  updated: 0,
  nameChanges: 0,
  fullSetsCreated: 0,
  missionsProcessed: 0,
  missionsInserted: 0,
  missionsUpdated: 0,
  missionsSkipped: 0,
  missionsWithBlueprintRewards: 0,
  missionBlueprintLinksCreated: 0,
  blueprintsProcessed: 0,
  blueprintsInserted: 0,
  blueprintsUpdated: 0,
  blueprintsSkipped: 0,
  resourcesProcessed: 0,
  resourcesInserted: 0,
  resourcesUpdated: 0,
  resourcesSkipped: 0,
  shipsProcessed: 0,
  shipsInserted: 0,
  amenityTypesImported: 0,
  jurisdictionsImported: 0,
  locationsImported: 0,
  mineableElementsImported: 0,
  miningSpawnsImported: 0,
  qualityDistributionsImported: 0,
  craftedPropertyDefsImported: 0,
  errors: [],
}

/** Build a stub uploaded file with only the fields the controller reads. */
function mockUploadedFile(
  fields: Pick<
    Express.Multer.File,
    "originalname" | "mimetype" | "path" | "size"
  >,
): Express.Multer.File {
  return fields as Express.Multer.File
}

describe("AdminController", () => {
  let controller: AdminController
  let mockRequest: MockRequest

  beforeEach(() => {
    mockRequest = {
      user: {
        user_id: "admin-user-123",
        role: "admin",
      } as User,
    }
    controller = new AdminController(mockRequest as ExpressRequest)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("importGameData", () => {
    it("should reject non-admin users", async () => {
      mockRequest.user = {
        user_id: "regular-user-123",
        role: "user",
      } as User
      controller = new AdminController(mockRequest as ExpressRequest)

      await expect(controller.importGameData(mockRequest as ExpressRequest)).rejects.toThrow()
    })

    it("should reject requests without file upload", async () => {
      const result = await controller.importGameData(mockRequest as ExpressRequest)

      expect(result).toMatchObject({
        success: false,
        error: "No file uploaded",
      })
    })

    it("should reject non-ZIP files", async () => {
      mockRequest.file = mockUploadedFile({
        originalname: "data.json",
        mimetype: "application/json",
        path: "/tmp/upload-123",
        size: 1000,
      })

      const result = await controller.importGameData(mockRequest as ExpressRequest)

      expect(result).toMatchObject({
        success: false,
        error: "Invalid file type",
      })
    })

    it("should successfully import valid game data", async () => {
      const mockFile = mockUploadedFile({
        originalname: "game-data.zip",
        mimetype: "application/zip",
        path: "/tmp/upload-123",
        size: 5000,
      })
      mockRequest.file = mockFile

      // Mock file system operations
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          items: [
            {
              id: "item-1",
              name: "Test Item",
              type: "Cargo",
              file: "test.xml",
            },
          ],
        }),
      )
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined)
      vi.mocked(fs.rmSync).mockImplementation(() => undefined)

      // Mock execSync for unzip
      const { execSync } = await import("child_process")
      vi.mocked(execSync).mockReturnValue(Buffer.from(""))

      // Mock import service
      const mockStats: ImportStats = {
        ...emptyImportStats,
        totalP4KItems: 1,
        validP4KItems: 1,
        existingDBItems: 100,
        matched: 1,
        matchedExact: 1,
        updated: 1,
      }
      vi.mocked(gameDataImportService.importGameData).mockResolvedValue(mockStats)

      const result = await controller.importGameData(mockRequest as ExpressRequest)

      expect(result).toMatchObject({
        success: true,
        summary: {
          totalP4KItems: 1,
          validP4KItems: 1,
          matched: 1,
          updated: 1,
        },
      })
    })

    it("should handle ZIP extraction errors", async () => {
      const mockFile = mockUploadedFile({
        originalname: "game-data.zip",
        mimetype: "application/zip",
        path: "/tmp/upload-123",
        size: 5000,
      })
      mockRequest.file = mockFile

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)

      // Mock execSync to throw error
      const { execSync } = await import("child_process")
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("Invalid ZIP file")
      })

      const result = await controller.importGameData(mockRequest as ExpressRequest)

      expect(result).toMatchObject({
        success: false,
        error: "Failed to extract ZIP file",
      })
    })

    it("should handle missing game-data.json in ZIP", async () => {
      const mockFile = mockUploadedFile({
        originalname: "game-data.zip",
        mimetype: "application/zip",
        path: "/tmp/upload-123",
        size: 5000,
      })
      mockRequest.file = mockFile

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const { execSync } = await import("child_process")
      vi.mocked(execSync).mockReturnValue(Buffer.from(""))

      const result = await controller.importGameData(mockRequest as ExpressRequest)

      expect(result).toMatchObject({
        success: false,
        error: "Invalid ZIP structure",
      })
    })

    it("should handle invalid JSON format", async () => {
      const mockFile = mockUploadedFile({
        originalname: "game-data.zip",
        mimetype: "application/zip",
        path: "/tmp/upload-123",
        size: 5000,
      })
      mockRequest.file = mockFile

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json")

      const { execSync } = await import("child_process")
      vi.mocked(execSync).mockReturnValue(Buffer.from(""))

      const result = await controller.importGameData(mockRequest as ExpressRequest)

      expect(result).toMatchObject({
        success: false,
        error: "Failed to parse game-data.json",
      })
    })

    it("should handle missing items array in JSON", async () => {
      const mockFile = mockUploadedFile({
        originalname: "game-data.zip",
        mimetype: "application/zip",
        path: "/tmp/upload-123",
        size: 5000,
      })
      mockRequest.file = mockFile

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ data: "test" }))

      const { execSync } = await import("child_process")
      vi.mocked(execSync).mockReturnValue(Buffer.from(""))

      const result = await controller.importGameData(mockRequest as ExpressRequest)

      expect(result).toMatchObject({
        success: false,
        error: "Invalid game-data.json structure",
      })
    })

    it("should clean up temporary files on success", async () => {
      const mockFile = mockUploadedFile({
        originalname: "game-data.zip",
        mimetype: "application/zip",
        path: "/tmp/upload-123",
        size: 5000,
      })
      mockRequest.file = mockFile

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          items: [{ id: "1", name: "Test", type: "Cargo", file: "test.xml" }],
        }),
      )
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined)
      vi.mocked(fs.rmSync).mockImplementation(() => undefined)

      const { execSync } = await import("child_process")
      vi.mocked(execSync).mockReturnValue(Buffer.from(""))

      vi.mocked(gameDataImportService.importGameData).mockResolvedValue({
        ...emptyImportStats,
        totalP4KItems: 1,
        validP4KItems: 1,
        inserted: 1,
      })

      await controller.importGameData(mockRequest as ExpressRequest)

      expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/upload-123")
      expect(fs.rmSync).toHaveBeenCalled()
    })

    it("should clean up temporary files on error", async () => {
      const mockFile = mockUploadedFile({
        originalname: "game-data.zip",
        mimetype: "application/zip",
        path: "/tmp/upload-123",
        size: 5000,
      })
      mockRequest.file = mockFile

      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          items: [{ id: "1", name: "Test", type: "Cargo", file: "test.xml" }],
        }),
      )
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined)
      vi.mocked(fs.rmSync).mockImplementation(() => undefined)

      const { execSync } = await import("child_process")
      vi.mocked(execSync).mockReturnValue(Buffer.from(""))

      vi.mocked(gameDataImportService.importGameData).mockRejectedValue(
        new Error("Database error"),
      )

      await controller.importGameData(mockRequest as ExpressRequest)

      expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/upload-123")
      expect(fs.rmSync).toHaveBeenCalled()
    })
  })
})
