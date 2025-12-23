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
import {
  setupTestDb,
  teardownTestDb,
  beginTransaction,
  rollbackTransaction,
} from "./testDb.js"
import { createTestUser } from "./testFixtures.js"
import { createTestUserWithAuth, getAuthHeaders } from "./testAuth.js"
import { createTestServer } from "./testServer.js"
import request from "supertest"

describe("Example Test Suite", () => {
  beforeAll(async () => {
    await setupTestDb()
  })

  afterAll(async () => {
    await teardownTestDb()
  })

  beforeEach(async () => {
    // Start a transaction for each test to ensure isolation
    await beginTransaction()
  })

  afterEach(async () => {
    // Rollback transaction after each test
    await rollbackTransaction()
  })

  it("should create a test user", async () => {
    const user = await createTestUser({
      username: "testuser",
      balance: 1000,
    })

    expect(user).toBeDefined()
    expect(user.username).toBe("testuser")
    expect(user.balance).toBe(1000)
  })

  it("should create a test user with auth token", async () => {
    const user = await createTestUserWithAuth({
      username: "authtest",
    })

    expect(user).toBeDefined()
    expect(user.token).toBeDefined()
    expect(user.token).toMatch(/^scm_/)
  })

  it("should make an authenticated API request", async () => {
    const app = createTestServer()
    const user = await createTestUserWithAuth()

    const response = await request(app)
      .get("/api/v1/profiles/me")
      .set(getAuthHeaders(user))
      .expect(200)

    expect(response.body).toBeDefined()
  })
})
