/**
 * V2 Listing Ownership Helpers
 *
 * Permission checks via shop ownership. All listings have a shop_id.
 */

import { canManageShop, canViewShopPrivate, getShopById } from "../../../../services/shops/shop-permissions.service.js"

/**
 * Check if a user can modify a listing (edit, delete, refresh, manage stock).
 *
 * Delegates to canManageShop — user must be the shop owner or have
 * manage_market in the shop's owning org.
 */
export async function canModifyListing(
  listing: { shop_id: string },
  userId: string,
): Promise<boolean> {
  const shop = await getShopById(listing.shop_id)
  if (!shop) return false
  return canManageShop(shop, userId)
}

/**
 * Check if a user can view a listing's private data (stock, orders, analytics).
 *
 * Returns true if user can manage the shop, or is any member of the owning org.
 */
export async function canViewListingPrivate(
  listing: { shop_id: string },
  userId: string,
): Promise<boolean> {
  const shop = await getShopById(listing.shop_id)
  if (!shop) return false
  return canViewShopPrivate(shop, userId)
}
