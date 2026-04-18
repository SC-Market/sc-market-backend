/**
 * Orders V2 Controller
 *
 * TSOA controller for order management in the V2 market system.
 * Handles order creation with variant-specific items, stock allocation,
 * and price snapshotting.
 *
 * Requirements: 25.1-25.12
 */

import { Post, Route, Tags, Body, Request, Get, Path, Query } from "tsoa"
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
  OrderPreview,
} from "../types/orders.types.js"
import logger from "../../../../logger/logger.js"

@Route("orders")
@Tags("Orders V2")
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

    logger.info("Fetching V2 order detail", { orderId, userId })

    try {
      const knex = getKnex()

      // Step 1: Get order record
      // Requirement 26.10: Return 404 if order not found
      const order = await knex("orders")
        .where({ order_id: orderId })
        .first()

      if (!order) {
        throw this.throwNotFound("Order", orderId)
      }

      // Step 2: Get buyer and seller information
      // Requirement 26.2: Return order metadata with buyer and seller information
      const [buyer, seller] = await Promise.all([
        knex("accounts")
          .where({ user_id: order.customer_id })
          .select("user_id", "username", "display_name", "avatar")
          .first(),
        knex("market_orders")
          .join("listings", "market_orders.listing_id", "listings.listing_id")
          .join("accounts", "listings.seller_id", "accounts.user_id")
          .where({ "market_orders.order_id": orderId })
          .select("accounts.user_id", "accounts.username", "accounts.display_name", "accounts.avatar")
          .first(),
      ])

      if (!buyer || !seller) {
        throw this.throwNotFound("Order participants", orderId)
      }

      // Requirement 26.11: Validate user authorization to view order
      if (userId !== buyer.user_id && userId !== seller.user_id) {
        throw this.throwForbidden("You do not have permission to view this order")
      }

      // Step 3: Get order items with variant details
      // Requirement 26.3: Return array of order items with variant details
      const orderItems = await knex("order_market_items_v2")
        .where({ order_id: orderId })
        .select("*")

      if (orderItems.length === 0) {
        logger.warn("Order has no items in order_market_items_v2", { orderId })
        // Return empty items array instead of throwing error
      }

      // Step 4: Enrich items with variant details
      // Requirements 26.4-26.7: Include quality_tier, variant attributes, display_name, price_per_unit
      const items: OrderItemDetail[] = await Promise.all(
        orderItems.map(async (orderItem) => {
          // Get variant details
          const variant = await knex("item_variants")
            .where({ variant_id: orderItem.variant_id })
            .first()

          if (!variant) {
            logger.error("Variant not found for order item", {
              orderId,
              orderItemId: orderItem.order_item_id,
              variantId: orderItem.variant_id,
            })
            throw this.throwNotFound("Variant", orderItem.variant_id)
          }

          // Build variant detail for response
          const variantDetail: OrderVariantDetail = {
            variant_id: variant.variant_id,
            attributes: variant.attributes,
            display_name: variant.display_name,
            short_name: variant.short_name,
          }

          return {
            order_item_id: orderItem.order_item_id,
            listing_id: orderItem.listing_id,
            item_id: orderItem.item_id,
            variant: variantDetail,
            quantity: orderItem.quantity,
            price_per_unit: orderItem.price_per_unit, // Requirement 26.7: Snapshot from purchase time
            subtotal: orderItem.price_per_unit * orderItem.quantity,
          }
        }),
      )

      // Step 5: Calculate total price
      // Requirement 26.8: Calculate order totals with per-variant pricing
      const totalPrice = items.reduce((sum, item) => sum + item.subtotal, 0)

      logger.info("V2 order detail retrieved successfully", {
        orderId,
        userId,
        itemCount: items.length,
        totalPrice,
      })

      // Requirement 26.9: Include order status and timestamps
      return {
        order_id: order.order_id,
        buyer: {
          user_id: buyer.user_id,
          username: buyer.username,
          display_name: buyer.display_name,
          avatar: buyer.avatar,
        },
        seller: {
          user_id: seller.user_id,
          username: seller.username,
          display_name: seller.display_name,
          avatar: seller.avatar,
        },
        total_price: totalPrice,
        status: order.status,
        created_at: order.created_at.toISOString(),
        updated_at: order.updated_at.toISOString(),
        items,
      }
    } catch (error) {
      logger.error("Failed to fetch V2 order detail", {
        orderId,
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
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
        // For seller role, join with market_orders and listings
        query = query
          .join("market_orders", "orders.order_id", "market_orders.order_id")
          .join("listings", "market_orders.listing_id", "listings.listing_id")
          .where("listings.seller_id", userId)
          .groupBy("orders.order_id", "buyer.username", "buyer.avatar")
      } else {
        // No role specified - show orders where user is buyer OR seller
        query = query.where((builder) => {
          builder
            .where("orders.customer_id", userId)
            .orWhereExists((subquery) => {
              subquery
                .select("*")
                .from("market_orders")
                .join("listings", "market_orders.listing_id", "listings.listing_id")
                .whereRaw("market_orders.order_id = orders.order_id")
                .where("listings.seller_id", userId)
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
        variant_attributes: variant.attributes,
        variant_display_name: variant.display_name,
        variant_short_name: variant.short_name,
      })
    }

    return result
  }
}
