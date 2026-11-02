/**
 * V2 Listing Ownership Helpers
 *
 * Permission checks via shop ownership. All listings have a shop_id.
 */

import { canManageShop, canManageShopStock, canViewShopPrivate, getShopById } from "../../../../services/shops/shop-permissions.service.js"

/**
 * Check if a user can modify a listing (edit, delete, refresh). Stock lots
 * have their own check, canModifyListingStock.
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
 * Check if a user can write a listing's stock lots (create, edit, delete).
 *
 * Delegates to canManageShopStock — the shop owner, or manage_market or
 * manage_stock in the shop's owning org.
 */
export async function canModifyListingStock(
  listing: { shop_id: string },
  userId: string,
): Promise<boolean> {
  const shop = await getShopById(listing.shop_id)
  if (!shop) return false
  return canManageShopStock(shop, userId)
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
