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
 * Get all shops associated with a user (their own + orgs they're a member of).
 * Includes a `can_manage` flag indicating whether the user has manage_market permission.
 */
export interface ShopPermissions {
  can_manage: boolean
  manage_market: boolean
  manage_stock: boolean
  manage_orders: boolean
}

export async function getShopsForUser(userId: string): Promise<(Shop & { permissions: ShopPermissions })[]> {
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

  const result: (Shop & { permissions: ShopPermissions })[] = []
  for (const shop of shops) {
    if (shop.owner_user_id === userId) {
      result.push({ ...shop, permissions: { can_manage: true, manage_market: true, manage_stock: true, manage_orders: true } })
    } else if (shop.owner_contractor_id) {
      const [manageMarket, manageStock, manageOrders] = await Promise.all([
        has_permission(shop.owner_contractor_id, userId, "manage_market"),
        has_permission(shop.owner_contractor_id, userId, "manage_stock"),
        has_permission(shop.owner_contractor_id, userId, "manage_orders"),
      ])
      result.push({
        ...shop,
        permissions: {
          can_manage: manageMarket,
          manage_market: manageMarket,
          manage_stock: manageStock,
          manage_orders: manageOrders,
        },
      })
    }
  }

  return result
}
