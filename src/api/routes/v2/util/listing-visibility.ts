/**
 * Listing visibility filters shared by every surface that lists or counts
 * listings.
 *
 * listings.visibility is one of:
 * - 'public'   — listed everywhere: market grid, shop grid, aggregates, counts.
 * - 'private'  — internal to the org that owns the shop: only members of that
 *                org may see it, in grids and on the detail page.
 * - 'unlisted' — reachable by direct link only. It never appears in a grid,
 *                search result, aggregate or count, for anyone; the listing
 *                detail page still serves it to whoever has the link.
 *
 * The shop header and shop cards used to count every active listing, so an
 * anonymous visitor saw "3 listings" on a shop whose grid said "No active
 * listings". Counting through these filters keeps every count equal to what
 * the viewer's grid shows.
 */

import type { Knex } from "knex"

export interface ListingVisibilityColumns {
  /** Column holding the listing's visibility ('public' | 'private' | 'unlisted'). */
  visibility: string
  /** Column holding the owning org (contractor) id of the listing's shop. */
  ownerContractorId: string
}

/**
 * Returns a `where` callback restricting a listings query to the listings the
 * viewer may see in a grid, search result, aggregate or count: public ones,
 * plus private ones of orgs the viewer belongs to. Unlisted listings are never
 * included (they are link-only). Pass `undefined` for anonymous viewers.
 */
export function listingVisibleTo(
  db: Knex,
  viewerUserId: string | undefined,
  columns: ListingVisibilityColumns,
): (this: Knex.QueryBuilder) => void {
  return function () {
    if (!viewerUserId) {
      this.where(columns.visibility, "public")
      return
    }
    this.where(columns.visibility, "public").orWhere(function () {
      this.where(columns.visibility, "private")
        .whereNotNull(columns.ownerContractorId)
        .whereExists(function () {
          this.select(db.raw("1"))
            .from("contractor_members")
            .whereRaw("contractor_members.contractor_id = ??", [
              columns.ownerContractorId,
            ])
            .where("contractor_members.user_id", viewerUserId)
        })
    })
  }
}

export interface PubliclyListedColumns extends ListingVisibilityColumns {
  /** Column holding the listing's status ('active' | 'inactive' | ...). */
  status: string
}

/**
 * Returns a `where` callback restricting a listings query to listings that may
 * be shown or broadcast to anyone: active and visible to an anonymous visitor
 * of the market grid (the `listingVisibleTo(db, undefined, ...)` rule, i.e.
 * visibility = 'public'). Used for alerts to strangers (watchlist, buy-order
 * matches) and for viewer-independent public aggregates (wiki market stats,
 * mining prices, price history, sitemap).
 */
export function listingPubliclyListed(
  db: Knex,
  columns: PubliclyListedColumns,
): (this: Knex.QueryBuilder) => void {
  return function () {
    this.where(columns.status, "active").where(
      listingVisibleTo(db, undefined, columns),
    )
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
): Knex.QueryBuilder {
  return db("listing_search as ls")
    .where("ls.shop_id", shopId)
    .where("ls.status", "active")
    .where(
      listingVisibleTo(db, viewerUserId, {
        visibility: "ls.visibility",
        ownerContractorId: "ls.shop_owner_contractor_id",
      }),
    )
}
