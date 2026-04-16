/**
 * Cart Service for Market V2
 *
 * Handles shopping cart operations with variant support and multi-seller carts.
 * Achieves feature parity with V1 cart system.
 */

import { Knex } from "knex";
import { getKnex } from "../../clients/database/knex-db.js";
import { CartItemV2, CartDetailV2, CartSellerV2, CheckoutCartRequest, CheckoutCartResponse } from "../../api/routes/v2/types/market-v2-types.js";
import { PriceConsistencyService } from "./price-consistency.service.js";
import { AvailabilityValidationService } from "./availability-validation.service.js";
import { NotFoundError, CartValidationError, ConflictError } from "./errors.js";

export class CartService {
  private knex: Knex;
  private priceService: PriceConsistencyService;
  private availabilityService: AvailabilityValidationService;

  constructor(knex?: Knex) {
    this.knex = knex || getKnex();
    this.priceService = new PriceConsistencyService(this.knex);
    this.availabilityService = new AvailabilityValidationService(this.knex);
  }

  /**
   * Get cart for current user with variant details, grouped by seller
   */
  async getCart(userId: string): Promise<CartDetailV2> {
    // Fetch cart items with all related data including seller info
    const cartItems = await this.knex("cart_items_v2 as ci")
      .select(
        "ci.cart_item_id",
        "ci.seller_id",
        "ci.listing_id",
        "ci.item_id",
        "ci.variant_id",
        "ci.quantity",
        "ci.price_per_unit",
        "ci.price_updated_at",
        "ci.buyer_note",
        "l.title as listing_title",
        "l.seller_type",
        "a.username as seller_username",
        "a.display_name as seller_display_name",
        "c.name as contractor_name",
        "gi.game_item_id",
        "gi.name as game_item_name",
        "gi.type as game_item_type",
        "iv.display_name as variant_display_name",
        "iv.attributes as variant_attributes",
        this.knex.raw("COALESCE(vp.price, li.base_price) as current_price")
      )
      .join("listings as l", "ci.listing_id", "l.listing_id")
      .join("accounts as a", "ci.seller_id", "a.user_id")
      .leftJoin("contractors as c", function(join) {
        join.on("c.user_id", "=", "ci.seller_id")
          .andOnVal("l.seller_type", "=", "contractor");
      })
      .join("listing_items as li", "ci.item_id", "li.item_id")
      .join("game_items as gi", "li.game_item_id", "gi.game_item_id")
      .join("item_variants as iv", "ci.variant_id", "iv.variant_id")
      .leftJoin("variant_pricing as vp", function() {
        this.on("vp.item_id", "=", "ci.item_id")
          .andOn("vp.variant_id", "=", "ci.variant_id");
      })
      .where("ci.user_id", userId)
      .orderBy("ci.created_at", "desc");

    // Check availability for each item
    const itemsWithStatus = await Promise.all(
      cartItems.map(async (item) => {
        const StockAllocationService = (await import("./stock-allocation.service.js")).StockAllocationService;
        const stockService = new StockAllocationService(this.knex);
        const availabilityCheck = await stockService.checkAvailability(item.variant_id);

        const isPriceStale = item.current_price !== item.price_per_unit;
        const qualityTier = item.variant_attributes?.quality_tier || 0;

        return {
          cart_item_id: item.cart_item_id,
          seller_id: item.seller_id,
          seller_type: item.seller_type,
          seller_username: item.seller_username,
          seller_display_name: item.seller_display_name,
          contractor_name: item.contractor_name,
          buyer_note: item.buyer_note,
          listing: {
            listing_id: item.listing_id,
            title: item.listing_title,
          },
          game_item: {
            game_item_id: item.game_item_id,
            name: item.game_item_name,
            type: item.game_item_type,
          },
          variant: {
            variant_id: item.variant_id,
            display_name: item.variant_display_name,
            attributes: item.variant_attributes,
            quality_tier: qualityTier,
          },
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
          current_price: item.current_price,
          is_price_stale: isPriceStale,
          is_available: availabilityCheck.available && availabilityCheck.available_quantity >= item.quantity,
        };
      })
    );

    // Group items by seller
    const sellerMap = new Map<string, CartSellerV2>();
    
    for (const item of itemsWithStatus) {
      if (!sellerMap.has(item.seller_id)) {
        const sellerName = item.seller_type === 'contractor' 
          ? item.contractor_name 
          : (item.seller_display_name || item.seller_username);
        
        sellerMap.set(item.seller_id, {
          seller_id: item.seller_id,
          seller_name: sellerName,
          seller_type: item.seller_type,
          buyer_note: item.buyer_note,
          items: [],
          subtotal: 0,
          stale_items_count: 0,
          unavailable_items_count: 0,
        });
      }

      const seller = sellerMap.get(item.seller_id)!;
      seller.items.push({
        cart_item_id: item.cart_item_id,
        listing: item.listing,
        game_item: item.game_item,
        variant: item.variant,
        quantity: item.quantity,
        price_per_unit: item.price_per_unit,
        current_price: item.current_price,
        is_price_stale: item.is_price_stale,
        is_available: item.is_available,
      });

      seller.subtotal += item.price_per_unit * item.quantity;
      if (item.is_price_stale) seller.stale_items_count++;
      if (!item.is_available) seller.unavailable_items_count++;
    }

    const sellers = Array.from(sellerMap.values());

    // Calculate overall totals
    const totalPrice = sellers.reduce((sum, seller) => sum + seller.subtotal, 0);
    const staleItemsCount = sellers.reduce((sum, seller) => sum + seller.stale_items_count, 0);
    const unavailableItemsCount = sellers.reduce((sum, seller) => sum + seller.unavailable_items_count, 0);

    return {
      sellers,
      total_price: totalPrice,
      stale_items_count: staleItemsCount,
      unavailable_items_count: unavailableItemsCount,
    };
  }

