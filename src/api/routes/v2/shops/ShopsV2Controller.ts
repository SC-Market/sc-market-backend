/**
 * Shops V2 Controller
 *
 * TSOA controller for shop management. Shops are the seller identity —
 * listings, services, orders belong to a shop. A user or org can own multiple shops.
 */

import { Controller, Post, Get, Put, Delete, Route, Tags, Body, Request, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  canManageShop,
  getShopById,
  getShopBySlug,
  getShopsForUser,
  type Shop,
} from "../../../../services/shops/shop-permissions.service.js"
import { getShopMetrics } from "../../../../services/shops/shop-metrics.service.js"
import { has_permission } from "../../v1/util/permissions.js"
import { ErrorCode } from "../../v1/util/error-codes.js"

// ─── Request/Response Types ──────────────────────────────────────────────────

export interface CreateShopRequest {
  name: string
  slug?: string
  description?: string
  banner?: string
  logo?: string
  /** If set, shop is owned by this org. User must have manage_market in the org. */
  contractor_id?: string
}

export interface QuickCreateShopRequest {
  owner_type: "user" | "contractor"
  /** Required when owner_type is "contractor" */
  contractor_id?: string
}

export interface UpdateShopRequest {
  name?: string
  slug?: string
  description?: string
  banner?: string
  logo?: string
  supported_languages?: string[]
  market_order_template?: string
  default_pickup_method?: string | null
  tags?: string[]
  accepts_custom_orders?: boolean
}

export interface TransferShopRequest {
  target_contractor_id: string
}

export interface ShopResponse {
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
  banner_url: string | null
  /** Granular permissions for the current user on this shop (only in /shops/mine) */
  permissions?: {
    can_manage: boolean
    manage_market: boolean
    manage_stock: boolean
    manage_orders: boolean
  }
  logo_url: string | null
}

export interface ShopOwnerInfo {
  type: "user" | "contractor"
  /** Username (for users) or spectrum_id (for orgs) */
  slug: string
  name: string
  avatar_url: string | null
}

export interface ShopMetricsResponse {
  total_orders: number
  total_completed: number
  avg_completion_hours: number | null
  streak: number
  response_rate: number | null
}

export interface ShopPublicResponse {
  shop_id: string
  slug: string
  name: string
  description: string
  banner_url: string | null
  logo_url: string | null
  supported_languages: string[]
  tags: string[]
  accepts_custom_orders: boolean
  status: string
  created_at: string
  rating: number | null
  rating_count: number
  /** Owner information — link to user profile or org page (included in detail view) */
  owner?: ShopOwnerInfo
  /** Number of active listings in this shop (included in detail view) */
  listing_count?: number
  /** Total completed orders (included in detail view) */
  total_sales?: number
  /** Metrics for reputation/badges (included in detail view) */
  metrics?: ShopMetricsResponse
}

export interface ShopReviewResponse {
  review_id: string
  rating: number
  comment: string
  created_at: string
  author: {
    user_id: string
    username: string
    display_name: string
    avatar: string | null
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Route("shops")
@Tags("Shops")
export class ShopsV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * List all shops the current user can manage.
   * Includes personal shops and org shops where user has manage_market.
   *
   * @summary List my shops
   */
  @Get("mine")
  @Security("loggedin")
  public async getMyShops(@Request() request: ExpressRequest): Promise<ShopResponse[]> {
    this.request = request
    const userId = this.getUserId()
    const shops = await getShopsForUser(userId)
    return Promise.all(shops.map(async (shop) => {
      const response = await shopToResponse(shop)
      return { ...response, permissions: shop.permissions }
    }))
  }

  /**
   * Create a new shop. If contractor_id is provided, the shop is org-owned
   * (user must have manage_market). Otherwise, user-owned.
   *
   * @summary Create shop
   */
  @Post("")
  @Security("loggedin")
  public async createShop(
    @Request() request: ExpressRequest,
    @Body() body: CreateShopRequest,
  ): Promise<ShopResponse> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    let ownerUserId: string | null = null
    let ownerContractorId: string | null = null

    if (body.contractor_id) {
      const hasPerm = await has_permission(body.contractor_id, userId, "manage_market")
      if (!hasPerm) {
        this.throwForbidden("You do not have manage_market permission in this org")
      }
      ownerContractorId = body.contractor_id
    } else {
      ownerUserId = userId
    }

    const slug = body.slug || await generateSlug(db, body.name)

    const existing = await db("shops").where("slug", slug).first()
    if (existing) {
      this.throwConflict("A shop with this slug already exists")
    }

    const [shop] = await db("shops")
      .insert({
        slug,
        name: body.name,
        description: body.description || "",
        banner: body.banner || null,
        logo: body.logo || null,
        owner_user_id: ownerUserId,
        owner_contractor_id: ownerContractorId,
      })
      .returning("*")

    return await shopToResponse(shop)
  }

