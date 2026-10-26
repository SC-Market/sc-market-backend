/**
 * V2 order stock allocation.
 *
 * An order's V2 lines (order_market_items_v2) take units from
 * listing_item_lots of the same listing item and variant. Allocating moves
 * the units out of the lot (quantity_total goes down) and records the move in
 * order_stock_allocations_v2, so every availability read (SUM of listed
 * lots' quantity_total, the listing_items.quantity_available trigger) already
 * excludes allocated stock, and releasing puts the units back in the lot they
 * came from.
 *
 * Concurrency: every operation runs in one transaction that locks the order
 * row first, then the lots it touches (one SELECT ... FOR UPDATE ordered by
 * lot_id), so two orders can't take the same units and two requests on one
 * order can't interleave. Lot updates are also guarded
 * (quantity_total >= n) and chk_listing_item_lots_quantity_total rejects a
 * negative quantity, should anything get past the locks.
 *
 * Statuses: active (units held for the order), released (put back: cancel or
 * deallocation), fulfilled (the order was fulfilled; the units left with it).
 */

import type { Knex } from "knex"

export const V2_ALLOCATIONS_TABLE = "order_stock_allocations_v2"

/** Order statuses whose allocations can no longer change. */
export const CLOSED_ORDER_STATUSES = ["cancelled", "fulfilled"]

export interface V2OrderLine {
  order_item_id: string
  order_id: string
  listing_id: string
  item_id: string
  variant_id: string
  quantity: number
}

export interface V2AllocationRow {
  allocation_id: string
  order_id: string
  order_item_id: string
  lot_id: string | null
  quantity: number
  status: "active" | "released" | "fulfilled"
  allocated_by: string | null
  created_at: Date
  updated_at: Date
  released_at: Date | null
}

interface LotRow {
  lot_id: string
  item_id: string | null
  variant_id: string
  quantity_total: number
  listed: boolean
  created_at: Date
}

export interface V2AllocationTotals {
  total_requested: number
  total_allocated: number
  has_partial_allocations: boolean
}

/** Not enough stock in the lots for an allocation that must be complete. */
export class V2InsufficientStockError extends Error {
  constructor(
    public order_item_id: string,
    public requested: number,
    public available: number,
  ) {
    super(`Insufficient stock: requested ${requested}, available ${available}`)
    this.name = "V2InsufficientStockError"
  }
}

/** The request can't be applied to this order (bad lot, too much, closed). */
export class V2AllocationRequestError extends Error {
  constructor(
    message: string,
    public field: string = "allocations",
  ) {
    super(message)
    this.name = "V2AllocationRequestError"
  }
}

export async function getOrderLines(db: Knex | Knex.Transaction, orderId: string): Promise<V2OrderLine[]> {
  return db("order_market_items_v2")
    .where({ order_id: orderId })
    .orderBy([{ column: "created_at" }, { column: "order_item_id" }])
    .select("order_item_id", "order_id", "listing_id", "item_id", "variant_id", "quantity")
}

export async function getActiveAllocations(
  db: Knex | Knex.Transaction,
  orderId: string,
): Promise<V2AllocationRow[]> {
  return db(V2_ALLOCATIONS_TABLE)
    .where({ order_id: orderId, status: "active" })
    .orderBy([{ column: "created_at" }, { column: "allocation_id" }])
    .select("*")
}

function activeByLine(allocations: V2AllocationRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const a of allocations) m.set(a.order_item_id, (m.get(a.order_item_id) ?? 0) + a.quantity)
  return m
}

function totals(lines: V2OrderLine[], allocations: V2AllocationRow[]): V2AllocationTotals {
  const total_requested = lines.reduce((s, l) => s + l.quantity, 0)
  const total_allocated = allocations.reduce((s, a) => s + a.quantity, 0)
  return { total_requested, total_allocated, has_partial_allocations: total_allocated < total_requested }
}

