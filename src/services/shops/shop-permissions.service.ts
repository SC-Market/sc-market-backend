import { getKnex } from "../../clients/database/knex-db.js"
import { has_permission, is_member } from "../../api/routes/v1/util/permissions.js"

export interface Shop {
  shop_id: string
  slug: string
  name: string
  description: string
  banner: string | null
  logo: string | null
  owner_user_id: string | null
  owner_contractor_id: string | null
  supported_languages: string[]
  tags: string[]
  accepts_custom_orders: boolean
  market_order_template: string
  default_pickup_method: string | null
  status: string
  created_at: string
  updated_at: string
}

/**
 * Check if a user can manage a shop (edit settings, create listings, manage stock).
 *
 * Returns true if:
 * - Shop is user-owned and user is the owner
 * - Shop is org-owned and user has manage_market permission in that org
 * - User is a site admin (checked via has_permission internals)
 */
export async function canManageShop(
  shop: Pick<Shop, "shop_id" | "owner_user_id" | "owner_contractor_id">,
  userId: string,
): Promise<boolean> {
  if (shop.owner_user_id && shop.owner_user_id === userId) {
    return true
  }

  if (shop.owner_contractor_id) {
    return has_permission(shop.owner_contractor_id, userId, "manage_market")
  }

  return false
}

/**
 * Check if a user can view a shop's private data (stock levels, order details, analytics).
 *
 * Returns true if:
 * - User can manage the shop
 * - Shop is org-owned and user is a member (any role)
 */
export async function canViewShopPrivate(
  shop: Pick<Shop, "shop_id" | "owner_user_id" | "owner_contractor_id">,
  userId: string,
): Promise<boolean> {
  if (await canManageShop(shop, userId)) return true

  if (shop.owner_contractor_id) {
    return is_member(shop.owner_contractor_id, userId)
  }

  return false
}

/**
 * Fetch a shop by ID, returns null if not found or archived.
 */
export async function getShopById(shopId: string): Promise<Shop | null> {
  const db = getKnex()
  const row = await db("shops").where("shop_id", shopId).first()
  return row || null
}

/**
 * Fetch a shop by slug, returns null if not found.
 */
export async function getShopBySlug(slug: string): Promise<Shop | null> {
  const db = getKnex()
  const row = await db("shops").where("slug", slug).first()
  return row || null
}

/**
 * Get all shops a user can manage (their own + orgs where they have manage_market).
 */
export async function getShopsForUser(userId: string): Promise<Shop[]> {
  const db = getKnex()

  const shops = await db("shops")
    .where(function () {
      this.where("owner_user_id", userId)
        .orWhereIn(
          "owner_contractor_id",
          db("contractor_members")
            .select("contractor_id")
            .where("user_id", userId),
        )
    })
    .where("status", "active")
    .orderBy("created_at", "asc")

  // Filter org shops to only those where user has manage_market
  const result: Shop[] = []
  for (const shop of shops) {
    if (shop.owner_user_id === userId) {
      result.push(shop)
    } else if (shop.owner_contractor_id) {
      const hasPerm = await has_permission(
        shop.owner_contractor_id,
        userId,
        "manage_market",
      )
      if (hasPerm) result.push(shop)
    }
  }

  return result
}
