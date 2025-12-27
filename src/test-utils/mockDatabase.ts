/**
 * Mock the database singleton for testing
 * This mocks the database instance that's imported throughout the codebase
 */

import { vi } from "vitest"
import type { Knex } from "knex"
import type {
  DBUser,
  DBTransaction,
  DBContractor,
  DBContractorMemberRole,
} from "../clients/database/db-models.js"

// Re-export types for use in test files
export type { DBUser, DBTransaction, DBContractor, DBContractorMemberRole }

/**
 * Type mapping for database tables to their corresponding DB types
 */
export interface MockTableTypes {
  accounts: DBUser
  transactions: DBTransaction
  contractors: DBContractor
  contractor_member_roles: DBContractorMemberRole
  api_tokens: {
    id: string
    user_id: string
    name: string
    token_hash: string
    scopes: string[]
    created_at: Date
    last_used_at: Date | null
    expires_at: Date | null
    contractor_ids?: string[] | null
  }
}

/**
 * Union type for all known table types
 */
type KnownTableType = MockTableTypes[keyof MockTableTypes]

/**
 * Extended type that includes both known tables and generic records
 */
export type TableDataValue = KnownTableType | Record<string, unknown>

/**
 * Type-safe helper to get table data type
 */
export type TableData<T extends keyof MockTableTypes> = MockTableTypes[T]

/**
 * Create a mock Knex query builder that can be chained
 */
function createMockQueryBuilder() {
  const mockBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    whereNotNull: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    returning: vi.fn().mockResolvedValue([]),
    then: vi.fn().mockResolvedValue([]),
    catch: vi.fn(),
  }

  return mockBuilder
}

/**
 * Create a mock Knex instance
 * Returns a partial Knex implementation that satisfies the interface
 */
export function createMockKnex(): Knex {
  const mockQueryBuilder = createMockQueryBuilder()
  
  const mockKnexFn = vi.fn((table: string) => mockQueryBuilder)
  
  // Add Knex methods to the function
  Object.assign(mockKnexFn, {
    raw: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn().mockResolvedValue({
      commit: vi.fn(),
      rollback: vi.fn(),
    }),
  })

  return mockKnexFn as unknown as Knex
}

/**
 * Mock data storage with type safety
 */
const mockData: Partial<{
  [K in keyof MockTableTypes]: MockTableTypes[K][]
}> & {
  [key: string]: TableDataValue[]
} = {}

/**
 * Setup mock data for a table (type-safe version)
 */
export function setupMockTableData<T extends keyof MockTableTypes>(
  table: T,
  data: MockTableTypes[T][],
): void {
  ;(mockData as Record<string, TableDataValue[]>)[table] = data
}

/**
 * Setup mock data for a table (generic fallback)
 */
export function setupMockTableDataGeneric(
  table: string,
  data: TableDataValue[],
): void {
  mockData[table] = data
}

/**
 * Get mock data for a table (type-safe version)
 */
export function getMockTableData<T extends keyof MockTableTypes>(
  table: T,
): MockTableTypes[T][] {
  return (mockData[table] as MockTableTypes[T][]) || []
}

/**
 * Get mock data for a table (generic fallback)
 */
export function getMockTableDataGeneric(table: string): TableDataValue[] {
  return (mockData[table] as TableDataValue[]) || []
}

/**
 * Clear all mock data
 */
export function clearMockData(): void {
  Object.keys(mockData).forEach((key) => delete mockData[key])
}

interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  whereNull: ReturnType<typeof vi.fn>
  whereNotNull: ReturnType<typeof vi.fn>
  orWhere: ReturnType<typeof vi.fn>
  first: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  then: ReturnType<typeof vi.fn>
  catch: ReturnType<typeof vi.fn>
  whereConditions?: Array<{ column: string; value?: unknown }>
}

/**
 * Create a mock database instance that uses the mock data
 */
export function createMockDatabase() {
  const tableBuilders = new Map<string, MockQueryBuilder>()

  const createTableBuilder = (table: string): MockQueryBuilder => {
    if (tableBuilders.has(table)) {
      return tableBuilders.get(table)!
    }

    const builder: MockQueryBuilder = createMockQueryBuilder()

    // Make first() return the first item from mock data
    builder.first = vi.fn().mockImplementation(async () => {
      const data = getMockTableDataGeneric(table)
      return data[0] || null
    })

    // Make insert() return the inserted data
    builder.insert = vi.fn().mockImplementation((data: unknown) => {
      const tableData = getMockTableDataGeneric(table)
      const inserted = Array.isArray(data) ? data : [data]
      tableData.push(...inserted)
      setupMockTableDataGeneric(table, tableData)
      return builder
    })

    // Make update() work with mock data
    builder.update = vi.fn().mockImplementation((data: unknown) => {
      const tableData = getMockTableDataGeneric(table)
      // Simple update - in real tests you'd filter by where clauses
      if (tableData.length > 0 && typeof data === "object" && data !== null) {
        Object.assign(tableData[0] as Record<string, unknown>, data)
      }
      return builder
    })

    // Make where() chainable and filter mock data
    builder.where = vi
      .fn()
      .mockImplementation((column: string, value?: unknown) => {
        // Store the where condition for filtering
        builder.whereConditions = builder.whereConditions || []
        builder.whereConditions.push({ column, value })
        return builder
      })

    tableBuilders.set(table, builder)
    return builder
  }

  const mockKnexFn = vi.fn((table: string) => createTableBuilder(table))
  
  // Add Knex methods to the function
  Object.assign(mockKnexFn, {
    raw: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn().mockResolvedValue({
      commit: vi.fn(),
      rollback: vi.fn(),
    }),
  })

  return {
    knex: mockKnexFn as unknown as Knex,
  }
}