/** Locks the order row; returns its status. */
async function lockOrder(trx: Knex.Transaction, orderId: string): Promise<{ status: string } | undefined> {
  return trx("orders").where({ order_id: orderId }).forUpdate().first("order_id", "status")
}

/** Locks lots in lot_id order (a single, consistent order prevents deadlocks). */
async function lockLotsById(trx: Knex.Transaction, lotIds: string[]): Promise<Map<string, LotRow>> {
  if (lotIds.length === 0) return new Map()
  const rows: LotRow[] = await trx("listing_item_lots")
    .whereIn("lot_id", [...new Set(lotIds)])
    .orderBy("lot_id")
    .forUpdate()
    .select("lot_id", "item_id", "variant_id", "quantity_total", "listed", "created_at")
  return new Map(rows.map((r) => [r.lot_id, r]))
}

async function takeFromLot(trx: Knex.Transaction, lotId: string, n: number): Promise<void> {
  const updated = await trx("listing_item_lots")
    .where({ lot_id: lotId })
    .where("quantity_total", ">=", n)
    .update({ quantity_total: trx.raw("quantity_total - ?", [n]), updated_at: trx.fn.now() })
  if (updated !== 1) throw new V2AllocationRequestError(`Lot ${lotId} no longer has ${n} available`)
}

async function returnToLot(trx: Knex.Transaction, lotId: string, n: number): Promise<void> {
  await trx("listing_item_lots")
    .where({ lot_id: lotId })
    .update({ quantity_total: trx.raw("quantity_total + ?", [n]), updated_at: trx.fn.now() })
}

/** Adds `n` to the line's active allocation from the lot (one active row per pair). */
async function addAllocation(
  trx: Knex.Transaction,
  line: V2OrderLine,
  lotId: string,
  n: number,
  allocatedBy: string | null,
): Promise<void> {
  await trx.raw(
    `INSERT INTO ${V2_ALLOCATIONS_TABLE} (order_id, order_item_id, lot_id, quantity, status, allocated_by)
     VALUES (?, ?, ?, ?, 'active', ?)
     ON CONFLICT (order_item_id, lot_id) WHERE status = 'active'
     DO UPDATE SET quantity = ${V2_ALLOCATIONS_TABLE}.quantity + EXCLUDED.quantity,
                   allocated_by = EXCLUDED.allocated_by,
                   updated_at = now()`,
    [line.order_id, line.order_item_id, lotId, n, allocatedBy],
  )
}

export interface AutoAllocateOptions {
  /**
   * Every line must be allocated in full, or nothing is (throws
   * V2InsufficientStockError and the caller's transaction rolls back). Buy now
   * and buy-order fulfilment use this: they promise stock that is listed.
   * Otherwise lines get what is available (an accepted offer, or the seller's
   * "auto-allocate" action) and the rest stays unallocated.
   */
  strict: boolean
  /** User who asked for it; null for allocation at order creation. */
  allocatedBy?: string | null
}

/**
 * Allocates each line's unallocated quantity from its listed lots, oldest
 * lot first. Must run inside the caller's transaction.
 */
