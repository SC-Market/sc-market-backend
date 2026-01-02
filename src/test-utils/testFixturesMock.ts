/**
 * Mock test fixtures that don't require a real database
 * These create test data objects without hitting the database
 */

import { v4 as uuidv4 } from "uuid"
import {
  setupMockTableData,
  getMockTableData,
  clearMockData,
  setupMockTableDataGeneric,
  getMockTableDataGeneric,
  type DBUser,
  type DBContractor,
  type DBTransaction,
} from "./mockDatabase.js"

export interface TestUser {
  user_id: string
  username: string
  email?: string
  discord_id?: string
  spectrum_id?: string
  balance?: number
  role?: "user" | "admin"
  banned?: boolean
  rsi_confirmed?: boolean
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
 * Create a test user (mock - doesn't hit database)
 */
export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  const user_id = overrides?.user_id || uuidv4()

  const user: TestUser = {
    user_id,
    username: overrides?.username || `testuser_${Date.now()}`,
    email: overrides?.email || `test_${user_id}@example.com`,
    discord_id: overrides?.discord_id || `discord_${user_id}`,
    spectrum_id: overrides?.spectrum_id || `spectrum_${user_id}`,
    balance: overrides?.balance ?? 1000,
    role: overrides?.role || "user",
    banned: overrides?.banned ?? false,
    rsi_confirmed: overrides?.rsi_confirmed ?? true,
  }

  // Convert TestUser to DBUser and add to mock data
  const dbUser: DBUser = {
    user_id: user.user_id,
    username: user.username,
    discord_id: user.discord_id || null,
    display_name: user.username,
    profile_description: "",
    role: user.role || "user",
    banned: user.banned || false,
    avatar: "",
    banner: "",
    balance: (user.balance || 0).toString(),
    created_at: new Date(),
    locale: "en",
    rsi_confirmed: user.rsi_confirmed || false,
    spectrum_user_id: user.spectrum_id || null,
    official_server_id: null,
    discord_thread_channel_id: null,
    market_order_template: "",
    supported_languages: ["en"],
  }
  const accounts = getMockTableData("accounts")
  accounts.push(dbUser)
  setupMockTableData("accounts", accounts)

  return user
}

/**
 * Create a test contractor (mock)
 */
export function createTestContractor(
  overrides?: Partial<TestContractor>,
): TestContractor {
  const contractor_id = overrides?.contractor_id || uuidv4()
  const spectrum_id = overrides?.spectrum_id || `test_contractor_${Date.now()}`

  const contractor: TestContractor = {
    contractor_id,
    spectrum_id,
    name: overrides?.name || `Test Contractor ${Date.now()}`,
    owner_user_id: overrides?.owner_user_id,
  }

  // Convert TestContractor to DBContractor and add to mock data
  const dbContractor: DBContractor = {
    contractor_id: contractor.contractor_id,
    spectrum_id: contractor.spectrum_id,
    kind: "org",
    size: 1,
    name: contractor.name,
    description: "",
    avatar: "",
    balance: "0",
    default_role: "member",
    owner_role: "owner",
    official_server_id: null,
    discord_thread_channel_id: null,
    banner: "",
    market_order_template: "",
    locale: "en",
    archived: false,
    supported_languages: ["en"],
  }
  const contractors = getMockTableData("contractors")
  contractors.push(dbContractor)
  setupMockTableData("contractors", contractors)

  return contractor
}

/**
 * Create a test order (mock)
 */
export function createTestOrder(overrides?: Partial<TestOrder>): TestOrder {
  const order_id = overrides?.order_id || uuidv4()

  // Create a user if not provided
  let user_id = overrides?.user_id
  if (!user_id) {
    const user = createTestUser()
    user_id = user.user_id
  }

  const order: TestOrder = {
    order_id,
    user_id,
    contractor_id: overrides?.contractor_id,
    status: overrides?.status || "pending",
  }

  // Add to mock data (orders is not a typed table, use generic)
  const orders = getMockTableDataGeneric("orders")
  orders.push(order as unknown as Record<string, unknown>)
  setupMockTableDataGeneric("orders", orders)

  return order
}

/**
 * Create a test transaction (mock)
 */
export function createTestTransaction(
  overrides?: Partial<TestTransaction>,
): TestTransaction {
  const transaction_id = overrides?.transaction_id || uuidv4()

  // Create users if not provided
  let from_user_id = overrides?.from_user_id
  let to_user_id = overrides?.to_user_id

  if (!from_user_id) {
    const user = createTestUser()
    from_user_id = user.user_id
  }

  if (!to_user_id) {
    const user = createTestUser()
    to_user_id = user.user_id
  }

  const amount = overrides?.amount || 100

  const transaction: TestTransaction = {
    transaction_id,
    from_user_id,
    to_user_id,
    amount,
  }

  // Convert TestTransaction to DBTransaction and add to mock data
  const dbTransaction: DBTransaction = {
    transaction_id: transaction.transaction_id,
    kind: "transfer",
    timestamp: new Date(),
    amount: transaction.amount.toString(),
    status: "completed",
    contractor_sender_id: "",
    contractor_recipient_id: "",
    user_sender_id: transaction.from_user_id,
    user_recipient_id: transaction.to_user_id,
  }
  const transactions = getMockTableData("transactions")
  transactions.push(dbTransaction)
  setupMockTableData("transactions", transactions)

  return transaction
}

/**
 * Clear all mock test data
 */
export function cleanupTestData(): void {
  clearMockData()
}
