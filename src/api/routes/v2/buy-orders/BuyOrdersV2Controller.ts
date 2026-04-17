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

import { Post, Route, Tags, Body, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { OrderLifecycleService } from "../../../../services/allocation/order-lifecycle.service.js"
import {
  CreateBuyOrderRequest,
  CreateBuyOrderResponse,
  BuyOrderItemDetail,
  BuyOrderVariantDetail,
} from "../types/buy-orders.types.js"
import logger from "../../../../logger/logger.js"

@Route("buy-orders")
@Tags("Buy Orders V2")
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
   * @param requestBody Buy order request with listing, variant, and quantity
   * @param request Express request for authentication
   * @returns Created order with order_id and purchase details
   */
  @Post()
  public async createBuyOrder(
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

      // TODO: Notify seller of new order
      // This should be implemented using the existing notification service

      // TODO: Log order creation to Audit_Trail
      // This should be implemented when audit trail system is in place

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
