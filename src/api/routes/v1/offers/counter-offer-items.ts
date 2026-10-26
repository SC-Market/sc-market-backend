import type { Knex } from "knex"
import type { DBOfferSession } from "../../../../clients/database/db-models.js"

type Session = Pick<DBOfferSession, "shop_id" | "contractor_id" | "assigned_id">

/**
 * Every item in a counter-offer must come from the session's seller, and each
 * V2 variant must be a variant of that listing's item.
 *
 * Without this, a user could open an offer to their own shop, counter-offer
 * with someone else's listing and accept it: the resulting order then
 * consumes (allocates / decrements) the victim's stock.
 *
 * Returns null when all items are valid, else a message for the user.
 */
export async function validateCounterOfferItems(
  db: Knex | ((table: string) => Knex.QueryBuilder),
  session: Session,
  v1Listings: {
    listing: {
      listing: {
        user_seller_id?: string | null
        contractor_seller_id?: string | null
      }
    }
  }[],
  v2Items: { listing_id: string; variant_id: string }[],
): Promise<string | null> {
  for (const { listing } of v1Listings) {
    const l = listing.listing
    const sameSeller = session.contractor_id
      ? l.contractor_seller_id === session.contractor_id
      : !!l.user_seller_id && l.user_seller_id === session.assigned_id
    if (!sameSeller) return "Every listing must belong to this offer's seller"
  }

  const shopCache = new Map<
    string,
    | { owner_user_id: string | null; owner_contractor_id: string | null }
    | undefined
  >()
  for (const item of v2Items) {
    const listing = await db("listings")
      .where({ listing_id: item.listing_id })
      .first()
    if (!listing || listing.status !== "active") return "Invalid V2 listing"

    if (session.shop_id) {
      if (listing.shop_id !== session.shop_id) {
        return "Every listing must belong to this offer's shop"
      }
    } else {
      if (!shopCache.has(listing.shop_id)) {
        shopCache.set(
          listing.shop_id,
          await db("shops")
            .where({ shop_id: listing.shop_id })
            .first("owner_user_id", "owner_contractor_id"),
        )
      }
      const shop = shopCache.get(listing.shop_id)
      const sameSeller =
        !!shop &&
        (session.contractor_id
          ? shop.owner_contractor_id === session.contractor_id
          : !!shop.owner_user_id && shop.owner_user_id === session.assigned_id)
      if (!sameSeller) return "Every listing must belong to this offer's seller"
    }

    const listingItem = await db("listing_items")
      .where({ listing_id: item.listing_id })
      .first()
    const variant = await db("item_variants")
      .where({ variant_id: item.variant_id })
      .first()
    if (
      !listingItem ||
      !variant ||
      variant.game_item_id !== listingItem.game_item_id
    ) {
      return "Invalid variant"
    }
  }
  return null
}