  /**
   * Quick-create a shop with auto-populated defaults from user profile or org details.
   * Only name is required to proceed — everything else is pre-filled.
   *
   * @summary Quick-create shop
   */
  @Post("quick")
  @Security("loggedin")
  public async quickCreateShop(
    @Request() request: ExpressRequest,
    @Body() body: QuickCreateShopRequest,
  ): Promise<ShopResponse> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    if (body.owner_type === "contractor") {
      if (!body.contractor_id) {
        this.throwBusinessError(ErrorCode.VALIDATION_ERROR, "contractor_id is required for org shops")
      }

      const hasPerm = await has_permission(body.contractor_id, userId, "manage_market")
      if (!hasPerm) {
        this.throwForbidden("You do not have manage_market permission in this org")
      }

      // Return existing shop if one already exists for this org
      const existing = await db("shops").where("owner_contractor_id", body.contractor_id).where("status", "active").first()
      if (existing) return await shopToResponse(existing)

      const contractor = await db("contractors")
        .where("contractor_id", body.contractor_id)
        .first()
      if (!contractor) this.throwNotFound("Contractor", body.contractor_id)

      const slug = await generateSlug(db, contractor.spectrum_id)

      const [shop] = await db("shops")
        .insert({
          slug,
          name: contractor.name,
          description: contractor.description || "",
          banner: contractor.banner,
          logo: contractor.avatar,
          owner_contractor_id: body.contractor_id,
          market_order_template: contractor.market_order_template || "",
        })
        .returning("*")

      return await shopToResponse(shop)
    }

    // Return existing personal shop if one already exists
    const existingPersonal = await db("shops").where("owner_user_id", userId).where("status", "active").first()
    if (existingPersonal) return await shopToResponse(existingPersonal)

    // User-owned shop
    const user = await db("accounts").where("user_id", userId).first()
    if (!user) this.throwNotFound("User")

    const slug = await generateSlug(db, user.username + "-shop")

    const [shop] = await db("shops")
      .insert({
        slug,
        name: `${user.display_name}'s Shop`,
        description: "",
        banner: user.banner,
        logo: user.avatar,
        owner_user_id: userId,
        market_order_template: user.market_order_template || "",
      })
      .returning("*")

