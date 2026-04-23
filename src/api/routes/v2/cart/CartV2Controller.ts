/**
 * Cart V2 Controller
 *
 * TSOA controller for shopping cart management in the V2 market system.
 * Handles cart operations with variant-specific items, stock validation,
 * and price change detection.
 *
 * Requirements: 29.1-29.12, 30.1-30.12, 31.1-31.12, 32.1-32.12
 */

import { Get, Post, Put, Delete, Route, Tags, Body, Request, Path, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { getNextAvailableTime } from "../util/next-available.js"
import * as profileDb from "../../v1/profiles/database.js"
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
import { auditService } from "../../../../services/audit/audit.service.js"

@Route("cart")
@Tags("Cart V2")
@Security("jwt")
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
        .leftJoin("contractors as contractor", function() {
          this.on("l.seller_id", "contractor.contractor_id")
            .andOn(knex.raw("l.seller_type = 'contractor'"))
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
          "l.seller_id",
          // Variant info
          "iv.attributes as variant_attributes",
          "iv.display_name as variant_display_name",
          "iv.short_name as variant_short_name",
          // Seller info
          "seller.username as seller_username",
          "seller.display_name as seller_display_name",
          knex.raw(`
            CASE 
              WHEN l.seller_type = 'user' THEN get_total_rating(l.seller_id, NULL)
              WHEN l.seller_type = 'contractor' THEN get_total_rating(NULL, l.seller_id)
              ELSE 0
            END AS seller_rating
          `),
          "contractor.spectrum_id as contractor_spectrum_id",
          "contractor.name as contractor_name",
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
          const sellerSlug = item.seller_type === "contractor"
            ? item.contractor_spectrum_id || ""
            : item.seller_username || ""
          const sellerName = item.seller_type === "contractor"
            ? item.contractor_name || "Unknown"
            : item.seller_username || item.seller_display_name || "Unknown"

          // Compute next available time from seller's availability schedule
          let sellerNextAvailable: string | null = null
          try {
            const availability = await profileDb.getUserAvailability(
              item.seller_id,
              item.seller_type === "contractor" ? item.seller_id : null,
            )
            sellerNextAvailable = getNextAvailableTime(availability)
          } catch {
            // Silently ignore — availability is optional
          }

          const listingInfo: CartListingInfo = {
            listing_id: item.listing_id,
            title: item.listing_title,
            seller_name: sellerName,
            seller_type: item.seller_type,
            seller_slug: sellerSlug,
            seller_rating: parseInt(item.seller_rating) || 0,
            status: item.listing_status,
            seller_next_available: sellerNextAvailable,
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
        auditService.log({ entity_type: "cart", entity_id: cartItemId, action: "item_added", actor_id: userId, details: { listing_id: requestBody.listing_id, variant_id: requestBody.variant_id, quantity: requestBody.quantity } })

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
        auditService.log({ entity_type: "cart", entity_id: cartItem.cart_item_id, action: "item_updated", actor_id: userId })
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
   * Checkout cart — creates an offer session (mirrors V1 purchase_listings flow)
   *
   * 1. Validates all cart items are still available
   * 2. Detects price changes and requires confirmation if needed
   * 3. Checks blocked users, availability requirements, order limits
   * 4. Creates an offer session via V1 createOffer (chat, Discord, notifications)
   * 5. Clears cart after successful offer creation
   *
   * @summary Checkout cart
   * @param requestBody Checkout request with optional price change confirmation and note
   * @param request Express request for authentication
   * @returns Offer session details (session_id, offer_id, discord_invite)
   */
  @Post("checkout")
  public async checkoutCart(
    @Body() requestBody: CheckoutCartRequest,
    @Request() request: ExpressRequest,
  ): Promise<CheckoutCartResponse> {
    this.request = request
    this.requireAuth()
    const user = this.getUser()
    const userId = user.user_id

    logger.info("Checking out cart", { userId })

    try {
      const knex = getKnex()

      // Step 1: Fetch all cart items
      const cartItems = await knex("cart_items_v2")
        .where({ user_id: userId })
        .select("*")

      if (cartItems.length === 0) {
        this.throwValidationError("Cart is empty", [
          { field: "cart", message: "Cannot checkout an empty cart" },
        ])
      }

      // Step 2: Validate availability and detect price changes
      const unavailableItems: UnavailableCartItem[] = []
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
        seller_type: string
      }> = []
      let hasPriceChanges = false

      for (const cartItem of cartItems) {
        const listing = await knex("listings")
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

        const listingItem = await knex("listing_items")
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

        const variant = await knex("item_variants")
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

        // Check stock availability
        const availabilityResult = await knex("listing_item_lots")
          .where({ item_id: cartItem.item_id, variant_id: cartItem.variant_id, listed: true })
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
          const variantPricing = await knex("variant_pricing")
            .where({ item_id: cartItem.item_id, variant_id: cartItem.variant_id })
            .first()
          if (variantPricing) currentPrice = variantPricing.price
        }
        if (currentPrice !== cartItem.price_per_unit) hasPriceChanges = true

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
          seller_type: listing.seller_type,
        })
      }

      // Handle unavailable items
      if (unavailableItems.length > 0) {
        if (validatedItems.length === 0) {
          this.throwValidationError("All cart items are unavailable", [
            { field: "cart", message: "Cannot checkout - all items are unavailable" },
          ])
        }
        // Remove unavailable items from cart
        await knex("cart_items_v2")
          .whereIn("cart_item_id", unavailableItems.map((i) => i.cart_item_id))
          .delete()
      }

      // Handle price changes
      if (hasPriceChanges && !requestBody.confirm_price_changes) {
        this.throwValidationError("Price changes detected - confirmation required", [
          { field: "confirm_price_changes", message: "Item prices have changed. Set confirm_price_changes=true to proceed." },
        ])
      }

      // Verify single seller
      const sellerIds = new Set(validatedItems.map((i) => i.seller_id))
      if (sellerIds.size > 1) {
        this.throwValidationError("Cart contains items from multiple sellers", [
          { field: "cart", message: "Cannot checkout - all items must be from the same seller" },
        ])
      }

      const firstItem = validatedItems[0]
      const sellerContractorId = firstItem.seller_type === "contractor" ? firstItem.seller_id : null
      const sellerUserId = firstItem.seller_type === "user" ? firstItem.seller_id : null

      // Step 3: Blocked user check (mirrors V1)
      if (sellerContractorId) {
        const blocked = await profileDb.isUserBlocked(sellerContractorId, userId, "contractor")
        if (blocked) {
          this.throwValidationError("You are blocked from creating offers with this contractor", [
            { field: "seller", message: "You are blocked from creating offers with this contractor" },
          ])
        }
      }
      if (sellerUserId) {
        const blocked = await profileDb.isUserBlocked(sellerUserId, userId, "user")
        if (blocked) {
          this.throwValidationError("You are blocked from creating offers with this user", [
            { field: "seller", message: "You are blocked from creating offers with this user" },
          ])
        }
      }

      // Step 4: Availability requirement check
      const { validateAvailabilityRequirement, validateOrderLimits, createOffer } =
        await import("../../v1/orders/helpers.js")

      try {
        await validateAvailabilityRequirement(userId, sellerContractorId, sellerUserId)
      } catch (error) {
        this.throwValidationError(
          error instanceof Error ? error.message : "Availability is required to submit this offer.",
          [{ field: "availability", message: error instanceof Error ? error.message : "Availability required" }],
        )
      }

      // Step 5: Order limit validation
      const offerSize = validatedItems.reduce((sum, i) => sum + i.quantity, 0)
      const totalPrice = validatedItems.reduce((sum, i) => sum + i.current_price * i.quantity, 0)

      try {
        await validateOrderLimits(sellerContractorId, sellerUserId, offerSize, totalPrice)
      } catch (error) {
        this.throwValidationError(
          error instanceof Error ? error.message : "Order does not meet size or value requirements",
          [{ field: "order_limits", message: error instanceof Error ? error.message : "Order limit violation" }],
        )
      }

      // Step 6: Build market_listings for createOffer (it only uses listing_id + quantity)
      const listingQuantities = new Map<string, number>()
      for (const item of validatedItems) {
        listingQuantities.set(item.listing_id, (listingQuantities.get(item.listing_id) || 0) + item.quantity)
      }
      const marketListings = Array.from(listingQuantities.entries()).map(([listing_id, quantity]) => ({
        quantity,
        listing: { listing: { listing_id } } as any,
      }))

      // Build v2_variant_items for offer
      const v2VariantItems = validatedItems.map((i) => ({
        listing_id: i.listing_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
        price_per_unit: i.current_price,
      }))

      const message = requestBody.note || ""

      // Step 7: Create offer session (mirrors V1 purchase_listings exactly)
      const { offer, session, discord_invite } = await createOffer(
        {
          customer_id: userId,
          assigned_id: sellerUserId,
          contractor_id: sellerContractorId,
        },
        {
          actor_id: userId,
          kind: "Delivery",
          cost: totalPrice.toString(),
          title: `Items Sold to ${user.username}`,
          description: message,
        },
        marketListings,
        v2VariantItems,
      )

      // Step 8: Clear cart
      await knex("cart_items_v2").where({ user_id: userId }).delete()

      logger.info("Cart checkout completed — offer created", {
        userId,
        sessionId: session.id,
        offerId: offer.id,
      })

      auditService.log({ entity_type: "offer", entity_id: session.id, action: "checkout", actor_id: userId, details: { offer_id: offer.id, item_count: validatedItems.length, total_price: totalPrice } })

      return {
        result: "Success",
        offer_id: offer.id,
        session_id: session.id,
        discord_invite: discord_invite,
        unavailable_items: unavailableItems.length > 0 ? unavailableItems : undefined,
      }
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

