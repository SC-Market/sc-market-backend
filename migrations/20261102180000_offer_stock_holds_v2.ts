import type { Knex } from "knex"

/**
 * V2 offer stock holds (services/allocation/v2-offer-holds.service.ts): the
 * units a pending offer holds when its shop's stock subtraction timing is
 * 'on_received' (subtract when the offer is received, before acceptance).
 *
 * Holding moves units out of the lot (quantity_total goes down), exactly as
 * an order allocation does, so availability reads stay correct; a row here
 * records where they came from so they can go back (counter-offer, reject,
 * withdraw) or pass to the order on acceptance.
 *
 * session_id has no FK: offer_sessions is hot, and a hold whose session is
 * gone is released by the sweeper (releaseHoldsOfClosedSessions) instead of
 * being deleted with its units. The lot FK takes a brief SHARE ROW EXCLUSIVE
 * on listing_item_lots (writes wait, reads don't), bounded by lock_timeout.
 * New, empty table; indexes are on it only.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS offer_stock_holds_v2 (
      hold_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL,
      offer_id uuid,
      lot_id uuid REFERENCES listing_item_lots (lot_id) ON DELETE SET NULL,
      item_id uuid NOT NULL,
      variant_id uuid NOT NULL,
      quantity integer NOT NULL CONSTRAINT chk_offer_stock_holds_v2_quantity CHECK (quantity > 0),
      status varchar(20) NOT NULL DEFAULT 'active'
        CONSTRAINT chk_offer_stock_holds_v2_status CHECK (status IN ('active', 'released', 'converted')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      released_at timestamptz
    );
  `)
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_offer_stock_holds_v2_active_session ON offer_stock_holds_v2 (session_id) WHERE status = 'active';`,
  )
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_offer_stock_holds_v2_active_lot ON offer_stock_holds_v2 (lot_id) WHERE status = 'active';`,
  )
  await knex.raw(`
    COMMENT ON TABLE offer_stock_holds_v2 IS
      'Units of listing_item_lots held by pending V2 offers (on_received timing). Active units are already subtracted from the lot''s quantity_total.';
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  // Put held units back before the record of them goes.
  await knex.raw(`
    UPDATE listing_item_lots l
    SET quantity_total = l.quantity_total + h.held, updated_at = now()
    FROM (
      SELECT lot_id, SUM(quantity)::integer AS held
      FROM offer_stock_holds_v2
      WHERE status = 'active' AND lot_id IS NOT NULL
      GROUP BY lot_id
    ) h
    WHERE l.lot_id = h.lot_id
  `)
  await knex.raw("DROP TABLE IF EXISTS offer_stock_holds_v2")
}