  /**
   * Add item to cart
   */
  async addToCart(
    userId: string,
    listingId: string,
    variantId: string,
    quantity: number
  ): Promise<CartItemV2> {
    // Validate quantity
    if (quantity <= 0) {
      throw new CartValidationError("Quantity must be greater than 0");
    }

    // Get listing and listing item
    const listing = await this.knex("listings")
      .where({ listing_id: listingId })
      .first();

    if (!listing) {
      throw new NotFoundError("Listing not found");
    }

    const listingItem = await this.knex("listing_items")
      .where({ listing_id: listingId })
      .first();

    if (!listingItem) {
      throw new NotFoundError("Listing item not found");
    }

    // Validate variant availability
    const availabilityCheck = await this.availabilityService.validateForCartAdd(
      variantId,
      quantity,
      listingItem.item_id
    );

    if (!availabilityCheck.valid) {
      throw new CartValidationError(availabilityCheck.error_message || "Variant not available");
    }

    // Get current price
    const currentPrice = await this.priceService.getCurrentPrice(
      listingItem.item_id,
      variantId
    );

    // Check if item already exists in cart
    const existingItem = await this.knex("cart_items_v2")
      .where({
        user_id: userId,
        listing_id: listingId,
        variant_id: variantId,
      })
      .first();

    if (existingItem) {
      throw new ConflictError("Item already in cart. Use update endpoint to change quantity.");
    }

    // Insert cart item with seller_id
    const [cartItem] = await this.knex("cart_items_v2")
      .insert({
        user_id: userId,
        seller_id: listing.seller_id,
        listing_id: listingId,
        item_id: listingItem.item_id,
        variant_id: variantId,
        quantity,
        price_per_unit: currentPrice,
        price_updated_at: this.knex.fn.now(),
      })
      .returning("*");

    return cartItem;
  }

