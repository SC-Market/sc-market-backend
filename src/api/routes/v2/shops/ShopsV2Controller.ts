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
  DiscordChannelRef,
  clearThreadChannel,
  getThreadChannel,
  setThreadChannel,
} from "../../../../services/discord/channel-setups.js"
import {
  canManageShop,
  canTransferShop,
  getShopById,
  getShopBySlug,
  getShopsForUser,
  type Shop,
} from "../../../../services/shops/shop-permissions.service.js"
import { publiclyListedSql, visibleActiveListingCountQuery } from "../util/listing-visibility.js"
import { isUuid } from "../util/short-slug.js"
import {
  ShopSlugConflictError,
  assertChosenShopSlugAvailable,
  checkShopSlugAvailability,
  insertShopWithAutoSlug,
  insertShopWithChosenSlug,
  isShopSlugUniqueViolation,
  shopSlugFormatProblem,
  shopSlugOwner,
  type ShopSlugAvailabilityResponse,
  type ShopSlugOwner,
} from "../../../../services/shops/shop-slug.service.js"
import { getShopMetrics } from "../../../../services/shops/shop-metrics.service.js"
import { computeShopBadges } from "../../../../services/shops/shop-badges.service.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"
import { verifyDiscordThreadTarget } from "../../../../services/discord/verify-discord-target.js"
import { has_permission, is_member } from "../../v1/util/permissions.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import { createNotificationWebhook } from "../../v1/util/webhooks.js"
import { validateWebhookUrl } from "../../../util/validate-webhook-url.js"
import * as notificationDb from "../../v1/notifications/database.js"
import * as orderDb from "../../v1/orders/database.js"
import {
  assertSameRealm,
  canViewTestEntity,
  denyTestUser,
  hiddenFromRealViewers,
} from "../../../../services/test-accounts/isolation.js"

// ─── Request/Response Types ──────────────────────────────────────────────────

export interface CreateShopRequest {
  name: string
  slug?: string
  description?: string
  banner?: string
  logo?: string
  /**
   * If set, shop is owned by this org: its contractor_id (UUID), not its
   * spectrum_id. User must have manage_market in the org.
   */
  contractor_id?: string
  supported_languages?: string[]
  tags?: string[]
  accepts_custom_orders?: boolean
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
  /**
   * Discord server (guild) ID of this shop's order-thread channel. Send it with
   * discord_thread_channel_id; send both as null to use the owner's channel.
   */
  official_server_id?: string | null
  /** Discord channel ID where this shop's order and offer threads are created */
  discord_thread_channel_id?: string | null
}

export interface TransferShopRequest {
  /** Whether ownership transfers to a user account or an org. */
  target_type: "user" | "contractor"
  /**
   * Identifier of the new owner.
   * - When target_type is "user": the target user's user_id or username.
   * - When target_type is "contractor": the target org's contractor_id (UUID) or spectrum_id.
   */
  target_id: string
}

export interface CreateShopWebhookRequest {
  name: string
  webhook_url: string
  actions: string[]
}

export interface ShopWebhookResponse {
  webhook_id: string
  name: string
  webhook_url: string
  shop_id: string
}

export interface ShopResponse {
  shop_id: string
  slug: string
  name: string
  description: string
  banner: string | null
  logo: string | null
  owner_user_id: string | null
  is_org_owned: boolean
  /** Spectrum ID of the owning contractor (for V1 APIs that need it) */
  owner_contractor_spectrum_id: string | null
  supported_languages: string[]
  tags: string[]
  accepts_custom_orders: boolean
  market_order_template: string
  default_pickup_method: string | null
  status: string
  created_at: string
  updated_at: string
  banner_url: string | null
  /** Discord server (guild) ID of this shop's own order-thread channel; null uses the owner's */
  official_server_id: string | null
  /** Discord channel ID where this shop's order and offer threads are created; null uses the owner's */
  discord_thread_channel_id: string | null
  /** Seller reputation badges, computed server-side from shop metrics + owner data */
  badge_ids: string[]
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
  /** Seller reputation badges, computed server-side from shop metrics + owner data */
  badge_ids: string[]
  /** Owner information — link to user profile or org page (included in detail view) */
  owner?: ShopOwnerInfo
  /** Number of active listings in this shop */
  listing_count?: number
  /** Number of active services in this shop */
  service_count?: number
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

export interface BlockUserRequest {
  username: string
  reason?: string
}

export interface ShopBlocklistEntry {
  id: string
  user_id: string
  username: string
  display_name: string
  avatar: string | null
  reason: string
  created_at: string
}

export interface ShopCustomerEntry {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
  order_count: number
  fulfilled_count: number
  total_spent: number
  last_order_at: string | null
}

export interface ShopCustomersResponse {
  items: ShopCustomerEntry[]
  total: number
  page: number
  page_size: number
}

export type OrderSettingType =
  | "offer_message"
  | "order_message"
  | "require_availability"
  | "stock_subtraction_timing"
  | "min_order_size"
  | "max_order_size"
  | "min_order_value"
  | "max_order_value"
  | "allocation_mode"

export interface ShopOrderSettingResponse {
  id: string
  entity_type: "shop"
  entity_id: string
  setting_type: OrderSettingType
  message_content: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface UpsertShopOrderSettingRequest {
  message_content: string
  enabled: boolean
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
      if (!isUuid(body.contractor_id)) {
        this.throwValidationError("contractor_id must be the org's id (a UUID), not its Spectrum ID", [
          { field: "contractor_id", message: "Must be the org's contractor_id (UUID)" },
        ])
      }
      const org = await db("contractors")
        .where("contractor_id", body.contractor_id)
        .first("contractor_id", "archived")
      if (!org || org.archived) this.throwNotFound("Organization", body.contractor_id)
      const hasPerm = await has_permission(body.contractor_id, userId, "manage_market")
      if (!hasPerm) {
        this.throwForbidden("You do not have manage_market permission in this org")
      }
      ownerContractorId = body.contractor_id
    } else {
      ownerUserId = userId
    }

