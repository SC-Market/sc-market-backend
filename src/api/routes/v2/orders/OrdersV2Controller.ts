/**
 * Orders V2 Controller
 *
 * TSOA controller for reading orders in the V2 market system. Orders are
 * created by accepting an offer (cart checkout) or by POST /buy-orders.
 *
 * Requirements: 25.1-25.12
 */

import { Route, Tags, Request, Get, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import type { Knex } from "knex"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import {
  canManageShopOrders,
  getShopIdsWithOrderAccess,
} from "../../../../services/shops/shop-permissions.service.js"
import {
  GetOrderDetailResponse,
  GetOrdersResponse,
  OrderItemDetail,
  OrderMarketListingV1,
  OrderMarketListingV2,
  OrderVariantItem,
  OrderPreview,
  OrdersByListingResponse,
} from "../types/orders.types.js"
import logger from "../../../../logger/logger.js"
import { clampPagination } from "../util/pagination.js"

/**
 * Row shape of the `order_market_items_v2` table. `price_per_unit` is a bigint,
 * which the pg driver returns as a string.
 */
interface OrderMarketItemV2Row {
  order_item_id: string
  order_id: string
  listing_id: string
  item_id: string
  variant_id: string
  quantity: number
  price_per_unit: string
  created_at: Date
}

/** Order creation time; the orders table calls it "timestamp". */
const ORDER_CREATED_AT_SQL = `orders."timestamp"`
/**
 * Last recorded change to an order. The table has no updated_at; besides
 * creation, the only change it timestamps is fulfilment (fulfilled_at).
 * GREATEST ignores NULLs, so unfulfilled orders report their creation time.
 */
const ORDER_UPDATED_AT_SQL = `GREATEST(orders."timestamp", orders.fulfilled_at)`
/**
 * Order total, as the detail endpoint computes it: the sum of the order's V2
 * line items, or orders.cost for orders without any (V1-era orders, services).
 */
const ORDER_TOTAL_PRICE_SQL = `COALESCE((SELECT SUM(omi.price_per_unit * omi.quantity) FROM order_market_items_v2 omi WHERE omi.order_id = orders.order_id), orders.cost)`

@Route("orders")
@Tags("Orders V2")
@Security("loggedin")
export class OrdersV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get order details with variant information
   *
   * Retrieves complete order information including:
   * 1. Order metadata (status, timestamps, total price)
   * 2. Buyer and seller information (username, display_name, avatar)
   * 3. Array of order items with variant details
   * 4. Quality tier, variant attributes, and display_name for each item
   * 5. Price per unit snapshot from time of purchase
   *
   * Authorization: User must be either the buyer or seller of the order.
   *
   * Requirements:
   * - 26.1: GET /api/v2/orders/:id endpoint
   * - 26.2: Return order metadata with buyer and seller information
   * - 26.3: Return array of order items with variant details
   * - 26.4: Include quality_tier for each order item
   * - 26.5: Include variant attributes for each item
   * - 26.6: Include variant display_name for each item
   * - 26.7: Include price_per_unit snapshot from time of purchase
   * - 26.8: Calculate order totals with per-variant pricing
   * - 26.9: Include order status and timestamps
   * - 26.10: Return 404 if order not found
   * - 26.11: Validate user authorization to view order
   * - 26.12: Include fulfillment status per item
   *
   * @summary Get order detail
   * @param orderId UUID of the order to retrieve
   * @param request Express request for authentication
   * @returns Order details with buyer/seller info and variant details
   */
  @Get("{orderId}")
  public async getOrderDetail(
    @Path() orderId: string,
    @Request() request: ExpressRequest,
  ): Promise<GetOrderDetailResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    try {
      const knex = getKnex()

      const order = await knex("orders").where({ order_id: orderId }).first()
      if (!order) throw this.throwNotFound("Order", orderId)

      // Buyer
      const buyer = await knex("accounts")
        .where({ user_id: order.customer_id })
        .select("user_id", "username", "display_name", "avatar")
        .first()

      // Seller: the order's shop (orders.shop_id; market_orders rows do not
      // exist for cart checkouts, so they cannot identify it)
      const orderShop = order.shop_id
        ? await knex("shops")
            .where({ shop_id: order.shop_id })
            .select("shop_id", "name as shop_name", "slug as shop_slug", "logo", "owner_user_id", "owner_contractor_id")
            .first()
        : undefined

      if (!buyer) throw this.throwNotFound("Order buyer", orderId)

      // Auth check — buyer, the shop's order managers, or assignee
      const isBuyer = userId === buyer.user_id
      const isAssigned = order.assigned_id === userId
      const isShopSeller = orderShop ? await canManageShopOrders(orderShop, userId) : false
      if (!isBuyer && !isShopSeller && !isAssigned) {
        throw this.throwForbidden("You do not have permission to view this order")
      }

      // V2 order items
      const v2Items = await knex("order_market_items_v2")
        .where({ order_id: orderId })
        .select<OrderMarketItemV2Row[]>("*")

      // V1 market listings
      const v1Listings = await knex("market_orders")
        .where({ order_id: orderId })
        .select("listing_id", "quantity")

      // Build V1 market listings (separate, no V2 enrichment)
      const market_listings: OrderMarketListingV1[] = await Promise.all(
        v1Listings.map(async (ml: { listing_id: string; quantity: number }) => {
          let title = "Unknown"
          let price = 0
          const v1 = await knex("market_unique_listings")
            .join("market_listing_details", "market_unique_listings.details_id", "market_listing_details.details_id")
            .join("market_listings", "market_unique_listings.listing_id", "market_listings.listing_id")
            .where("market_unique_listings.listing_id", ml.listing_id)
            .first("market_listing_details.title", "market_listings.price")
          if (v1) { title = v1.title; price = parseInt(v1.price) || 0 }
          return { listing_id: ml.listing_id, quantity: ml.quantity, title, price }
        }),
      )

      // Build V2 market listings (separate, with variant data)
      const market_listings_v2: OrderMarketListingV2[] = []
      if (v2Items.length > 0) {
        const grouped = new Map<string, OrderMarketItemV2Row[]>()
        for (const vi of v2Items) {
          if (!grouped.has(vi.listing_id)) grouped.set(vi.listing_id, [])
          grouped.get(vi.listing_id)!.push(vi)
        }
        for (const [listing_id, litems] of grouped) {
          let title = "Unknown"
          let price = 0
          const v2Listing = await knex("listings").where({ listing_id }).first()
          if (v2Listing) {
            title = v2Listing.title
            const li = await knex("listing_items").where({ listing_id }).first()
            price = li?.base_price ? parseInt(li.base_price) : 0
          }
          const photoRow = await knex("listing_photos_v2 as lp")
            .join("image_resources as ir", "lp.resource_id", "ir.resource_id")
            .where("lp.listing_id", listing_id)
            .orderBy("lp.display_order", "asc")
            .select(knex.raw("COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) as url"))
            .first()
          const totalQty = litems.reduce((s: number, i) => s + i.quantity, 0)
          const v2Variants: OrderVariantItem[] = await Promise.all(
            litems.map(async (vi) => {
              const variant = await knex("item_variants").where({ variant_id: vi.variant_id }).first()
              return {
                order_item_id: vi.order_item_id, variant_id: vi.variant_id, quantity: vi.quantity,
                price_per_unit: parseInt(vi.price_per_unit) || 0,
                attributes: variant?.attributes || {}, display_name: variant?.display_name || "Standard", short_name: variant?.short_name || "STD",
              }
            }),
          )
          market_listings_v2.push({ listing_id, quantity: totalQty, title, price, photo: photoRow?.url || undefined, v2_variants: v2Variants })
        }
      }

      const marketListings = market_listings
      const marketListingsV2 = market_listings_v2

      // Build items array from V2 data
      const items: OrderItemDetail[] = await Promise.all(
        v2Items.map(async (oi) => {
          const variant = await knex("item_variants").where({ variant_id: oi.variant_id }).first()
          const listing = await knex("listings").where({ listing_id: oi.listing_id }).select("title").first()
          return {
            order_item_id: oi.order_item_id,
            listing_id: oi.listing_id,
            item_id: oi.item_id,
            listing_title: listing?.title || "Unknown",
            variant: {
              variant_id: oi.variant_id,
              attributes: variant?.attributes || {},
              display_name: variant?.display_name || "Standard",
              short_name: variant?.short_name || "STD",
            },
            quantity: oi.quantity,
            price_per_unit: parseInt(oi.price_per_unit) || 0,
            subtotal: (parseInt(oi.price_per_unit) || 0) * oi.quantity,
          }
        }),
      )

      const totalPrice = items.length > 0
        ? items.reduce((s, i) => s + i.subtotal, 0)
        : parseInt(String(order.cost)) || 0

      return {
        order_id: order.order_id,
        buyer: { user_id: buyer.user_id, username: buyer.username, display_name: buyer.display_name, avatar: buyer.avatar ? await cdn.getFileLinkResource(buyer.avatar) : null },
        seller: orderShop
          ? { shop_id: orderShop.shop_id, name: orderShop.shop_name, slug: orderShop.shop_slug }
          : { shop_id: "", name: "Unknown", slug: "" },
        total_price: totalPrice,
        status: order.status,
        kind: order.kind || "",
        title: order.title || "",
        description: order.description || "",
        payment_type: order.payment_type || "",
        offer_session_id: order.offer_session_id || null,
        created_at: order.timestamp?.toISOString?.() || new Date().toISOString(),
        updated_at: order.updated_at?.toISOString?.() || order.timestamp?.toISOString?.() || new Date().toISOString(),
        market_listings: marketListings,
        market_listings_v2: marketListingsV2,
        items,
      }
    } catch (error) {
      logger.error("Failed to fetch V2 order detail", {
        orderId, userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get orders list with filtering and pagination
   *
   * Retrieves a list of orders for the current user with:
   * 1. Role-based filtering (buyer or seller)
   * 2. Status filtering, by the statuses orders store
   *    (not-started, in-progress, fulfilled, cancelled)
   * 3. Quality tier filtering (min and max)
   * 4. Pagination support
   * 5. Sorting options
   *
   * Returns order previews with quality tier information visible.
   *
   * Requirements:
   * - 45.1: Provide OrderListV2 React component (backend support)
   * - 45.2: Maintain visual parity with V1 OrderList component
   * - 45.3: Use RTK_Query_Client for API calls
   * - 45.4: Show quality tier in order preview
   * - 45.5: Filter orders by quality tier
   *
   * @summary Get orders list
   * @param status Only orders with this status, as orders store it
   * @param role buyer: orders the user placed; customer: the same (the word
   *   /offers and the V1 API use for the buyer); seller: orders of the user's
   *   shops or assigned to them. Omitted: both.
   * @param request Express request for authentication
   * @returns Orders list with pagination metadata
   */
  @Get()
  public async getOrders(
    @Query() status?: 'not-started' | 'in-progress' | 'fulfilled' | 'cancelled',
    @Query() role?: 'buyer' | 'customer' | 'seller',
    @Query() quality_tier_min?: number,
    @Query() quality_tier_max?: number,
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() sort_by?: 'created_at' | 'updated_at' | 'total_price',
    @Query() sort_order?: 'asc' | 'desc',
    @Request() request?: ExpressRequest,
  ): Promise<GetOrdersResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    // Set defaults
    // Validated before anything else: a negative page_size used to become a
    // negative LIMIT, which Postgres answers with a 500.
    const { page: currentPage, page_size: pageSize, offset } = clampPagination(page, page_size, { defaultPageSize: 20 })
    const sortBy = sort_by || 'created_at'
    const sortOrder = sort_order || 'desc'

    logger.info("Fetching V2 orders list", {
      userId,
      status,
      role,
      quality_tier_min,
      quality_tier_max,
      page: currentPage,
      page_size: pageSize,
    })

    try {
      const knex = getKnex()

      // The orders table has no created_at/updated_at columns: creation time
      // is "timestamp", and the only later change it records is fulfilled_at.
      // Selecting orders.created_at made every call to this endpoint a 500.
      const sortExpressions: Record<typeof sortBy, string> = {
        created_at: ORDER_CREATED_AT_SQL,
        updated_at: ORDER_UPDATED_AT_SQL,
        total_price: ORDER_TOTAL_PRICE_SQL,
      }

      // Build base query
      let query = knex("orders")
        .select(
          "orders.order_id",
          "orders.status",
          knex.raw(`${ORDER_CREATED_AT_SQL} as created_at`),
          knex.raw(`${ORDER_UPDATED_AT_SQL} as updated_at`),
          "orders.customer_id",
          "orders.title",
          knex.raw(`${ORDER_TOTAL_PRICE_SQL} as total_price`),
          "buyer.username as buyer_username",
          "buyer.avatar as buyer_avatar",
          "seller_shop.name as shop_name",
          "seller_shop.slug as shop_slug",
          "seller_shop.logo as shop_logo",
        )
        .leftJoin("accounts as buyer", "orders.customer_id", "buyer.user_id")
        .leftJoin("shops as seller_shop", "orders.shop_id", "seller_shop.shop_id")

      // The user sells an order when it belongs to a shop whose orders they
      // manage (their own shops, and org shops where they hold manage_market
      // or manage_orders), or when it is assigned to them. orders.shop_id is
      // set on every order, V1-era ones included; market_orders rows are not
      // (cart checkouts never write them), so it is the only reliable link.
      const sellerShopIds = await getShopIdsWithOrderAccess(userId)
      const sellsOrder = (qb: Knex.QueryBuilder) => {
        qb.where("orders.assigned_id", userId)
        if (sellerShopIds.length) qb.orWhereIn("orders.shop_id", sellerShopIds)
      }

      // Apply role filter
      if (role === 'buyer' || role === 'customer') {
        query = query.where("orders.customer_id", userId)
      } else if (role === 'seller') {
        query = query.where(sellsOrder)
      } else {
        query = query.where((builder) => {
          builder.where("orders.customer_id", userId).orWhere(sellsOrder)
        })
      }

      // Apply status filter
      if (status) {
        query = query.where("orders.status", status)
      }

      // Clone query for count
      const countQuery = query.clone().clearSelect().clearOrder().count("* as total")

      // Apply sorting
      query = query
        .orderByRaw(`${sortExpressions[sortBy]} ${sortOrder === "asc" ? "asc" : "desc"}`)
        .orderBy("orders.order_id", sortOrder)

      // Apply pagination
      query = query.limit(pageSize).offset(offset)

      // Execute queries
      const [orders, countResult] = await Promise.all([
        query,
        countQuery.first(),
      ])

      const total = parseInt(countResult?.total as string || "0")

      // Enrich orders with additional information
      const enrichedOrders = await Promise.all(
        orders.map(async (order) => {
          // Get order items with variant details
          const orderItems = await knex("order_market_items_v2")
            .where({ order_id: order.order_id })
            .select("*")

          // Quality tier range
          let qualityTierMin: number | undefined
          let qualityTierMax: number | undefined

          for (const item of orderItems) {
            // Get variant to extract quality tier
            const variant = await knex("item_variants")
              .where({ variant_id: item.variant_id })
              .first()

            if (variant && variant.attributes.quality_tier) {
              const tier = variant.attributes.quality_tier
              if (qualityTierMin === undefined || tier < qualityTierMin) {
                qualityTierMin = tier
              }
              if (qualityTierMax === undefined || tier > qualityTierMax) {
                qualityTierMax = tier
              }
            }
          }

          // Apply quality tier filter if specified
          if (quality_tier_min !== undefined && qualityTierMax !== undefined && qualityTierMax < quality_tier_min) {
            return null // Filter out this order
          }
          if (quality_tier_max !== undefined && qualityTierMin !== undefined && qualityTierMin > quality_tier_max) {
            return null // Filter out this order
          }

          return {
            order_id: order.order_id,
            title: order.title,
            total_price: Number(order.total_price),
            status: order.status,
            created_at: order.created_at.toISOString(),
            updated_at: order.updated_at.toISOString(),
            buyer_username: order.buyer_username,
            shop_name: order.shop_name ?? "Unknown",
            shop_slug: order.shop_slug ?? "",
            item_count: orderItems.length,
            quality_tier_min: qualityTierMin,
            quality_tier_max: qualityTierMax,
            buyer_avatar: order.buyer_avatar ? await cdn.getFileLinkResource(order.buyer_avatar) : null,
            shop_logo: order.shop_logo ?? null,
          }
        }),
      )

      // Filter out null entries (orders that didn't match quality tier filter)
      const filteredOrders = enrichedOrders.filter((order) => order !== null) as OrderPreview[]

      logger.info("V2 orders list retrieved successfully", {
        userId,
        orderCount: filteredOrders.length,
        total,
      })

      return {
        orders: filteredOrders,
        total,
        page: currentPage,
        page_size: pageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch V2 orders list", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get orders and offers related to a specific listing.
   * Only visible to the listing owner or org members.
   * @summary Get orders by listing
   * @param listingId Listing UUID
   */
  @Get("by-listing/{listingId}")
  @Security("loggedin")
  public async getOrdersByListing(
    @Path() listingId: string,
  ): Promise<OrdersByListingResponse> {
    const knex = getKnex()
    const userId = this.getUserId()

    // Verify user can manage this listing's shop
    const listing = await knex("listings").where("listing_id", listingId).first()
    if (!listing) this.throwNotFound("Listing", listingId)

    const { canModifyListing } = await import("../util/listing-permissions.js")
    if (!(await canModifyListing({ shop_id: listing.shop_id }, userId))) {
      this.throwForbidden("Not authorized to view orders for this listing")
    }

    // Get orders via order_market_items_v2
    interface OrderRow { order_id: string; status: string; created_at: Date; buyer_name: string; quantity: number; price_per_unit: string }
    const v2Orders = await knex("order_market_items_v2 as omi")
      .join("orders as o", "omi.order_id", "o.order_id")
      .join("accounts as buyer", "o.customer_id", "buyer.user_id")
      .where("omi.listing_id", listingId)
      .select<OrderRow[]>(
        "o.order_id", "o.status", "o.timestamp as created_at",
        "buyer.username as buyer_name",
        "omi.quantity", "omi.price_per_unit",
      )
      .orderBy("o.timestamp", "desc")
      .limit(20)

    // Get offers via offer_market_items_v2
    interface OfferRow { session_id: string; status: string; created_at: Date; buyer_name: string; quantity: number; price_per_unit: string }
    let v2Offers: OfferRow[] = []
    const hasTable = await knex.schema.hasTable("offer_market_items_v2")
    if (hasTable) {
      v2Offers = await knex("offer_market_items_v2 as omi")
        .join("offers as off", "omi.offer_id", "off.id")
        .join("offer_sessions as os", "off.offer_session_id", "os.id")
        .join("accounts as buyer", "os.customer_id", "buyer.user_id")
        .where("omi.listing_id", listingId)
        .whereNotIn("os.status", ["accepted", "rejected"])
        .select<OfferRow[]>(
          "os.id as session_id", "os.status",
          "os.timestamp as created_at",
          "buyer.username as buyer_name",
          "omi.quantity", "omi.price_per_unit",
        )
        .orderBy("os.timestamp", "desc")
        .limit(20)
    }

    return {
      orders: v2Orders.map((r) => ({
        order_id: r.order_id, status: r.status, created_at: r.created_at?.toISOString?.() || "",
        buyer_name: r.buyer_name, quantity: r.quantity,
        price_per_unit: parseFloat(r.price_per_unit) || 0,
      })),
      offers: v2Offers.map((r) => ({
        session_id: r.session_id, status: r.status, created_at: r.created_at?.toISOString?.() || "",
        buyer_name: r.buyer_name, quantity: r.quantity,
        price_per_unit: parseFloat(r.price_per_unit) || 0,
      })),
    }
  }
}
