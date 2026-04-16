/**
 * Purchase Service Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PurchaseService } from "./purchase.service.js";
import { getKnex } from "../../clients/database/knex-db.js";
import { AvailabilityValidationService } from "./availability-validation.service.js";
import { PriceConsistencyService } from "./price-consistency.service.js";
import * as helpers from "../../api/routes/v1/orders/helpers.js";

vi.mock("../../clients/database/knex-db.js");
vi.mock("./availability-validation.service.js");
vi.mock("./price-consistency.service.js");
vi.mock("../../api/routes/v1/orders/helpers.js");

describe("PurchaseService", () => {
  let purchaseService: PurchaseService;
  let mockKnex: any;

  beforeEach(() => {
    mockKnex = {
      fn: { now: vi.fn(() => new Date()) },
    };

    (getKnex as any).mockReturnValue(mockKnex);

    purchaseService = new PurchaseService(mockKnex);
  });

  describe("purchaseItems", () => {
    it("should create offer with V2 variant tracking successfully", async () => {
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

      // Mock listings query
      mockKnex.where = vi.fn().mockReturnThis();
      mockKnex.first = vi.fn().mockResolvedValue({
        listing_id: "listing-1",
        user_seller_id: "seller-123",
        contractor_seller_id: null,
        title: "Test Item",
      });

      // Mock listing_items query
      mockKnex.first = vi.fn()
        .mockResolvedValueOnce({
          listing_id: "listing-1",
          user_seller_id: "seller-123",
          contractor_seller_id: null,
          title: "Test Item",
        })
        .mockResolvedValueOnce({
          item_id: "item-1",
          listing_id: "listing-1",
          base_price: 1000,
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

      // Mock validateAvailabilityRequirement
      vi.spyOn(helpers, "validateAvailabilityRequirement").mockResolvedValue(undefined);

      // Mock validateOrderLimits
      vi.spyOn(helpers, "validateOrderLimits").mockResolvedValue(undefined);

      // Mock createOffer
      const mockOffer = {
        id: "offer-123",
      };
      const mockSession = {
        id: "session-123",
      };
      vi.spyOn(helpers, "createOffer").mockResolvedValue({
        offer: mockOffer,
        session: mockSession,
        discord_invite: "https://discord.gg/test",
      } as any);

      // Mock offer_market_items_v2 insert
      mockKnex.insert = vi.fn().mockReturnThis();
      mockKnex.returning = vi.fn().mockResolvedValue([]);

      const result = await purchaseService.purchaseItems(userId, request);

      expect(result).toEqual({
        offer_id: "offer-123",
        session_id: "session-123",
        discord_invite: "https://discord.gg/test",
        total_price: 5000,
      });

      expect(helpers.createOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: userId,
          assigned_id: "seller-123",
          contractor_id: null,
        }),
        expect.objectContaining({
          actor_id: userId,
          kind: "Delivery",
          cost: "5000",
          title: "Market Purchase",
        }),
        expect.any(Array)
      );
    });

    it("should throw error when listing not found", async () => {
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

      mockKnex.where = vi.fn().mockReturnThis();
      mockKnex.first = vi.fn().mockResolvedValue(null);

      await expect(
        purchaseService.purchaseItems(userId, request)
      ).rejects.toThrow("Listing not found");
    });

    it("should throw error when items from different sellers", async () => {
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

      mockKnex.where = vi.fn().mockReturnThis();
      mockKnex.first = vi.fn()
        .mockResolvedValueOnce({
          listing_id: "listing-1",
          user_seller_id: "seller-1",
          contractor_seller_id: null,
        })
        .mockResolvedValueOnce({ item_id: "item-1" })
        .mockResolvedValueOnce({
          listing_id: "listing-2",
          user_seller_id: "seller-2",
          contractor_seller_id: null,
        })
        .mockResolvedValueOnce({ item_id: "item-2" });

      await expect(
        purchaseService.purchaseItems(userId, request)
      ).rejects.toThrow("All items must be from the same seller");
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

      mockKnex.where = vi.fn().mockReturnThis();
      mockKnex.first = vi.fn()
        .mockResolvedValueOnce({
          listing_id: "listing-1",
          user_seller_id: "seller-123",
          contractor_seller_id: null,
        })
        .mockResolvedValueOnce({
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
  });
});
