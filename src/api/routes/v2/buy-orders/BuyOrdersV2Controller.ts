/**
 * Buy Orders V2 Controller
 *
 * TSOA controller for direct purchase (buy now) functionality in the V2 market system.
 * Handles creating orders directly from listings with variant selection, bypassing the cart.
 *
 * Task: 4.7 Implement BuyOrdersV2Controller
 * 
 * Implementation Requirements:
 * 1. Create BuyOrdersV2Controller with POST /api/v2/buy-orders endpoint
 * 2. Validate listing exists and is active
 * 3. Validate variant exists and belongs to listing
 * 4. Check variant availability
 * 5. Create order with variant-specific line item
 * 6. Allocate stock for the variant
 * 7. Use database transaction for atomicity
 * 8. Return order_id and purchase summary
 * 9. Add comprehensive error handling
 */

import { Post, Get, Put, Delete, Route, Tags, Body, Request, Query, Path, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { OrderLifecycleService } from "../../../../services/allocation/order-lifecycle.service.js"
import {
  CreateBuyOrderRequest,
  CreateBuyOrderResponse,
  BuyOrderItemDetail,
  BuyOrderVariantDetail,
  CreateStandingBuyOrderRequest,
  UpdateStandingBuyOrderRequest,
  StandingBuyOrder,
  SearchBuyOrdersResponse,
} from "../types/buy-orders.types.js"
import logger from "../../../../logger/logger.js"

@Route("buy-orders")
@Tags("Buy Orders V2")
@Security("jwt")
export class BuyOrdersV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Create a direct purchase order from listing
   *
   * Creates an order directly from a listing with variant selection, bypassing the cart.
   * This implements "Buy Now" functionality for immediate purchases.
   *
   * Process:
   * 1. Validates listing exists and is active
   * 2. Validates variant exists and belongs to listing
   * 3. Checks variant availability (sufficient stock)
   * 4. Snapshots variant price at purchase time
   * 5. Creates order record in V1 orders table
   * 6. Creates market_orders entry (V1 compatibility)
   * 7. Creates order_market_items_v2 entry with variant tracking
   * 8. Allocates stock from variant-specific lots
   * 9. Returns order details with purchase summary
   *
   * Uses database transaction for atomicity to ensure all-or-nothing behavior.
   * Stock allocation follows the V1 workflow using OrderLifecycleService.
   *
   * Requirements:
   * - Validate listing exists and is active
   * - Validate variant exists and belongs to listing
   * - Check variant availability before order creation
   * - Create order with variant-specific line item
   * - Allocate stock for the variant
   * - Use database transaction for atomicity
   * - Snapshot variant price at time of purchase
   * - Return order_id and purchase summary
   * - Prevent ordering unavailable variants with descriptive error
   * - Follow same patterns as cart checkout
   *
   * @summary Create direct purchase order
   * @summary Create direct purchase from listing
   * @param requestBody Purchase request with listing, variant, and quantity
   * @param request Express request for authentication
   * @returns Created order with order_id and purchase details
   */
  @Post()
  public async createPurchase(
    @Body() requestBody: CreateBuyOrderRequest,
    @Request() request: ExpressRequest,
  ): Promise<CreateBuyOrderResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Creating direct purchase order", {
      userId,
      listingId: requestBody.listing_id,
      variantId: requestBody.variant_id,
      quantity: requestBody.quantity,
    })

    // Validate request
    this.validateCreateBuyOrderRequest(requestBody)

    try {
      // Use database transaction for atomicity
      const result = await withTransaction(async (trx) => {
        // Step 1: Validate listing exists and is active
        const listing = await trx("listings")
          .where({ listing_id: requestBody.listing_id })
          .first()

        if (!listing) {
          throw this.throwNotFound("Listing", requestBody.listing_id)
        }

        if (listing.status !== "active") {
          throw this.throwValidationError("Listing is not active", [
            {
              field: "listing_id",
              message: `Listing status is ${listing.status}`,
            },
          ])
        }

        // Step 2: Get listing_item
        const listingItem = await trx("listing_items")
          .where({ listing_id: requestBody.listing_id })
          .first()

        if (!listingItem) {
          throw this.throwNotFound(
            `Listing item not found for listing ${requestBody.listing_id}`,
            "listing_id",
          )
        }

        // Step 3: Validate variant exists and belongs to listing
        const variant = await trx("item_variants")
          .where({ variant_id: requestBody.variant_id })
          .first()

        if (!variant) {
          throw this.throwNotFound("Variant", requestBody.variant_id)
        }

        // Verify variant belongs to the correct game item
        if (variant.game_item_id !== listingItem.game_item_id) {
          throw this.throwValidationError("Variant does not belong to this listing", [
            {
              field: "variant_id",
              message: "Variant game_item_id does not match listing game_item_id",
            },
          ])
        }

        // Step 4: Check variant availability
        const availabilityResult = await trx("listing_item_lots")
          .where({
            item_id: listingItem.item_id,
            variant_id: requestBody.variant_id,
            listed: true,
          })
          .sum("quantity_total as total")
          .first()

        const availableQuantity = parseInt(availabilityResult?.total || "0")

        if (availableQuantity < requestBody.quantity) {
          throw this.throwValidationError(
            `Insufficient stock for variant ${requestBody.variant_id}`,
            [
              {
                field: "quantity",
                message: `Only ${availableQuantity} available, requested ${requestBody.quantity}`,
              },
            ],
          )
        }

        // Step 5: Get current price for variant (snapshot at purchase time)
        let price: number

        if (listingItem.pricing_mode === "unified") {
          price = listingItem.base_price
        } else {
          // per_variant pricing
          const variantPricing = await trx("variant_pricing")
            .where({
              item_id: listingItem.item_id,
              variant_id: requestBody.variant_id,
            })
            .first()

          if (!variantPricing) {
            throw this.throwNotFound(
              `Pricing not found for variant ${requestBody.variant_id}`,
              "variant_id",
            )
          }

          price = variantPricing.price
        }

        // Calculate total price
        const totalPrice = price * requestBody.quantity

        // Get seller_id
        const sellerId = listing.seller_id

        // Step 6: Create order record in V1 orders table
        const [order] = await trx("orders")
          .insert({
            customer_id: userId,
            contractor_id: null, // V2 orders are user-to-user by default
            status: "pending",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("*")

        logger.info("Created order record for direct purchase", {
          orderId: order.order_id,
          userId,
          totalPrice,
        })

        // Step 7: Create market_orders entry for V1 compatibility
        await trx("market_orders").insert({
          order_id: order.order_id,
          listing_id: requestBody.listing_id,
          quantity: requestBody.quantity,
        })

        logger.info("Created market_orders entry", {
          orderId: order.order_id,
          listingId: requestBody.listing_id,
        })

        // Step 8: Create order_market_items_v2 entry with variant tracking
        const [orderItem] = await trx("order_market_items_v2")
          .insert({
            order_id: order.order_id,
            listing_id: requestBody.listing_id,
            item_id: listingItem.item_id,
            variant_id: requestBody.variant_id,
            quantity: requestBody.quantity,
            price_per_unit: price, // Snapshot price at purchase time
            created_at: new Date(),
          })
          .returning("*")

        logger.info("Created order_market_items_v2 entry", {
          orderId: order.order_id,
          orderItemId: orderItem.order_item_id,
        })

        // Step 9: Allocate stock from variant-specific lots
        const lifecycleService = new OrderLifecycleService(trx)

        const allocationResult = await lifecycleService.allocateStockForOrder(
          order.order_id,
          [
            {
              listing_id: requestBody.listing_id,
              quantity: requestBody.quantity,
            },
          ],
          null, // contractor_id
          userId,
        )

        logger.info("Stock allocated for direct purchase", {
          orderId: order.order_id,
          totalRequested: allocationResult.total_requested,
          totalAllocated: allocationResult.total_allocated,
          hasPartial: allocationResult.has_partial_allocations,
        })

        // Build variant detail for response
        const variantDetail: BuyOrderVariantDetail = {
          variant_id: variant.variant_id,
          attributes: variant.attributes,
          display_name: variant.display_name,
          short_name: variant.short_name,
        }

        // Build item detail for response
        const itemDetail: BuyOrderItemDetail = {
          order_item_id: orderItem.order_item_id,
          listing_id: requestBody.listing_id,
          item_id: listingItem.item_id,
          variant: variantDetail,
          quantity: requestBody.quantity,
          price_per_unit: price,
          subtotal: totalPrice,
        }

        // Return order response
        return {
          order_id: order.order_id,
          buyer_id: userId,
          seller_id: sellerId,
          total_price: totalPrice,
          status: order.status,
          created_at: order.created_at.toISOString(),
          item: itemDetail,
          allocation_result: {
            has_partial_allocations: allocationResult.has_partial_allocations,
            total_requested: allocationResult.total_requested,
            total_allocated: allocationResult.total_allocated,
          },
        }
      })

      logger.info("Direct purchase order created successfully", {
        orderId: result.order_id,
        userId,
        totalPrice: result.total_price,
      })

      // Notify seller of new order
      try {
        const { notificationService } = await import("../../../../services/notifications/notification.service.js")
        // Adapt buy order response to CreateOrderResponse shape for notification
        const orderForNotification = { ...result, items: [result.item] } as any
        await notificationService.createNewOrderNotificationV2(orderForNotification, result.seller_id)
      } catch (e) {
        logger.error("Failed to send V2 buy order notification", { error: e })
      }

      return result
    } catch (error) {
      logger.error("Failed to create direct purchase order", {
        userId,
        listingId: requestBody.listing_id,
        variantId: requestBody.variant_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Create a standing buy order
   */
  @Post('standing')
  @Security('session')
  public async createStandingBuyOrder(
    @Body() body: CreateStandingBuyOrderRequest,
    @Request() request: ExpressRequest,
  ): Promise<StandingBuyOrder> {
    this.request = request
    this.requireAuth()
    const db = getKnex();
    const userId = this.getUserId();

    const expiresAt = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 86400000)
      : new Date(Date.now() + 30 * 86400000);

    const [order] = await db('buy_orders_v2').insert({
      game_item_id: body.game_item_id,
      buyer_id: userId,
      quantity: body.quantity,
      price_min: body.price_per_unit,
      price_max: body.price_per_unit,
      quality_tier_min: body.quality_tier_min || 1,
      quality_tier_max: body.quality_tier_max || 5,
      status: 'active',
      expires_at: expiresAt,
    }).returning('*');

    return this.formatBuyOrderRow(order);
  }

  /**
   * Search active standing buy orders
   */
  @Get('search')
  public async searchBuyOrders(
    @Query() game_item_id?: string,
    @Query() quality_tier_min?: number,
    @Query() quality_tier_max?: number,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<SearchBuyOrdersResponse> {
    const db = getKnex();
    const p = Math.max(1, page || 1);
    const ps = Math.min(100, Math.max(1, page_size || 20));

    let query = db('buy_orders_v2 as bo')
      .leftJoin('accounts as u', 'bo.buyer_id', 'u.user_id')
      .leftJoin('game_items as gi', 'bo.game_item_id', 'gi.game_item_id')
      .where('bo.status', 'active');

    if (game_item_id) query = query.where('bo.game_item_id', game_item_id);
    if (quality_tier_min) query = query.where('bo.quality_tier_max', '>=', quality_tier_min);
    if (quality_tier_max) query = query.where('bo.quality_tier_min', '<=', quality_tier_max);

    const [{ count }] = await query.clone().clearSelect().clearOrder().count('* as count');
    const total = parseInt(String(count), 10);

    const results = await query
      .select('bo.*', 'u.username as buyer_name', 'gi.name as game_item_name')
      .orderBy('bo.created_at', 'desc')
      .limit(ps).offset((p - 1) * ps);

    return {
      buy_orders: results.map((r: any) => this.formatBuyOrderRow(r)),
      total, page: p, page_size: ps,
    };
  }

  /**
   * Get current user's buy orders
   */
  @Get('mine')
  @Security('session')
  public async getMyBuyOrders(
    @Request() request: ExpressRequest,
    @Query() status?: 'active' | 'fulfilled' | 'cancelled' | 'expired',
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<SearchBuyOrdersResponse> {
    this.request = request
    this.requireAuth()
    const db = getKnex();
    const userId = this.getUserId();
    const p = Math.max(1, page || 1);
    const ps = Math.min(100, Math.max(1, page_size || 20));

    let query = db('buy_orders_v2 as bo')
      .leftJoin('accounts as u', 'bo.buyer_id', 'u.user_id')
      .leftJoin('game_items as gi', 'bo.game_item_id', 'gi.game_item_id')
      .where('bo.buyer_id', userId);

    if (status) query = query.where('bo.status', status);

    const [{ count }] = await query.clone().clearSelect().clearOrder().count('* as count');
    const total = parseInt(String(count), 10);

    const results = await query
      .select('bo.*', 'u.username as buyer_name', 'gi.name as game_item_name')
      .orderBy('bo.created_at', 'desc')
      .limit(ps).offset((p - 1) * ps);

    return {
      buy_orders: results.map((r: any) => this.formatBuyOrderRow(r)),
      total, page: p, page_size: ps,
    };
  }

  /**
   * Update a standing buy order
   */
  @Put('{id}')
  @Security('session')
  public async updateBuyOrder(
    @Request() request: ExpressRequest,
    @Path() id: string,
    @Body() body: UpdateStandingBuyOrderRequest,
  ): Promise<StandingBuyOrder> {
    this.request = request
    this.requireAuth()
    const db = getKnex();
    const userId = this.getUserId();

    const order = await db('buy_orders_v2').where('buy_order_id', id).first();
    if (!order) throw this.throwNotFound('Buy order not found');
    if (order.buyer_id !== userId) throw this.throwValidationError('Not authorized', [{ field: 'id', message: 'You do not own this buy order' }]);
    if (order.status !== 'active') throw this.throwValidationError('Cannot update', [{ field: 'status', message: 'Buy order is ' + order.status }]);

    const updates: Record<string, any> = { updated_at: new Date() };
    if (body.quantity !== undefined) updates.quantity_desired = body.quantity;
    if (body.price_per_unit !== undefined) {
      updates.price_min = body.price_per_unit;
      updates.price_max = body.price_per_unit;
    }
    if (body.quality_tier_min !== undefined) updates.quality_tier_min = body.quality_tier_min;
    if (body.quality_tier_max !== undefined) updates.quality_tier_max = body.quality_tier_max;
    if (body.expires_in_days !== undefined) {
      updates.expires_at = new Date(Date.now() + body.expires_in_days * 86400000);
    }

    const [updated] = await db('buy_orders_v2')
      .where('buy_order_id', id)
      .update(updates)
      .returning('*');

    // Re-fetch with joins for display names
    const row = await db('buy_orders_v2 as bo')
      .leftJoin('accounts as u', 'bo.buyer_id', 'u.user_id')
      .leftJoin('game_items as gi', 'bo.game_item_id', 'gi.game_item_id')
      .where('bo.buy_order_id', id)
      .select('bo.*', 'u.username as buyer_name', 'gi.name as game_item_name')
      .first();

    return this.formatBuyOrderRow(row);
  }

  /**
   * Cancel a standing buy order
   */
  @Delete('{id}')
  @Security('session')
  public async cancelBuyOrder(
    @Request() request: ExpressRequest,
    @Path() id: string,
  ): Promise<{ message: string }> {
    this.request = request
    this.requireAuth()
    const db = getKnex();
    const userId = this.getUserId();

    const order = await db('buy_orders_v2').where('buy_order_id', id).first();
    if (!order) throw this.throwNotFound('Buy order not found');
    if (order.buyer_id !== userId) throw this.throwValidationError('Not authorized', [{ field: 'id', message: 'You do not own this buy order' }]);
    if (order.status !== 'active') return { message: 'Buy order already ' + order.status };

    await db('buy_orders_v2').where('buy_order_id', id).update({ status: 'cancelled' });
    return { message: 'Buy order cancelled' };
  }

  /**
   * Fulfill a standing buy order
   * @summary Seller fulfills a buy order
   */
  @Post('{id}/fulfill')
  @Security('session')
  public async fulfillBuyOrder(
    @Request() request: ExpressRequest,
    @Path() id: string,
    @Body() body: { listing_id: string; variant_id: string },
  ): Promise<CreateBuyOrderResponse> {
    this.request = request
    this.requireAuth()
    const sellerId = this.getUserId()
    const db = getKnex()

    const result = await withTransaction(async (trx) => {
      // Validate buy order is active
      const buyOrder = await trx('buy_orders_v2').where('buy_order_id', id).first()
      if (!buyOrder) throw this.throwNotFound('Buy order', id)
      if (buyOrder.status !== 'active') {
        throw this.throwValidationError('Buy order is not active', [
          { field: 'status', message: `Buy order is ${buyOrder.status}` },
        ])
      }

      // Validate listing belongs to seller and is active
      const listing = await trx('listings').where({ listing_id: body.listing_id, seller_id: sellerId }).first()
      if (!listing) throw this.throwNotFound('Listing', body.listing_id)
      if (listing.status !== 'active') {
        throw this.throwValidationError('Listing is not active', [
          { field: 'listing_id', message: `Listing status is ${listing.status}` },
        ])
      }

      // Get listing item matching the buy order's game item
      const listingItem = await trx('listing_items')
        .where({ listing_id: body.listing_id, game_item_id: buyOrder.game_item_id })
        .first()
      if (!listingItem) {
        throw this.throwValidationError('Listing does not contain the requested game item', [
          { field: 'listing_id', message: 'Game item mismatch' },
        ])
      }

      // Validate variant
      const variant = await trx('item_variants').where({ variant_id: body.variant_id }).first()
      if (!variant) throw this.throwNotFound('Variant', body.variant_id)
      if (variant.game_item_id !== buyOrder.game_item_id) {
        throw this.throwValidationError('Variant does not match buy order game item', [
          { field: 'variant_id', message: 'Game item mismatch' },
        ])
      }

      // Check stock availability
      const quantity = buyOrder.quantity || buyOrder.quantity_desired || 1
      const availResult = await trx('listing_item_lots')
        .where({ item_id: listingItem.item_id, variant_id: body.variant_id, listed: true })
        .sum('quantity_total as total')
        .first()
      const available = parseInt(availResult?.total || '0')
      if (available < quantity) {
        throw this.throwValidationError('Insufficient stock', [
          { field: 'quantity', message: `Only ${available} available, need ${quantity}` },
        ])
      }

      // Determine price
      let price: number
      if (listingItem.pricing_mode === 'unified') {
        price = listingItem.base_price
      } else {
        const vp = await trx('variant_pricing').where({ item_id: listingItem.item_id, variant_id: body.variant_id }).first()
        price = vp ? vp.price : listingItem.base_price
      }

      // Create order
      const [order] = await trx('orders').insert({
        customer_id: buyOrder.buyer_id,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      }).returning('*')

      // Create order item
      const [orderItem] = await trx('order_market_items_v2').insert({
        order_id: order.order_id,
        listing_id: body.listing_id,
        item_id: listingItem.item_id,
        variant_id: body.variant_id,
        quantity,
        price_per_unit: price,
        variant_attributes: variant.attributes,
        variant_display_name: variant.display_name || 'Standard',
        created_at: new Date(),
      }).returning('*')

      // Allocate stock
      const lifecycleService = new OrderLifecycleService(trx)
      const allocationResult = await lifecycleService.allocateStockForOrder(
        order.order_id,
        [{ listing_id: body.listing_id, quantity }],
        null,
        buyOrder.buyer_id,
      )

      // Mark buy order as fulfilled
      await trx('buy_orders_v2').where('buy_order_id', id).update({ status: 'fulfilled', updated_at: new Date() })

      return {
        order_id: order.order_id,
        buyer_id: buyOrder.buyer_id,
        seller_id: sellerId,
        total_price: price * quantity,
        status: order.status,
        created_at: order.created_at.toISOString(),
        item: {
          order_item_id: orderItem.order_item_id,
          listing_id: body.listing_id,
          item_id: listingItem.item_id,
          variant: {
            variant_id: variant.variant_id,
            attributes: variant.attributes,
            display_name: variant.display_name || 'Standard',
            short_name: variant.short_name || 'STD',
          },
          quantity,
          price_per_unit: price,
          subtotal: price * quantity,
        },
        allocation_result: {
          has_partial_allocations: allocationResult.has_partial_allocations,
          total_requested: allocationResult.total_requested,
          total_allocated: allocationResult.total_allocated,
        },
      } as CreateBuyOrderResponse
    })

    return result
  }

  private formatBuyOrderRow(r: any): StandingBuyOrder {
    return {
      buy_order_id: r.buy_order_id,
      game_item_id: r.game_item_id,
      game_item_name: r.game_item_name || '',
      buyer_id: r.buyer_id,
      buyer_name: r.buyer_name || 'Unknown',
      quantity: r.quantity || r.quantity_desired || 0,
      price_per_unit: parseFloat(r.price_max) || 0,
      quality_tier_min: r.quality_tier_min || undefined,
      quality_tier_max: r.quality_tier_max || undefined,
      negotiable: r.negotiable || false,
      status: r.status,
      created_at: r.created_at?.toISOString?.() || r.created_at,
      expires_at: r.expires_at?.toISOString?.() || r.expires_at || undefined,
    };
  }

  /**
   * Validates the create buy order request
   */
  private validateCreateBuyOrderRequest(request: CreateBuyOrderRequest): void {
    const errors: Array<{ field: string; message: string }> = []

    if (!request.listing_id) {
      errors.push({
        field: "listing_id",
        message: "listing_id is required",
      })
    }

    if (!request.variant_id) {
      errors.push({
        field: "variant_id",
        message: "variant_id is required",
      })
    }

    if (!request.quantity || request.quantity <= 0) {
      errors.push({
        field: "quantity",
        message: "quantity must be greater than 0",
      })
    }

    if (errors.length > 0) {
      throw this.throwValidationError("Invalid buy order request", errors)
    }
  }
}
