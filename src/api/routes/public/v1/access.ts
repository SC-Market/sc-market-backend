/**
 * Reachability rules shared by the public API controllers.
 *
 * A token reaches what its user can reach on the site, narrowed to the orgs
 * the token was granted (token-org-access.ts). What a token can't reach
 * answers 404, not 403, so the API never confirms that a private org
 * resource exists (design doc §3 "Org scoping").
 *
 * - Shops: the user's own shops, and shops of granted orgs the user belongs
 *   to (getShopsForUser with the token's org scope). Active shops only.
 * - Orders and offers: the user's own (as customer) always; seller-side ones
 *   only when their org is granted. The reused site handlers then apply the
 *   user's current org permissions.
 */

import type { Request } from "express"
import type { User } from "../../v1/api-models.js"
import type {
  DBOfferSession,
  DBOrder,
} from "../../../../clients/database/db-models.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  getShopsForUser,
  type Shop,
  type ShopPermissions,
} from "../../../../services/shops/shop-permissions.service.js"
import {
  tokenAllowsOrg,
  tokenOrgScope,
  type TokenOrgScope,
} from "../../v2/middleware/token-org-access.js"
import { isUuid } from "../../v2/util/short-slug.js"
import { BusinessLogicError } from "../../v1/util/errors.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { notFound, PublicApiError } from "./errors.js"

export function actingUser(req: Request): User {
  const user = req.user as User | undefined
  if (!user || !req.publicApiToken) {
    throw new PublicApiError(401, "UNAUTHORIZED", "An API token is required")
  }
  return user
}

export function orgScopeOf(req: Request): TokenOrgScope {
  return tokenOrgScope(req.__tokenInfo)
}

export type ReachableShop = Shop & { permissions: ShopPermissions }

export async function reachableShops(req: Request): Promise<ReachableShop[]> {
  return getShopsForUser(actingUser(req).user_id, orgScopeOf(req))
}

/** A shop by UUID or slug, if the token reaches it; else 404. */
export async function reachableShop(
  req: Request,
  ref: string,
): Promise<ReachableShop> {
  const key = ref.trim().toLowerCase()
  const shop = (await reachableShops(req)).find((s) =>
    isUuid(key) ? s.shop_id === key : s.slug.toLowerCase() === key,
  )
  if (!shop) throw notFound("Shop")
  return shop
}

/** The listing's shop id when the token reaches that shop; else 404. */
export async function reachableListingShop(
  req: Request,
  listingId: string,
): Promise<ReachableShop> {
  if (!isUuid(listingId)) throw notFound("Listing")
  const row = await getKnex()("listings")
    .where("listing_id", listingId)
    .first("shop_id")
  if (!row) throw notFound("Listing")
  const shop = (await reachableShops(req)).find(
    (s) => s.shop_id === row.shop_id,
  )
  if (!shop) throw notFound("Listing")
  return shop
}

/**
 * An order the token may look at: the user's own order (as customer), or a
 * seller-side order whose org (and shop's org) the token was granted.
 * Whether the user may see or change it is then up to the site's rules.
 */
export async function orderInGrant(
  req: Request,
  orderId: string,
): Promise<DBOrder> {
  if (!isUuid(orderId)) throw notFound("Order")
  const db = getKnex()
  const order: DBOrder | undefined = await db("orders")
    .where("order_id", orderId)
    .first()
  if (!order) throw notFound("Order")
  const user = actingUser(req)
  if (order.customer_id === user.user_id) return order
  const scope = orgScopeOf(req)
  const shop = order.shop_id
    ? await db("shops")
        .where("shop_id", order.shop_id)
        .first("owner_contractor_id")
    : undefined
  if (
    !tokenAllowsOrg(scope, order.contractor_id) ||
    !tokenAllowsOrg(scope, shop?.owner_contractor_id)
  ) {
    throw notFound("Order")
  }
  return order
}

/** Same rule as orderInGrant, for offer sessions. */
export async function offerInGrant(
  req: Request,
  sessionId: string,
): Promise<DBOfferSession> {
  if (!isUuid(sessionId)) throw notFound("Offer")
  const db = getKnex()
  const session: DBOfferSession | undefined = await db("offer_sessions")
    .where("id", sessionId)
    .first()
  if (!session) throw notFound("Offer")
  const user = actingUser(req)
  if (session.customer_id === user.user_id) return session
  const scope = orgScopeOf(req)
  const shop = session.shop_id
    ? await db("shops")
        .where("shop_id", session.shop_id)
        .first("owner_contractor_id")
    : undefined
  if (
    !tokenAllowsOrg(scope, session.contractor_id) ||
    !tokenAllowsOrg(scope, shop?.owner_contractor_id)
  ) {
    throw notFound("Offer")
  }
  return session
}

/**
 * Run a reused site handler; its "forbidden" becomes this API's 404 (the
 * token may not see the resource, so don't confirm it exists).
 */
export async function hidingForbidden<T>(
  what: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (
      error instanceof BusinessLogicError &&
      error.code === ErrorCode.FORBIDDEN
    )
      throw notFound(what)
    throw error
  }
}

/** Default page size of every public list (doc §6: 1-100, default 25). */
export const DEFAULT_PAGE_SIZE = 25
