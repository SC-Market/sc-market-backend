import dotenv from "dotenv"
import { vi } from "vitest"
import {
  createMockKnex,
  getMockTableData,
  getMockTableDataGeneric,
  setupMockTableDataGeneric,
  type DBUser,
  type DBTransaction,
  type TableDataValue,
} from "./mockDatabase.js"

// Load environment variables
dotenv.config()

// Set test environment variables if not already set
process.env.NODE_ENV = process.env.NODE_ENV || "test"

// Create a mock knex instance
const mockKnex = createMockKnex()

// Mock the database singleton - this needs to be done before any imports
vi.mock("../clients/database/knex-db.js", () => {
  // Create a mock query builder that can chain
  const createQueryBuilder = (table: string) => {
    let filteredData: Record<string, unknown>[] = (
      getMockTableDataGeneric(table) as unknown[]
    ).map((item) => item as Record<string, unknown>)
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation((data: unknown) => {
        const tableData = getMockTableDataGeneric(table)
        const inserted = Array.isArray(data)
          ? (data as Record<string, unknown>[])
          : [data as Record<string, unknown>]
        tableData.push(...(inserted as TableDataValue[]))
        setupMockTableDataGeneric(table, tableData)
        return builder
      }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockImplementation(
          (
            columnOrFn: string | ((builder: unknown) => void),
            value?: unknown,
          ) => {
            if (typeof columnOrFn === "function") {
              // Handle callback pattern: where(function() { this.whereNull(...).orWhere(...) })
              const callbackBuilder = {
                whereNull: vi.fn().mockImplementation((col: string) => {
                  // Filter for null values
                  filteredData = filteredData.filter(
                    (row) => col in row && row[col] === null,
                  )
                  return callbackBuilder
                }),
                orWhere: vi
                  .fn()
                  .mockImplementation(
                    (col: string, op: string, val: unknown) => {
                      // For expires_at > new Date(), include non-expired tokens
                      if (op === ">") {
                        filteredData = filteredData.filter((row) => {
                          const colValue = col in row ? row[col] : null
                          return (
                            colValue === null ||
                            (colValue instanceof Date &&
                              colValue > (val as Date)) ||
                            (typeof colValue === "string" &&
                              new Date(colValue) > (val as Date))
                          )
                        })
                      }
                      return callbackBuilder
                    },
                  ),
              }
              columnOrFn.call(callbackBuilder, callbackBuilder)
            } else if (value !== undefined) {
              filteredData = filteredData.filter(
                (row) => columnOrFn in row && row[columnOrFn] === value,
              )
            }
            return builder
          },
        ),
      whereNull: vi.fn().mockImplementation((column: string) => {
        filteredData = filteredData.filter(
          (row) => column in row && row[column] === null,
        )
        return builder
      }),
      orWhere: vi
        .fn()
        .mockImplementation(
          (column: string, operator: string, value?: unknown) => {
            // For expired token check: expires_at > new Date()
            if (operator === ">") {
              filteredData = filteredData.filter((row) => {
                const colValue = column in row ? row[column] : null
                return (
                  colValue === null ||
                  (colValue instanceof Date && colValue > (value as Date)) ||
                  (typeof colValue === "string" &&
                    new Date(colValue) > (value as Date))
                )
              })
            }
            return builder
          },
        ),
      first: vi.fn().mockImplementation(() => {
        const result = filteredData[0] || null
        filteredData = (getMockTableDataGeneric(table) as unknown[]).map(
          (item) => item as Record<string, unknown>,
        ) // Reset for next query
        return Promise.resolve(result)
      }),
      returning: vi.fn().mockImplementation((cols?: string) => {
        const result = filteredData
        filteredData = (getMockTableDataGeneric(table) as unknown[]).map(
          (item) => item as Record<string, unknown>,
        ) // Reset for next query
        return Promise.resolve(result)
      }),
    }
    // Reset filtered data when builder is created
    filteredData = (getMockTableDataGeneric(table) as unknown[]).map(
      (item) => item as Record<string, unknown>,
    )
    return builder
  }

  const mockKnexFn = vi.fn((table: string) => createQueryBuilder(table))

  return {
    database: {
      knex: mockKnexFn,
    },
    getKnex: () => mockKnexFn,
    KnexDatabase: class MockKnexDatabase {
      knex = mockKnexFn
    },
  }
})

// Mock profile database functions
vi.mock("../api/routes/v1/profiles/database.js", () => {
  return {
    getUser: vi.fn(async (query: { user_id?: string; username?: string }) => {
      const accounts = getMockTableData("accounts")
      if (query.user_id) {
        const user = accounts.find((u) => u.user_id === query.user_id)
        if (!user) {
          throw new Error("User not found")
        }
        return user
      }
      if (query.username) {
        const user = accounts.find((u) => u.username === query.username)
        if (!user) {
          throw new Error("User not found")
        }
        return user
      }
      throw new Error("User not found")
    }),
    incrementUserBalance: vi.fn(async (userId: string, amount: number) => {
      const accounts = getMockTableData("accounts")
      const account = accounts.find((a) => a.user_id === userId)
      if (account) {
        const currentBalance = parseFloat(account.balance) || 0
        account.balance = (currentBalance + amount).toString()
      }
    }),
    decrementUserBalance: vi.fn(async (userId: string, amount: number) => {
      const accounts = getMockTableData("accounts")
      const account = accounts.find((a) => a.user_id === userId)
      if (account) {
        const currentBalance = parseFloat(account.balance) || 0
        account.balance = (currentBalance - amount).toString()
      }
    }),
  }
})

// Mock transaction database functions
vi.mock("../api/routes/v1/transactions/database.js", () => {
  return {
    getTransaction: vi.fn(async (query: { transaction_id: string }) => {
      const transactions = getMockTableData("transactions")
      return (
        transactions.find((t) => t.transaction_id === query.transaction_id) ||
        null
      )
    }),
    createTransaction: vi.fn(async (data: Partial<DBTransaction>) => {
      const transactions = getMockTableData("transactions")
      const transaction: DBTransaction = {
        transaction_id: data.transaction_id || `txn_${Date.now()}`,
        kind: data.kind || "transfer",
        timestamp: data.timestamp || new Date(),
        amount: data.amount || "0",
        status: data.status || "pending",
        contractor_sender_id: data.contractor_sender_id || "",
        contractor_recipient_id: data.contractor_recipient_id || "",
        user_sender_id: data.user_sender_id || "",
        user_recipient_id: data.user_recipient_id || "",
        ...data,
      }
      transactions.push(transaction)
      return transaction
    }),
  }
})

// Mock contractor database functions
vi.mock("../api/routes/v1/contractors/database.js", () => {
  return {
    getContractor: vi.fn(
      async (query: { contractor_id?: string; spectrum_id?: string }) => {
        const contractors = getMockTableData("contractors")
        if (query.contractor_id) {
          return (
            contractors.find((c) => c.contractor_id === query.contractor_id) ||
            null
          )
        }
        if (query.spectrum_id) {
          return (
            contractors.find((c) => c.spectrum_id === query.spectrum_id) || null
          )
        }
        return null
      },
    ),
    incrementContractorBalance: vi.fn(),
  }
})
