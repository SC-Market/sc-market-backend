/**
 * API tokens are restricted to the orgs listed in `contractor_ids`.
 *
 * v1 enforces this per route (requireContractorAccess); v2 ignored it, so a
 * token created for one org (or for personal use) could act for every org its
 * user manages. Here the org(s) a v2 request touches are derived from the
 * request itself and checked against the token. `full` and `admin` tokens are
 * unrestricted, as in v1.
 *
 * Org references recognised in path params and query, and anywhere in a JSON
 * body (nested objects and arrays included), snake_case or camelCase:
 * - spectrum_id, contractor_id
 * - shop_id / shopId, shops/{slug}   -> the shop's owning org
 * - listing_id / listingId, and listings/{id}   -> the listing's shop's org
 * - lotId / lot_id, and stock-lots/{id}         -> the lot's listing's org
 * - order_id / orderId, orders/{id}  -> the order's org
 * - session_id / sessionId / offer_id / offerId, offers/{id}
 *                                    -> the offer session's org
 * A request that touches no org (personal resources) is not affected.
 */

import type { Knex } from "knex"
import type { Request } from "express"
import type { TokenInfo } from "./token-scopes.js"

type Source = Record<string, unknown> | undefined

/** How deep and how wide a JSON body is searched for org references. */
const MAX_BODY_DEPTH = 6
const MAX_BODY_NODES = 2000
/** Ids of one kind looked up per request; more is refused (400). */
const MAX_IDS_PER_KIND = 100

/**
 * String values under any of `keys`, in params and query (top level) and
 * anywhere in a JSON body: nested objects and arrays (cart lines, bulk
 * payloads), and a body that is itself an array.
 */
function strings(sources: Source[], body: unknown, ...keys: string[]): string[] {
  const out = new Set<string>()
  const wanted = new Set(keys)
  for (const src of sources) {
    if (!src || typeof src !== "object") continue
    for (const k of keys) {
      const v = (src as Record<string, unknown>)[k]
      if (typeof v === "string" && v) out.add(v)
    }
  }
  let nodes = 0
  const walk = (value: unknown, depth: number) => {
    if (depth > MAX_BODY_DEPTH || nodes > MAX_BODY_NODES) return
    if (Array.isArray(value)) {
      for (const item of value) {
        nodes++
        walk(item, depth + 1)
      }
      return
    }
    if (!value || typeof value !== "object") return
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      nodes++
      if (wanted.has(k)) {
        if (typeof v === "string" && v) out.add(v)
        else if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && x && out.add(x))
      }
      if (v && typeof v === "object") walk(v, depth + 1)
    }
  }
  walk(body, 0)
  if (out.size > MAX_IDS_PER_KIND) {
    const err = new Error(`Too many ${keys[0]} references in one request`) as Error & {
      status: number
    }
    err.status = 400
    throw err
  }
  return [...out]
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
  const sources: Source[] = [req.params as Source, req.query as Source]
  const body = req.body && typeof req.body === "object" ? req.body : undefined
  const orgs = new Set<string>()
  const add = (id: string | null | undefined) => {
    if (id) orgs.add(id)
  }

  for (const c of strings(sources, body, "contractor_id", "contractorId")) add(c)

  for (const sid of strings(sources, body, "spectrum_id", "spectrumId")) {
    const row = await db("contractors")
      .where({ spectrum_id: sid })
      .first("contractor_id")
    add(row?.contractor_id)
  }

  const shopIds = strings(sources, body, "shop_id", "shopId")
  const listingIds = strings(sources, body, "listing_id", "listingId")
  const pl = pathId(req.path, "listings")
  if (pl) listingIds.push(pl)
  const lotIds = strings(sources, body, "lot_id", "lotId")
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
  // GET /shops/{slug}: the route's own param (from the matched route), not
  // any "slug" in the query or body.
  const slug = (req.params as Record<string, unknown> | undefined)?.slug
  if (typeof slug === "string" && slug && /^\/?shops\//i.test(req.path)) {
    // Slugs are stored lower-case (generateSlug).
    const row = await db("shops").where({ slug: slug.toLowerCase() }).first("shop_id")
    if (row?.shop_id) shopIds.push(row.shop_id)
  }
  for (const shop_id of shopIds) {
    const row = await db("shops")
      .where({ shop_id })
      .first("owner_contractor_id")
    add(row?.owner_contractor_id)
  }

  const orderIds = strings(sources, body, "order_id", "orderId")
  const po = pathId(req.path, "orders")
  if (po) orderIds.push(po)
  for (const order_id of orderIds) {
    const row = await db("orders").where({ order_id }).first("contractor_id")
    add(row?.contractor_id)
  }

  const sessionIds = strings(sources, body, "session_id", "sessionId", "offer_id", "offerId", "offer_session_id")
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
