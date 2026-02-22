import { Request } from "express"
import { describe, it, expect, beforeEach, vi } from "vitest"
import crypto from "crypto"

// Mock dependencies before imports
vi.mock("../../clients/database/knex-db.js", () => ({
  database: {
    knex: vi.fn(),
  },
}))

vi.mock("../routes/v1/profiles/database.js", () => ({
  getUser: vi.fn(),
}))

vi.mock("../../logger/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// Import after mocks
import { expressAuthentication } from "./tsoa-auth.js"
import { User } from "../routes/v1/api-models.js"
import { database } from "../../clients/database/knex-db.js"
import * as profileDb from "../routes/v1/profiles/database.js"

describe("expressAuthentication", () => {
  let mockRequest: Partial<Request>
  let mockUser: User

  beforeEach(() => {
    mockUser = {
      user_id: "test-user-id",
      display_name: "Test User",
      profile_description: "Test description",
      role: "user",
      banned: false,
      username: "testuser",
      avatar: "avatar.jpg",
      banner: "banner.jpg",
      balance: "100.00",
      created_at: new Date(),
      locale: "en",
      rsi_confirmed: true,
      spectrum_user_id: "spectrum-123",
      discord_access_token: null,
      discord_refresh_token: null,
      official_server_id: null,
      discord_thread_channel_id: null,
      market_order_template: "default",
    }

    mockRequest = {
      headers: {},
      isAuthenticated: vi.fn() as any,
      user: undefined,
    }

    vi.clearAllMocks()
  })

  describe("sessionAuth", () => {
    it("should authenticate valid session user", async () => {
      mockRequest.isAuthenticated = vi.fn().mockReturnValue(true) as any
      mockRequest.user = mockUser

      const result = await expressAuthentication(
        mockRequest as Request,
        "sessionAuth",
      )

      expect(result).toEqual(mockUser)
      expect(mockRequest.isAuthenticated).toHaveBeenCalled()
    })

    it("should reject unauthenticated session", async () => {
      mockRequest.isAuthenticated = vi.fn().mockReturnValue(false) as any

      await expect(
        expressAuthentication(mockRequest as Request, "sessionAuth"),
      ).rejects.toThrow("Not authenticated")
    })

    it("should reject banned user", async () => {
      mockRequest.isAuthenticated = vi.fn().mockReturnValue(true) as any
      mockRequest.user = { ...mockUser, banned: true }

      await expect(
        expressAuthentication(mockRequest as Request, "sessionAuth"),
      ).rejects.toThrow("User is banned")
    })

    it("should enforce admin scope", async () => {
      mockRequest.isAuthenticated = vi.fn().mockReturnValue(true) as any
      mockRequest.user = mockUser

      await expect(
        expressAuthentication(mockRequest as Request, "sessionAuth", ["admin"]),
      ).rejects.toThrow("Admin access required")
    })

    it("should allow admin user with admin scope", async () => {
      mockRequest.isAuthenticated = vi.fn().mockReturnValue(true) as any
      mockRequest.user = { ...mockUser, role: "admin" }

      const result = await expressAuthentication(
        mockRequest as Request,
        "sessionAuth",
        ["admin"],
      )

      expect(result).toEqual({ ...mockUser, role: "admin" })
    })
  })

  describe("bearerAuth", () => {
    const validToken = "scm_test_token_123"
    const tokenHash = crypto
      .createHash("sha256")
      .update(validToken)
      .digest("hex")

    beforeEach(() => {
      // Mock database token lookup
      const mockKnex = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn(),
        update: vi.fn(),
      }
      ;(database.knex as any) = vi.fn().mockReturnValue(mockKnex)
    })

    it("should authenticate valid bearer token", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const tokenRecord = {
        id: "token-id",
        user_id: "test-user-id",
        name: "Test Token",
        scopes: ["market:read", "market:write"],
        expires_at: null,
        contractor_ids: [],
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(tokenRecord)
      ;(profileDb.getUser as any) = vi.fn().mockResolvedValue(mockUser)

      const result = await expressAuthentication(
        mockRequest as Request,
        "bearerAuth",
      )

      expect(result).toEqual(mockUser)
      expect(profileDb.getUser).toHaveBeenCalledWith({
        user_id: "test-user-id",
      })
    })

    it("should reject missing bearer token", async () => {
      mockRequest.headers = {}

      await expect(
        expressAuthentication(mockRequest as Request, "bearerAuth"),
      ).rejects.toThrow("No bearer token provided")
    })

    it("should reject invalid token format", async () => {
      mockRequest.headers = {
        authorization: "Bearer invalid_token",
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(null)

      await expect(
        expressAuthentication(mockRequest as Request, "bearerAuth"),
      ).rejects.toThrow("Invalid or expired token")
    })

    it("should reject expired token", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(null) // Token not found (expired)

      await expect(
        expressAuthentication(mockRequest as Request, "bearerAuth"),
      ).rejects.toThrow("Invalid or expired token")
    })

    it("should reject token for banned user", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const tokenRecord = {
        id: "token-id",
        user_id: "test-user-id",
        name: "Test Token",
        scopes: ["market:read"],
        expires_at: null,
        contractor_ids: [],
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(tokenRecord)
      ;(profileDb.getUser as any) = vi.fn().mockResolvedValue({
        ...mockUser,
        banned: true,
      })

      await expect(
        expressAuthentication(mockRequest as Request, "bearerAuth"),
      ).rejects.toThrow("Invalid or expired token")
    })

    it("should enforce token scopes", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const tokenRecord = {
        id: "token-id",
        user_id: "test-user-id",
        name: "Test Token",
        scopes: ["market:read"], // Only read scope
        expires_at: null,
        contractor_ids: [],
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(tokenRecord)
      ;(profileDb.getUser as any) = vi.fn().mockResolvedValue(mockUser)

      await expect(
        expressAuthentication(mockRequest as Request, "bearerAuth", [
          "market:write",
        ]),
      ).rejects.toThrow("Insufficient permissions")
    })

    it("should allow token with required scope", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const tokenRecord = {
        id: "token-id",
        user_id: "test-user-id",
        name: "Test Token",
        scopes: ["market:read", "market:write"],
        expires_at: null,
        contractor_ids: [],
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(tokenRecord)
      ;(profileDb.getUser as any) = vi.fn().mockResolvedValue(mockUser)

      const result = await expressAuthentication(
        mockRequest as Request,
        "bearerAuth",
        ["market:write"],
      )

      expect(result).toEqual(mockUser)
    })

    it("should allow admin scope token", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const tokenRecord = {
        id: "token-id",
        user_id: "test-user-id",
        name: "Admin Token",
        scopes: ["admin"], // Admin has all scopes
        expires_at: null,
        contractor_ids: [],
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(tokenRecord)
      ;(profileDb.getUser as any) = vi.fn().mockResolvedValue(mockUser)

      const result = await expressAuthentication(
        mockRequest as Request,
        "bearerAuth",
        ["market:write", "orders:write"],
      )

      expect(result).toEqual(mockUser)
    })

    it("should allow full scope token", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const tokenRecord = {
        id: "token-id",
        user_id: "test-user-id",
        name: "Full Access Token",
        scopes: ["full"], // Full has all non-admin scopes
        expires_at: null,
        contractor_ids: [],
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(tokenRecord)
      ;(profileDb.getUser as any) = vi.fn().mockResolvedValue(mockUser)

      const result = await expressAuthentication(
        mockRequest as Request,
        "bearerAuth",
        ["market:write", "orders:write"],
      )

      expect(result).toEqual(mockUser)
    })

    it("should update last_used_at timestamp", async () => {
      mockRequest.headers = {
        authorization: `Bearer ${validToken}`,
      }

      const tokenRecord = {
        id: "token-id",
        user_id: "test-user-id",
        name: "Test Token",
        scopes: ["market:read"],
        expires_at: null,
        contractor_ids: [],
      }

      const mockKnex = database.knex("api_tokens") as any
      mockKnex.first.mockResolvedValue(tokenRecord)
      ;(profileDb.getUser as any) = vi.fn().mockResolvedValue(mockUser)

      await expressAuthentication(mockRequest as Request, "bearerAuth")

      expect(mockKnex.update).toHaveBeenCalledWith(
        expect.objectContaining({
          last_used_at: expect.any(Date),
        }),
      )
    })
  })

  describe("unknown security scheme", () => {
    it("should reject unknown security scheme", async () => {
      await expect(
        expressAuthentication(mockRequest as Request, "unknownAuth"),
      ).rejects.toThrow("Unknown security scheme")
    })
  })
})
