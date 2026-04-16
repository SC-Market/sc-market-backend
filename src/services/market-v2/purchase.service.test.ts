/**
 * Purchase Service Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PurchaseService } from "./purchase.service.js";
import { getKnex } from "../../clients/database/knex-db.js";
import { AvailabilityValidationService } from "./availability-validation.service.js";
import { PriceConsistencyService } from "./price-consistency.service.js";
import { StockAllocationService } from "./stock-allocation.service.js";

vi.mock("../../clients/database/knex-db.js");
vi.mock("./availability-validation.service.js");
vi.mock("./price-consistency.service.js");
vi.mock("./stock-allocation.service.js");

describe("PurchaseService", () => {
  let purchaseService: PurchaseService;
  let mockKnex: any;
  let mockTrx: any;

  beforeEach(() => {
    mockTrx = {
      fn: { now: vi.fn(() => new Date()) },
      transaction: vi.fn((callback) => callback(mockTrx)),
    };

    mockKnex = {
      transaction: vi.fn((callback) => callback(mockTrx)),
    };

    (getKnex as any).mockReturnValue(mockKnex);

    purchaseService = new PurchaseService(mockKnex);
  });

  describe("purchaseItems", () => {
    it("should create order with V2 items successfully", async () => {
      const userId = "user-123";
      const request = {
        items: [
          {
            listing_id: "listing-1",
            variant_id: "variant-1",
            quantity: 5,
          },
        ],
      };

      // Mock listing_items query
      mockTrx.where = vi.fn().mockReturnThis();
      mockTrx.first = vi.fn().mockResolvedValue({
        item_id: "item-1",
        listing_id: "listing-1",
      });

      // Mock availability validation
      const mockValidation = {
        valid: true,
        item_errors: [],
      };
      vi.spyOn(
        AvailabilityValidationService.prototype,
        "validateForOrderCreation"
      ).mockResolvedValue(mockValidation);

      // Mock price snapshot
      const mockPrices = [
        {
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          quantity: 5,
          price_per_unit: 1000,
        },
      ];
      vi.spyOn(
        PriceConsistencyService.prototype,
        "snapshotPricesForOrder"
      ).mockResolvedValue(mockPrices);

      // Mock listings query
      const mockListing = {
        listing_id: "listing-1",
        seller_id: "seller-123",
      };
      mockTrx.first = vi.fn().mockResolvedValue(mockListing);

      // Mock order creation
      const mockOrder = {
        order_id: "order-123",
        customer_id: userId,
        cost: 5000,
        status: "not-started",
      };
      mockTrx.insert = vi.fn().mockReturnThis();
      mockTrx.returning = vi.fn().mockResolvedValue([mockOrder]);

      // Mock stock allocation
      vi.spyOn(
        StockAllocationService.prototype,
        "allocateStock"
      ).mockResolvedValue(undefined);

      const result = await purchaseService.purchaseItems(userId, request);

      expect(result).toEqual({
        order_id: "order-123",
        total_price: 5000,
      });
    });

    it("should throw error when listing item not found", async () => {
      const userId = "user-123";
      const request = {
        items: [
          {
            listing_id: "invalid-listing",
            variant_id: "variant-1",
            quantity: 5,
          },
        ],
      };

      mockTrx.where = vi.fn().mockReturnThis();
      mockTrx.first = vi.fn().mockResolvedValue(null);

      await expect(
        purchaseService.purchaseItems(userId, request)
      ).rejects.toThrow("Listing item not found");
    });

    it("should throw error when availability validation fails", async () => {
      const userId = "user-123";
      const request = {
        items: [
          {
            listing_id: "listing-1",
            variant_id: "variant-1",
            quantity: 100,
          },
        ],
      };

      mockTrx.where = vi.fn().mockReturnThis();
      mockTrx.first = vi.fn().mockResolvedValue({
        item_id: "item-1",
        listing_id: "listing-1",
      });

      const mockValidation = {
        valid: false,
        item_errors: [
          {
            variant_id: "variant-1",
            error_message: "Insufficient stock",
          },
        ],
      };
      vi.spyOn(
        AvailabilityValidationService.prototype,
        "validateForOrderCreation"
      ).mockResolvedValue(mockValidation);

      await expect(
        purchaseService.purchaseItems(userId, request)
      ).rejects.toThrow("Purchase validation failed");
    });

    it("should handle multiple items in single purchase", async () => {
      const userId = "user-123";
      const request = {
        items: [
          {
            listing_id: "listing-1",
            variant_id: "variant-1",
            quantity: 5,
          },
          {
            listing_id: "listing-2",
            variant_id: "variant-2",
            quantity: 3,
          },
        ],
      };

      // Mock listing_items queries
      mockTrx.where = vi.fn().mockReturnThis();
      mockTrx.first = vi
        .fn()
        .mockResolvedValueOnce({ item_id: "item-1", listing_id: "listing-1" })
        .mockResolvedValueOnce({ item_id: "item-2", listing_id: "listing-2" });

      // Mock availability validation
      vi.spyOn(
        AvailabilityValidationService.prototype,
        "validateForOrderCreation"
      ).mockResolvedValue({ valid: true, item_errors: [] });

      // Mock price snapshot
      vi.spyOn(
        PriceConsistencyService.prototype,
        "snapshotPricesForOrder"
      ).mockResolvedValue([
        {
          item_id: "item-1",
          variant_id: "variant-1",
          listing_id: "listing-1",
          quantity: 5,
          price_per_unit: 1000,
        },
        {
          item_id: "item-2",
          variant_id: "variant-2",
          listing_id: "listing-2",
          quantity: 3,
          price_per_unit: 2000,
        },
      ]);

      // Mock listings query
      mockTrx.first = vi.fn().mockResolvedValue({
        listing_id: "listing-1",
        seller_id: "seller-123",
      });

      // Mock order creation
      mockTrx.insert = vi.fn().mockReturnThis();
      mockTrx.returning = vi.fn().mockResolvedValue([
        {
          order_id: "order-123",
          customer_id: userId,
          cost: 11000,
        },
      ]);

      // Mock stock allocation
      vi.spyOn(
        StockAllocationService.prototype,
        "allocateStock"
      ).mockResolvedValue(undefined);

      const result = await purchaseService.purchaseItems(userId, request);

      expect(result.total_price).toBe(11000);
      expect(StockAllocationService.prototype.allocateStock).toHaveBeenCalledTimes(
        2
      );
    });
  });
});
