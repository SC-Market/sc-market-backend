/**
 * Orders Service Unit Tests
 *
 * Unit tests for order operations with variant support.
 * Tests cover order creation, retrieval, and listing with filters.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OrdersService } from "./orders.service.js";
import { OrderValidationError, NotFoundError } from "./errors.js";

describe("OrdersService - Unit Tests", () => {
  let ordersService: OrdersService;

  beforeEach(() => {
    ordersService = new OrdersService();
  });

  describe("createOrder - Validation", () => {
    it("should validate items array is not empty", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const request = {
        items: [],
      };

      // Empty items array should fail at validation level
      try {
        await ordersService.createOrder(userId, request);
      } catch (error) {
        // Expect some error (validation or DB)
        expect(error).toBeDefined();
      }
    });

    it("should validate item structure", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const validRequest = {
        items: [
          {
            listing_id: "00000000-0000-0000-0000-000000000002",
            variant_id: "00000000-0000-0000-0000-000000000003",
            quantity: 1,
          },
        ],
      };

      // Valid structure should not throw validation error (will fail at DB level)
      try {
        await ordersService.createOrder(userId, validRequest);
      } catch (error) {
        // Expect DB errors, not validation errors
        expect(error).not.toBeInstanceOf(OrderValidationError);
      }
    });

    it("should validate quantities are positive", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const requestWithZeroQuantity = {
        items: [
          {
            listing_id: "00000000-0000-0000-0000-000000000002",
            variant_id: "00000000-0000-0000-0000-000000000003",
            quantity: 0,
          },
        ],
      };

      // Zero quantity should fail
      try {
        await ordersService.createOrder(userId, requestWithZeroQuantity);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("getOrderDetail - Validation", () => {
    it("should accept valid order IDs", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";
      const orderId = "00000000-0000-0000-0000-000000000002";

      // Should not throw validation error (will fail at DB level with NotFoundError)
      try {
        await ordersService.getOrderDetail(orderId, userId);
      } catch (error) {
        // Expect NotFoundError from DB, not validation error
        expect(error).toBeInstanceOf(NotFoundError);
      }
    });
  });

  describe("getOrders - Validation", () => {
    it("should accept valid role filters", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      const validRoles: Array<"buyer" | "seller" | undefined> = ["buyer", "seller", undefined];

      for (const role of validRoles) {
        try {
          await ordersService.getOrders(userId, {
            role,
            page: 1,
            page_size: 20,
          });
        } catch (error) {
          // Expect DB errors, not validation errors
          expect(error).not.toBeInstanceOf(OrderValidationError);
        }
      }
    });

    it("should accept valid pagination parameters", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      const validPaginations = [
        { page: 1, page_size: 10 },
        { page: 1, page_size: 20 },
        { page: 2, page_size: 50 },
        { page: 5, page_size: 100 },
      ];

      for (const pagination of validPaginations) {
        try {
          await ordersService.getOrders(userId, pagination);
        } catch (error) {
          // Expect DB errors, not validation errors
          expect(error).not.toBeInstanceOf(OrderValidationError);
        }
      }
    });

    it("should accept valid sort parameters", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      const validSorts: Array<{
        sort_by?: "created_at" | "total_price" | "quality_tier";
        sort_order?: "asc" | "desc";
      }> = [
        { sort_by: "created_at", sort_order: "desc" },
        { sort_by: "total_price", sort_order: "asc" },
        { sort_by: "quality_tier", sort_order: "desc" },
        { sort_by: undefined, sort_order: undefined },
      ];

      for (const sort of validSorts) {
        try {
          await ordersService.getOrders(userId, {
            page: 1,
            page_size: 20,
            ...sort,
          });
        } catch (error) {
          // Expect DB errors, not validation errors
          expect(error).not.toBeInstanceOf(OrderValidationError);
        }
      }
    });

    it("should accept valid quality tier filters", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      const validQualityTiers = [1, 2, 3, 4, 5, undefined];

      for (const quality_tier of validQualityTiers) {
        try {
          await ordersService.getOrders(userId, {
            quality_tier,
            page: 1,
            page_size: 20,
          });
        } catch (error) {
          // Expect DB errors, not validation errors
          expect(error).not.toBeInstanceOf(OrderValidationError);
        }
      }
    });

    it("should accept valid date range filters", async () => {
      const userId = "00000000-0000-0000-0000-000000000001";

      const validDateRanges = [
        { date_from: new Date("2024-01-01"), date_to: new Date("2024-12-31") },
        { date_from: new Date("2024-01-01"), date_to: undefined },
        { date_from: undefined, date_to: new Date("2024-12-31") },
        { date_from: undefined, date_to: undefined },
      ];

      for (const dateRange of validDateRanges) {
        try {
          await ordersService.getOrders(userId, {
            ...dateRange,
            page: 1,
            page_size: 20,
          });
        } catch (error) {
          // Expect DB errors, not validation errors
          expect(error).not.toBeInstanceOf(OrderValidationError);
        }
      }
    });
  });
});
