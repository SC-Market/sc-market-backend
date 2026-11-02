/**
 * V2 offer stock holds ('on_received' stock subtraction timing, see
 * stock-timing.service.ts): the units of a pending offer's V2 items, taken
 * out of the seller's listed lots when the offer arrives, before the seller
 * accepts it.
 *
 * Like an order allocation (v2-order-allocation.service.ts), holding moves
 * the units out of the lot (quantity_total goes down), so every availability
 * read and "out of stock" display already excludes them, and a row in
 * offer_stock_holds_v2 records where they came from so they can go back.
 *
 * One offer session holds the units of its most recent offer:
 * - offer received (cart checkout): hold;
 * - counter-offer: put the old units back, hold the new offer's;
 * - accepted: the units go back to their lots and the order's allocation
 *   takes them again in the same transaction (status 'converted'), so the
 *   order owns them from then on;
 * - rejected, withdrawn, merged away, archived, or the session is no longer
 *   active for any other reason: put back (status 'released').
 *   releaseHoldsOfClosedSessions sweeps up any session closed by a path that
 *   didn't release its holds.
 *
 * Holding is not strict: the checkout already checked availability, and if a
 * concurrent sale got there first the offer holds what is left (the seller
 * still sees the full request and allocates the rest on acceptance).
 *
 * Concurrency: lots are locked (SELECT ... FOR UPDATE, ordered by lot_id)
 * before they change, inside the caller's transaction; quantities are
 * written from the locked row and guarded on it.
 */

import type { Knex } from "knex"

export const V2_OFFER_HOLDS_TABLE = "offer_stock_holds_v2"

type Db = Knex | Knex.Transaction

export interface OfferHoldItem {
  listing_id: string
  variant_id: string
  quantity: number
}

export interface OfferHoldRow {
  hold_id: string
  session_id: string
  offer_id: string | null
  lot_id: string | null
  item_id: string
  variant_id: string
  quantity: number
  status: "active" | "released" | "converted"
}

interface LotRow {
  lot_id: string
  item_id: string | null
  variant_id: string
  quantity_total: number
  listed: boolean
  created_at: Date | string
}

export interface OfferHoldTotals {
  requested: number
  held: number
}

const time = (v: Date | string) => new Date(v).getTime()

/** Locks lots by id in lot_id order (one consistent order prevents deadlocks). */
async function lockLots(
  trx: Db,
  lotIds: string[],
): Promise<Map<string, LotRow>> {
  const ids = [...new Set(lotIds)].sort()
  if (ids.length === 0) return new Map()
  const rows: LotRow[] = await trx("listing_item_lots")
    .whereIn("lot_id", ids)
    .orderBy("lot_id")
    .forUpdate()
    .select(
      "lot_id",
      "item_id",
      "variant_id",
      "quantity_total",
      "listed",
      "created_at",
    )
  return new Map(rows.map((r) => [r.lot_id, r]))
}

/** Sets a locked lot's quantity, guarded on the value read under the lock. */
async function setLotQuantity(
  trx: Db,
  lot: LotRow,
  quantity: number,
): Promise<void> {
  const updated = await trx("listing_item_lots")
    .where({ lot_id: lot.lot_id, quantity_total: lot.quantity_total })
    .update({ quantity_total: quantity, updated_at: new Date() })
  if (updated !== 1)
    throw new Error(
      `offer stock hold: lot ${lot.lot_id} changed under its lock`,
    )
  lot.quantity_total = quantity
}

/**
 * Holds the units of `items` (an offer's V2 items) from the listed lots of
 * each item's listing and variant, oldest lot first, for the session. Must
 * run inside the caller's transaction.
 */
export async function holdOfferStock(
  trx: Db,
  sessionId: string,
  offerId: string | null,
  items: OfferHoldItem[],
): Promise<OfferHoldTotals> {
  const wanted = items.filter((i) => i.quantity > 0)
  const requested = wanted.reduce((s, i) => s + i.quantity, 0)
  if (wanted.length === 0) return { requested, held: 0 }

  const listingItems: Array<{ listing_id: string; item_id: string }> =
    await trx("listing_items")
      .whereIn("listing_id", [...new Set(wanted.map((i) => i.listing_id))])
      .orderBy("item_id")
      .select("listing_id", "item_id")
  const itemOf = new Map<string, string>()
  for (const li of listingItems)
    if (!itemOf.has(li.listing_id)) itemOf.set(li.listing_id, li.item_id)

  const itemIds = [...new Set([...itemOf.values()])]
  if (itemIds.length === 0) return { requested, held: 0 }
  const lots: LotRow[] = await trx("listing_item_lots")
    .whereIn("item_id", itemIds)
    .where({ listed: true })
    .orderBy("lot_id")
    .forUpdate()
    .select(
      "lot_id",
      "item_id",
      "variant_id",
      "quantity_total",
      "listed",
      "created_at",
    )
  const fifo = [...lots].sort(
    (a, b) =>
      time(a.created_at) - time(b.created_at) ||
      a.lot_id.localeCompare(b.lot_id),
  )

  const holds: Array<Omit<OfferHoldRow, "hold_id" | "status">> = []
  for (const item of wanted) {
    const itemId = itemOf.get(item.listing_id)
    if (!itemId) continue
    let need = item.quantity
    for (const lot of fifo) {
      if (need === 0) break
      if (lot.item_id !== itemId || lot.variant_id !== item.variant_id) continue
      const n = Math.min(need, lot.quantity_total)
      if (n <= 0) continue
      await setLotQuantity(trx, lot, lot.quantity_total - n)
      holds.push({
        session_id: sessionId,
        offer_id: offerId,
        lot_id: lot.lot_id,
        item_id: itemId,
        variant_id: item.variant_id,
        quantity: n,
      })
      need -= n
    }
  }

  if (holds.length > 0) {
    const now = new Date()
    await trx(V2_OFFER_HOLDS_TABLE).insert(
      holds.map((h) => ({
        ...h,
        status: "active",
        created_at: now,
        updated_at: now,
      })),
    )
  }
  return { requested, held: holds.reduce((s, h) => s + h.quantity, 0) }
}

