/**
 * Mock authentication utilities for testing
 * These work with mocked database
 */

import { createTestUser, TestUser } from "./testFixturesMock.js"
import {
  setupMockTableData,
  getMockTableData,
  type DBUser,
} from "./mockDatabase.js"
import crypto from "crypto"
import { v4 as uuidv4 } from "uuid"

export interface TestUserWithAuth extends TestUser {
  token: string
  sessionId?: string
}

/**
 * Create a test user with authentication token (mock)
 */
export function createTestUserWithAuth(
  overrides?: Partial<TestUser>,
): TestUserWithAuth {
  const user = createTestUser(overrides)

  // Generate a test API token (format: scm_...)
  const token = `scm_test_${uuidv4()}_${Date.now()}`
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex")

  // Store token in mock data
  const tokens = getMockTableData("api_tokens")
  tokens.push({
    id: uuidv4(),
    user_id: user.user_id,
    name: "Test Token",
    token_hash: tokenHash,
    scopes: ["read", "write"],
    created_at: new Date(),
    last_used_at: new Date(),
    expires_at: null,
  })
  setupMockTableData("api_tokens", tokens)

  return {
    ...user,
    token,
  }
}

/**
 * Get authorization headers for a test user
 */
export function getAuthHeaders(user: TestUserWithAuth): {
  Authorization: string
} {
  return {
    Authorization: `Bearer ${user.token}`,
  }
}

/**
 * Create an admin test user (mock)
 */
export function createAdminUser(
  overrides?: Partial<TestUser>,
): TestUserWithAuth {
  const user = createTestUserWithAuth({
    ...overrides,
    role: "admin",
  })

  // Update mock data
  const accounts = getMockTableData("accounts")
  const accountIndex = accounts.findIndex(
    (a) => a.user_id === user.user_id,
  )
  if (accountIndex >= 0) {
    accounts[accountIndex].role = "admin"
    setupMockTableData("accounts", accounts)
  }

  return user
}

/**
 * Create an owner test user (mock)
 */
export function createOwnerUser(
  contractorId: string,
  overrides?: Partial<TestUser>,
): TestUserWithAuth {
  const user = createTestUserWithAuth(overrides)

  // Add to contractor member roles in mock data
  const roles = getMockTableData("contractor_member_roles")
  roles.push({
    user_id: user.user_id,
    role_id: "owner_role_id", // Mock role ID (contractor_member_roles doesn't have contractor_id)
  })
  setupMockTableData("contractor_member_roles", roles)

  return user
}
