/**
 * Checks every purchase path must run before creating an order or offer for a
 * shop. Cart checkout had them inline; the direct-purchase (POST
 * /api/v2/buy-orders) and POST /api/v2/orders paths skipped them, and nothing
 * consulted the shop's own blocklist.
 */

import { isBlockedFromShop } from "../shops/shop-permissions.service.js"
import { assertSameRealm } from "../test-accounts/isolation.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import {
  validateAvailabilityRequirement,
  validateOrderLimits,
} from "../../api/routes/v1/orders/helpers.js"

export interface CheckoutShop {
  shop_id: string
  owner_user_id: string | null
  owner_contractor_id: string | null
}

/** A purchase the buyer may not make. `field` points the UI at the cause. */
export class CheckoutRejectedError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message)
    this.name = "CheckoutRejectedError"
  }
}

/** Whether the buyer is blocked by the shop or by its owning org/user. */
export async function isBuyerBlocked(
  userId: string,
  shop: CheckoutShop,
): Promise<boolean> {
  if (await isBlockedFromShop(shop.shop_id, userId)) return true
  if (
    shop.owner_contractor_id &&
    (await profileDb.isUserBlocked(
      shop.owner_contractor_id,
      userId,
      "contractor",
    ))
  ) {
    return true
  }
  if (
    shop.owner_user_id &&
    (await profileDb.isUserBlocked(shop.owner_user_id, userId, "user"))
  ) {
    return true
  }
  return false
}

/**
 * Self-purchase, test/real isolation, blocklists (shop + owner), availability
 * requirement and the seller's order size/value limits. Throws
 * CheckoutRejectedError (isolation: the 403 from testIsolationError).
 */
export async function assertBuyerMayCheckout(
  userId: string,
  shop: CheckoutShop,
  offerSize: number,
  totalPrice: number,
): Promise<void> {
  if (shop.owner_user_id && shop.owner_user_id === userId) {
    throw new CheckoutRejectedError(
      "You cannot purchase from your own shop",
      "shop",
    )
  }
  // Test accounts buy only from test shops, real ones only from real shops
  // (403, services/test-accounts/isolation.ts).
  await assertSameRealm({ users: [userId], shops: [shop.shop_id] })
  if (await isBuyerBlocked(userId, shop)) {
    throw new CheckoutRejectedError(
      "You are blocked from purchasing from this shop",
      "shop",
    )
  }
  try {
    await validateAvailabilityRequirement(
      userId,
      shop.owner_contractor_id,
      shop.owner_user_id,
    )
  } catch (error) {
    throw new CheckoutRejectedError(
      error instanceof Error
        ? error.message
        : "Availability is required to submit this offer.",
      "availability",
    )
  }
  try {
    await validateOrderLimits(
      shop.owner_contractor_id,
      shop.owner_user_id,
      offerSize,
      totalPrice,
    )
  } catch (error) {
    throw new CheckoutRejectedError(
      error instanceof Error
        ? error.message
        : "Order does not meet size or value requirements",
      "order_limits",
    )
  }
}
