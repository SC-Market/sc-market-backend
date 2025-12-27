import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Request, Response, NextFunction } from "express"
import {
  userAuthorized,
  adminAuthorized,
  verifiedUser,
  AuthRequest,
} from "./auth.js"
import { clearMockData } from "../../test-utils/mockDatabase.js"
import { createTestUser } from "../../test-utils/testFixturesMock.js"
import {
  createTestUserWithAuth,
  getAuthHeaders,
} from "../../test-utils/testAuthMock.js"
import crypto from "crypto"
import { v4 as uuidv4 } from "uuid"

describe("Authentication Middleware", () => {
  beforeEach(() => {
    clearMockData()
  })

  afterEach(() => {
    clearMockData()
  })

  describe("userAuthorized", () => {
    it("should allow access with valid token", async () => {
      const user = await createTestUserWithAuth()
      const req = {
        headers: {
          authorization: `Bearer ${user.token}`,
        },
        isAuthenticated: () => false,
      } as unknown as Request

      const res = {
        status: (code: number) => {
          expect(code).not.toBe(401)
          expect(code).not.toBe(403)
          return res
        },
        json: (data: any) => {
          // Should not be called for successful auth
          expect(true).toBe(false)
          return res
        },
      } as unknown as Response

      let nextCalled = false
      const next: NextFunction = () => {
        nextCalled = true
      }

      await userAuthorized(req, res, next)

      expect(nextCalled).toBe(true)
      expect((req as AuthRequest).user).toBeDefined()
      expect((req as AuthRequest).user?.user_id).toBe(user.user_id)
      expect((req as AuthRequest).authMethod).toBe("token")
    })

    it("should reject invalid token", async () => {
      const req = {
        headers: {
          authorization: "Bearer invalid_token_123",
        },
        isAuthenticated: () => false,
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      let nextCalled = false
      const next: NextFunction = () => {
        nextCalled = true
      }

      await userAuthorized(req, res, next)

      expect(nextCalled).toBe(false)
      expect(statusCode).toBe(401)
      expect(responseData).toHaveProperty("error")
    })

    it("should reject request without authorization header", async () => {
      const req = {
        headers: {},
        isAuthenticated: () => false,
      } as unknown as Request

      let statusCode = 0
      let responseData: any = null

      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => {
          responseData = data
          return res
        },
      } as unknown as Response

      let nextCalled = false
      const next: NextFunction = () => {
        nextCalled = true
      }

      await userAuthorized(req, res, next)

      expect(nextCalled).toBe(false)
      expect(statusCode).toBe(401)
      expect(responseData).toHaveProperty("error")
    })

    it("should reject expired token", async () => {
      const user = createTestUser()

      const expiredDate = new Date()
      expiredDate.setDate(expiredDate.getDate() - 1) // Yesterday

      // Add expired token to mock data
      const { setupMockTableData, getMockTableData } =
        await import("../../test-utils/mockDatabase.js")
      const tokens = getMockTableData("api_tokens")
      const expiredToken = `scm_test_expired_${Date.now()}`
      const expiredTokenHash = crypto
        .createHash("sha256")
        .update(expiredToken)
        .digest("hex")
      tokens.push({
        id: uuidv4(),
        user_id: user.user_id,
        name: "Expired Token",
        token_hash: expiredTokenHash,
        scopes: ["read", "write"],
        expires_at: expiredDate,
        created_at: new Date(),
        last_used_at: null,
      })
      setupMockTableData("api_tokens", tokens)

      const req = {
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
        isAuthenticated: () => false,
      } as unknown as Request

      let statusCode = 0
      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => res,
      } as unknown as Response

      let nextCalled = false
      const next: NextFunction = () => {
        nextCalled = true
      }

      await userAuthorized(req, res, next)

      expect(nextCalled).toBe(false)
      expect(statusCode).toBe(401)
    })
  })

  describe("adminAuthorized", () => {
    it("should allow access for admin user with token", async () => {
      const user = createTestUserWithAuth({ role: "admin" })

      const req = {
        headers: {
          authorization: `Bearer ${user.token}`,
        },
        isAuthenticated: () => false,
      } as unknown as Request

      let nextCalled = false
      const res = {
        status: (code: number) => {
          expect(code).not.toBe(401)
          expect(code).not.toBe(403)
          return res
        },
        json: (data: any) => {
          expect(true).toBe(false) // Should not be called
          return res
        },
      } as unknown as Response

      const next: NextFunction = () => {
        nextCalled = true
      }

      await adminAuthorized(req, res, next)

      expect(nextCalled).toBe(true)
      expect((req as AuthRequest).user).toBeDefined()
    })

    it("should reject non-admin user with token", async () => {
      const user = createTestUserWithAuth({ role: "user" })

      const req = {
        headers: {
          authorization: `Bearer ${user.token}`,
        },
        isAuthenticated: () => false,
      } as unknown as Request

      let statusCode = 0
      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => res,
      } as unknown as Response

      let nextCalled = false
      const next: NextFunction = () => {
        nextCalled = true
      }

      await adminAuthorized(req, res, next)

      expect(nextCalled).toBe(false)
      expect(statusCode).toBe(403)
    })
  })

  describe("verifiedUser", () => {
    it("should return true for verified user with token", async () => {
      const user = createTestUserWithAuth({ rsi_confirmed: true })

      const req = {
        headers: {
          authorization: `Bearer ${user.token}`,
        },
        isAuthenticated: () => false,
      } as unknown as Request

      const res = {
        status: (code: number) => res,
        json: (data: any) => res,
      } as unknown as Response

      const result = await verifiedUser(req, res)

      expect(result).toBe(true)
      expect((req as AuthRequest).user).toBeDefined()
    })

    it("should return false for unverified user with token", async () => {
      const user = createTestUserWithAuth({ rsi_confirmed: false })

      const req = {
        headers: {
          authorization: `Bearer ${user.token}`,
        },
        isAuthenticated: () => false,
      } as unknown as Request

      let statusCode = 0
      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => res,
      } as unknown as Response

      const result = await verifiedUser(req, res)

      expect(result).toBe(false)
      expect(statusCode).toBe(401)
    })

    it("should return false for invalid token", async () => {
      const req = {
        headers: {
          authorization: "Bearer invalid_token",
        },
        isAuthenticated: () => false,
      } as unknown as Request

      let statusCode = 0
      const res = {
        status: (code: number) => {
          statusCode = code
          return res
        },
        json: (data: any) => res,
      } as unknown as Response

      const result = await verifiedUser(req, res)

      expect(result).toBe(false)
      expect(statusCode).toBe(401)
    })
  })
})
