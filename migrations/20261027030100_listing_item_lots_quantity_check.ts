import type { Knex } from "knex"

/**
 * listing_item_lots.quantity_total may never go negative. Allocating takes
 * units out of quantity_total, so this CHECK is the database's guarantee that
 * two orders can't take the same stock even if a code path forgot its row
 * lock.
 *
 * The market V2 schema created it as chk_listing_item_lots_quantity_total;
 * this makes sure it exists and is validated. Where it already is (every
 * database built from the migrations) this takes no lock at all. Otherwise
 * ADD ... NOT VALID is a brief ACCESS EXCLUSIVE, then VALIDATE scans.
 */
const NAME = "chk_listing_item_lots_quantity_total"

export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  const { rows } = await knex.raw<{ rows: Array<{ convalidated: boolean }> }>(
    `SELECT convalidated FROM pg_constraint
      WHERE conname = ? AND conrelid = 'listing_item_lots'::regclass`,
    [NAME],
  )
  if (rows.length === 0) {
    await knex.raw(
      `ALTER TABLE listing_item_lots ADD CONSTRAINT ${NAME} CHECK (quantity_total >= 0) NOT VALID`,
    )
  }
  if (rows.length === 0 || !rows[0].convalidated) {
    await knex.raw(`ALTER TABLE listing_item_lots VALIDATE CONSTRAINT ${NAME}`)
  }
}

export async function down(): Promise<void> {
  // The constraint predates this migration; keep it.
}