export async function autoAllocateOrder(
  trx: Knex.Transaction,
  orderId: string,
  { strict, allocatedBy = null }: AutoAllocateOptions,
): Promise<V2AllocationTotals> {
  const order = await lockOrder(trx, orderId)
  if (!order) throw new V2AllocationRequestError("Order not found", "order_id")
  if (CLOSED_ORDER_STATUSES.includes(order.status)) {
    throw new V2AllocationRequestError(`Order is ${order.status}; its allocations can't change`, "order_id")
  }
  const lines = await getOrderLines(trx, orderId)
  const held = activeByLine(await getActiveAllocations(trx, orderId))

  const pending = lines.filter((l) => l.quantity - (held.get(l.order_item_id) ?? 0) > 0)
  if (pending.length > 0) {
    const candidates: LotRow[] = await trx("listing_item_lots")
      .where("listed", true)
      .where("quantity_total", ">", 0)
      .where((q) => {
        for (const l of pending) q.orWhere({ item_id: l.item_id, variant_id: l.variant_id })
      })
      .orderBy("lot_id")
      .forUpdate()
      .select("lot_id", "item_id", "variant_id", "quantity_total", "listed", "created_at")

    const left = new Map(candidates.map((c) => [c.lot_id, c.quantity_total]))
    const fifo = [...candidates].sort(
      (a, b) => a.created_at.getTime() - b.created_at.getTime() || a.lot_id.localeCompare(b.lot_id),
    )

    const takes: Array<{ line: V2OrderLine; lot_id: string; n: number }> = []
    for (const line of pending) {
      let need = line.quantity - (held.get(line.order_item_id) ?? 0)
      const requested = need
      for (const lot of fifo) {
        if (need === 0) break
        if (lot.item_id !== line.item_id || lot.variant_id !== line.variant_id) continue
        const n = Math.min(need, left.get(lot.lot_id) ?? 0)
        if (n <= 0) continue
        left.set(lot.lot_id, (left.get(lot.lot_id) ?? 0) - n)
        takes.push({ line, lot_id: lot.lot_id, n })
        need -= n
      }
      if (need > 0 && strict) {
        throw new V2InsufficientStockError(line.order_item_id, requested, requested - need)
      }
    }

    for (const t of takes) {
      await takeFromLot(trx, t.lot_id, t.n)
      await addAllocation(trx, t.line, t.lot_id, t.n, allocatedBy)
    }
  }

  return totals(lines, await getActiveAllocations(trx, orderId))
}

export interface ManualAllocationTarget {
  lot_id: string
  /** Units of this lot the line should hold after the call; 0 releases it. */
  quantity: number
  /** Needed only when the lot's item and variant match several lines. */
  order_item_id?: string
}

/**
 * Sets how many units each given lot holds for the order (absolute, not a
 * delta): more takes units from the lot, less puts them back, 0 releases it.
 * The lot must hold the line's listing item and variant (listed or not).
 */
export async function setManualAllocations(
  trx: Knex.Transaction,
  orderId: string,
  targets: ManualAllocationTarget[],
  allocatedBy: string,
): Promise<V2AllocationTotals> {
  const order = await lockOrder(trx, orderId)
  if (!order) throw new V2AllocationRequestError("Order not found", "order_id")
  if (CLOSED_ORDER_STATUSES.includes(order.status)) {
    throw new V2AllocationRequestError(`Order is ${order.status}; its allocations can't change`, "order_id")
  }
  const lines = await getOrderLines(trx, orderId)
  if (lines.length === 0) throw new V2AllocationRequestError("Order has no V2 items to allocate", "order_id")

  const seen = new Set<string>()
  for (const t of targets) {
    if (seen.has(t.lot_id)) throw new V2AllocationRequestError(`Lot ${t.lot_id} is listed twice`)
    seen.add(t.lot_id)
  }
  const lots = await lockLotsById(trx, targets.map((t) => t.lot_id))
  const active = await getActiveAllocations(trx, orderId)
  const held = activeByLine(active)

  const changes: Array<{ line: V2OrderLine; lot_id: string; delta: number; current?: V2AllocationRow }> = []
  for (const t of targets) {
    const lot = lots.get(t.lot_id)
    if (!lot) throw new V2AllocationRequestError(`Lot ${t.lot_id} not found`)
    const matching = lines.filter(
      (l) =>
        l.item_id === lot.item_id &&
        l.variant_id === lot.variant_id &&
        (!t.order_item_id || l.order_item_id === t.order_item_id),
    )
    if (matching.length === 0) {
      throw new V2AllocationRequestError(`Lot ${t.lot_id} does not hold the item and variant of a line in this order`)
    }
    if (matching.length > 1) {
      throw new V2AllocationRequestError(`Lot ${t.lot_id} matches several lines; pass order_item_id`)
    }
    const line = matching[0]
    const current = active.find((a) => a.order_item_id === line.order_item_id && a.lot_id === t.lot_id)
    const delta = t.quantity - (current?.quantity ?? 0)
    if (delta === 0) continue
    if (delta > lot.quantity_total) {
      throw new V2AllocationRequestError(
        `Cannot allocate ${delta} more from lot ${t.lot_id}. Only ${lot.quantity_total} available.`,
      )
    }
    held.set(line.order_item_id, (held.get(line.order_item_id) ?? 0) + delta)
    changes.push({ line, lot_id: t.lot_id, delta, current })
  }
  for (const line of lines) {
    const h = held.get(line.order_item_id) ?? 0
    if (h > line.quantity) {
      throw new V2AllocationRequestError(`Cannot allocate ${h} units. The order line only requires ${line.quantity}.`)
    }
  }

  for (const c of changes) {
    if (c.delta > 0) {
      await takeFromLot(trx, c.lot_id, c.delta)
      await addAllocation(trx, c.line, c.lot_id, c.delta, allocatedBy)
    } else {
      await returnToLot(trx, c.lot_id, -c.delta)
      const remaining = c.current!.quantity + c.delta
      await trx(V2_ALLOCATIONS_TABLE)
        .where({ allocation_id: c.current!.allocation_id })
        .update(
          remaining === 0
            ? { status: "released", released_at: trx.fn.now(), updated_at: trx.fn.now() }
            : { quantity: remaining, updated_at: trx.fn.now() },
        )
    }
  }

  return totals(lines, await getActiveAllocations(trx, orderId))
}

