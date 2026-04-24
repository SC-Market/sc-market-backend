/**
 * V2 Listing Ownership Helpers
 *
 * Reusable permission checks for V2 controllers.
 * Uses V1 permission helpers (has_permission, is_member) under the hood.
 */

import { has_permission, is_member } from "../../v1/util/permissions.js"

/**
 * Check if a user can modify a listing (edit, delete, refresh, manage stock).
 *
 * Returns true if:
 * - User is the direct seller (seller_type='user', seller_id=userId)
 * - User is a member of the seller org with manage_market permission
 * - User is a site admin
 */
export async function canModifyListing(
  listing: { seller_id: string; seller_type: string },
  userId: string,
): Promise<boolean> {
  // Direct seller
  if (listing.seller_type === "user" && listing.seller_id === userId) {
    return true
  }

  // Contractor member with manage_market permission
  if (listing.seller_type === "contractor") {
    return has_permission(listing.seller_id, userId, "manage_market")
  }

  return false
}

/**
 * Check if a user can view a listing's private data (stock, orders, analytics).
 *
 * Returns true if:
 * - User can modify the listing (above)
 * - User is a member of the seller org (any role)
 */
export async function canViewListingPrivate(
  listing: { seller_id: string; seller_type: string },
  userId: string,
): Promise<boolean> {
  if (await canModifyListing(listing, userId)) return true

  if (listing.seller_type === "contractor") {
    return is_member(listing.seller_id, userId)
  }

  return false
}