    const owner: ShopSlugOwner = ownerContractorId ? { contractorId: ownerContractorId } : { userId }
    const row = {
      name: body.name,
      description: body.description || "",
      banner: body.banner || null,
      logo: body.logo || null,
      owner_user_id: ownerUserId,
      owner_contractor_id: ownerContractorId,
      ...(body.supported_languages !== undefined && { supported_languages: body.supported_languages }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.accepts_custom_orders !== undefined && { accepts_custom_orders: body.accepts_custom_orders }),
    }

    // No slug: generate one from the name. A chosen slug must be valid and
    // free for this owner; taken or reserved is a 409 with suggestions.
    const chosenSlug = body.slug?.trim()
    if (chosenSlug) this.assertSlugFormat(chosenSlug)
    const shop = await this.slugConflictAs409(async () => {
      if (!chosenSlug) return insertShopWithAutoSlug(db, body.name, owner, row)
      await assertChosenShopSlugAvailable(db, chosenSlug, owner)
      return insertShopWithChosenSlug(db, chosenSlug, owner, row)
    })

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

      // The org's Spectrum ID is reserved for it; -2, -3… if its shop already has it.
      const shop = await this.slugConflictAs409(() =>
        insertShopWithAutoSlug(db, contractor.spectrum_id, { contractorId: body.contractor_id! }, {
          name: contractor.name,
          description: contractor.description || "",
          banner: contractor.banner,
          logo: contractor.avatar,
          owner_contractor_id: body.contractor_id,
          market_order_template: contractor.market_order_template || "",
        }),
      )

      return await shopToResponse(shop)
    }

    // Return existing personal shop if one already exists
    const existingPersonal = await db("shops").where("owner_user_id", userId).where("status", "active").first()
    if (existingPersonal) return await shopToResponse(existingPersonal)

    // User-owned shop
    const user = await db("accounts").where("user_id", userId).first()
    if (!user) this.throwNotFound("User")

