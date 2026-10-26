import type { Knex } from "knex"

/**
 * V2 stock allocations: which listing_item_lots an order's V2 lines took
 * their units from.
 *
 * Allocating moves units out of a lot: quantity_total goes down by the
 * allocated amount (what automatic allocation already did), so every
 * availability read (SUM(quantity_total) of listed lots, the
 * listing_items.quantity_available trigger) stays correct. A row here records
 * where the units went, so cancelling or deallocating can put them back in
 * the same lot, and the seller can see and change them.
 *
 * V1 stock_allocations is not reused: its lot_id references V1 stock_lots.
 * stock_allocation_log (FK to listing_item_lots) was never written and has no
 * status, so it can't say what is still held.
 *
 * New, empty table: the FKs take a brief SHARE ROW EXCLUSIVE on orders,
 * order_market_items_v2 and listing_item_lots (writes wait, reads don't);
 * lock_timeout keeps that wait bounded. Indexes are on the new table only.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS order_stock_allocations_v2 (
      allocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
      order_item_id uuid NOT NULL REFERENCES order_market_items_v2 (order_item_id) ON DELETE CASCADE,
      lot_id uuid REFERENCES listing_item_lots (lot_id) ON DELETE SET NULL,
      quantity integer NOT NULL CONSTRAINT chk_order_stock_allocations_v2_quantity CHECK (quantity > 0),
      status varchar(20) NOT NULL DEFAULT 'active'
        CONSTRAINT chk_order_stock_allocations_v2_status CHECK (status IN ('active', 'released', 'fulfilled')),
      allocated_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      released_at timestamptz
    );
  `)
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_order_stock_allocations_v2_order ON order_stock_allocations_v2 (order_id);`,
  )
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_order_stock_allocations_v2_active_lot ON order_stock_allocations_v2 (lot_id) WHERE status = 'active';`,
  )
  // One active row per (line, lot): allocating more from the same lot adds to it.
  await knex.raw(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_order_stock_allocations_v2_active_line_lot ON order_stock_allocations_v2 (order_item_id, lot_id) WHERE status = 'active';`,
  )
  await knex.raw(`
    COMMENT ON TABLE order_stock_allocations_v2 IS
      'Units of listing_item_lots held for V2 order lines. Active units are already subtracted from the lot''s quantity_total.';
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP TABLE IF EXISTS order_stock_allocations_v2")
}