/**
 * Puts the units of the order's active allocations back into their lots and
 * marks them released: all of them, or only `allocationIds`. A lot deleted
 * since (lot_id NULL) has nothing to return to; the row is just released.
 * Returns the number of units put back.
 */
export async function releaseOrderAllocations(
  trx: Knex.Transaction,
  orderId: string,
  allocationIds?: string[],
): Promise<number> {
  await lockOrder(trx, orderId)
  let active = await getActiveAllocations(trx, orderId)
  if (allocationIds) {
    const wanted = new Set(allocationIds)
    active = active.filter((a) => wanted.has(a.allocation_id))
  }
  if (active.length === 0) return 0

  await lockLotsById(trx, active.map((a) => a.lot_id).filter((id): id is string => !!id))
  let returned = 0
  for (const a of active) {
    if (a.lot_id) {
      await returnToLot(trx, a.lot_id, a.quantity)
      returned += a.quantity
    }
  }
  await trx(V2_ALLOCATIONS_TABLE)
    .whereIn("allocation_id", active.map((a) => a.allocation_id))
    .update({ status: "released", released_at: trx.fn.now(), updated_at: trx.fn.now() })
  return returned
}

/**
 * The order was fulfilled: its allocated units left with it. They were
 * already taken out of the lots, so only the status changes.
 */
export async function markOrderAllocationsFulfilled(db: Knex | Knex.Transaction, orderId: string): Promise<void> {
  await db(V2_ALLOCATIONS_TABLE)
    .where({ order_id: orderId, status: "active" })
    .update({ status: "fulfilled", updated_at: db.fn.now() })
}

/** Units of each lot held by orders that are still open (active allocations). */
export async function activeAllocatedByLot(
  db: Knex | Knex.Transaction,
  lotIds: string[],
): Promise<Map<string, number>> {
  if (lotIds.length === 0) return new Map()
  const rows: Array<{ lot_id: string; allocated: number }> = await db(V2_ALLOCATIONS_TABLE)
    .whereIn("lot_id", lotIds)
    .where("status", "active")
    .groupBy("lot_id")
    .select("lot_id", db.raw("SUM(quantity)::integer AS allocated"))
  return new Map(rows.map((r) => [r.lot_id, r.allocated]))
}
