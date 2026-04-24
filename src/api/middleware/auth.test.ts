import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Request, Response, NextFunction } from "express"
import {
  userAuthorized,
  adminAuthorized,
  verifiedUser,
} from "./auth.js"
import { clearMockData } from "../../test-utils/mockDatabase.js"
import { createTestUser } from "../../test-utils/testFixturesMock.js"

/**
 * These tests verify the simplified auth middleware.
 *
 * In production, `populate-user` middleware runs first and sets req.user.
 * These middleware functions just check req.user exists and meets conditions.
 */

function mockReq(user?: any): Request {
  return { user, headers: {}, isAuthenticated: () => !!user } as unknown as Request
}

function mockRes() {
  let _status = 0
  let _data: any = null
  const res = {
    status: (code: number) => { _status = code; return res },
    json: (data: any) => { _data = data; return res },
    get statusCode() { return _status },
    get responseData() { return _data },
  } as unknown as Response & { statusCode: number; responseData: any }
  return res
}

describe("Authentication Middleware", () => {
  beforeEach(() => clearMockData())
  afterEach(() => clearMockData())

  describe("userAuthorized", () => {
    it("should allow access when req.user is set", async () => {
      const user = createTestUser()
      const req = mockReq(user)
      const res = mockRes()
      let nextCalled = false

      await userAuthorized(req, res, () => { nextCalled = true })

      expect(nextCalled).toBe(true)
    })

    it("should reject when no user", async () => {
      const req = mockReq()
      const res = mockRes()
      let nextCalled = false

      await userAuthorized(req, res, () => { nextCalled = true })

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(401)
    })

    it("should reject banned user", async () => {
      const user = createTestUser({ banned: true })
      const req = mockReq(user)
      const res = mockRes()
      let nextCalled = false

      await userAuthorized(req, res, () => { nextCalled = true })

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(418)
    })
  })

  describe("adminAuthorized", () => {
    it("should allow admin user", async () => {
      const user = createTestUser({ role: "admin" })
      const req = mockReq(user)
      const res = mockRes()
      let nextCalled = false

      await adminAuthorized(req, res, () => { nextCalled = true })

      expect(nextCalled).toBe(true)
    })

    it("should reject non-admin user", async () => {
      const user = createTestUser({ role: "user" })
      const req = mockReq(user)
      const res = mockRes()
      let nextCalled = false

      await adminAuthorized(req, res, () => { nextCalled = true })

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(403)
    })

    it("should reject when no user", async () => {
      const req = mockReq()
      const res = mockRes()
      let nextCalled = false

      await adminAuthorized(req, res, () => { nextCalled = true })

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(401)
    })
  })

  describe("verifiedUser", () => {
    it("should return true for verified user", async () => {
      const user = createTestUser({ rsi_confirmed: true })
      const req = mockReq(user)
      const res = mockRes()

      expect(await verifiedUser(req, res)).toBe(true)
    })

    it("should return false for unverified user", async () => {
      const user = createTestUser({ rsi_confirmed: false })
      const req = mockReq(user)
      const res = mockRes()

      expect(await verifiedUser(req, res)).toBe(false)
      expect(res.statusCode).toBe(401)
    })

    it("should allow unverified when allowUnverified=true", async () => {
      const user = createTestUser({ rsi_confirmed: false })
      const req = mockReq(user)
      const res = mockRes()

      expect(await verifiedUser(req, res, true)).toBe(true)
    })

    it("should return false when no user", async () => {
      const req = mockReq()
      const res = mockRes()

      expect(await verifiedUser(req, res)).toBe(false)
      expect(res.statusCode).toBe(401)
    })
  })
})
