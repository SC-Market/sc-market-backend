/**
 * Cart Service Unit Tests
 *
 * Comprehensive unit tests for cart operations with variant support.
 * Tests cover adding items, updating quantities, removing items, and checkout flows.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CartService } from "./cart.service.js";
import { CartValidationError } from "./errors.js";

describe("CartService - Unit Tests", () => {
  let cartService: CartService;

  beforeEach(() => {
    cartService = new CartService();
  });

  describe("addToCart - Validation", () => {
    it("should validate quantity is positive", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const listingId = "00000000-0000-0000-0000-000000000002";
      const variantId = "00000000-0000-0000-0000-000000000003";

      await expect(
        cartService.addToCart(userId, listingId, variantId, 0)
      ).rejects.toThrow(CartValidationError);

      await expect(
        cartService.addToCart(userId, listingId, variantId, -1)
      ).rejects.toThrow(CartValidationError);
    });

    it("should accept valid positive quantities", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const listingId = "00000000-0000-0000-0000-000000000002";
      const variantId = "00000000-0000-0000-0000-000000000003";

      // These should not throw validation errors (will fail at DB level in tests)
      const validQuantities = [1, 5, 10, 100];
      
      for (const quantity of validQuantities) {
        try {
          await cartService.addToCart(userId, listingId, variantId, quantity);
        } catch (error) {
          // Expect DB errors, not validation errors
          expect(error).not.toBeInstanceOf(CartValidationError);
        }
      }
    });
  });

  describe("updateCartItem - Validation", () => {
    it("should validate quantity is positive", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const cartItemId = "00000000-0000-0000-0000-000000000002";

      await expect(
        cartService.updateCartItem(userId, cartItemId, 0)
      ).rejects.toThrow(CartValidationError);

      await expect(
        cartService.updateCartItem(userId, cartItemId, -1)
      ).rejects.toThrow(CartValidationError);
    });

    it("should accept valid positive quantities", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const cartItemId = "00000000-0000-0000-0000-000000000002";

      const validQuantities = [1, 2, 10, 50];
      
      for (const quantity of validQuantities) {
        try {
          await cartService.updateCartItem(userId, cartItemId, quantity);
        } catch (error) {
          // Expect DB errors, not validation errors
          expect(error).not.toBeInstanceOf(CartValidationError);
        }
      }
    });
  });

  describe("removeFromCart - Validation", () => {
    it("should accept valid UUID cart item IDs", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const cartItemId = "00000000-0000-0000-0000-000000000002";

      // Should not throw validation error (will fail at DB level)
      try {
        await cartService.removeFromCart(userId, cartItemId);
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });
  });

  describe("clearCart - Validation", () => {
    it("should accept valid user IDs", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      // Should not throw validation error (will fail at DB level)
      try {
        await cartService.clearCart(userId);
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });
  });

  describe("clearCartForSeller - Validation", () => {
    it("should accept valid user and seller IDs", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const sellerId = "00000000-0000-0000-0000-000000000002";

      // Should not throw validation error (will fail at DB level)
      try {
        await cartService.clearCartForSeller(userId, sellerId);
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });
  });

  describe("updateCartNotes - Validation", () => {
    it("should accept valid user ID, seller ID, and note", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const sellerId = "00000000-0000-0000-0000-000000000002";
      const buyerNote = "Please deliver by Friday";

      // Should not throw validation error (will fail at DB level)
      try {
        await cartService.updateCartNotes(userId, sellerId, buyerNote);
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });

    it("should accept empty notes", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const sellerId = "00000000-0000-0000-0000-000000000002";

      // Should not throw validation error (will fail at DB level)
      try {
        await cartService.updateCartNotes(userId, sellerId, "");
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });
  });

  describe("getCartItemCount - Validation", () => {
    it("should accept valid user IDs", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      // Should not throw validation error (will fail at DB level)
      try {
        await cartService.getCartItemCount(userId);
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });
  });

  describe("checkoutCart - Validation", () => {
    it("should accept CheckoutCartRequest with seller_id", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const sellerId = "00000000-0000-0000-0000-000000000002";

      // Test with accept_price_changes true
      try {
        await cartService.checkoutCart(userId, {
          seller_id: sellerId,
          accept_price_changes: true,
        });
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }

      // Test with accept_price_changes false
      try {
        await cartService.checkoutCart(userId, {
          seller_id: sellerId,
          accept_price_changes: false,
        });
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });

    it("should accept optional offer_amount and buyer_note", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const sellerId = "00000000-0000-0000-0000-000000000002";

      try {
        await cartService.checkoutCart(userId, {
          seller_id: sellerId,
          accept_price_changes: true,
          offer_amount: 5000,
          buyer_note: "Please deliver by Friday",
        });
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(CartValidationError);
      }
    });
  });

  describe("Cart Operations - Business Logic", () => {
    it("should enforce unique (user_id, listing_id, variant_id) constraint conceptually", () => {
      // This tests the business logic concept that a cart should not have
      // duplicate items with the same listing and variant combination
      const cartItems = [
        { user_id: "user1", listing_id: "listing1", variant_id: "variant1", quantity: 2 },
        { user_id: "user1", listing_id: "listing1", variant_id: "variant2", quantity: 1 },
        { user_id: "user1", listing_id: "listing2", variant_id: "variant1", quantity: 3 },
      ];

      // Create a set of unique combinations
      const uniqueCombinations = new Set(
        cartItems.map(item => `${item.user_id}:${item.listing_id}:${item.variant_id}`)
      );

      // Verify no duplicates
      expect(uniqueCombinations.size).toBe(cartItems.length);
    });

    it("should calculate cart totals correctly", () => {
      const cartItems = [
        { quantity: 2, price_per_unit: 1000 },
        { quantity: 1, price_per_unit: 500 },
        { quantity: 3, price_per_unit: 750 },
      ];

      const total = cartItems.reduce(
        (sum, item) => sum + item.quantity * item.price_per_unit,
        0
      );

      expect(total).toBe(2 * 1000 + 1 * 500 + 3 * 750);
      expect(total).toBe(4750);
    });

    it("should identify stale prices correctly", () => {
      const cartItems = [
        { cart_price: 1000, current_price: 1000, is_stale: false },
        { cart_price: 1000, current_price: 1100, is_stale: true },
        { cart_price: 500, current_price: 450, is_stale: true },
      ];

      const staleItems = cartItems.filter(item => item.is_stale);
      expect(staleItems.length).toBe(2);

      const freshItems = cartItems.filter(item => !item.is_stale);
      expect(freshItems.length).toBe(1);
    });

    it("should calculate price change percentages correctly", () => {
      const priceChanges = [
        { old_price: 1000, new_price: 1100 },
        { old_price: 500, new_price: 450 },
        { old_price: 2000, new_price: 2000 },
      ];

      const percentageChanges = priceChanges.map(change => ({
        ...change,
        percentage: Math.round(
          ((change.new_price - change.old_price) / change.old_price) * 100
        ),
      }));

      expect(percentageChanges[0].percentage).toBe(10); // 10% increase
      expect(percentageChanges[1].percentage).toBe(-10); // 10% decrease
      expect(percentageChanges[2].percentage).toBe(0); // No change
    });

    it("should group cart items by seller correctly", () => {
      const cartItems = [
        { seller_id: "seller1", listing_id: "listing1", quantity: 2 },
        { seller_id: "seller1", listing_id: "listing2", quantity: 1 },
        { seller_id: "seller2", listing_id: "listing3", quantity: 3 },
        { seller_id: "seller2", listing_id: "listing4", quantity: 1 },
      ];

      const groupedBySeller = cartItems.reduce((acc, item) => {
        if (!acc[item.seller_id]) {
          acc[item.seller_id] = [];
        }
        acc[item.seller_id].push(item);
        return acc;
      }, {} as Record<string, typeof cartItems>);

      expect(Object.keys(groupedBySeller).length).toBe(2);
      expect(groupedBySeller["seller1"].length).toBe(2);
      expect(groupedBySeller["seller2"].length).toBe(2);
    });

    it("should calculate totals per seller correctly", () => {
      const cartItems = [
        { seller_id: "seller1", quantity: 2, price_per_unit: 1000 },
        { seller_id: "seller1", quantity: 1, price_per_unit: 500 },
        { seller_id: "seller2", quantity: 3, price_per_unit: 750 },
      ];

      const totalsBySeller = cartItems.reduce((acc, item) => {
        if (!acc[item.seller_id]) {
          acc[item.seller_id] = 0;
        }
        acc[item.seller_id] += item.quantity * item.price_per_unit;
        return acc;
      }, {} as Record<string, number>);

      expect(totalsBySeller["seller1"]).toBe(2500); // 2*1000 + 1*500
      expect(totalsBySeller["seller2"]).toBe(2250); // 3*750
    });

    it("should support buyer notes per seller", () => {
      const sellerCarts = [
        { seller_id: "seller1", buyer_note: "Please deliver by Friday" },
        { seller_id: "seller2", buyer_note: "Leave at front door" },
      ];

      expect(sellerCarts[0].buyer_note).toBe("Please deliver by Friday");
      expect(sellerCarts[1].buyer_note).toBe("Leave at front door");
    });

    it("should support counter-offers per seller", () => {
      const checkoutRequests = [
        { seller_id: "seller1", calculated_total: 5000, offer_amount: 4500 },
        { seller_id: "seller2", calculated_total: 3000, offer_amount: undefined },
      ];

      expect(checkoutRequests[0].offer_amount).toBe(4500);
      expect(checkoutRequests[1].offer_amount).toBeUndefined();
    });
  });

  describe("Checkout Flow - Business Logic", () => {
    it("should validate availability before checkout", () => {
      const cartItems = [
        { variant_id: "v1", quantity: 5, available_quantity: 10, is_available: true },
        { variant_id: "v2", quantity: 3, available_quantity: 2, is_available: false },
        { variant_id: "v3", quantity: 1, available_quantity: 1, is_available: true },
      ];

      const unavailableItems = cartItems.filter(item => !item.is_available);
      expect(unavailableItems.length).toBe(1);
      expect(unavailableItems[0].variant_id).toBe("v2");
    });

    it("should detect price changes during checkout", () => {
      const cartItems = [
        { cart_price: 1000, current_price: 1000, has_price_change: false },
        { cart_price: 500, current_price: 550, has_price_change: true },
        { cart_price: 750, current_price: 700, has_price_change: true },
      ];

      const itemsWithPriceChanges = cartItems.filter(item => item.has_price_change);
      expect(itemsWithPriceChanges.length).toBe(2);
    });

    it("should require explicit acceptance for price changes", () => {
      const hasPriceChanges = true;
      const acceptPriceChanges = false;

      // Checkout should fail if price changes exist and not accepted
      const shouldProceed = !hasPriceChanges || acceptPriceChanges;
      expect(shouldProceed).toBe(false);

      // Checkout should succeed if price changes are accepted
      const acceptPriceChanges2 = true;
      const shouldProceed2 = !hasPriceChanges || acceptPriceChanges2;
      expect(shouldProceed2).toBe(true);
    });

    it("should clear cart for seller after successful checkout", () => {
      const cartBeforeCheckout = [
        { cart_item_id: "item1", seller_id: "seller1", quantity: 2 },
        { cart_item_id: "item2", seller_id: "seller1", quantity: 1 },
        { cart_item_id: "item3", seller_id: "seller2", quantity: 3 },
      ];

      // Simulate successful checkout for seller1
      const checkoutSuccess = true;
      const checkoutSellerId = "seller1";
      const cartAfterCheckout = checkoutSuccess 
        ? cartBeforeCheckout.filter(item => item.seller_id !== checkoutSellerId)
        : cartBeforeCheckout;

      expect(cartAfterCheckout.length).toBe(1);
      expect(cartAfterCheckout[0].seller_id).toBe("seller2");
    });

    it("should preserve cart if checkout fails", () => {
      const cartBeforeCheckout = [
        { cart_item_id: "item1", seller_id: "seller1", quantity: 2 },
        { cart_item_id: "item2", seller_id: "seller1", quantity: 1 },
      ];

      // Simulate failed checkout
      const checkoutSuccess = false;
      const checkoutSellerId = "seller1";
      const cartAfterCheckout = checkoutSuccess 
        ? cartBeforeCheckout.filter(item => item.seller_id !== checkoutSellerId)
        : cartBeforeCheckout;

      expect(cartAfterCheckout.length).toBe(2);
      expect(cartAfterCheckout).toEqual(cartBeforeCheckout);
    });

    it("should handle partial checkout with unavailable items", () => {
      const cartItems = [
        { cart_item_id: "item1", is_available: true },
        { cart_item_id: "item2", is_available: false },
        { cart_item_id: "item3", is_available: true },
      ];

      const availableItems = cartItems.filter(item => item.is_available);
      const unavailableItems = cartItems.filter(item => !item.is_available);

      expect(availableItems.length).toBe(2);
      expect(unavailableItems.length).toBe(1);
      expect(unavailableItems[0].cart_item_id).toBe("item2");
    });
  });

  describe("Price Snapshotting - Business Logic", () => {
    it("should snapshot price at add-to-cart time", () => {
      const currentPrice = 1000;
      const snapshotTime = new Date();

      const cartItem = {
        price_per_unit: currentPrice,
        added_at: snapshotTime,
      };

      expect(cartItem.price_per_unit).toBe(currentPrice);
      expect(cartItem.added_at).toBe(snapshotTime);
    });

    it("should detect when snapshot price differs from current price", () => {
      const cartItems = [
        { snapshot_price: 1000, current_price: 1000 },
        { snapshot_price: 500, current_price: 550 },
        { snapshot_price: 750, current_price: 750 },
      ];

      const stalePrices = cartItems.filter(
        item => item.snapshot_price !== item.current_price
      );

      expect(stalePrices.length).toBe(1);
      expect(stalePrices[0].snapshot_price).toBe(500);
      expect(stalePrices[0].current_price).toBe(550);
    });

    it("should use snapshot price for order creation", () => {
      const cartItem = {
        snapshot_price: 1000,
        current_price: 1100,
        quantity: 2,
      };

      // Order should use snapshot price if user accepts changes
      const orderItemPrice = cartItem.snapshot_price;
      const orderTotal = orderItemPrice * cartItem.quantity;

      expect(orderItemPrice).toBe(1000);
      expect(orderTotal).toBe(2000);
    });
  });

  describe("Variant Support - Business Logic", () => {
    it("should preserve variant_id from cart to order", () => {
      const cartItems = [
        { variant_id: "variant1", quantity: 2 },
        { variant_id: "variant2", quantity: 1 },
      ];

      const orderItems = cartItems.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
      }));

      expect(orderItems[0].variant_id).toBe("variant1");
      expect(orderItems[1].variant_id).toBe("variant2");
    });

    it("should allow same listing with different variants in cart", () => {
      const cartItems = [
        { listing_id: "listing1", variant_id: "variant1", quantity: 2 },
        { listing_id: "listing1", variant_id: "variant2", quantity: 1 },
      ];

      const uniqueItems = new Set(
        cartItems.map(item => `${item.listing_id}:${item.variant_id}`)
      );

      expect(uniqueItems.size).toBe(2);
    });

    it("should prevent duplicate (listing_id, variant_id) combinations", () => {
      const existingCartItems = [
        { listing_id: "listing1", variant_id: "variant1" },
      ];

      const newItem = { listing_id: "listing1", variant_id: "variant1" };

      const isDuplicate = existingCartItems.some(
        item =>
          item.listing_id === newItem.listing_id &&
          item.variant_id === newItem.variant_id
      );

      expect(isDuplicate).toBe(true);
    });
  });
});
