/**
 * Listing visibility filter shared by the market grid and every place that
 * counts a shop's listings.
 *
 * A listing with visibility = 'private' is internal to the org that owns the
 * shop: only members of that org may see it. Everyone else (anonymous visitors
 * included) sees only non-private listings. The shop header and shop cards
 * used to count every active listing, so an anonymous visitor saw "3 listings"
 * on a shop whose grid said "No active listings". Counting through this filter
 * keeps the count equal to what the viewer's grid shows.
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
 * viewer may see. Pass `undefined` for anonymous viewers.
 */
export function listingVisibleTo(
  db: Knex,
  viewerUserId: string | undefined,
  columns: ListingVisibilityColumns,
): (this: Knex.QueryBuilder) => void {
  return function () {
    if (!viewerUserId) {
      this.where(columns.visibility, "!=", "private")
      return
    }
    this.where(columns.visibility, "!=", "private").orWhere(function () {
      this.whereNotNull(columns.ownerContractorId).whereExists(function () {
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
 * be broadcast to anyone: active, visible to an anonymous visitor of the public
 * market grid (the `listingVisibleTo(db, undefined, ...)` rule), and not
 * 'unlisted'. Unlisted listings are reachable by link only, so pushing them to
 * strangers (watchlist alerts) would leak them even though the anonymous grid
 * rule alone lets them through.
 */
export function listingPubliclyListed(
  db: Knex,
  columns: PubliclyListedColumns,
): (this: Knex.QueryBuilder) => void {
  return function () {
    this.where(columns.status, "active")
      .where(listingVisibleTo(db, undefined, columns))
      .where(columns.visibility, "public")
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
