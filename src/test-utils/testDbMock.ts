/**
 * Mock database utilities for unit tests
 * Use this for faster tests that don't require a real database
 *
 * For integration tests that test actual database queries and transactions,
 * use testDb.ts with a real test database instead.
 */

import { vi } from "vitest"
import type { Knex } from "knex"

/**
 * Create a mock Knex query builder
 * This mocks the common Knex query methods
 */
export function createMockKnex(): Knex {
  const mockKnex = {
    raw: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn().mockResolvedValue({
      commit: vi.fn(),
      rollback: vi.fn(),
    }),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    whereNotNull: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    returning: vi.fn().mockResolvedValue([]),
    then: vi.fn().mockResolvedValue([]),
    catch: vi.fn(),
  } as unknown as Knex

  // Make it chainable
  ;(mockKnex as any).knex = (table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    whereNotNull: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    returning: vi.fn().mockResolvedValue([]),
  })

  return mockKnex
}

/**
 * Mock database instance
 */
let mockKnex: Knex | null = null

/**
 * Get a mocked Knex instance for unit tests
 */
export function getMockKnex(): Knex {
  if (!mockKnex) {
    mockKnex = createMockKnex()
  }
  return mockKnex
}

/**
 * Reset the mock database (clears all mocks)
 */
export function resetMockDatabase(): void {
  if (mockKnex) {
    vi.clearAllMocks()
    mockKnex = null
  }
}

/**
 * Setup mock database responses
 * Use this to configure what the database should return
 */
export function setupMockDatabaseResponses(responses: {
  [table: string]: {
    [method: string]: any
  }
}): void {
  const knex = getMockKnex()
  // This is a placeholder - you'll configure mocks per test
}
