/**
 * Example test file demonstrating how to use the test utilities
 * This file can be deleted once real tests are written
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest"
import { clearMockData } from "./mockDatabase.js"
import { createTestUser } from "./testFixturesMock.js"
import { createTestUserWithAuth, getAuthHeaders } from "./testAuthMock.js"

describe("Example Test Suite", () => {
  beforeEach(() => {
    clearMockData()
  })

  afterEach(() => {
    clearMockData()
  })

  it("should create a test user", () => {
    const user = createTestUser({
      username: "testuser",
      balance: 1000,
    })

    expect(user).toBeDefined()
    expect(user.username).toBe("testuser")
    expect(user.balance).toBe(1000)
  })

  it("should create a test user with auth token", () => {
    const user = createTestUserWithAuth({
      username: "authtest",
    })

    expect(user).toBeDefined()
    expect(user.token).toBeDefined()
    expect(user.token).toMatch(/^scm_/)
  })

  it("should create auth headers for API requests", () => {
    const user = createTestUserWithAuth()
    const headers = getAuthHeaders(user)

    expect(headers).toBeDefined()
    expect(headers.Authorization).toBeDefined()
    expect(headers.Authorization).toMatch(/^Bearer scm_/)
  })
})
