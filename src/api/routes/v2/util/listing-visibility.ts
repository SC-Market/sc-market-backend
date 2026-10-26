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