  /**
   * Update cart item quantity
   */
  async updateCartItem(
    userId: string,
    cartItemId: string,
    quantity: number
  ): Promise<CartItemV2> {
    // Validate quantity
    if (quantity <= 0) {
      throw new CartValidationError("Quantity must be greater than 0");
    }

    // Get cart item
    const cartItem = await this.knex("cart_items_v2")
      .where({ cart_item_id: cartItemId })
      .first();

    if (!cartItem) {
      throw new NotFoundError("Cart item not found");
    }

    // Validate ownership
    if (cartItem.user_id !== userId) {
      throw new CartValidationError("Cannot update another user's cart item");
    }

    // Validate availability for new quantity
    const availabilityCheck = await this.availabilityService.validateForCartAdd(
      cartItem.variant_id,
      quantity,
      cartItem.item_id
    );

    if (!availabilityCheck.valid) {
      throw new CartValidationError(availabilityCheck.error_message || "Insufficient quantity available");
    }

    // Update cart item
    const [updatedItem] = await this.knex("cart_items_v2")
      .where({ cart_item_id: cartItemId })
      .update({
        quantity,
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    return updatedItem;
  }

  /**
   * Update buyer notes for a seller
   */
  async updateCartNotes(
    userId: string,
    sellerId: string,
    buyerNote: string
  ): Promise<void> {
    // Update all cart items for this seller
    await this.knex("cart_items_v2")
      .where({
        user_id: userId,
        seller_id: sellerId,
      })
      .update({
        buyer_note: buyerNote,
        updated_at: this.knex.fn.now(),
      });
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(userId: string, cartItemId: string): Promise<void> {
    // Get cart item
    const cartItem = await this.knex("cart_items_v2")
      .where({ cart_item_id: cartItemId })
      .first();

    if (!cartItem) {
      throw new NotFoundError("Cart item not found");
    }

    // Validate ownership
    if (cartItem.user_id !== userId) {
      throw new CartValidationError("Cannot remove another user's cart item");
    }

    // Delete cart item
    await this.knex("cart_items_v2")
      .where({ cart_item_id: cartItemId })
      .del();
  }

  /**
   * Clear entire cart for user
   */
  async clearCart(userId: string): Promise<void> {
    await this.knex("cart_items_v2")
      .where({ user_id: userId })
      .del();
  }

  /**
   * Clear cart for specific seller
   */
  async clearCartForSeller(userId: string, sellerId: string): Promise<void> {
    await this.knex("cart_items_v2")
      .where({
        user_id: userId,
        seller_id: sellerId,
      })
      .del();
  }

  /**
   * Get cart item count for user
   */
  async getCartItemCount(userId: string): Promise<number> {
    const result = await this.knex("cart_items_v2")
      .where({ user_id: userId })
      .count("* as count")
      .first();

    return parseInt(result?.count as string) || 0;
  }

  /**
   * Checkout cart for specific seller and create order
   * Validates availability, checks price changes, allocates stock, creates order
   */
  async checkoutCart(
    userId: string,
    request: CheckoutCartRequest
  ): Promise<CheckoutCartResponse> {
    const { seller_id, accept_price_changes = false, offer_amount, buyer_note } = request;

    return await this.knex.transaction(async (trx) => {
      // Get cart items for this seller only
      const sellerCartItems = await trx("cart_items_v2")
        .where({
          user_id: userId,
          seller_id: seller_id,
        })
        .select("*");

      if (sellerCartItems.length === 0) {
        throw new CartValidationError("No items in cart for this seller");
      }

      // Validate cart for checkout (locks rows, removes unavailable items, detects price changes)
      const validation = await this.availabilityService.validateCartForCheckout(userId, trx, seller_id);

      // Check for price changes
      const priceChanges = validation.price_changes.map((item) => ({
        cart_item_id: item.cart_item_id,
        old_price: item.price_per_unit,
        new_price: item.current_price,
        percentage_change: item.percentage_change,
      }));

      // If price changes exist and not accepted, throw error
      if (priceChanges.length > 0 && !accept_price_changes) {
        throw new CartValidationError(
          "Price changes detected. Please review and accept changes to proceed.",
          { price_changes: priceChanges }
        );
      }

      // If no valid items, throw error
      if (validation.valid_items.length === 0) {
        throw new CartValidationError("No valid items in cart to checkout");
      }

      // Get current prices for all items (snapshot at order time)
      const itemsWithCurrentPrices = await Promise.all(
        validation.valid_items.map(async (item) => {
          const currentPrice = await this.priceService.getCurrentPrice(item.item_id, item.variant_id);
          return {
            ...item,
            current_price: currentPrice,
          };
        })
      );

      // Calculate order total
      const orderTotal = itemsWithCurrentPrices.reduce(
        (sum, item) => sum + item.current_price * item.quantity,
        0
      );

      // Use offer_amount if provided, otherwise use calculated total
      const finalAmount = offer_amount !== undefined ? offer_amount : orderTotal;

      // Get seller info for discord invite
      const seller = await trx("accounts")
        .where({ user_id: seller_id })
        .first();

      let discordInvite: string | undefined;
      
      // Check if seller is a contractor and has discord invite
      if (seller) {
        const contractor = await trx("contractors")
          .where({ user_id: seller_id })
          .first();
        
        if (contractor?.discord_invite) {
          discordInvite = contractor.discord_invite;
        }
      }

      // Generate session ID for offer page navigation
      const sessionId = this.knex.raw("gen_random_uuid()").toString();

      // Create order
      const [order] = await trx("orders")
        .insert({
          buyer_id: userId,
          seller_id: seller_id,
          status: "pending",
          total_price: orderTotal,
          offer_amount: offer_amount,
          buyer_note: buyer_note || sellerCartItems[0].buyer_note,
          discord_invite: discordInvite,
          session_id: sessionId,
          created_at: trx.fn.now(),
        })
        .returning("*");

      // Allocate stock and create order items
      const StockAllocationService = (await import("./stock-allocation.service.js")).StockAllocationService;
      const stockService = new StockAllocationService(trx);

      for (const item of itemsWithCurrentPrices) {
        // Allocate stock using FIFO
        await stockService.allocateStock(item.variant_id, item.quantity, trx);

        // Create order item
        await trx("order_market_items_v2").insert({
          order_id: order.order_id,
          listing_id: item.listing_id,
          item_id: item.item_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          price_per_unit: item.current_price,
          fulfillment_status: "pending",
          created_at: trx.fn.now(),
        });
      }

      // Clear cart for this seller after successful checkout
      await trx("cart_items_v2")
        .where({
          user_id: userId,
          seller_id: seller_id,
        })
        .del();

      return {
        order_id: order.order_id,
        session_id: order.session_id,
        discord_invite: discordInvite,
        items_removed: validation.removed_items.map((item) => item.cart_item_id),
        price_changes: priceChanges,
      };
    });
  }
}
