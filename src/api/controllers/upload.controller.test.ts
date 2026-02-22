/**
 * Unit tests for UploadController
 *
 * Tests file upload functionality including:
 * - Successful photo uploads
 * - File validation (size, type)
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { UploadController } from "./upload.controller.js"
import { Request as ExpressRequest } from "express"
import { User } from "../routes/v1/api-models.js"
import { ValidationErrorClass } from "./base.controller.js"

// Mock dependencies
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: {
    uploadFile: vi.fn(),
    getFileLinkResource: vi.fn(),
  },
}))

vi.mock("../../logger/logger.js", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("../middleware/tsoa-ratelimit.js", () => ({
  tsoaWriteRateLimit: vi.fn((req, res, next) => next()),
}))

vi.mock("../routes/v1/util/upload.js", () => ({
  singlePhotoUpload: {
    single: vi.fn(() => (req: any, res: any, next: any) => next()),
  },
}))

import { cdn } from "../../clients/cdn/cdn.js"

describe("UploadController", () => {
  let controller: UploadController
  let mockRequest: Partial<ExpressRequest>
  let mockUser: User

  beforeEach(() => {
    controller = new UploadController()
    
    mockUser = {
      user_id: "test-user-123",
      username: "testuser",
      display_name: "Test User",
      role: "user",
      banned: false,
      rsi_confirmed: true,
    } as User

    mockRequest = {
      user: mockUser,
      ip: "127.0.0.1",
    }

    vi.clearAllMocks()
  })

  describe("uploadPhoto", () => {
    it("should successfully upload a valid photo", async () => {
      // Arrange
      const mockFile: Express.Multer.File = {
        fieldname: "photo",
        originalname: "test-photo.jpg",
        encoding: "7bit",
        mimetype: "image/jpeg",
        size: 1000000, // 1MB
        destination: "uploads/",
        filename: "test-file.jpg",
        path: "uploads/test-file.jpg",
        buffer: Buffer.from(""),
        stream: {} as any,
      }

      mockRequest.file = mockFile

      const mockResource = {
        resource_id: "resource-123",
        filename: "test-photo.jpg",
      }

      const mockUrl = "https://cdn.example.com/resource-123.jpg"

      vi.mocked(cdn.uploadFile).mockResolvedValue(mockResource)
      vi.mocked(cdn.getFileLinkResource).mockResolvedValue(mockUrl)

      // Act
      const result = await controller.uploadPhoto(
        mockFile,
        mockRequest as ExpressRequest,
      )

      // Assert
      expect(result.data).toMatchObject({
        resource_id: "resource-123",
        url: mockUrl,
        filename: "test-photo.jpg",
        size: 1000000,
        mimetype: "image/jpeg",
      })
      expect(result.data.uploaded_at).toBeDefined()
      expect(cdn.uploadFile).toHaveBeenCalledWith(
        expect.stringContaining("test-user-123_photo_"),
        "uploads/test-file.jpg",
        "image/jpeg",
      )
      expect(cdn.getFileLinkResource).toHaveBeenCalledWith("resource-123")
    })

    it("should reject file that is too large", async () => {
      // Arrange
      const mockFile: Express.Multer.File = {
        fieldname: "photo",
        originalname: "large-photo.jpg",
        encoding: "7bit",
        mimetype: "image/jpeg",
        size: 3000000, // 3MB (exceeds 2.5MB limit)
        destination: "uploads/",
        filename: "large-file.jpg",
        path: "uploads/large-file.jpg",
        buffer: Buffer.from(""),
        stream: {} as any,
      }

      mockRequest.file = mockFile

      // Act & Assert
      await expect(
        controller.uploadPhoto(mockFile, mockRequest as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject invalid file type", async () => {
      // Arrange
      const mockFile: Express.Multer.File = {
        fieldname: "photo",
        originalname: "document.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: 1000000,
        destination: "uploads/",
        filename: "document.pdf",
        path: "uploads/document.pdf",
        buffer: Buffer.from(""),
        stream: {} as any,
      }

      mockRequest.file = mockFile

      // Act & Assert
      await expect(
        controller.uploadPhoto(mockFile, mockRequest as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should reject when no file is provided", async () => {
      // Arrange
      mockRequest.file = undefined

      // Act & Assert
      await expect(
        controller.uploadPhoto(undefined as any, mockRequest as ExpressRequest),
      ).rejects.toThrow()
    })

    it("should accept all valid image types", async () => {
      // Arrange
      const validMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ]

      for (const mimetype of validMimeTypes) {
        const mockFile: Express.Multer.File = {
          fieldname: "photo",
          originalname: `test.${mimetype.split("/")[1]}`,
          encoding: "7bit",
          mimetype,
          size: 1000000,
          destination: "uploads/",
          filename: "test-file",
          path: "uploads/test-file",
          buffer: Buffer.from(""),
          stream: {} as any,
        }

        mockRequest.file = mockFile

        const mockResource = {
          resource_id: `resource-${mimetype}`,
          filename: mockFile.originalname,
        }

        const mockUrl = `https://cdn.example.com/${mockResource.resource_id}`

        vi.mocked(cdn.uploadFile).mockResolvedValue(mockResource)
        vi.mocked(cdn.getFileLinkResource).mockResolvedValue(mockUrl)

        // Act
        const result = await controller.uploadPhoto(
          mockFile,
          mockRequest as ExpressRequest,
        )

        // Assert
        expect(result.data.mimetype).toBe(mimetype)
        expect(result.data.resource_id).toBe(mockResource.resource_id)
      }
    })

    it("should handle CDN upload errors", async () => {
      // Arrange
      const mockFile: Express.Multer.File = {
        fieldname: "photo",
        originalname: "test-photo.jpg",
        encoding: "7bit",
        mimetype: "image/jpeg",
        size: 1000000,
        destination: "uploads/",
        filename: "test-file.jpg",
        path: "uploads/test-file.jpg",
        buffer: Buffer.from(""),
        stream: {} as any,
      }

      mockRequest.file = mockFile

      vi.mocked(cdn.uploadFile).mockRejectedValue(
        new Error("CDN upload failed"),
      )

      // Act & Assert
      await expect(
        controller.uploadPhoto(mockFile, mockRequest as ExpressRequest),
      ).rejects.toThrow()
    })
  })
})
