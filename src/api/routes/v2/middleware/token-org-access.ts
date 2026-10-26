/**
 * API tokens are restricted to the orgs listed in `contractor_ids`.
 *
 * v1 enforces this per route (requireContractorAccess); v2 ignored it, so a
 * token created for one org (or for personal use) could act for every org its
 * user manages. Here the org(s) a v2 request touches are derived from the
 * request itself and checked against the token. `full` and `admin` tokens are
 * unrestricted, as in v1.
 *
 * Org references recognised (path params, query, or JSON body):
 * - spectrum_id, contractor_id
 * - shop_id / shopId                 -> the shop's owning org
 * - listing_id / listingId, and listings/{id}   -> the listing's shop's org
 * - lotId / lot_id, and stock-lots/{id}         -> the lot's listing's org
 * - orderId, orders/{id}             -> the order's org
 * - sessionId / offerId, offers/{id} -> the offer session's org
 * A request that touches no org (personal resources) is not affected.
 */

import type { Knex } from "knex"
import type { Request } from "express"
import type { TokenInfo } from "./token-scopes.js"

type Source = Record<string, unknown> | undefined

function strings(sources: Source[], ...keys: string[]): string[] {
  const out: string[] = []
  for (const src of sources) {
    if (!src || typeof src !== "object") continue
    for (const k of keys) {
      const v = (src as Record<string, unknown>)[k]
      if (typeof v === "string" && v) out.push(v)
    }
  }
  return out
}

function pathId(path: string, prefix: string): string | null {
  const m = path
    .replace(/^\/+/, "")
    .match(new RegExp(`^${prefix}/([^/?]+)`, "i"))
  if (!m) return null
  const id = m[1]
  // Only ids, not sub-collections like listings/mine or orders/search
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

export async function orgIdsForRequest(
  db: Knex,
  req: Pick<Request, "params" | "query" | "body" | "path">,
): Promise<Set<string>> {
  const sources: Source[] = [
    req.params as Source,
    req.query as Source,
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Source)
      : undefined,
  ]
  const orgs = new Set<string>()
  const add = (id: string | null | undefined) => {
    if (id) orgs.add(id)
  }

  for (const c of strings(sources, "contractor_id")) add(c)

  for (const sid of strings(sources, "spectrum_id")) {
    const row = await db("contractors")
      .where({ spectrum_id: sid })
      .first("contractor_id")
    add(row?.contractor_id)
  }

  const shopIds = strings(sources, "shop_id", "shopId")
  const listingIds = strings(sources, "listing_id", "listingId")
  const pl = pathId(req.path, "listings")
  if (pl) listingIds.push(pl)
  const lotIds = strings(sources, "lotId", "lot_id")
  const plot = pathId(req.path, "stock-lots")
  if (plot) lotIds.push(plot)
  for (const lot_id of lotIds) {
    const row = await db("listing_item_lots as lil")
      .join("listing_items as li", "lil.item_id", "li.item_id")
      .where("lil.lot_id", lot_id)
      .first("li.listing_id")
    if (row?.listing_id) listingIds.push(row.listing_id)
  }
  for (const listing_id of listingIds) {
    const row = await db("listings").where({ listing_id }).first("shop_id")
    if (row?.shop_id) shopIds.push(row.shop_id)
  }
  for (const shop_id of shopIds) {
    const row = await db("shops")
      .where({ shop_id })
      .first("owner_contractor_id")
    add(row?.owner_contractor_id)
  }

  const orderIds = strings(sources, "orderId")
  const po = pathId(req.path, "orders")
  if (po) orderIds.push(po)
  for (const order_id of orderIds) {
    const row = await db("orders").where({ order_id }).first("contractor_id")
    add(row?.contractor_id)
  }

  const sessionIds = strings(sources, "sessionId", "offerId")
  const ps = pathId(req.path, "offers")
  if (ps) sessionIds.push(ps)
  for (const id of sessionIds) {
    const row = await db("offer_sessions").where({ id }).first("contractor_id")
    add(row?.contractor_id)
  }

  return orgs
}

/**
 * Throws a 403 when a token request touches an org the token wasn't granted.
 *
 * Only orgs the token's user belongs to are checked: those are the ones whose
 * permissions the request could use. Touching another org's resources as an
 * outsider (buying from its shop, reading its listings) needs no grant; the
 * normal authorization treats the user as a customer there.
 */
export async function enforceTokenOrgAccess(
  db: Knex,
  tokenInfo: TokenInfo | undefined,
  req: Pick<Request, "params" | "query" | "body" | "path">,
  userId: string,
): Promise<void> {
  if (!tokenInfo) return
  const scopes = tokenInfo.scopes || []
  if (scopes.includes("admin") || scopes.includes("full")) return

  const allowed = new Set(tokenInfo.contractor_ids || [])
  for (const org of await orgIdsForRequest(db, req)) {
    if (allowed.has(org)) continue
    const member = await db("contractor_members")
      .where({ contractor_id: org, user_id: userId })
      .first()
    if (member) {
      const err = new Error(
        "Token does not have access to this contractor",
      ) as Error & {
        status: number
      }
      err.status = 403
      throw err
    }
  }
}
