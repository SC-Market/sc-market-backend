/**
 * Allocation Types and Interfaces
 * 
 * Defines the data structures for stock allocation management.
 */

/**
 * Database representation of a stock allocation
 */
export interface DBAllocation {
  allocation_id: string
  lot_id: string
  order_id: string
  quantity: number
  status: 'active' | 'released' | 'fulfilled'
  created_at: Date
  updated_at: Date
}

/**
 * Input for creating a new allocation
 */
export interface CreateAllocationInput {
  lot_id: string
  order_id: string
  quantity: number
  status?: 'active' | 'released' | 'fulfilled'
}

/**
 * Input for updating an allocation
 */
export interface UpdateAllocationInput {
  quantity?: number
  status?: 'active' | 'released' | 'fulfilled'
}

/**
 * Filters for querying allocations
 */
export interface AllocationFilters {
  order_id?: string
  lot_id?: string
  status?: 'active' | 'released' | 'fulfilled'
}

/**
 * Input for manual allocation
 */
export interface ManualAllocationInput {
  lot_id: string
  quantity: number
}

/**
 * Result of an allocation operation
 */
export interface AllocationResult {
  allocations: DBAllocation[]
  total_allocated: number
  is_partial: boolean
}

/**
 * Allocation strategy types
 */
export type AllocationStrategyType = 'fifo' | 'location_priority'

/**
 * Database representation of an allocation strategy
 */
export interface DBAllocationStrategy {
  strategy_id: string
  contractor_id: string
  strategy_type: AllocationStrategyType
  location_priority_order: string[] | null
  created_at: Date
  updated_at: Date
}

/**
 * Input for creating/updating an allocation strategy
 */
export interface AllocationStrategyInput {
  contractor_id: string
  strategy_type: AllocationStrategyType
  location_priority_order?: string[]
}
