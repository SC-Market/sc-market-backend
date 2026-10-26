import { getKnex } from "../../clients/database/knex-db.js"
import { has_permission, is_member } from "../../api/routes/v1/util/permissions.js"
import { isContractorOwner } from "../../api/routes/v1/contractors/database.js"

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
  badge_ids: string[]
  /** Test shop (owner is a test account or test org). Set by a DB trigger. */
  is_test?: boolean
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
 * Check if a user handles a shop's orders as its seller: the owning user, or
 * an org member with manage_market or manage_orders.
 */
export async function canManageShopOrders(
  shop: Pick<Shop, "shop_id" | "owner_user_id" | "owner_contractor_id">,
  userId: string,
): Promise<boolean> {
  if (shop.owner_user_id) return shop.owner_user_id === userId
  if (!shop.owner_contractor_id) return false
  return (
    (await has_permission(shop.owner_contractor_id, userId, "manage_market")) ||
    has_permission(shop.owner_contractor_id, userId, "manage_orders")
  )
}

/**
 * IDs of every shop (active or not) whose orders the user handles as the
 * seller, per canManageShopOrders.
 */
export async function getShopIdsWithOrderAccess(userId: string): Promise<string[]> {
  const db = getKnex()
  const shops: Pick<Shop, "shop_id" | "owner_user_id" | "owner_contractor_id">[] = await db("shops")
    .where("owner_user_id", userId)
    .orWhereIn(
      "owner_contractor_id",
      db("contractor_members").select("contractor_id").where("user_id", userId),
    )
    .select("shop_id", "owner_user_id", "owner_contractor_id")
  const allowed = await Promise.all(shops.map((shop) => canManageShopOrders(shop, userId)))
  return shops.filter((_, i) => allowed[i]).map((shop) => shop.shop_id)
}

/**
 * Check if a user may give a shop away (transfer ownership).
 *
 * Stricter than canManageShop: a manage_market member can run an org's shop
 * but must not be able to hand it to themselves. Only the owning user, or the
 * owner of the owning org, may transfer. (Site admins are handled by callers.)
 */
export async function canTransferShop(
  shop: Pick<Shop, "shop_id" | "owner_user_id" | "owner_contractor_id">,
  userId: string,
): Promise<boolean> {
  if (shop.owner_user_id) {
    return shop.owner_user_id === userId
  }
  if (shop.owner_contractor_id) {
    return isContractorOwner(userId, shop.owner_contractor_id)
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

export async function isBlockedFromShop(shopId: string, userId: string): Promise<boolean> {
  const db = getKnex()
  const entry = await db("shop_blocklist")
    .where({ shop_id: shopId, blocked_user_id: userId })
    .first("id")
  return !!entry
}