    // <username>-shop is reserved for this user's personal shop.
    const shop = await this.slugConflictAs409(() =>
      insertShopWithAutoSlug(db, `${user.username}-shop`, { userId }, {
        name: `${user.display_name}'s Shop`,
        description: "",
        banner: user.banner,
        logo: user.avatar,
        owner_user_id: userId,
        market_order_template: user.market_order_template || "",
      }),
    )

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
          badge_ids: shop.badge_ids || [],
        }
      }),
    )
  }

  /**
   * Check whether a slug is free for a shop, before creating or renaming it.
   * Unavailable answers say why (invalid, reserved route word, reserved for
   * an org's Spectrum ID or a user's personal shop, taken) and suggest free
   * alternatives. The owner is the caller's personal shop, or `contractor_id`'s
   * org shop (needs manage_market), or `shop_id`'s owner when renaming that
   * shop (needs to manage it; its own slug counts as free).
   *
   * @summary Check shop slug availability
   */
  @Get("slug-availability")
  @Security("loggedin")
  public async getShopSlugAvailability(
    @Request() request: ExpressRequest,
    @Query() slug: string,
    @Query() contractor_id?: string,
    @Query() shop_id?: string,
  ): Promise<ShopSlugAvailabilityResponse> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    let owner: ShopSlugOwner = { userId }
    let excludeShopId: string | undefined
    if (shop_id) {
      if (!isUuid(shop_id)) this.throwNotFound("Shop", shop_id)
      const shop = await getShopById(shop_id)
      if (!shop) this.throwNotFound("Shop", shop_id)
      if (!this.isAdmin() && !(await canManageShop(shop, userId))) this.throwForbidden()
      owner = shopSlugOwner(shop)
      excludeShopId = shop_id
    } else if (contractor_id) {
      if (!isUuid(contractor_id)) {
        this.throwValidationError("contractor_id must be the org's id (a UUID), not its Spectrum ID", [
          { field: "contractor_id", message: "Must be the org's contractor_id (UUID)" },
        ])
      }
      if (!(await has_permission(contractor_id, userId, "manage_market"))) {
        this.throwForbidden("You do not have manage_market permission in this org")
      }
      owner = { contractorId: contractor_id }
    }

    return checkShopSlugAvailability(db, slug, owner, { excludeShopId })
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
    @Request() request?: ExpressRequest,
  ): Promise<{ shops: ShopPublicResponse[]; total: number; page: number; page_size: number }> {
    if (request) this.request = request
    const db = getKnex()
    const viewerUserId = this.tryGetUserId()
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
        "s.badge_ids",
        // Aggregated stats
        db.raw("COALESCE((SELECT AVG(sr.rating)::numeric(3,2) FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as avg_rating"),
        db.raw("COALESCE((SELECT COUNT(*)::integer FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as rating_count"),
        db.raw("COALESCE((SELECT SUM(sr.rating)::integer FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as total_rating"),
        // Only the listings this viewer can see (private ones are org-internal)
        visibleActiveListingCountQuery(db, db.ref("s.shop_id"), viewerUserId)
          .select(db.raw("COUNT(*)::integer"))
          .as("listing_count"),
        db.raw("COALESCE((SELECT COUNT(*)::integer FROM services sv WHERE sv.shop_id = s.shop_id AND sv.status = 'active'), 0) as service_count"),
        db.raw("s.total_completed as total_sales"),
        // Owner info — aliased to avoid clashing with shop columns
        db.raw("CASE WHEN s.owner_user_id IS NOT NULL THEN 'user' ELSE 'contractor' END as owner_type"),
        db.raw("COALESCE(a.display_name, c.name) as owner_name"),
        db.raw("COALESCE(a.username, c.spectrum_id) as owner_slug"),
        db.raw("COALESCE(uir.external_url, CASE WHEN uir.filename IS NOT NULL THEN 'https://cdn.sc-market.space/' || uir.filename END, cir.external_url, CASE WHEN cir.filename IS NOT NULL THEN 'https://cdn.sc-market.space/' || cir.filename END) as owner_avatar_url"),
      )
      .where("s.status", "active")
      // Test shops: test viewers only (services/test-accounts/isolation.ts).
      .whereRaw(hiddenFromRealViewers(db, "NOT s.is_test", viewerUserId))

    if (tag) {
      query = query.whereRaw("? = ANY(s.tags)", [tag])
    }

    if (search && search.trim()) {
      query = query.where(function () {
        this.where("s.name", "ilike", `%${search.trim()}%`)
          .orWhere("s.slug", "ilike", `%${search.trim()}%`)
      })
    }

    const countQuery = db("shops as s")
      .where("s.status", "active")
      .whereRaw(hiddenFromRealViewers(db, "NOT s.is_test", viewerUserId))
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
      // Can't use correlated subquery aliases in ORDER BY — repeat expressions
      const direction2 = direction === "ASC" ? "ASC" : "DESC"
      query = query.orderByRaw(
        `(CASE WHEN EXISTS(SELECT 1 FROM listings l WHERE l.shop_id = s.shop_id AND ${publiclyListedSql("l")})
               OR EXISTS(SELECT 1 FROM services sv WHERE sv.shop_id = s.shop_id AND sv.status = 'active')
               THEN 0 ELSE 1 END) ASC, ` +
        `COALESCE((SELECT SUM(sr.rating) FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) ${direction2}`,
      )
    } else if (sortBy === "total_sales") {
      query = query.orderBy("s.total_completed", direction)
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
        badge_ids: (row.badge_ids as string[]) || [],
        listing_count: (row.listing_count as number) || 0,
        service_count: (row.service_count as number) || 0,
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
  public async getShop(
    @Path() slug: string,
    @Request() request?: ExpressRequest,
  ): Promise<ShopPublicResponse> {
    if (request) this.request = request
    const db = getKnex()
    const shop = await getShopBySlug(slug)
    if (!shop) this.throwNotFound("Shop", slug)
    if (shop.is_test && !canViewTestEntity(request?.user)) this.throwNotFound("Shop", slug)

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

    // Listing count: only what this viewer's listings grid will show
    const listingCount = await visibleActiveListingCountQuery(db, shop.shop_id, this.tryGetUserId())
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
      badge_ids: shop.badge_ids || [],
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

    // An unchanged slug is not re-checked: a shop that already holds a slug
    // reserved for someone else keeps it (shop-slug.service.ts).
    const newSlug = body.slug?.trim()
    const slugChanged = newSlug !== undefined && newSlug !== shop.slug
    const slugOwner = shopSlugOwner(shop)
    if (slugChanged) {
      this.assertSlugFormat(newSlug)
      await this.slugConflictAs409(() =>
        assertChosenShopSlugAvailable(db, newSlug, slugOwner, { excludeShopId: shopId }),
      )
    }

    const updates: Partial<Record<string, string | boolean | string[] | null | ReturnType<typeof db.fn.now>>> = { updated_at: db.fn.now() }
    if (body.name !== undefined) updates.name = body.name
    if (slugChanged) updates.slug = newSlug
    if (body.description !== undefined) updates.description = body.description
    if (body.banner !== undefined) updates.banner = body.banner
    if (body.logo !== undefined) updates.logo = body.logo
    if (body.supported_languages !== undefined) updates.supported_languages = body.supported_languages
    if (body.market_order_template !== undefined) updates.market_order_template = body.market_order_template
    if (body.default_pickup_method !== undefined) updates.default_pickup_method = body.default_pickup_method
    if (body.tags !== undefined) updates.tags = body.tags
    if (body.accepts_custom_orders !== undefined) updates.accepts_custom_orders = body.accepts_custom_orders

    const threadChannel = parseShopThreadChannel(body)
    if (threadChannel === "invalid") {
      this.throwValidationError("Enter both the Discord server ID and the channel ID, or leave both empty", [
        { field: "discord_thread_channel_id", message: "Discord IDs are numbers, e.g. 123456789012345678" },
      ])
    }
    // A new thread target must be a server the bot is in and the user
    // administers, or the bot would create threads (and hand out invites) in
    // someone else's server. Clearing it, or saving it unchanged, is fine.
    if (typeof threadChannel === "object") {
      const current = await getThreadChannel({ owner_type: "shop", owner_id: shopId })
      const changed =
        !current ||
        current.guild_id !== threadChannel.guild_id ||
        current.channel_id !== threadChannel.channel_id
      if (changed) {
        const problem = await verifyDiscordThreadTarget(
          userId,
          threadChannel.guild_id,
          threadChannel.channel_id,
        )
        if (problem) {
          this.throwValidationError(problem, [{ field: "discord_thread_channel_id", message: problem }])
        }
      }
    }

    const [updated] = await this.slugConflictAs409(async () => {
      try {
        return await db("shops").where("shop_id", shopId).update(updates).returning("*")
      } catch (error) {
        // Another shop took the slug between the check and the update.
        if (slugChanged && isShopSlugUniqueViolation(error)) {
          throw new ShopSlugConflictError(
            await checkShopSlugAvailability(db, newSlug, slugOwner, { excludeShopId: shopId }),
          )
        }
        throw error
      }
    })
    if (threadChannel === "clear") {
      await clearThreadChannel({ owner_type: "shop", owner_id: shopId })
    } else if (threadChannel !== "unchanged") {
      await setThreadChannel({ owner_type: "shop", owner_id: shopId }, threadChannel, null)
    }
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

    const reviews: ShopReviewResponse[] = await Promise.all(
      rows.map(async (row: Record<string, unknown>) => ({
        review_id: row.rating_id as string,
        rating: row.rating as number,
        comment: (row.comment as string) || "",
        created_at: (row.created_at as Date).toISOString(),
        author: {
          user_id: row.user_id as string,
          username: row.username as string,
          display_name: row.display_name as string,
          avatar: await resolveImageUrl(db, row.avatar as string | null),
        },
      })),
    )

    return { reviews, total, page: validatedPage, page_size: validatedPageSize }
  }

  /**
   * List webhooks for a shop.
   * Requires manage_market permission.
   *
   * @summary List shop webhooks
   */
  @Get("{shopId}/webhooks")
  @Security("loggedin")
  public async getShopWebhooks(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
  ): Promise<ShopWebhookResponse[]> {
    this.request = request
    const userId = this.getUserId()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }

    const webhooks = await notificationDb.getNotificationWebhooks({ shop_id: shopId })
    return webhooks.map((w) => ({
      webhook_id: w.webhook_id,
      name: w.name,
      webhook_url: w.webhook_url,
      shop_id: shopId,
    }))
  }

  /**
   * Create a webhook for a shop.
   * Requires manage_market permission.
   *
   * @summary Create shop webhook
   */
  @Post("{shopId}/webhooks")
  @Security("loggedin")
  public async createShopWebhook(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Body() body: CreateShopWebhookRequest,
  ): Promise<ShopWebhookResponse> {
    this.request = request
    const userId = this.getUserId()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }
    // Test accounts and test shops never post to external URLs.
    denyTestUser(request.user, "Test accounts cannot use webhooks")
    if (shop.is_test) this.throwForbidden("Test shops cannot use webhooks")

    const webhookValidation = validateWebhookUrl(body.webhook_url)
    if (!webhookValidation.valid) {
      this.throwValidationError("Invalid webhook URL", [
        { field: "webhook_url", message: webhookValidation.reason! },
      ])
    }

    const webhook = await createNotificationWebhook(
      body.name,
      body.webhook_url,
      body.actions,
      undefined,
      undefined,
      shopId,
    )

    return {
      webhook_id: webhook.webhook_id,
      name: webhook.name,
      webhook_url: webhook.webhook_url,
      shop_id: shopId,
    }
  }

  /**
   * Delete a webhook for a shop.
   * Requires manage_market permission.
   *
   * @summary Delete shop webhook
   */
  @Delete("{shopId}/webhooks/{webhookId}")
  @Security("loggedin")
  public async deleteShopWebhook(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Path() webhookId: string,
  ): Promise<{ success: boolean }> {
    this.request = request
    const userId = this.getUserId()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }

    const deleted = await notificationDb.deleteNotificationWebhook({
      webhook_id: webhookId,
      shop_id: shopId,
    })

    if (!deleted.length) this.throwNotFound("Webhook", webhookId)

    return { success: true }
  }

  /**
   * Transfer shop ownership to a user or an org.
   *
   * Supports all directions (user↔user, user↔org, org↔org). Only the shop's
   * owner may transfer it: the owning user, or the owner of the owning org
   * (manage_market alone is not enough). When transferring to an org, the
   * requester must also have manage_market in the target org (auto-accept).
   * Every transfer is recorded in the audit log of the orgs involved.
   *
   * After transfer, active order/offer assignments held by people no longer
   * associated with the new owner are cleared so the new owner can reclaim them,
   * and shop badges are recomputed (owner-derived badges may change).
   *
   * @summary Transfer shop ownership
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

    // Giving the shop away is an owner action. manage_market lets a member run
    // an org's shop, but must not let them transfer it to themselves.
    if (!this.isAdmin() && !(await canTransferShop(shop, userId))) {
      this.throwForbidden("Only the shop owner can transfer ownership")
    }

    let newOwnerUserId: string | null = null
    let newOwnerContractorId: string | null = null

    if (body.target_type === "contractor") {
      // Resolve target org by contractor_id (UUID) or spectrum_id
      const targetOrg = await db("contractors")
        .where("contractor_id", body.target_id)
        .orWhere("spectrum_id", body.target_id)
        .first()
      if (!targetOrg) this.throwNotFound("Contractor", body.target_id)

      // Auto-accept if requester has manage_market in target org
      const hasTargetPerm = await has_permission(
        targetOrg.contractor_id,
        userId,
        "manage_market",
      )
      if (!hasTargetPerm) {
        this.throwForbidden(
          "You must have manage_market permission in the target org to transfer",
        )
      }

      newOwnerContractorId = targetOrg.contractor_id
    } else if (body.target_type === "user") {
      // Resolve target user by user_id or username
      const targetUser = await db("accounts")
        .where("user_id", body.target_id)
        .orWhere("username", body.target_id)
        .first("user_id")
      if (!targetUser) this.throwNotFound("User", body.target_id)

      newOwnerUserId = targetUser.user_id
    } else {
      this.throwValidationError("Invalid target_type", [
        { field: "target_type", message: 'target_type must be "user" or "contractor"' },
      ])
    }

    // A test shop only moves between test owners, a real one between real
    // owners (services/test-accounts/isolation.ts; a DB trigger also refuses).
    await assertSameRealm({
      shops: [shopId],
      users: [newOwnerUserId],
      contractors: [newOwnerContractorId],
    })

    const [updated] = await db("shops")
      .where("shop_id", shopId)
      .update({
        owner_user_id: newOwnerUserId,
        owner_contractor_id: newOwnerContractorId,
        updated_at: db.fn.now(),
      })
      .returning("*")

    const transferMetadata = {
      shop_id: shopId,
      shop_slug: shop.slug,
      from_user_id: shop.owner_user_id,
      from_contractor_id: shop.owner_contractor_id,
      to_user_id: newOwnerUserId,
      to_contractor_id: newOwnerContractorId,
    }
    // One entry per org involved, so it shows up in each org's audit log.
    const orgs = [shop.owner_contractor_id, newOwnerContractorId].filter(
      (id, i, all): id is string => !!id && all.indexOf(id) === i,
    )
    for (const contractor_id of orgs.length ? orgs : [null]) {
      await auditLogService.record({
        action: "shop.transferred",
        actorId: userId,
        subjectType: "shop",
        subjectId: shopId,
        metadata: contractor_id ? { ...transferMetadata, contractor_id } : transferMetadata,
      })
    }

    // Reassign orphaned data + recompute owner-derived badges
    await reassignShopDataAfterTransfer(db, shopId, newOwnerUserId, newOwnerContractorId)
    await computeShopBadges(shopId)

    return await shopToResponse(updated)
  }

  /** 400 for a malformed slug. */
  private assertSlugFormat(slug: string): void {
    const problem = shopSlugFormatProblem(slug)
    if (problem) this.throwValidationError(problem, [{ field: "slug", message: problem }])
  }

  /**
   * Run `fn`, answering a ShopSlugConflictError as 409 whose error details are
   * the ShopSlugAvailabilityResponse (reason, suggestions).
   */
  private async slugConflictAs409<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ShopSlugConflictError) this.throwConflict(error.message, { ...error.availability })
      throw error
    }
  }

  // ─── Blocklist ──────────────────────────────────────────────────────────────

  /**
   * Get users blocked from this shop.
   * @summary Get shop blocklist
   */
  @Get("{shopId}/blocklist")
  @Security("loggedin")
  public async getShopBlocklist(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
  ): Promise<ShopBlocklistEntry[]> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)
    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden("Missing permissions")
    }

    const entries = await db("shop_blocklist")
      .join("accounts", "shop_blocklist.blocked_user_id", "accounts.user_id")
      .where("shop_blocklist.shop_id", shopId)
      .select(
        "shop_blocklist.id",
        "shop_blocklist.blocked_user_id",
        "accounts.username",
        "accounts.display_name",
        "accounts.avatar",
        "shop_blocklist.reason",
        "shop_blocklist.created_at",
      )
      .orderBy("shop_blocklist.created_at", "desc")

    return Promise.all(entries.map(async (e) => ({
      id: e.id,
      user_id: e.blocked_user_id,
      username: e.username,
      display_name: e.display_name,
      avatar: await resolveImageUrl(db, e.avatar),
      reason: e.reason,
      created_at: e.created_at.toISOString(),
    })))
  }

  /**
   * Block a user from this shop.
   * @summary Block user from shop
   */
  @Post("{shopId}/blocklist")
  @Security("loggedin")
  public async blockUserFromShop(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Body() body: BlockUserRequest,
  ): Promise<{ success: boolean }> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)
    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden("Missing permissions")
    }

    const targetUser = await db("accounts").where("username", body.username).first("user_id")
    if (!targetUser) this.throwNotFound("User", body.username)

    await db("shop_blocklist")
      .insert({
        shop_id: shopId,
        blocked_user_id: targetUser.user_id,
        reason: body.reason || "",
      })
      .onConflict(["shop_id", "blocked_user_id"])
      .ignore()

    return { success: true }
  }

  /**
   * Unblock a user from this shop.
   * @summary Unblock user from shop
   */
  @Delete("{shopId}/blocklist/{blockedUserId}")
  @Security("loggedin")
  public async unblockUserFromShop(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Path() blockedUserId: string,
  ): Promise<{ success: boolean }> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)
    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden("Missing permissions")
    }

    await db("shop_blocklist")
      .where({ shop_id: shopId, blocked_user_id: blockedUserId })
      .delete()

    return { success: true }
  }

  // ─── Customers ──────────────────────────────────────────────────────────────

  /**
   * Get customers who have placed orders at this shop.
   * @summary Get shop customers
   */
  @Get("{shopId}/customers")
  @Security("loggedin")
  public async getShopCustomers(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<ShopCustomersResponse> {
    this.request = request
    const userId = this.getUserId()
    const db = getKnex()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)
    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden("Missing permissions")
    }

    const limit = page_size || 20
    const offset = (page || 0) * limit

    const customers = await db("orders")
      .join("accounts", "orders.customer_id", "accounts.user_id")
      .where("orders.shop_id", shopId)
      .groupBy("accounts.user_id", "accounts.username", "accounts.display_name", "accounts.avatar")
      .select(
        "accounts.user_id",
        "accounts.username",
        "accounts.display_name",
        "accounts.avatar",
        db.raw("COUNT(*) as order_count"),
        db.raw("COUNT(CASE WHEN orders.status = 'fulfilled' THEN 1 END) as fulfilled_count"),
        db.raw("COALESCE(SUM(orders.cost), 0) as total_spent"),
        db.raw("MAX(orders.timestamp) as last_order_at"),
      )
      .orderBy("order_count", "desc")
      .limit(limit)
      .offset(offset)

    const [{ count: totalCount }] = await db("orders")
      .where("shop_id", shopId)
      .countDistinct("customer_id as count")

    return {
      items: await Promise.all(customers.map(async (c) => ({
        user_id: c.user_id,
        username: c.username,
        display_name: c.display_name,
        avatar: await resolveImageUrl(db, c.avatar),
        order_count: +c.order_count,
        fulfilled_count: +c.fulfilled_count,
        total_spent: +c.total_spent,
        last_order_at: c.last_order_at?.toISOString() || null,
      }))),
      total: +totalCount,
      page: page || 0,
      page_size: limit,
    }
  }

  // ─── Order Settings ─────────────────────────────────────────────────────────

  /**
   * List all order settings for this shop.
   * @summary Get shop order settings
   */
  @Get("{shopId}/order-settings")
  @Security("loggedin")
  public async getShopOrderSettings(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
  ): Promise<ShopOrderSettingResponse[]> {
    this.request = request
    const userId = this.getUserId()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }

    const settings = await orderDb.getOrderSettings("shop", shopId)
    return settings.map((s) => ({
      id: s.id,
      entity_type: "shop" as const,
      entity_id: s.entity_id,
      setting_type: s.setting_type as OrderSettingType,
      message_content: s.message_content,
      enabled: s.enabled,
      created_at: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
      updated_at: s.updated_at instanceof Date ? s.updated_at.toISOString() : String(s.updated_at),
    }))
  }

  /**
   * Create or update an order setting for this shop.
   * @summary Upsert shop order setting
   */
  @Put("{shopId}/order-settings/{settingType}")
  @Security("loggedin")
  public async upsertShopOrderSetting(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Path() settingType: string,
    @Body() body: UpsertShopOrderSettingRequest,
  ): Promise<ShopOrderSettingResponse> {
    this.request = request
    const userId = this.getUserId()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }

    const validTypes: OrderSettingType[] = [
      "offer_message", "order_message", "require_availability",
      "stock_subtraction_timing", "min_order_size", "max_order_size",
      "min_order_value", "max_order_value", "allocation_mode",
    ]
    if (!validTypes.includes(settingType as OrderSettingType)) {
      this.throwValidationError("Invalid setting type", [
        { field: "settingType", message: `Must be one of: ${validTypes.join(", ")}` },
      ])
    }

    const existing = await orderDb.getOrderSetting(
      "shop",
      shopId,
      settingType as OrderSettingType,
    )

    let setting
    if (existing) {
      setting = await orderDb.updateOrderSetting(existing.id, {
        message_content: body.message_content,
        enabled: body.enabled,
      })
    } else {
      setting = await orderDb.createOrderSetting({
        entity_type: "shop",
        entity_id: shopId,
        setting_type: settingType as OrderSettingType,
        message_content: body.message_content,
        enabled: body.enabled,
      })
    }

    return {
      id: setting.id,
      entity_type: "shop",
      entity_id: setting.entity_id,
      setting_type: setting.setting_type as OrderSettingType,
      message_content: setting.message_content,
      enabled: setting.enabled,
      created_at: setting.created_at instanceof Date ? setting.created_at.toISOString() : String(setting.created_at),
      updated_at: setting.updated_at instanceof Date ? setting.updated_at.toISOString() : String(setting.updated_at),
    }
  }

  /**
   * Delete an order setting for this shop.
   * @summary Delete shop order setting
   */
  @Delete("{shopId}/order-settings/{settingType}")
  @Security("loggedin")
  public async deleteShopOrderSetting(
    @Request() request: ExpressRequest,
    @Path() shopId: string,
    @Path() settingType: string,
  ): Promise<{ success: boolean }> {
    this.request = request
    const userId = this.getUserId()

    const shop = await getShopById(shopId)
    if (!shop) this.throwNotFound("Shop", shopId)

    if (!this.isAdmin() && !(await canManageShop(shop, userId))) {
      this.throwForbidden()
    }

    const validTypes: OrderSettingType[] = [
      "offer_message", "order_message", "require_availability",
      "stock_subtraction_timing", "min_order_size", "max_order_size",
      "min_order_value", "max_order_value", "allocation_mode",
    ]
    if (!validTypes.includes(settingType as OrderSettingType)) {
      this.throwValidationError("Invalid setting type", [
        { field: "settingType", message: `Must be one of: ${validTypes.join(", ")}` },
      ])
    }

    const existing = await orderDb.getOrderSetting(
      "shop",
      shopId,
      settingType as OrderSettingType,
    )

    if (!existing) {
      this.throwNotFound("Order setting", settingType)
    }

    await orderDb.deleteOrderSetting(existing.id)
    return { success: true }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * After a shop changes owner, keep its active orders/offers consistent with the
 * new owner:
 * - Set contractor_id to the new org (or null for a personal shop) so records
 *   line up with the owning entity.
 * - Clear assigned_id when the previous assignee is no longer associated with
 *   the new owner (not a member of the new org / not the new user owner), so the
 *   new owner can reclaim the work.
 *
 * Only active records are touched — completed (fulfilled) and cancelled orders
 * are left untouched as a historical record.
 */
async function reassignShopDataAfterTransfer(
  db: ReturnType<typeof getKnex>,
  shopId: string,
  newOwnerUserId: string | null,
  newOwnerContractorId: string | null,
): Promise<void> {
  const ACTIVE_ORDER_STATUSES = ["not-started", "in-progress"]
  const ACTIVE_OFFER_STATUSES = ["active", "counteroffered", "to-customer", "to-seller"]

  // Determine whether a given assignee is still associated with the new owner.
  const isAssigneeAssociated = async (assignedId: string | null): Promise<boolean> => {
    if (!assignedId) return true // nothing assigned, nothing to clear
    if (newOwnerContractorId) {
      return is_member(newOwnerContractorId, assignedId)
    }
    // Personal shop: only the new owner should remain assigned
    return assignedId === newOwnerUserId
  }

  // ── Orders ──────────────────────────────────────────────────────────────
  const orders = await db("orders")
    .where("shop_id", shopId)
    .whereIn("status", ACTIVE_ORDER_STATUSES)
    .select("order_id", "assigned_id")

  for (const order of orders) {
    const keepAssignee = await isAssigneeAssociated(order.assigned_id)
    await db("orders")
      .where("order_id", order.order_id)
      .update({
        contractor_id: newOwnerContractorId,
        ...(keepAssignee ? {} : { assigned_id: null }),
      })
  }

  // ── Offer sessions ──────────────────────────────────────────────────────
  const sessions = await db("offer_sessions")
    .where("shop_id", shopId)
    .whereIn("status", ACTIVE_OFFER_STATUSES)
    .select("id", "assigned_id")

  for (const session of sessions) {
    const keepAssignee = await isAssigneeAssociated(session.assigned_id)
    await db("offer_sessions")
      .where("id", session.id)
      .update({
        contractor_id: newOwnerContractorId,
        ...(keepAssignee ? {} : { assigned_id: null }),
      })
  }
}

async function shopToResponse(shop: Shop & { tags?: string[]; accepts_custom_orders?: boolean }): Promise<ShopResponse> {
  const db = getKnex()
  const threadChannel = await getThreadChannel({ owner_type: "shop", owner_id: shop.shop_id })

  // Resolve contractor spectrum_id for V1 API compatibility
  let ownerContractorSpectrumId: string | null = null
  if (shop.owner_contractor_id) {
    const contractor = await db("contractors")
      .where("contractor_id", shop.owner_contractor_id)
      .first("spectrum_id")
    ownerContractorSpectrumId = contractor?.spectrum_id || null
  }

  return {
    shop_id: shop.shop_id,
    slug: shop.slug,
    name: shop.name,
    description: shop.description,
    banner: shop.banner,
    logo: shop.logo,
    owner_user_id: shop.owner_user_id,
    is_org_owned: !!shop.owner_contractor_id,
    owner_contractor_spectrum_id: ownerContractorSpectrumId,
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
    official_server_id: threadChannel?.guild_id ?? null,
    discord_thread_channel_id: threadChannel?.channel_id ?? null,
    badge_ids: shop.badge_ids || [],
  }
}

const DISCORD_ID = /^[0-9]{15,22}$/

/** What an update asks for the shop's own thread channel. */
function parseShopThreadChannel(
  body: Pick<UpdateShopRequest, "official_server_id" | "discord_thread_channel_id">,
): DiscordChannelRef | "clear" | "unchanged" | "invalid" {
  if (body.official_server_id === undefined && body.discord_thread_channel_id === undefined) {
    return "unchanged"
  }
  const guild_id = (body.official_server_id ?? "").trim()
  const channel_id = (body.discord_thread_channel_id ?? "").trim()
  if (!guild_id && !channel_id) return "clear"
  if (!DISCORD_ID.test(guild_id) || !DISCORD_ID.test(channel_id)) return "invalid"
  return { guild_id, channel_id }
}

async function resolveImageUrl(db: ReturnType<typeof getKnex>, resourceId: string | null): Promise<string | null> {
  if (!resourceId) return null
  const row = await db("image_resources").where("resource_id", resourceId).first()
  if (!row) return null
  return row.external_url || `https://cdn.sc-market.space/${row.filename}`
}
