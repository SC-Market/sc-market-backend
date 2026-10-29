/**
 * Listing visibility filters shared by every surface that lists or counts
 * listings.
 *
 * listings.visibility is one of:
 * - 'public'   — listed everywhere: market grid, shop grid, aggregates, counts.
 * - 'private'  — internal to the org that owns the shop: only members of that
 *                org may see it, in grids and on the detail page.
 * - 'unlisted' — reachable by direct link only. It never appears in a grid,
 *                search result, aggregate or count; the listing detail page
 *                still serves it to whoever has the link. The one exception
 *                is the listing search for a site admin who asks for it
 *                (?include_unlisted=true: the admin Market page and the
 *                admin-only "Show unlisted" toggle on shop pages), see
 *                ListingVisibilityOptions.
 *
 * The shop header and shop cards used to count every active listing, so an
 * anonymous visitor saw "3 listings" on a shop whose grid said "No active
 * listings". Counting through these filters keeps every count equal to what
 * the viewer's grid shows.
 */

import type { Knex } from "knex"
import type { TokenOrgScope } from "../middleware/token-org-access.js"
import {
  hiddenFromRealViewers,
  notTestShop,
} from "../../../../services/test-accounts/isolation.js"

export interface ListingVisibilityColumns {
  /** Column holding the listing's visibility ('public' | 'private' | 'unlisted'). */
  visibility: string
  /** Column holding the owning org (contractor) id of the listing's shop. */
  ownerContractorId: string
  /**
   * Column holding the listing's shop id. Listings of test shops
   * (shops.is_test, src/services/test-accounts/isolation.ts) are only visible
   * to test accounts.
   */
  shopId: string
}

export interface ListingVisibilityOptions {
  /**
   * Also include unlisted listings. Only for a site admin's listing search
   * (the caller checks isSiteAdmin, which is never true for a test account);
   * ignored for anonymous viewers. The test-shop rule still applies.
   */
  includeUnlisted?: boolean
}

/**
 * Returns a `where` callback restricting a listings query to the listings the
 * viewer may see in a grid, search result, aggregate or count: public ones,
 * plus private ones of orgs the viewer belongs to. Unlisted listings are
 * never included (they are link-only), unless `options.includeUnlisted`.
 * Pass `undefined` for anonymous viewers.
 *
 * `orgScope` is the request's API-token org grant (BaseController.tokenOrgScope):
 * a token sees private listings only of the orgs it was granted. null
 * (sessions, full/admin tokens, anonymous) applies membership alone.
 */
export function listingVisibleTo(
  db: Knex,
  viewerUserId: string | undefined,
  orgScope: TokenOrgScope,
  columns: ListingVisibilityColumns,
  options: ListingVisibilityOptions = {},
): (this: Knex.QueryBuilder) => void {
  return function () {
    // Test shops' listings: test viewers only (services/test-accounts).
    this.whereRaw(hiddenFromRealViewers(db, notTestShop(columns.shopId), viewerUserId))
    if (!viewerUserId) {
      this.where(columns.visibility, "public")
      return
    }
    const includeUnlisted = options.includeUnlisted === true
    this.where(function () {
      this.where(columns.visibility, "public")
      if (includeUnlisted) this.orWhere(columns.visibility, "unlisted")
      this.orWhere(function () {
      this.where(columns.visibility, "private")
        .whereNotNull(columns.ownerContractorId)
        .whereExists(function () {
          this.select(db.raw("1"))
            .from("contractor_members")
            .whereRaw("contractor_members.contractor_id = ??", [
              columns.ownerContractorId,
            ])
            .where("contractor_members.user_id", viewerUserId)
            .modify((q) => {
              if (orgScope !== null) q.whereIn("contractor_members.contractor_id", [...orgScope])
            })
          })
      })
    })
  }
}

export interface PubliclyListedColumns {
  /** Column holding the listing's status ('active' | 'inactive' | ...). */
  status: string
  /** Column holding the listing's visibility ('public' | 'private' | 'unlisted'). */
  visibility: string
  /** Not needed: the anonymous rule has no org-member exception. */
  ownerContractorId?: string
  /** Column holding the listing's shop id: test shops are never publicly listed. */
  shopId: string
}

/**
 * Returns a `where` callback restricting a listings query to listings that may
 * be shown or broadcast to anyone: active and visible to an anonymous visitor
 * of the market grid (the `listingVisibleTo(db, undefined, ...)` rule, i.e.
 * visibility = 'public'). Used for alerts to strangers (watchlist, buy-order
 * matches) and for viewer-independent public aggregates (wiki market stats,
 * mining prices, price history, sitemap). It works on any table with the two
 * columns, including `listings` queries that don't join `shops`.
 */
export function listingPubliclyListed(
  _db: Knex,
  columns: PubliclyListedColumns,
): (this: Knex.QueryBuilder) => void {
  return function () {
    this.where(columns.status, "active")
      .where(function () {
        this.where(columns.visibility, "public")
      })
      .whereRaw(notTestShop(columns.shopId))
  }
}

/**
 * Builds the query that counts a shop's active listings visible to the viewer.
 * It uses the same `listing_search` view and filters as the market grid
 * (`GET /listings/search?shop_slug=...`) so the two numbers can't drift.
 *
 * `shopId` is either a literal shop id or `db.ref("s.shop_id")` to correlate
 * with an outer query.
 */
export function visibleActiveListingCountQuery(
  db: Knex,
  shopId: string | Knex.Ref<string, Record<string, string>>,
  viewerUserId: string | undefined,
  orgScope: TokenOrgScope,
): Knex.QueryBuilder {
  return db("listing_search as ls")
    .where("ls.shop_id", shopId)
    .where("ls.status", "active")
    .where(
      listingVisibleTo(db, viewerUserId, orgScope, {
        visibility: "ls.visibility",
        ownerContractorId: "ls.shop_owner_contractor_id",
        shopId: "ls.shop_id",
      }),
    )
}

/**
 * SQL-text form of `listingPubliclyListed` for subqueries written as raw SQL
 * (listing photo lookups, the price-history snapshot). `alias` is the listings
 * table alias in that SQL: a code literal, never user input. Excludes test
 * shops' listings.
 */
export function publiclyListedSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error(`publiclyListedSql: invalid table alias ${alias}`)
  }
  return `${alias}.status = 'active' AND ${alias}.visibility = 'public' AND ${notTestShop(`${alias}.shop_id`)}`
}
