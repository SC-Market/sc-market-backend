import { getTestDatabase } from "./testDb.js"
import { v4 as uuidv4 } from "uuid"
import type { Knex } from "knex"

/**
 * Test data factories and fixtures
 * These functions create test data in the database
 */

export interface TestUser {
  user_id: string
  username: string
  email?: string
  discord_id?: string
  spectrum_id?: string
  balance?: number
}

export interface TestOrder {
  order_id: string
  user_id: string
  contractor_id?: string
  status?: string
}

export interface TestTransaction {
  transaction_id: string
  from_user_id: string
  to_user_id: string
  amount: number
}

export interface TestContractor {
  contractor_id: string
  spectrum_id: string
  name: string
  owner_user_id?: string
}

/**
 * Create a test user in the database
 */
export async function createTestUser(
  overrides?: Partial<TestUser>,
): Promise<TestUser> {
  const db = getTestDatabase()
  const user_id = overrides?.user_id || uuidv4()

  const userData = {
    user_id,
    username: overrides?.username || `testuser_${Date.now()}`,
    email: overrides?.email || `test_${user_id}@example.com`,
    discord_id: overrides?.discord_id || `discord_${user_id}`,
    spectrum_id: overrides?.spectrum_id || `spectrum_${user_id}`,
    balance: overrides?.balance ?? 1000,
    created_at: new Date(),
    updated_at: new Date(),
  }

  await db.knex("accounts").insert(userData)

  return {
    user_id,
    username: userData.username,
    email: userData.email,
    discord_id: userData.discord_id,
    spectrum_id: userData.spectrum_id,
    balance: userData.balance,
  }
}

/**
 * Create a test contractor/organization
 */
export async function createTestContractor(
  overrides?: Partial<TestContractor>,
): Promise<TestContractor> {
  const db = getTestDatabase()
  const contractor_id = overrides?.contractor_id || uuidv4()
  const spectrum_id = overrides?.spectrum_id || `test_contractor_${Date.now()}`

  const contractorData = {
    contractor_id,
    spectrum_id,
    name: overrides?.name || `Test Contractor ${Date.now()}`,
    created_at: new Date(),
    updated_at: new Date(),
  }

  await db.knex("contractors").insert(contractorData)

  return {
    contractor_id,
    spectrum_id,
    name: contractorData.name,
    owner_user_id: overrides?.owner_user_id,
  }
}

/**
 * Create a test order
 */
export async function createTestOrder(
  overrides?: Partial<TestOrder>,
): Promise<TestOrder> {
  const db = getTestDatabase()
  const order_id = overrides?.order_id || uuidv4()

  // Create a user if not provided
  let user_id = overrides?.user_id
  if (!user_id) {
    const user = await createTestUser()
    user_id = user.user_id
  }

  const orderData = {
    order_id,
    user_id,
    contractor_id: overrides?.contractor_id || null,
    status: overrides?.status || "pending",
    created_at: new Date(),
    updated_at: new Date(),
  }

  await db.knex("orders").insert(orderData)

  return {
    order_id,
    user_id,
    contractor_id: orderData.contractor_id || undefined,
    status: orderData.status,
  }
}

/**
 * Create a test transaction
 */
export async function createTestTransaction(
  overrides?: Partial<TestTransaction>,
): Promise<TestTransaction> {
  const db = getTestDatabase()
  const transaction_id = overrides?.transaction_id || uuidv4()

  // Create users if not provided
  let from_user_id = overrides?.from_user_id
  let to_user_id = overrides?.to_user_id

  if (!from_user_id) {
    const user = await createTestUser()
    from_user_id = user.user_id
  }

  if (!to_user_id) {
    const user = await createTestUser()
    to_user_id = user.user_id
  }

  const amount = overrides?.amount || 100

  const transactionData = {
    transaction_id,
    from_user_id,
    to_user_id,
    amount,
    created_at: new Date(),
  }

  await db.knex("transactions").insert(transactionData)

  return {
    transaction_id,
    from_user_id,
    to_user_id,
    amount,
  }
}

/**
 * Clean up test data
 */
export async function cleanupTestData(): Promise<void> {
  const db = getTestDatabase()

  // Delete in reverse order of dependencies
  await db.knex("transactions").delete()
  await db.knex("orders").delete()
  await db.knex("contractors").delete()
  await db.knex("accounts").delete()
}
