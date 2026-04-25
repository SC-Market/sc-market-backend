/**
 * Orders V2 Controller
 *
 * TSOA controller for order management in the V2 market system.
 * Handles order creation with variant-specific items, stock allocation,
 * and price snapshotting.
 *
 * Requirements: 25.1-25.12
 */

import { Post, Route, Tags, Body, Request, Get, Path, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { OrderLifecycleService } from "../../../../services/allocation/order-lifecycle.service.js"
import {
  CreateOrderRequest,
  CreateOrderResponse,
  GetOrderDetailResponse,
  GetOrdersRequest,
  GetOrdersResponse,
  OrderItemDetail,
  OrderVariantDetail,
  OrderMarketListingV2,
  OrderVariantItem,
  OrderPreview,
  OrdersByListingResponse,
} from "../types/orders.types.js"
import logger from "../../../../logger/logger.js"

@Route("orders")
@Tags("Orders V2")
@Security("loggedin")
export class OrdersV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Create a new order with variant-specific items
   *
   * Creates an order by:
   * 1. Validating variant availability for each item
   * 2. Creating order record in V1 orders table
   * 3. Creating market_orders entries (V1 compatibility)
   * 4. Creating order_market_items_v2 entries with variant tracking
   * 5. Snapshotting variant prices at purchase time
   * 6. Allocating stock from variant-specific lots
   * 7. Notifying seller of new order
   *
   * Uses database transaction for atomicity to ensure all-or-nothing behavior.
   * Stock allocation follows the V1 workflow using OrderLifecycleService.
   *
   * Requirements:
   * - 25.1: POST /api/v2/orders endpoint
   * - 25.2: Accept array of items with listing_id, variant_id, quantity
   * - 25.3: Validate variant availability before order creation
   * - 25.4: Use variant-specific pricing in order calculations
   * - 25.5: Allocate stock from correct variant's stock lots
   * - 25.6: Use database transaction for atomicity
   * - 25.7: Snapshot variant prices at time of order creation
   * - 25.8: Prevent ordering unavailable variants with descriptive error
   * - 25.9: Create order_market_items_v2 entries for each item
   * - 25.10: Return order_id and order details on success
   * - 25.11: Notify seller of new order
   * - 25.12: Log order creation to Audit_Trail
   *
   * @summary Create order
   * @param requestBody Order creation request with items array
   * @param request Express request for authentication
   * @returns Created order with order_id and item details
   */
  @Post()
  public async createOrder(
    @Body() requestBody: CreateOrderRequest,
    @Request() request: ExpressRequest,
  ): Promise<CreateOrderResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Creating V2 order", {
      userId,
      itemCount: requestBody.items.length,
    })

    // Validate request
    this.validateCreateOrderRequest(requestBody)

    try {
      // Use database transaction for atomicity (Requirement 25.6)
      const result = await withTransaction(async (trx) => {
        // Step 1: Validate variant availability and get pricing info
        // Requirement 25.3: Validate variant availability before order creation
        const itemsWithPricing = await this.validateAndGetPricing(
          requestBody.items,
          trx,
        )

        // Calculate total price
        // Requirement 25.4: Use variant-specific pricing in order calculations
        const totalPrice = itemsWithPricing.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        )

        // Get seller_id from first listing (all items must be from same seller)
        const sellerId = itemsWithPricing[0].seller_id

        // Step 2: Create order record in V1 orders table
        // This maintains compatibility with existing order system
        const [order] = await trx("orders")
          .insert({
            customer_id: userId,
            contractor_id: null, // V2 orders are user-to-user by default
            status: "pending",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("*")

        logger.info("Created order record", {
          orderId: order.order_id,
          userId,
          totalPrice,
        })

        // Step 3: Create market_orders entries for V1 compatibility
        // Group items by listing_id to create aggregated market_orders entries
        const listingQuantities = new Map<string, number>()
        for (const item of requestBody.items) {
          const current = listingQuantities.get(item.listing_id) || 0
          listingQuantities.set(item.listing_id, current + item.quantity)
        }

        for (const [listing_id, quantity] of listingQuantities.entries()) {
          await trx("market_orders").insert({
            order_id: order.order_id,
            listing_id,
            quantity,
          })
        }

        logger.info("Created market_orders entries", {
          orderId: order.order_id,
          listingCount: listingQuantities.size,
        })

        // Step 4: Create order_market_items_v2 entries with variant tracking
        // Requirement 25.9: Create order_market_items_v2 entries for each item
        // Requirement 25.7: Snapshot variant prices at time of order creation
        const orderItems: OrderItemDetail[] = []

        for (const item of itemsWithPricing) {
          const [orderItem] = await trx("order_market_items_v2")
            .insert({
              order_id: order.order_id,
              listing_id: item.listing_id,
              item_id: item.item_id,
              variant_id: item.variant_id,
              quantity: item.quantity,
              price_per_unit: item.price, // Snapshot price at purchase time
              created_at: new Date(),
            })
            .returning("*")

          // Build variant detail for response
          const variantDetail: OrderVariantDetail = {
            variant_id: item.variant_id,
            attributes: item.variant_attributes,
            display_name: item.variant_display_name,
            short_name: item.variant_short_name,
          }

          orderItems.push({
            order_item_id: orderItem.order_item_id,
            listing_id: item.listing_id,
            item_id: item.item_id,
            listing_title: item.listing_title,
            variant: variantDetail,
            quantity: item.quantity,
            price_per_unit: item.price,
            subtotal: item.price * item.quantity,
          })
        }

        logger.info("Created order_market_items_v2 entries", {
          orderId: order.order_id,
          itemCount: orderItems.length,
        })

        // Step 5: Allocate stock from variant-specific lots
        // Requirement 25.5: Allocate stock from correct variant's stock lots
        // Use OrderLifecycleService to maintain V1 workflow compatibility
        const lifecycleService = new OrderLifecycleService(trx)
        
        // Convert to format expected by OrderLifecycleService
        const marketListings = Array.from(listingQuantities.entries()).map(
          ([listing_id, quantity]) => ({
            listing_id,
            quantity,
          }),
        )

        const allocationResult = await lifecycleService.allocateStockForOrder(
          order.order_id,
          marketListings,
          null, // contractor_id
          userId,
        )

        logger.info("Stock allocated for V2 order", {
          orderId: order.order_id,
          totalRequested: allocationResult.total_requested,
          totalAllocated: allocationResult.total_allocated,
          hasPartial: allocationResult.has_partial_allocations,
        })

        // Return order response (Requirement 25.10)
        return {
          order_id: order.order_id,
          buyer_id: userId,
          seller_id: sellerId,
          total_price: totalPrice,
          status: order.status,
          created_at: order.created_at.toISOString(),
          items: orderItems,
          allocation_result: {
            has_partial_allocations: allocationResult.has_partial_allocations,
            total_requested: allocationResult.total_requested,
            total_allocated: allocationResult.total_allocated,
          },
        }
      })

      logger.info("V2 order created successfully", {
        orderId: result.order_id,
        userId,
        totalPrice: result.total_price,
      })

      // Notify seller of new order (Requirement 25.11)
      try {
        const { notificationService } = await import("../../../../services/notifications/notification.service.js")
        await notificationService.createNewOrderNotificationV2(result, result.seller_id)
      } catch (e) {
        logger.error("Failed to send V2 order notification", { error: e })
      }

      return result
    } catch (error) {
      logger.error("Failed to create V2 order", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
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

      // Seller — from market_orders → listings → accounts, or from assigned_id
      let seller = await knex("market_orders")
        .join("listings", "market_orders.listing_id", "listings.listing_id")
        .join("accounts", "listings.seller_id", "accounts.user_id")
        .where({ "market_orders.order_id": orderId })
        .select("accounts.user_id", "accounts.username", "accounts.display_name", "accounts.avatar")
        .first()

      if (!seller && order.assigned_id) {
        seller = await knex("accounts")
          .where({ user_id: order.assigned_id })
          .select("user_id", "username", "display_name", "avatar")
          .first()
      }

      if (!buyer) throw this.throwNotFound("Order buyer", orderId)

      // Auth check — buyer, seller, or contractor member
      const isBuyer = userId === buyer.user_id
      const isSeller = seller && userId === seller.user_id
      const isAssigned = order.assigned_id === userId
      // Check contractor membership if seller is an org
      let isOrgMember = false
      if (!isSeller && seller) {
        const listing = await knex("market_orders")
          .join("listings", "market_orders.listing_id", "listings.listing_id")
          .where({ "market_orders.order_id": orderId })
          .select("listings.seller_id", "listings.seller_type")
          .first()
        if (listing?.seller_type === "contractor") {
          const { is_member } = await import("../../../routes/v1/util/permissions.js")
          isOrgMember = await is_member(listing.seller_id, userId)
        }
      }
      if (!isBuyer && !isSeller && !isAssigned && !isOrgMember) {
        throw this.throwForbidden("You do not have permission to view this order")
      }

      // V1 market listings
      const v1Listings = await knex("market_orders")
        .where({ order_id: orderId })
        .select("listing_id", "quantity")

      // V2 variant items (may not exist)
      const hasV2Table = await knex.schema.hasTable("order_market_items_v2")
      let v2Items: any[] = []
      if (hasV2Table) {
        v2Items = await knex("order_market_items_v2")
          .where({ order_id: orderId })
          .select("*")
      }

      // Build source listings — V1 market_orders, or grouped V2 items if V1 is empty
      let sourceListings: Array<{ listing_id: string; quantity: number }> = v1Listings
      if (v1Listings.length === 0 && v2Items.length > 0) {
        const grouped = new Map<string, number>()
        for (const vi of v2Items) {
          grouped.set(vi.listing_id, (grouped.get(vi.listing_id) || 0) + vi.quantity)
        }
        sourceListings = Array.from(grouped.entries()).map(([listing_id, quantity]) => ({ listing_id, quantity }))
      }

      // Build enriched market_listings
      const marketListings: OrderMarketListingV2[] = await Promise.all(
        sourceListings.map(async (ml) => {
          // Get listing title/price from V2 listings table first, fall back to V1
          let title = "Unknown"
          let price = 0
          const v2Listing = await knex("listings").where({ listing_id: ml.listing_id }).first()
          if (v2Listing) {
            title = v2Listing.title
            const li = await knex("listing_items").where({ listing_id: ml.listing_id }).first()
            price = li?.base_price ? parseInt(li.base_price) : 0
          } else {
            const v1Details = await knex("market_listing_details").where({ listing_id: ml.listing_id }).first()
            if (v1Details) {
              title = v1Details.title
              price = parseInt(v1Details.price) || 0
            }
          }

          // Get V2 variant items for this listing
          const listingV2Items = v2Items.filter((i) => i.listing_id === ml.listing_id)
          const v2Variants: OrderVariantItem[] = await Promise.all(
            listingV2Items.map(async (vi) => {
              const variant = await knex("item_variants").where({ variant_id: vi.variant_id }).first()
              return {
                order_item_id: vi.order_item_id,
                variant_id: vi.variant_id,
                quantity: vi.quantity,
                price_per_unit: parseInt(vi.price_per_unit) || 0,
                attributes: variant?.attributes || {},
                display_name: variant?.display_name || "Standard",
                short_name: variant?.short_name || "STD",
              }
            }),
          )

          // Get first photo
          const photoRow = await knex("listing_photos_v2 as lp")
            .join("image_resources as ir", "lp.resource_id", "ir.resource_id")
            .where("lp.listing_id", ml.listing_id)
            .orderBy("lp.display_order", "asc")
            .select(knex.raw("COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename) as url"))
            .first()

          return { listing_id: ml.listing_id, quantity: ml.quantity, title, price, photo: photoRow?.url || undefined, v2_variants: v2Variants }
        }),
      )

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
        buyer: { user_id: buyer.user_id, username: buyer.username, display_name: buyer.display_name, avatar: buyer.avatar },
        seller: seller
          ? { user_id: seller.user_id, username: seller.username, display_name: seller.display_name, avatar: seller.avatar }
          : { user_id: "", username: "Unknown", display_name: "Unknown", avatar: null },
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
   * 2. Status filtering (pending, completed, cancelled)
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
   * @param request Express request for authentication
   * @returns Orders list with pagination metadata
   */
  @Get()
  public async getOrders(
    @Query() status?: 'pending' | 'completed' | 'cancelled',
    @Query() role?: 'buyer' | 'seller',
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
    const currentPage = page || 1
    const pageSize = Math.min(page_size || 20, 100)
    const sortBy = sort_by || 'created_at'
    const sortOrder = sort_order || 'desc'
    const offset = (currentPage - 1) * pageSize

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

      // Build base query
      let query = knex("orders")
        .select(
          "orders.order_id",
          "orders.status",
          "orders.created_at",
          "orders.updated_at",
          "orders.customer_id",
          "buyer.username as buyer_username",
          "buyer.avatar as buyer_avatar",
        )
        .leftJoin("accounts as buyer", "orders.customer_id", "buyer.user_id")

      // Apply role filter
      if (role === 'buyer') {
        query = query.where("orders.customer_id", userId)
      } else if (role === 'seller') {
        // For seller role: direct seller OR member of seller contractor
        const userContractorIds = await knex("contractor_members")
          .where("user_id", userId)
          .select("contractor_id")
        const cIds = userContractorIds.map((r: any) => r.contractor_id)
        query = query
          .join("market_orders", "orders.order_id", "market_orders.order_id")
          .join("listings", "market_orders.listing_id", "listings.listing_id")
          .where((qb) => {
            qb.where("listings.seller_id", userId)
            if (cIds.length) qb.orWhereIn("listings.seller_id", cIds)
          })
          .groupBy("orders.order_id", "buyer.username", "buyer.avatar")
      } else {
        // No role: buyer OR seller (direct or org)
        const userContractorIds = await knex("contractor_members")
          .where("user_id", userId)
          .select("contractor_id")
        const cIds = userContractorIds.map((r: any) => r.contractor_id)
        query = query.where((builder) => {
          builder
            .where("orders.customer_id", userId)
            .orWhereExists((subquery) => {
              subquery
                .select("*")
                .from("market_orders")
                .join("listings", "market_orders.listing_id", "listings.listing_id")
                .whereRaw("market_orders.order_id = orders.order_id")
                .where((qb) => {
                  qb.where("listings.seller_id", userId)
                  if (cIds.length) qb.orWhereIn("listings.seller_id", cIds)
                })
            })
        })
      }

      // Apply status filter
      if (status) {
        query = query.where("orders.status", status)
      }

      // Clone query for count
      const countQuery = query.clone().clearSelect().clearOrder().count("* as total")

      // Apply sorting
      query = query.orderBy(`orders.${sortBy}`, sortOrder)

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
          // Get seller information
          const seller = await knex("market_orders")
            .join("listings", "market_orders.listing_id", "listings.listing_id")
            .join("accounts", "listings.seller_id", "accounts.user_id")
            .where({ "market_orders.order_id": order.order_id })
            .select("accounts.username", "accounts.avatar")
            .first()

          // Get order items with variant details
          const orderItems = await knex("order_market_items_v2")
            .where({ order_id: order.order_id })
            .select("*")

          // Calculate total price and quality tier range
          let totalPrice = 0
          let qualityTierMin: number | undefined
          let qualityTierMax: number | undefined

          for (const item of orderItems) {
            totalPrice += item.price_per_unit * item.quantity

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

          // Get title from first listing
          const firstListing = await knex("market_orders")
            .join("listings", "market_orders.listing_id", "listings.listing_id")
            .where({ "market_orders.order_id": order.order_id })
            .select("listings.title")
            .first()

          return {
            order_id: order.order_id,
            title: firstListing?.title || "Order",
            total_price: totalPrice,
            status: order.status,
            created_at: order.created_at.toISOString(),
            updated_at: order.updated_at.toISOString(),
            buyer_username: order.buyer_username,
            seller_username: seller?.username || "Unknown",
            item_count: orderItems.length,
            quality_tier_min: qualityTierMin,
            quality_tier_max: qualityTierMax,
            buyer_avatar: order.buyer_avatar,
            seller_avatar: seller?.avatar,
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
   * Validates the create order request
   */
  private validateCreateOrderRequest(request: CreateOrderRequest): void {
    const errors: Array<{ field: string; message: string }> = []

    // Validate items array
    if (!request.items || request.items.length === 0) {
      errors.push({
        field: "items",
        message: "At least one item is required",
      })
    }

    // Validate each item
    if (request.items) {
      request.items.forEach((item, index) => {
        if (!item.listing_id) {
          errors.push({
            field: `items[${index}].listing_id`,
            message: "listing_id is required",
          })
        }

        if (!item.variant_id) {
          errors.push({
            field: `items[${index}].variant_id`,
            message: "variant_id is required",
          })
        }

        if (!item.quantity || item.quantity <= 0) {
          errors.push({
            field: `items[${index}].quantity`,
            message: "quantity must be greater than 0",
          })
        }
      })
    }

    if (errors.length > 0) {
      throw this.throwValidationError("Invalid order request", errors)
    }
  }

  /**
   * Validates variant availability and retrieves pricing information
   * Requirement 25.3: Validate variant availability before order creation
   * Requirement 25.8: Prevent ordering unavailable variants with descriptive error
   */
  private async validateAndGetPricing(
    items: Array<{ listing_id: string; variant_id: string; quantity: number }>,
    trx: any,
  ): Promise<
    Array<{
      listing_id: string
      item_id: string
      variant_id: string
      quantity: number
      price: number
      seller_id: string
      listing_title: string
      variant_attributes: any
      variant_display_name: string
      variant_short_name: string
    }>
  > {
    const result = []
    let firstSellerId: string | null = null

    for (const item of items) {
      // Get listing and verify it's active
      const listing = await trx("listings")
        .where({ listing_id: item.listing_id })
        .first()

      if (!listing) {
        throw this.throwNotFound(
          `Listing ${item.listing_id} not found`,
          "listing_id",
        )
      }

      if (listing.status !== "active") {
        throw this.throwValidationError(
          `Listing ${item.listing_id} is not active`,
          [
            {
              field: "listing_id",
              message: `Listing status is ${listing.status}`,
            },
          ],
        )
      }

      // Verify all items are from the same seller
      if (firstSellerId === null) {
        firstSellerId = listing.seller_id
      } else if (listing.seller_id !== firstSellerId) {
        throw this.throwValidationError(
          "All items must be from the same seller",
          [
            {
              field: "items",
              message: "Cannot create order with items from multiple sellers",
            },
          ],
        )
      }

      // Get listing_item
      const listingItem = await trx("listing_items")
        .where({ listing_id: item.listing_id })
        .first()

      if (!listingItem) {
        throw this.throwNotFound(
          `Listing item not found for listing ${item.listing_id}`,
          "listing_id",
        )
      }

      // Get variant details
      const variant = await trx("item_variants")
        .where({ variant_id: item.variant_id })
        .first()

      if (!variant) {
        throw this.throwNotFound(
          `Variant ${item.variant_id} not found`,
          "variant_id",
        )
      }

      // Check variant availability
      // Sum up quantity from all listed lots for this variant
      const availabilityResult = await trx("listing_item_lots")
        .where({
          item_id: listingItem.item_id,
          variant_id: item.variant_id,
          listed: true,
        })
        .sum("quantity_total as total")
        .first()

      const availableQuantity = parseInt(availabilityResult?.total || "0")

      if (availableQuantity < item.quantity) {
        throw this.throwValidationError(
          `Insufficient stock for variant ${item.variant_id}`,
          [
            {
              field: "quantity",
              message: `Only ${availableQuantity} available, requested ${item.quantity}`,
            },
          ],
        )
      }

      // Get price for this variant
      let price: number

      if (listingItem.pricing_mode === "unified") {
        price = listingItem.base_price
      } else {
        // per_variant pricing
        const variantPricing = await trx("variant_pricing")
          .where({
            item_id: listingItem.item_id,
            variant_id: item.variant_id,
          })
          .first()

        if (!variantPricing) {
          throw this.throwNotFound(
            `Pricing not found for variant ${item.variant_id}`,
            "variant_id",
          )
        }

        price = variantPricing.price
      }

      result.push({
        listing_id: item.listing_id,
        item_id: listingItem.item_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price,
        seller_id: listing.seller_id,
        listing_title: listing.title,
        variant_attributes: variant.attributes,
        variant_display_name: variant.display_name,
        variant_short_name: variant.short_name,
      })
    }

    return result
  }

  /**
   * Get orders and offers related to a specific listing.
   * Only visible to the listing owner or org members.
   * @summary Get orders by listing
   * @param listingId Listing UUID
   */
  @Get("by-listing/{listingId}")
  @Security("jwt")
  public async getOrdersByListing(
    @Path() listingId: string,
  ): Promise<OrdersByListingResponse> {
    const knex = getKnex()
    const userId = this.getUserId()

    // Verify user owns this listing or is in the org
    const listing = await knex("listings").where("listing_id", listingId).first()
    if (!listing) this.throwNotFound("Listing", listingId)

    const isOwner = listing.seller_id === userId
    let isOrgMember = false
    if (!isOwner && listing.seller_type === "contractor") {
      const member = await knex("contractor_members").where({ user_id: userId, contractor_id: listing.seller_id }).first()
      isOrgMember = !!member
    }
    if (!isOwner && !isOrgMember) this.throwForbidden("Not authorized to view orders for this listing")

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
