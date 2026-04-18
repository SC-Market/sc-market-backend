/**
 * Cart V2 Controller
 *
 * TSOA controller for shopping cart management in the V2 market system.
 * Handles cart operations with variant-specific items, stock validation,
 * and price change detection.
 *
 * Requirements: 29.1-29.12, 30.1-30.12, 31.1-31.12, 32.1-32.12
 */

import { Get, Post, Put, Delete, Route, Tags, Body, Request, Path } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import {
  AddToCartRequest,
  AddToCartResponse,
  UpdateCartItemRequest,
  GetCartResponse,
  CartItemDetail,
  CartVariantDetail,
  CartListingInfo,
  CheckoutCartRequest,
  CheckoutCartResponse,
  UnavailableCartItem,
} from "../types/cart.types.js"
import logger from "../../../../logger/logger.js"

@Route("cart")
@Tags("Cart V2")
export class CartV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get user's cart with variant-specific items
   *
   * Retrieves all cart items for the authenticated user with:
   * 1. Variant details (quality tier, attributes, display name)
   * 2. Listing information (title, seller, status)
   * 3. Real-time availability check for each variant
   * 4. Price change detection (compare snapshot vs current price)
   * 5. Calculated subtotals and cart total
   *
   * Availability is checked by querying listed stock lots for each variant.
   * Price changes are detected by comparing cart's price_per_unit with current
   * variant pricing from the listing.
   *
   * Requirements:
   * - 29.1: GET /api/v2/cart endpoint
   * - 29.2: Return array of cart items with variant details
   * - 29.3: Include listing information for each cart item
   * - 29.4: Include variant attributes (quality_tier, display_name)
   * - 29.5: Include quantity and price_per_unit snapshot
   * - 29.6: Calculate subtotal for each item
   * - 29.7: Calculate total_price for entire cart
   * - 29.8: Include availability indicator for each item
   * - 29.9: Include price_changed indicator for each item
   * - 29.10: Return current_price if price has changed
   * - 29.11: Return item_count (total number of items)
   * - 29.12: Filter cart items by authenticated user
   *
   * @summary Get cart
   * @param request Express request for authentication
   * @returns Cart contents with variant details and availability
   */
  @Get()
  public async getCart(
    @Request() request: ExpressRequest,
  ): Promise<GetCartResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Fetching cart", { userId })

    try {
      const knex = getKnex()

      // Fetch cart items with enriched data (Requirements 29.2-29.5)
      const cartItems = await knex("cart_items_v2 as ci")
        .join("listings as l", "ci.listing_id", "l.listing_id")
        .join("listing_items as li", "ci.item_id", "li.item_id")
        .join("item_variants as iv", "ci.variant_id", "iv.variant_id")
        .leftJoin("accounts as seller", function() {
          this.on("l.seller_id", "seller.user_id")
            .andOn(knex.raw("l.seller_type = 'user'"))
        })
        .where("ci.user_id", userId)
        .select(
          "ci.cart_item_id",
          "ci.listing_id",
          "ci.item_id",
          "ci.variant_id",
          "ci.quantity",
          "ci.price_per_unit",
          "ci.created_at",
          "ci.updated_at",
          // Listing info
          "l.title as listing_title",
          "l.status as listing_status",
          "l.seller_type",
          // Variant info
          "iv.attributes as variant_attributes",
          "iv.display_name as variant_display_name",
          "iv.short_name as variant_short_name",
          // Seller info
          "seller.username as seller_username",
          "seller.display_name as seller_display_name",
          "seller.rating as seller_rating",
          // Pricing info
          "li.pricing_mode",
          "li.base_price",
        )
        .orderBy("ci.created_at", "desc")

      // Enrich each cart item with availability and price change info
      const items: CartItemDetail[] = await Promise.all(
        cartItems.map(async (item) => {
          // Check availability (Requirement 29.8)
          const availabilityResult = await knex("listing_item_lots")
            .where({
              item_id: item.item_id,
              variant_id: item.variant_id,
              listed: true,
            })
            .sum("quantity_total as total")
            .first()

          const availableQuantity = parseInt(availabilityResult?.total || "0")
          const available = availableQuantity >= item.quantity

          // Check for price changes (Requirements 29.9, 29.10)
          let currentPrice = item.price_per_unit
          let priceChanged = false

          if (item.pricing_mode === "unified") {
            currentPrice = item.base_price
          } else {
            // per_variant pricing
            const variantPricing = await knex("variant_pricing")
              .where({
                item_id: item.item_id,
                variant_id: item.variant_id,
              })
              .first()

            if (variantPricing) {
              currentPrice = variantPricing.price
            }
          }

          priceChanged = currentPrice !== item.price_per_unit

          // Build variant detail
          const variantDetail: CartVariantDetail = {
            variant_id: item.variant_id,
            attributes: item.variant_attributes,
            display_name: item.variant_display_name || "Standard",
            short_name: item.variant_short_name || "STD",
          }

          // Build listing info (Requirement 29.3)
          const listingInfo: CartListingInfo = {
            listing_id: item.listing_id,
            title: item.listing_title,
            seller_name: item.seller_username || item.seller_display_name || "Unknown",
            seller_rating: item.seller_rating || 0,
            status: item.listing_status,
          }

          // Calculate subtotal (Requirement 29.6)
          const subtotal = item.price_per_unit * item.quantity

          return {
            cart_item_id: item.cart_item_id,
            listing: listingInfo,
            variant: variantDetail,
            quantity: item.quantity,
            price_per_unit: item.price_per_unit,
            subtotal,
            available,
            price_changed: priceChanged,
            current_price: priceChanged ? currentPrice : undefined,
          }
        }),
      )

      // Calculate totals (Requirements 29.7, 29.11)
      const totalPrice = items.reduce((sum, item) => sum + item.subtotal, 0)
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

      logger.info("Cart fetched successfully", {
        userId,
        itemCount: items.length,
        totalPrice,
      })

      return {
        items,
        total_price: totalPrice,
        item_count: itemCount,
      }
    } catch (error) {
      logger.error("Failed to fetch cart", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Add item to cart with variant selection
   *
   * Adds a variant-specific item to the user's cart by:
   * 1. Validating listing exists and is active
   * 2. Validating variant exists and belongs to listing
   * 3. Checking variant availability (sufficient stock)
   * 4. Snapshotting current variant price
   * 5. Creating or updating cart item (upsert on user_id + listing_id + variant_id)
   *
   * If the same variant already exists in cart, the quantities are added together.
   * Price is updated to current price on each add operation.
   *
   * Requirements:
   * - 30.1: POST /api/v2/cart/add endpoint
   * - 30.2: Accept listing_id, variant_id, and quantity
   * - 30.3: Validate listing exists and is active
   * - 30.4: Validate variant exists and belongs to listing
   * - 30.5: Check variant availability before adding
   * - 30.6: Snapshot variant price at add-to-cart time
   * - 30.7: Create cart_items_v2 entry with variant_id
   * - 30.8: Support upsert (update if already in cart)
   * - 30.9: Validate quantity is positive integer
   * - 30.10: Return cart_item_id on success
   * - 30.11: Prevent adding unavailable variants with descriptive error
   * - 30.12: Log cart additions to audit trail
   *
   * @summary Add item to cart
   * @param requestBody Add to cart request with listing, variant, and quantity
   * @param request Express request for authentication
   * @returns Cart item ID and success message
   */
  @Post("add")
  public async addToCart(
    @Body() requestBody: AddToCartRequest,
    @Request() request: ExpressRequest,
  ): Promise<AddToCartResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Adding item to cart", {
      userId,
      listingId: requestBody.listing_id,
      variantId: requestBody.variant_id,
      quantity: requestBody.quantity,
    })

    // Validate request (Requirement 30.9)
    this.validateAddToCartRequest(requestBody)

    try {
      const knex = getKnex()

      // Use database transaction for atomicity
      const result = await withTransaction(async (trx) => {
        // Step 1: Validate listing exists and is active (Requirement 30.3)
        const listing = await trx("listings")
          .where({ listing_id: requestBody.listing_id })
          .first()

        if (!listing) {
          this.throwNotFound("Listing", requestBody.listing_id)
        }

        if (listing.status !== "active") {
          this.throwValidationError("Listing is not active", [
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
          this.throwNotFound(
            `Listing item not found for listing ${requestBody.listing_id}`,
            "listing_id",
          )
        }

        // Step 3: Validate variant exists and belongs to listing (Requirement 30.4)
        const variant = await trx("item_variants")
          .where({ variant_id: requestBody.variant_id })
          .first()

        if (!variant) {
          this.throwNotFound("Variant", requestBody.variant_id)
        }

        // Verify variant belongs to the correct game item
        if (variant.game_item_id !== listingItem.game_item_id) {
          this.throwValidationError("Variant does not belong to this listing", [
            {
              field: "variant_id",
              message: "Variant game_item_id does not match listing game_item_id",
            },
          ])
        }

        // Step 4: Check variant availability (Requirements 30.5, 30.11)
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
          this.throwValidationError(
            `Insufficient stock for variant ${requestBody.variant_id}`,
            [
              {
                field: "quantity",
                message: `Only ${availableQuantity} available, requested ${requestBody.quantity}`,
              },
            ],
          )
        }

        // Step 5: Get current price for variant (Requirement 30.6)
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
            this.throwNotFound(
              `Pricing not found for variant ${requestBody.variant_id}`,
              "variant_id",
            )
          }

          price = variantPricing.price
        }

        // Step 6: Upsert cart item (Requirements 30.7, 30.8)
        // Check if item already exists in cart
        const existingCartItem = await trx("cart_items_v2")
          .where({
            user_id: userId,
            listing_id: requestBody.listing_id,
            variant_id: requestBody.variant_id,
          })
          .first()

        let cartItemId: string

        if (existingCartItem) {
          // Update existing cart item (add quantities, update price)
          const newQuantity = existingCartItem.quantity + requestBody.quantity

          // Validate new quantity doesn't exceed availability
          if (newQuantity > availableQuantity) {
            this.throwValidationError(
              `Insufficient stock for variant ${requestBody.variant_id}`,
              [
                {
                  field: "quantity",
                  message: `Only ${availableQuantity} available, cart would have ${newQuantity}`,
                },
              ],
            )
          }

          await trx("cart_items_v2")
            .where({ cart_item_id: existingCartItem.cart_item_id })
            .update({
              quantity: newQuantity,
              price_per_unit: price, // Update to current price
              updated_at: new Date(),
            })

          cartItemId = existingCartItem.cart_item_id

          logger.info("Updated existing cart item", {
            cartItemId,
            oldQuantity: existingCartItem.quantity,
            newQuantity,
          })
        } else {
          // Create new cart item
          const [newCartItem] = await trx("cart_items_v2")
            .insert({
              user_id: userId,
              listing_id: requestBody.listing_id,
              item_id: listingItem.item_id,
              variant_id: requestBody.variant_id,
              quantity: requestBody.quantity,
              price_per_unit: price,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("cart_item_id")

          cartItemId = newCartItem.cart_item_id

          logger.info("Created new cart item", {
            cartItemId,
            quantity: requestBody.quantity,
          })
        }

        // TODO: Requirement 30.12 - Log cart additions to audit trail
        // This should be implemented when audit trail system is in place

        return cartItemId
      })

      logger.info("Item added to cart successfully", {
        userId,
        cartItemId: result,
      })

      // Return success response (Requirement 30.10)
      return {
        cart_item_id: result,
        message: "Item added to cart successfully",
      }
    } catch (error) {
      logger.error("Failed to add item to cart", {
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
   * Update cart item quantity
   *
   * Updates a cart item's quantity or variant selection by:
   * 1. Validating cart item exists and belongs to user
   * 2. If quantity updated: validating new quantity against availability
   * 3. If variant changed: validating new variant and checking availability
   * 4. Updating price_per_unit to current price
   * 5. Updating cart item record
   *
   * Quantity must be positive. To remove an item, use DELETE endpoint instead.
   * Changing variant will update the price to the new variant's current price.
   *
   * Requirements:
   * - 31.1: PUT /api/v2/cart/:id endpoint
   * - 31.2: Accept quantity and variant_id updates
   * - 31.3: Validate cart item exists and belongs to user
   * - 31.4: Validate new quantity against variant availability
   * - 31.5: Validate new variant_id if provided
   * - 31.6: Update price_per_unit to current price
   * - 31.7: Prevent quantity from being set to 0 (use DELETE instead)
   * - 31.8: Use database transaction for atomicity
   * - 31.9: Return 404 if cart item not found
   * - 31.10: Return 403 if cart item belongs to different user
   * - 31.11: Log cart modifications to audit trail
   * - 31.12: Invalidate cart cache after update
   *
   * @summary Update cart item
   * @param id Cart item UUID
   * @param requestBody Update request with optional quantity and variant_id
   * @param request Express request for authentication
   * @returns Success message
   */
  @Put("{id}")
  public async updateCartItem(
    @Path() id: string,
    @Body() requestBody: UpdateCartItemRequest,
    @Request() request: ExpressRequest,
  ): Promise<{ message: string }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Updating cart item", {
      userId,
      cartItemId: id,
      updates: {
        hasQuantity: requestBody.quantity !== undefined,
        hasVariant: requestBody.variant_id !== undefined,
      },
    })

    // Validate request
    this.validateUpdateCartItemRequest(requestBody)

    try {
      const knex = getKnex()

      // Use database transaction for atomicity (Requirement 31.8)
      await withTransaction(async (trx) => {
        // Step 1: Fetch cart item and verify ownership (Requirements 31.3, 31.9, 31.10)
        const cartItem = await trx("cart_items_v2")
          .where({ cart_item_id: id })
          .first()

        if (!cartItem) {
          this.throwNotFound("Cart item", id)
        }

        if (cartItem.user_id !== userId) {
          this.throwForbidden("You do not have permission to update this cart item")
        }

        // Step 2: Get listing item for validation
        const listingItem = await trx("listing_items")
          .where({ item_id: cartItem.item_id })
          .first()

        if (!listingItem) {
          this.throwNotFound("Listing item", cartItem.item_id)
        }

        // Step 3: Determine final variant_id and quantity
        const finalVariantId = requestBody.variant_id || cartItem.variant_id
        const finalQuantity = requestBody.quantity !== undefined 
          ? requestBody.quantity 
          : cartItem.quantity

        // Step 4: Validate new variant if changed (Requirement 31.5)
        if (requestBody.variant_id && requestBody.variant_id !== cartItem.variant_id) {
          const variant = await trx("item_variants")
            .where({ variant_id: requestBody.variant_id })
            .first()

          if (!variant) {
            this.throwNotFound("Variant", requestBody.variant_id)
          }

          // Verify variant belongs to the correct game item
          if (variant.game_item_id !== listingItem.game_item_id) {
            this.throwValidationError("Variant does not belong to this listing", [
              {
                field: "variant_id",
                message: "Variant game_item_id does not match listing game_item_id",
              },
            ])
          }
        }

        // Step 5: Check availability for final variant and quantity (Requirement 31.4)
        const availabilityResult = await trx("listing_item_lots")
          .where({
            item_id: cartItem.item_id,
            variant_id: finalVariantId,
            listed: true,
          })
          .sum("quantity_total as total")
          .first()

        const availableQuantity = parseInt(availabilityResult?.total || "0")

        if (availableQuantity < finalQuantity) {
          this.throwValidationError(
            `Insufficient stock for variant ${finalVariantId}`,
            [
              {
                field: "quantity",
                message: `Only ${availableQuantity} available, requested ${finalQuantity}`,
              },
            ],
          )
        }

        // Step 6: Get current price for final variant (Requirement 31.6)
        let price: number

        if (listingItem.pricing_mode === "unified") {
          price = listingItem.base_price
        } else {
          // per_variant pricing
          const variantPricing = await trx("variant_pricing")
            .where({
              item_id: listingItem.item_id,
              variant_id: finalVariantId,
            })
            .first()

          if (!variantPricing) {
            this.throwNotFound(
              `Pricing not found for variant ${finalVariantId}`,
              "variant_id",
            )
          }

          price = variantPricing.price
        }

        // Step 7: Update cart item
        await trx("cart_items_v2")
          .where({ cart_item_id: id })
          .update({
            variant_id: finalVariantId,
            quantity: finalQuantity,
            price_per_unit: price, // Update to current price
            updated_at: new Date(),
          })

        logger.info("Cart item updated successfully", {
          cartItemId: id,
          oldVariantId: cartItem.variant_id,
          newVariantId: finalVariantId,
          oldQuantity: cartItem.quantity,
          newQuantity: finalQuantity,
        })

        // TODO: Requirement 31.11 - Log cart modifications to audit trail
        // This should be implemented when audit trail system is in place
      })

      logger.info("Cart item updated successfully", {
        userId,
        cartItemId: id,
      })

      // TODO: Requirement 31.12 - Invalidate cart cache after update
      // This should be implemented when cache system is in place

      return {
        message: "Cart item updated successfully",
      }
    } catch (error) {
      logger.error("Failed to update cart item", {
        userId,
        cartItemId: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Remove item from cart
   *
   * Deletes a cart item by:
   * 1. Validating cart item exists and belongs to user
   * 2. Deleting cart item record
   *
   * Requirements:
   * - 33.1: DELETE /api/v2/cart/:id endpoint
   * - 33.2: Validate cart item exists and belongs to user
   * - 33.3: Delete cart_items_v2 entry
   * - 33.4: Return 404 if cart item not found
   * - 33.5: Return 403 if cart item belongs to different user
   * - 33.6: Log cart deletions to audit trail
   * - 33.7: Invalidate cart cache after deletion
   *
   * @summary Remove cart item
   * @param id Cart item UUID
   * @param request Express request for authentication
   * @returns Success message
   */
  @Delete("{id}")
  public async removeCartItem(
    @Path() id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ message: string }> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Removing cart item", {
      userId,
      cartItemId: id,
    })

    try {
      const knex = getKnex()

      // Step 1: Fetch cart item and verify ownership (Requirements 33.2, 33.4, 33.5)
      const cartItem = await knex("cart_items_v2")
        .where({ cart_item_id: id })
        .first()

      if (!cartItem) {
        this.throwNotFound("Cart item", id)
      }

      if (cartItem.user_id !== userId) {
        this.throwForbidden("You do not have permission to remove this cart item")
      }

      // Step 2: Delete cart item (Requirement 33.3)
      await knex("cart_items_v2")
        .where({ cart_item_id: id })
        .delete()

      logger.info("Cart item removed successfully", {
        userId,
        cartItemId: id,
      })

      // TODO: Requirement 33.6 - Log cart deletions to audit trail
      // This should be implemented when audit trail system is in place

      // TODO: Requirement 33.7 - Invalidate cart cache after deletion
      // This should be implemented when cache system is in place

      return {
        message: "Cart item removed successfully",
      }
    } catch (error) {
      logger.error("Failed to remove cart item", {
        userId,
        cartItemId: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Checkout cart and create order
   *
   * Converts cart items to an order by:
   * 1. Validating all cart items are still available
   * 2. Detecting price changes and requiring confirmation if needed
   * 3. Creating order with variant-specific line items
   * 4. Allocating stock for each variant
   * 5. Clearing cart after successful order
   * 6. Handling partial failures (some items unavailable)
   *
   * Uses database transaction for atomicity to ensure all-or-nothing behavior.
   * If any cart items are unavailable or prices have changed without confirmation,
   * the checkout will fail with descriptive errors.
   *
   * Requirements:
   * - 32.1: POST /api/v2/cart/checkout endpoint
   * - 32.2: Validate all cart items for availability before checkout
   * - 32.3: Create order with variant-specific items from cart
   * - 32.4: Allocate stock from correct variants
   * - 32.5: Use variant-specific pricing in order totals
   * - 32.6: Use database transaction for atomicity
   * - 32.7: Clear cart after successful checkout
   * - 32.8: Handle partial checkout if some items become unavailable
   * - 32.9: Return order_id and order details on success
   * - 32.10: Notify user of price changes requiring confirmation
   * - 32.11: Notify sellers of new orders
   * - 32.12: Log checkout to Audit_Trail
   *
   * @summary Checkout cart
   * @param requestBody Checkout request with optional price change confirmation
   * @param request Express request for authentication
   * @returns Order ID and purchase summary
   */
  @Post("checkout")
  public async checkoutCart(
    @Body() requestBody: CheckoutCartRequest,
    @Request() request: ExpressRequest,
  ): Promise<CheckoutCartResponse> {
    this.request = request
    this.requireAuth()
    const userId = this.getUserId()

    logger.info("Checking out cart", { userId })

    try {
      const knex = getKnex()

      // Use database transaction for atomicity (Requirement 32.6)
      const result = await withTransaction(async (trx) => {
        // Step 1: Fetch all cart items for user
        const cartItems = await trx("cart_items_v2")
          .where({ user_id: userId })
          .select("*")

        if (cartItems.length === 0) {
          this.throwValidationError("Cart is empty", [
            {
              field: "cart",
              message: "Cannot checkout an empty cart",
            },
          ])
        }

        // Step 2: Validate availability and detect price changes (Requirements 32.2, 32.10)
        const unavailableItems: UnavailableCartItem[] = []
        const priceChanges: Array<{
          cart_item_id: string
          listing_title: string
          variant_display_name: string
          old_price: number
          new_price: number
        }> = []

        const validatedItems: Array<{
          cart_item_id: string
          listing_id: string
          item_id: string
          variant_id: string
          quantity: number
          price_per_unit: number
          current_price: number
          listing_title: string
          variant_display_name: string
          seller_id: string
        }> = []

        for (const cartItem of cartItems) {
          // Get listing and listing_item
          const listing = await trx("listings")
            .where({ listing_id: cartItem.listing_id })
            .first()

          if (!listing || listing.status !== "active") {
            unavailableItems.push({
              cart_item_id: cartItem.cart_item_id,
              listing_title: listing?.title || "Unknown",
              variant_display_name: "Unknown",
              reason: listing ? `Listing status is ${listing.status}` : "Listing not found",
            })
            continue
          }

          const listingItem = await trx("listing_items")
            .where({ item_id: cartItem.item_id })
            .first()

          if (!listingItem) {
            unavailableItems.push({
              cart_item_id: cartItem.cart_item_id,
              listing_title: listing.title,
              variant_display_name: "Unknown",
              reason: "Listing item not found",
            })
            continue
          }

          // Get variant details
          const variant = await trx("item_variants")
            .where({ variant_id: cartItem.variant_id })
            .first()

          if (!variant) {
            unavailableItems.push({
              cart_item_id: cartItem.cart_item_id,
              listing_title: listing.title,
              variant_display_name: "Unknown",
              reason: "Variant not found",
            })
            continue
          }

          // Check availability
          const availabilityResult = await trx("listing_item_lots")
            .where({
              item_id: cartItem.item_id,
              variant_id: cartItem.variant_id,
              listed: true,
            })
            .sum("quantity_total as total")
            .first()

          const availableQuantity = parseInt(availabilityResult?.total || "0")

          if (availableQuantity < cartItem.quantity) {
            unavailableItems.push({
              cart_item_id: cartItem.cart_item_id,
              listing_title: listing.title,
              variant_display_name: variant.display_name || "Unknown",
              reason: `Only ${availableQuantity} available, cart has ${cartItem.quantity}`,
            })
            continue
          }

          // Check for price changes
          let currentPrice = cartItem.price_per_unit

          if (listingItem.pricing_mode === "unified") {
            currentPrice = listingItem.base_price
          } else {
            // per_variant pricing
            const variantPricing = await trx("variant_pricing")
              .where({
                item_id: cartItem.item_id,
                variant_id: cartItem.variant_id,
              })
              .first()

            if (variantPricing) {
              currentPrice = variantPricing.price
            }
          }

          if (currentPrice !== cartItem.price_per_unit) {
            priceChanges.push({
              cart_item_id: cartItem.cart_item_id,
              listing_title: listing.title,
              variant_display_name: variant.display_name || "Unknown",
              old_price: cartItem.price_per_unit,
              new_price: currentPrice,
            })
          }

          // Item is valid
          validatedItems.push({
            cart_item_id: cartItem.cart_item_id,
            listing_id: cartItem.listing_id,
            item_id: cartItem.item_id,
            variant_id: cartItem.variant_id,
            quantity: cartItem.quantity,
            price_per_unit: cartItem.price_per_unit,
            current_price: currentPrice,
            listing_title: listing.title,
            variant_display_name: variant.display_name || "Unknown",
            seller_id: listing.seller_id,
          })
        }

        // Step 3: Handle unavailable items (Requirement 32.8)
        if (unavailableItems.length > 0) {
          logger.warn("Cart has unavailable items", {
            userId,
            unavailableCount: unavailableItems.length,
          })

          // If ALL items are unavailable, fail checkout
          if (validatedItems.length === 0) {
            this.throwValidationError("All cart items are unavailable", [
              {
                field: "cart",
                message: "Cannot checkout - all items are unavailable",
              },
            ])
          }

          // Otherwise, continue with partial checkout
          // Remove unavailable items from cart
          const unavailableIds = unavailableItems.map((item) => item.cart_item_id)
          await trx("cart_items_v2")
            .whereIn("cart_item_id", unavailableIds)
            .delete()
        }

        // Step 4: Handle price changes (Requirement 32.10)
        if (priceChanges.length > 0 && !requestBody.confirm_price_changes) {
          logger.warn("Cart has price changes requiring confirmation", {
            userId,
            priceChangeCount: priceChanges.length,
          })

          this.throwValidationError("Price changes detected - confirmation required", [
            {
              field: "confirm_price_changes",
              message: `${priceChanges.length} item(s) have price changes. Set confirm_price_changes=true to proceed.`,
            },
          ])
        }

        // Step 5: Verify all items are from the same seller
        const sellerIds = new Set(validatedItems.map((item) => item.seller_id))
        if (sellerIds.size > 1) {
          this.throwValidationError("Cart contains items from multiple sellers", [
            {
              field: "cart",
              message: "Cannot checkout - all items must be from the same seller",
            },
          ])
        }

        const sellerId = validatedItems[0].seller_id

        // Step 6: Calculate total price (use current prices) (Requirement 32.5)
        const totalPrice = validatedItems.reduce(
          (sum, item) => sum + item.current_price * item.quantity,
          0,
        )

        // Step 7: Create order record (Requirement 32.3)
        const [order] = await trx("orders")
          .insert({
            customer_id: userId,
            contractor_id: null,
            status: "pending",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("*")

        logger.info("Created order from cart", {
          orderId: order.order_id,
          userId,
          itemCount: validatedItems.length,
          totalPrice,
        })

        // Step 8: Create market_orders entries for V1 compatibility
        const listingQuantities = new Map<string, number>()
        for (const item of validatedItems) {
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

        // Step 9: Create order_market_items_v2 entries
        const orderItems: Array<{
          order_item_id: string
          listing_id: string
          item_id: string
          variant_id: string
          quantity: number
          price_per_unit: number
          subtotal: number
        }> = []

        for (const item of validatedItems) {
          const [orderItem] = await trx("order_market_items_v2")
            .insert({
              order_id: order.order_id,
              listing_id: item.listing_id,
              item_id: item.item_id,
              variant_id: item.variant_id,
              quantity: item.quantity,
              price_per_unit: item.current_price, // Use current price
              created_at: new Date(),
            })
            .returning("*")

          orderItems.push({
            order_item_id: orderItem.order_item_id,
            listing_id: item.listing_id,
            item_id: item.item_id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            price_per_unit: item.current_price,
            subtotal: item.current_price * item.quantity,
          })
        }

        logger.info("Created order items from cart", {
          orderId: order.order_id,
          itemCount: orderItems.length,
        })

        // Step 10: Allocate stock (Requirement 32.4)
        const OrderLifecycleService = (await import("../../../../services/allocation/order-lifecycle.service.js")).OrderLifecycleService
        const lifecycleService = new OrderLifecycleService(trx)

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

        logger.info("Stock allocated for cart checkout", {
          orderId: order.order_id,
          totalRequested: allocationResult.total_requested,
          totalAllocated: allocationResult.total_allocated,
          hasPartial: allocationResult.has_partial_allocations,
        })

        // Step 11: Clear cart (Requirement 32.7)
        await trx("cart_items_v2")
          .where({ user_id: userId })
          .delete()

        logger.info("Cart cleared after successful checkout", {
          userId,
          orderId: order.order_id,
        })

        // Notify sellers of new orders (Requirement 32.11)
        try {
          const { notificationService } = await import("../../../../services/notifications/notification.service.js")
          const orderRecord = await trx("orders").where({ order_id: order.order_id }).first()
          if (orderRecord) {
            await notificationService.createOrderNotification(orderRecord)
          }
        } catch (e) {
          logger.error("Failed to send cart checkout notification", { error: e })
        }

        // Step 12: Return checkout response (Requirement 32.9)
        return {
          order_id: order.order_id,
          total_price: totalPrice,
          items_purchased: validatedItems.length,
          unavailable_items: unavailableItems.length > 0 ? unavailableItems : undefined,
        }
      })

      logger.info("Cart checkout completed successfully", {
        userId,
        orderId: result.order_id,
        itemsPurchased: result.items_purchased,
        hadUnavailableItems: result.unavailable_items !== undefined,
      })

      return result
    } catch (error) {
      logger.error("Failed to checkout cart", {
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Validates the add to cart request
   */
  private validateAddToCartRequest(request: AddToCartRequest): void {
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
      throw this.throwValidationError("Invalid add to cart request", errors)
    }
  }

  /**
   * Validates the update cart item request
   */
  private validateUpdateCartItemRequest(request: UpdateCartItemRequest): void {
    const errors: Array<{ field: string; message: string }> = []

    // Validate at least one field is provided
    if (request.quantity === undefined && request.variant_id === undefined) {
      errors.push({
        field: "request",
        message: "At least one of quantity or variant_id must be provided",
      })
    }

    // Validate quantity if provided (Requirement 31.7)
    if (request.quantity !== undefined && request.quantity <= 0) {
      errors.push({
        field: "quantity",
        message: "quantity must be greater than 0 (use DELETE to remove item)",
      })
    }

    if (errors.length > 0) {
      throw this.throwValidationError("Invalid update cart item request", errors)
    }
  }
}

