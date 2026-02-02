/**
 * Allocation Repository
 *
 * Provides database access methods for stock allocations.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  DBAllocation,
  CreateAllocationInput,
  UpdateAllocationInput,
  AllocationFilters,
  DBAllocationStrategy,
  AllocationStrategyInput,
} from "./types.js"

export class AllocationRepository {
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
  }

  /**
   * Create a new allocation
   */
  async create(input: CreateAllocationInput): Promise<DBAllocation> {
    const [allocation] = await this.knex<DBAllocation>("stock_allocations")
      .insert({
        lot_id: input.lot_id,
        order_id: input.order_id,
        quantity: input.quantity,
        status: input.status ?? "active",
      })
      .returning("*")

    return allocation
  }

  /**
   * Create multiple allocations in a single transaction
   */
  async createMany(inputs: CreateAllocationInput[]): Promise<DBAllocation[]> {
    const allocations = await this.knex<DBAllocation>("stock_allocations")
      .insert(
        inputs.map((input) => ({
          lot_id: input.lot_id,
          order_id: input.order_id,
          quantity: input.quantity,
          status: input.status ?? "active",
        })),
      )
      .returning("*")

    return allocations
  }

  /**
   * Get an allocation by ID
   */
  async getById(allocationId: string): Promise<DBAllocation | null> {
    const allocation = await this.knex<DBAllocation>("stock_allocations")
      .where({ allocation_id: allocationId })
      .first()

    return allocation || null
  }

  /**
   * Get allocations with optional filters
   */
  async getAllocations(filters: AllocationFilters): Promise<DBAllocation[]> {
    let query = this.knex<DBAllocation>("stock_allocations")

    if (filters.order_id) {
      query = query.where({ order_id: filters.order_id })
    }

    if (filters.lot_id) {
      query = query.where({ lot_id: filters.lot_id })
    }

    if (filters.status) {
      query = query.where({ status: filters.status })
    }

    const allocations = await query.orderBy("created_at", "asc")

    return allocations
  }

  /**
   * Get all allocations for an order
   */
  async getByOrderId(orderId: string): Promise<DBAllocation[]> {
    return this.getAllocations({ order_id: orderId })
  }

  /**
   * Get all active allocations for an order
   */
  async getActiveByOrderId(orderId: string): Promise<DBAllocation[]> {
    return this.getAllocations({ order_id: orderId, status: "active" })
  }

  /**
   * Get all allocations for a lot
   */
  async getByLotId(lotId: string): Promise<DBAllocation[]> {
    return this.getAllocations({ lot_id: lotId })
  }

  /**
   * Get all active allocations for a lot
   */
  async getActiveByLotId(lotId: string): Promise<DBAllocation[]> {
    return this.getAllocations({ lot_id: lotId, status: "active" })
  }

  /**
   * Get the total allocated quantity for a lot
   */
  async getAllocatedQuantity(lotId: string): Promise<number> {
    const result = (await this.knex<DBAllocation>("stock_allocations")
      .where({ lot_id: lotId, status: "active" })
      .sum("quantity as total")
      .first()) as { total?: string | number } | undefined

    return result?.total ? Number(result.total) : 0
  }

  /**
   * Update an allocation
   */
  async update(
    allocationId: string,
    updates: UpdateAllocationInput,
  ): Promise<DBAllocation> {
    const updateData: Partial<DBAllocation> = {
      updated_at: new Date(),
    }

    if (updates.quantity !== undefined) {
      updateData.quantity = updates.quantity
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status
    }

    const [allocation] = await this.knex<DBAllocation>("stock_allocations")
      .where({ allocation_id: allocationId })
      .update(updateData)
      .returning("*")

    return allocation
  }

  /**
   * Update all allocations for an order with a new status
   */
  async updateStatusByOrderId(
    orderId: string,
    status: "active" | "released" | "fulfilled",
  ): Promise<DBAllocation[]> {
    const allocations = await this.knex<DBAllocation>("stock_allocations")
      .where({ order_id: orderId })
      .update({
        status,
        updated_at: new Date(),
      })
      .returning("*")

    return allocations
  }

  /**
   * Delete an allocation
   */
  async delete(allocationId: string): Promise<void> {
    await this.knex<DBAllocation>("stock_allocations")
      .where({ allocation_id: allocationId })
      .delete()
  }

  /**
   * Get allocation strategy for a contractor
   */
  async getStrategy(
    contractorId: string,
  ): Promise<DBAllocationStrategy | null> {
    const strategy = await this.knex<DBAllocationStrategy>(
      "allocation_strategies",
    )
      .where({ contractor_id: contractorId })
      .first()

    return strategy || null
  }

  /**
   * Create or update allocation strategy for a contractor
   */
  async upsertStrategy(
    input: AllocationStrategyInput,
  ): Promise<DBAllocationStrategy> {
    const existing = await this.getStrategy(input.contractor_id)

    if (existing) {
      const [strategy] = await this.knex<DBAllocationStrategy>(
        "allocation_strategies",
      )
        .where({ contractor_id: input.contractor_id })
        .update({
          strategy_type: input.strategy_type,
          location_priority_order: input.location_priority_order ?? null,
          updated_at: new Date(),
        })
        .returning("*")

      return strategy
    } else {
      const [strategy] = await this.knex<DBAllocationStrategy>(
        "allocation_strategies",
      )
        .insert({
          contractor_id: input.contractor_id,
          strategy_type: input.strategy_type,
          location_priority_order: input.location_priority_order ?? null,
        })
        .returning("*")

      return strategy
    }
  }
}