    return await shopToResponse(shop)
  }

  /**
   * Get shops by owner. Used on user/org profile pages to show their shops.
   *
   * @summary Get shops by owner
   */
  @Get("by-owner")
  public async getShopsByOwner(
    @Query() username?: string,
    @Query() spectrum_id?: string,
  ): Promise<ShopPublicResponse[]> {
    const db = getKnex()

    let query = db("shops as s").where("s.status", "active")

    if (spectrum_id) {
      const contractor = await db("contractors").where("spectrum_id", spectrum_id).first("contractor_id")
      if (!contractor) return []
      query = query.where("s.owner_contractor_id", contractor.contractor_id)
    } else if (username) {
      const user = await db("accounts").where("username", username).first("user_id")
      if (!user) return []
      query = query.where("s.owner_user_id", user.user_id)
    } else {
      return []
    }

    const shops = await query.select("s.*").orderBy("s.created_at", "asc")

    return Promise.all(
      shops.map(async (shop: Shop) => {
        const ratingResult = await db("shop_ratings")
          .where("shop_id", shop.shop_id)
          .select(
            db.raw("COALESCE(AVG(rating)::numeric(3,2), 0) as rating"),
            db.raw("COUNT(*)::integer as rating_count"),
          )
          .first()

        return {
          shop_id: shop.shop_id,
          slug: shop.slug,
          name: shop.name,
          description: shop.description,
          banner_url: await resolveImageUrl(db, shop.banner),
          logo_url: await resolveImageUrl(db, shop.logo),
          supported_languages: shop.supported_languages,
          tags: shop.tags || [],
          accepts_custom_orders: shop.accepts_custom_orders || false,
          status: shop.status,
          created_at: shop.created_at,
          rating: ratingResult?.rating ? parseFloat(ratingResult.rating) : null,
          rating_count: ratingResult?.rating_count || 0,
        }
      }),
    )
  }

  /**
   * Browse all active shops. Supports search, pagination, and sorting.
   *
   * @summary Browse shops
   */
  @Get("")
  public async browseShops(
    @Query() search?: string,
    @Query() tag?: string,
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() sort_by?: "name" | "rating" | "created_at" | "total_sales",
    @Query() sort_order?: "asc" | "desc",
  ): Promise<{ shops: ShopPublicResponse[]; total: number; page: number; page_size: number }> {
    const db = getKnex()
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(50, Math.max(1, page_size || 20))
    const sortBy = sort_by || "rating"
    const sortOrder = sort_order || "desc"
    const direction = sortOrder === "asc" ? "ASC" : "DESC"

    // Base query with JOINs for owner info — explicit aliases avoid column collision
    let query = db("shops as s")
      .leftJoin("accounts as a", "s.owner_user_id", "a.user_id")
      .leftJoin("contractors as c", "s.owner_contractor_id", "c.contractor_id")
      .leftJoin("image_resources as uir", "a.avatar", "uir.resource_id")
      .leftJoin("image_resources as cir", "c.avatar", "cir.resource_id")
      .select(
        // All shop columns explicitly to avoid collision with joined tables
        "s.shop_id", "s.slug", "s.name", "s.description", "s.banner", "s.logo",
        "s.supported_languages", "s.tags", "s.accepts_custom_orders", "s.status",
        "s.created_at", "s.owner_user_id", "s.owner_contractor_id", "s.total_completed",
        // Aggregated stats
        db.raw("COALESCE((SELECT AVG(sr.rating)::numeric(3,2) FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as avg_rating"),
        db.raw("COALESCE((SELECT COUNT(*)::integer FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as rating_count"),
        db.raw("COALESCE((SELECT SUM(sr.rating)::integer FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as total_rating"),
        db.raw("COALESCE((SELECT COUNT(*)::integer FROM listings l WHERE l.shop_id = s.shop_id AND l.status = 'active'), 0) as listing_count"),
        db.raw("s.total_completed as total_sales"),
        // Owner info — aliased to avoid clashing with shop columns
        db.raw("CASE WHEN s.owner_user_id IS NOT NULL THEN 'user' ELSE 'contractor' END as owner_type"),
        db.raw("COALESCE(a.display_name, c.name) as owner_name"),
        db.raw("COALESCE(a.username, c.spectrum_id) as owner_slug"),
        db.raw("COALESCE(uir.external_url, CASE WHEN uir.filename IS NOT NULL THEN 'https://cdn.sc-market.space/' || uir.filename END, cir.external_url, CASE WHEN cir.filename IS NOT NULL THEN 'https://cdn.sc-market.space/' || cir.filename END) as owner_avatar_url"),
      )
      .where("s.status", "active")

    if (tag) {
      query = query.whereRaw("? = ANY(s.tags)", [tag])
    }

    if (search && search.trim()) {
      query = query.where(function () {
        this.where("s.name", "ilike", `%${search.trim()}%`)
          .orWhere("s.slug", "ilike", `%${search.trim()}%`)
      })
    }

    const countQuery = db("shops as s").where("s.status", "active")
    if (tag) countQuery.whereRaw("? = ANY(s.tags)", [tag])
    if (search && search.trim()) {
      countQuery.where(function () {
        this.where("s.name", "ilike", `%${search.trim()}%`)
          .orWhere("s.slug", "ilike", `%${search.trim()}%`)
      })
    }
    const [{ count }] = await countQuery.count("* as count")
    const total = parseInt(String(count), 10)

    // Sort: "rating" uses total_rating (SUM) — shops with active listings ranked first,
    // then by total rating score (so shops with many reviews outrank single 5-star shops)
    if (sortBy === "rating") {
      query = query.orderByRaw(`CASE WHEN listing_count > 0 THEN 0 ELSE 1 END ASC, total_rating ${direction}`)
    } else if (sortBy === "total_sales") {
      query = query.orderByRaw(`total_sales ${direction}`)
    } else {
      const columnMap: Record<string, string> = { name: "s.name", created_at: "s.created_at" }
      query = query.orderBy(columnMap[sortBy] || "s.created_at", direction)
    }

    const offset = (validatedPage - 1) * validatedPageSize
    const rows = await query.limit(validatedPageSize).offset(offset)

    const results: ShopPublicResponse[] = await Promise.all(
      rows.map(async (row: Record<string, unknown>) => ({
        shop_id: row.shop_id as string,
        slug: row.slug as string,
        name: row.name as string,
        description: (row.description as string) || "",
        banner_url: await resolveImageUrl(db, row.banner as string | null),
        logo_url: await resolveImageUrl(db, row.logo as string | null),
        supported_languages: (row.supported_languages as string[]) || [],
        tags: (row.tags as string[]) || [],
        accepts_custom_orders: (row.accepts_custom_orders as boolean) || false,
        status: row.status as string,
        created_at: row.created_at as string,
        rating: row.avg_rating ? parseFloat(row.avg_rating as string) : null,
        rating_count: (row.rating_count as number) || 0,
        listing_count: (row.listing_count as number) || 0,
        total_sales: (row.total_sales as number) || 0,
        owner: row.owner_name ? {
          type: row.owner_type as "user" | "contractor",
          slug: row.owner_slug as string,
          name: row.owner_name as string,
          avatar_url: (row.owner_avatar_url as string | null) || null,
        } : undefined,
      })),
    )

    return { shops: results, total, page: validatedPage, page_size: validatedPageSize }
  }

  /**
   * Get a shop's public profile by slug.
   *
   * @summary Get shop by slug
   */
  @Get("{slug}")
  public async getShop(@Path() slug: string): Promise<ShopPublicResponse> {
    const db = getKnex()
    const shop = await getShopBySlug(slug)
    if (!shop) this.throwNotFound("Shop", slug)

    const ratingResult = await db("shop_ratings")
      .where("shop_id", shop.shop_id)
      .select(
        db.raw("COALESCE(AVG(rating)::numeric(3,2), 0) as rating"),
        db.raw("COUNT(*)::integer as rating_count"),
      )
      .first()

    // Resolve owner info
    let owner: ShopOwnerInfo
    if (shop.owner_contractor_id) {
      const contractor = await db("contractors")
        .where("contractor_id", shop.owner_contractor_id)
        .first("name", "spectrum_id", "avatar")
      owner = {
        type: "contractor",
        slug: contractor?.spectrum_id || "",
        name: contractor?.name || "Unknown",
        avatar_url: contractor?.avatar ? await resolveImageUrl(db, contractor.avatar) : null,
      }
    } else {
      const user = await db("accounts")
        .where("user_id", shop.owner_user_id)
        .first("display_name", "username", "avatar")
      owner = {
        type: "user",
        slug: user?.username || "",
        name: user?.display_name || "Unknown",
        avatar_url: user?.avatar ? await resolveImageUrl(db, user.avatar) : null,
      }
    }

    // Listing count
    const listingCount = await db("listings")
      .where("shop_id", shop.shop_id)
      .where("status", "active")
      .count("* as count")
      .first()

    // Read metrics from denormalized columns
    const metrics = await getShopMetrics(shop.shop_id)

    return {
      shop_id: shop.shop_id,
      slug: shop.slug,
      name: shop.name,
      description: shop.description,
      banner_url: await resolveImageUrl(db, shop.banner),
      logo_url: await resolveImageUrl(db, shop.logo),
      supported_languages: shop.supported_languages,
      tags: shop.tags || [],
      accepts_custom_orders: shop.accepts_custom_orders || false,
      status: shop.status,
      created_at: shop.created_at,
      rating: ratingResult?.rating ? parseFloat(ratingResult.rating) : null,
      rating_count: ratingResult?.rating_count || 0,
      owner,
      listing_count: parseInt(String(listingCount?.count || 0), 10),
      total_sales: metrics.total_completed,
      metrics,
    }
  }

  /**
   * Update shop settings. Only the shop owner (or org member with manage_market) can update.
   *
   * @summary Update shop
   */
  @Put("{shopId}")
  @Security("loggedin")
  public async updateShop(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Body() body: UpdateShopRequest,
  ): Promise<ShopResponse> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }

    if (body.slug && body.slug !== shop.slug) {
      const existing = await db("shops").where("slug", body.slug).whereNot("shop_id", shopId).first()
      if (existing) {
        this.throwConflict("A shop with this slug already exists")
      }
    }

    const updates: Partial<Record<string, string | boolean | string[] | null | ReturnType<typeof db.fn.now>>> = { updated_at: db.fn.now() }
    if (body.name !== undefined) updates.name = body.name
    if (body.slug !== undefined) updates.slug = body.slug
    if (body.description !== undefined) updates.description = body.description
    if (body.banner !== undefined) updates.banner = body.banner
    if (body.logo !== undefined) updates.logo = body.logo
    if (body.supported_languages !== undefined) updates.supported_languages = body.supported_languages
    if (body.market_order_template !== undefined) updates.market_order_template = body.market_order_template
    if (body.default_pickup_method !== undefined) updates.default_pickup_method = body.default_pickup_method
    if (body.tags !== undefined) updates.tags = body.tags
    if (body.accepts_custom_orders !== undefined) updates.accepts_custom_orders = body.accepts_custom_orders

    const [updated] = await db("shops").where("shop_id", shopId).update(updates).returning("*")
    return await shopToResponse(updated)
  }

  /**
   * Archive a shop. Listings under this shop will remain but the shop won't appear in directories.
   *
   * @summary Archive shop
   */
  @Delete("{shopId}")
  @Security("loggedin")
  public async archiveShop(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
  ): Promise<{ success: boolean }> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }

    await db("shops").where("shop_id", shopId).update({ status: "archived", updated_at: db.fn.now() })
    return { success: true }
  }

  /**
   * Get reviews for a shop. Returns paginated list of ratings with reviewer info.
   *
   * @summary Get shop reviews
   */
  @Get("{shopId}/reviews")
  public async getShopReviews(
    @Path() shopId: string,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<{ reviews: ShopReviewResponse[]; total: number; page: number; page_size: number }> {
    const db = getKnex()
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(50, Math.max(1, page_size || 20))
    const offset = (validatedPage - 1) * validatedPageSize

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    const [{ count }] = await db("shop_ratings").where("shop_id", shopId).count("* as count")
    const total = parseInt(String(count), 10)

    const rows = await db("shop_ratings as sr")
      .join("accounts as a", "sr.reviewer_id", "a.user_id")
      .where("sr.shop_id", shopId)
      .select(
        "sr.rating_id",
        "sr.rating",
        "sr.comment",
        "sr.created_at",
        "a.user_id",
        "a.username",
        "a.display_name",
        "a.avatar",
      )
      .orderBy("sr.created_at", "desc")
      .limit(validatedPageSize)
      .offset(offset)

    const reviews: ShopReviewResponse[] = rows.map((row: Record<string, unknown>) => ({
      review_id: row.rating_id as string,
      rating: row.rating as number,
      comment: (row.comment as string) || "",
      created_at: (row.created_at as Date).toISOString(),
      author: {
        user_id: row.user_id as string,
        username: row.username as string,
        display_name: row.display_name as string,
        avatar: row.avatar as string | null,
      },
    }))

    return { reviews, total, page: validatedPage, page_size: validatedPageSize }
  }

  /**
   * Transfer shop ownership to an org. Auto-accepts if the requesting user
   * has manage_market in the target org.
   *
   * @summary Transfer shop to org
   */
  @Post("{shopId}/transfer")
  @Security("loggedin")
  public async transferShop(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Body() body: TransferShopRequest,
  ): Promise<ShopResponse> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    // Only current owner can transfer
    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden("Only the shop owner can transfer ownership")
    }

    // Verify target org exists
    const targetOrg = await db("contractors")
      .where("contractor_id", body.target_contractor_id)
      .first()
    if (!targetOrg) this.throwNotFound("Contractor", body.target_contractor_id)

    // Auto-accept if user has manage_market in target org
    const hasTargetPerm = await has_permission(
      body.target_contractor_id,
      userId,
      "manage_market",
    )
    if (!hasTargetPerm) {
      this.throwForbidden(
        "You must have manage_market permission in the target org to transfer",
      )
    }

    const [updated] = await db("shops")
      .where("shop_id", shopId)
      .update({
        owner_user_id: null,
        owner_contractor_id: body.target_contractor_id,
        updated_at: db.fn.now(),
      })
      .returning("*")

    return await shopToResponse(updated)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function shopToResponse(shop: Shop & { tags?: string[]; accepts_custom_orders?: boolean }): Promise<ShopResponse> {
  const db = getKnex()
  return {
    shop_id: shop.shop_id,
    slug: shop.slug,
    name: shop.name,
    description: shop.description,
    banner: shop.banner,
    logo: shop.logo,
    owner_user_id: shop.owner_user_id,
    owner_contractor_id: shop.owner_contractor_id,
    supported_languages: shop.supported_languages,
    tags: shop.tags || [],
    accepts_custom_orders: shop.accepts_custom_orders || false,
    market_order_template: shop.market_order_template,
    default_pickup_method: shop.default_pickup_method,
    status: shop.status,
    created_at: shop.created_at,
    updated_at: shop.updated_at,
    banner_url: await resolveImageUrl(db, shop.banner),
    logo_url: await resolveImageUrl(db, shop.logo),
  }
}

async function resolveImageUrl(db: ReturnType<typeof getKnex>, resourceId: string | null): Promise<string | null> {
  if (!resourceId) return null
  const row = await db("image_resources").where("resource_id", resourceId).first()
  if (!row) return null
  return row.external_url || `https://cdn.sc-market.space/${row.filename}`
}

async function generateSlug(db: ReturnType<typeof getKnex>, base: string): Promise<string> {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 45)

  const existing = await db("shops").whereRaw("LOWER(slug) = ?", [slug]).first()
  if (!existing) return slug

  // Append numeric suffix
  for (let i = 2; i < 100; i++) {
    const candidate = `${slug.slice(0, 42)}-${i}`
    const exists = await db("shops").where("slug", candidate).first()
    if (!exists) return candidate
  }

  // Fallback: use partial UUID
  return `${slug.slice(0, 37)}-${crypto.randomUUID().slice(0, 8)}`
}