/**
 * Puts the units of the session's active holds back into their lots and
 * closes the holds: 'released' (the offer is gone or replaced) or
 * 'converted' (accepted: the order's allocation takes the units next, in the
 * same transaction). A lot deleted since (lot_id NULL) has nothing to take
 * them back. Returns the units put back. Must run inside the caller's
 * transaction.
 */
export async function releaseOfferHolds(
  trx: Db,
  sessionId: string,
  status: "released" | "converted" = "released",
): Promise<number> {
  const active: OfferHoldRow[] = await trx(V2_OFFER_HOLDS_TABLE)
    .where({ session_id: sessionId, status: "active" })
    .orderBy("hold_id")
    .forUpdate()
    .select("*")
  if (active.length === 0) return 0

  const lots = await lockLots(
    trx,
    active.map((h) => h.lot_id).filter((id): id is string => !!id),
  )
  let returned = 0
  for (const h of active) {
    const lot = h.lot_id ? lots.get(h.lot_id) : undefined
    if (!lot) continue
    await setLotQuantity(trx, lot, lot.quantity_total + h.quantity)
    returned += h.quantity
  }
  const now = new Date()
  await trx(V2_OFFER_HOLDS_TABLE)
    .whereIn(
      "hold_id",
      active.map((h) => h.hold_id),
    )
    .update({ status, released_at: now, updated_at: now })
  return returned
}

/**
 * The session's holds now follow `items` (its most recent offer's V2 items):
 * the old units go back, the new ones are held when `hold` (the shop's
 * policy). Must run inside the caller's transaction.
 */
export async function replaceOfferHolds(
  trx: Db,
  sessionId: string,
  offerId: string | null,
  items: OfferHoldItem[],
  hold: boolean,
): Promise<OfferHoldTotals> {
  await releaseOfferHolds(trx, sessionId, "released")
  if (!hold)
    return { requested: items.reduce((s, i) => s + i.quantity, 0), held: 0 }
  return holdOfferStock(trx, sessionId, offerId, items)
}

/** Units of each lot held by pending offers (active holds). */
export async function activeHeldByLot(
  db: Db,
  lotIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (lotIds.length === 0) return out
  const rows: Array<{ lot_id: string; quantity: number }> = await db(
    V2_OFFER_HOLDS_TABLE,
  )
    .whereIn("lot_id", lotIds)
    .where({ status: "active" })
    .select("lot_id", "quantity")
  for (const r of rows)
    out.set(r.lot_id, (out.get(r.lot_id) ?? 0) + Number(r.quantity))
  return out
}

/**
 * Safety net: puts back the holds of sessions that are no longer active
 * (closed or rejected by a path that didn't release them, or deleted).
 * `transaction` runs one session's release atomically. Returns the units put
 * back.
 */
export async function releaseHoldsOfClosedSessions(
  db: Knex,
  transaction: <T>(fn: (trx: Knex.Transaction) => Promise<T>) => Promise<T> = (
    fn,
  ) => db.transaction(fn),
): Promise<number> {
  const held: Array<{ session_id: string }> = await db(V2_OFFER_HOLDS_TABLE)
    .where({ status: "active" })
    .select("session_id")
  const sessionIds = [...new Set(held.map((h) => h.session_id))]
  if (sessionIds.length === 0) return 0
  const open: Array<{ id: string; status: string }> = await db("offer_sessions")
    .whereIn("id", sessionIds)
    .select("id", "status")
  const active = new Set(
    open.filter((s) => s.status === "active").map((s) => s.id),
  )
  let returned = 0
  for (const id of sessionIds.filter((s) => !active.has(s)).sort()) {
    returned += await transaction(async (trx) => {
      // Re-check under the transaction: the session may have been reopened.
      const session = await trx("offer_sessions")
        .where({ id })
        .forUpdate()
        .first("id", "status")
      if (session?.status === "active") return 0
      return releaseOfferHolds(trx, id, "released")
    })
  }
  return returned
}
