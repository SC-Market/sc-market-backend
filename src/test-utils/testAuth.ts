import { createTestUser, TestUser } from "./testFixtures.js"
import { getTestDatabase } from "./testDb.js"
import crypto from "crypto"
import { v4 as uuidv4 } from "uuid"

export interface TestUserWithAuth extends TestUser {
  token: string
  sessionId?: string
}

/**
 * Create a test user with authentication token
 * Tokens are stored in the api_tokens table with a hash
 */
export async function createTestUserWithAuth(
  overrides?: Partial<TestUser>,
): Promise<TestUserWithAuth> {
  const user = await createTestUser(overrides)
  const db = getTestDatabase()

  // Generate a test API token (format: scm_...)
  const token = `scm_test_${uuidv4()}_${Date.now()}`
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex")

  // Store token in database
  await db.knex("api_tokens").insert({
    id: uuidv4(),
    user_id: user.user_id,
    name: "Test Token",
    token_hash: tokenHash,
    scopes: ["read", "write"],
    created_at: new Date(),
    last_used_at: new Date(),
  })

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
 * Create an admin test user
 */
export async function createAdminUser(
  overrides?: Partial<TestUser>,
): Promise<TestUserWithAuth> {
  const user = await createTestUserWithAuth(overrides)

  // Set admin flag or role
  // Adjust this based on your actual admin logic
  const db = (await import("./testDb.js")).getTestDatabase()
  await db
    .knex("accounts")
    .where({ user_id: user.user_id })
    .update({ is_admin: true })

  return user
}

/**
 * Create an owner test user (for contractor ownership)
 */
export async function createOwnerUser(
  contractorId: string,
  overrides?: Partial<TestUser>,
): Promise<TestUserWithAuth> {
  const user = await createTestUserWithAuth(overrides)

  // Assign owner role
  // Adjust this based on your actual role assignment logic
  const db = (await import("./testDb.js")).getTestDatabase()
  const contractor = await db
    .knex("contractors")
    .where({ contractor_id: contractorId })
    .first()

  if (contractor && contractor.owner_role) {
    await db.knex("contractor_member_roles").insert({
      user_id: user.user_id,
      contractor_id: contractorId,
      role_id: contractor.owner_role,
    })
  }

  return user
}

/**
 * Create a test session (for session-based auth)
 */
export async function createTestSession(
  user: TestUserWithAuth,
): Promise<string> {
  // Generate a session ID
  // Adjust this based on your actual session creation logic
  const sessionId = `test_session_${Date.now()}_${Math.random()}`

  // Store session in database if needed
  // This depends on your session storage implementation

  return sessionId
}
