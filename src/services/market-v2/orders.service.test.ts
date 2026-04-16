/**
 * Unit tests for OrdersService
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock B2 client to avoid initialization errors
vi.mock("../../clients/backblaze/backblaze.js", () => ({
  BackBlazeCDN: class MockBackBlazeCDN {
    static getInstance() {
      return new MockBackBlazeCDN();
    }
  },
}));

// Mock knex-db before importing the service
vi.mock("../../clients/database/knex-db.js");

// Now import the service and dependencies
import { OrdersService } from "./orders.service.js";
import { NotFoundError } from "./errors.js";
import { getKnex } from "../../clients/database/knex-db.js";

describe("OrdersService", () => {
  let service: OrdersService;
  let mockKnex: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock knex with query builder methods
    mockKnex = vi.fn(() => mockKnex);
    mockKnex.fn = { now: vi.fn(() => new Date()) };
    mockKnex.raw = vi.fn((sql: string) => sql);
    mockKnex.where = vi.fn().mockReturnThis();
    mockKnex.first = vi.fn();
    mockKnex.select = vi.fn().mockReturnThis();
    mockKnex.join = vi.fn().mockReturnThis();
    mockKnex.groupBy = vi.fn().mockReturnThis();
    mockKnex.havingRaw = vi.fn().mockReturnThis();
    mockKnex.orderBy = vi.fn().mockReturnThis();
    mockKnex.limit = vi.fn().mockReturnThis();
    mockKnex.offset = vi.fn().mockReturnThis();
    mockKnex.clone = vi.fn().mockReturnThis();
    mockKnex.clearSelect = vi.fn().mockReturnThis();
    mockKnex.clearOrder = vi.fn().mockReturnThis();
    mockKnex.count = vi.fn().mockResolvedValue([{ count: "10" }]);

    (getKnex as any).mockReturnValue(mockKnex);

    service = new OrdersService(mockKnex);
  });

  describe("getOrderDetail", () => {
    it("should return order detail with V2 variant information", async () => {
      const orderId = "order-123";
      const userId = "user-456";

      // Mock order query
      mockKnex.first.mockResolvedValueOnce({
        order_id: orderId,
        customer_id: userId,
        assigned_id: "seller-789",
        status: "in-progress",
        cost: "10000",
        timestamp: new Date("2024-01-01"),
        updated_at: new Date("2024-01-02"),
      });

      // Mock V2 items query - second call to mockKnex returns items
      mockKnex.mockResolvedValueOnce([
        {
          order_item_id: "item-1",
          listing_id: "listing-1",
          item_id: "item-1",
          variant_id: "variant-1",
          quantity: 5,
          price_per_unit: "2000",
          fulfillment_status: "pending",
          game_item_id: "game-item-1",
          game_item_name: "Titanium Ore",
          game_item_type: "resource",
          variant_display_name: "Tier 3 - High Quality",
          variant_attributes: {
            quality_tier: 3,
            quality_value: 85,
            crafted_source: "mined",
          },
        },
      ]);

      const result = await service.getOrderDetail(orderId, userId);

      expect(result.order.order_id).toBe(orderId);
      expect(result.order.buyer_id).toBe(userId);
      expect(result.order.status).toBe("in-progress");
      expect(result.items).toHaveLength(1);
      expect(result.items[0].variant.quality_tier).toBe(3);
      expect(result.items[0].variant.display_name).toBe("Tier 3 - High Quality");
    });

    it("should throw NotFoundError if order does not exist", async () => {
      mockKnex.first.mockResolvedValueOnce(null);

      await expect(
        service.getOrderDetail("nonexistent", "user-123")
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError if user is not buyer or seller", async () => {
      mockKnex.first.mockResolvedValueOnce({
        order_id: "order-123",
        customer_id: "other-user",
        assigned_id: "other-seller",
        status: "in-progress",
        cost: "10000",
        timestamp: new Date(),
      });

      await expect(
        service.getOrderDetail("order-123", "unauthorized-user")
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError if no V2 items found", async () => {
      mockKnex.first.mockResolvedValueOnce({
        order_id: "order-123",
        customer_id: "user-456",
        assigned_id: "seller-789",
        status: "in-progress",
        cost: "10000",
        timestamp: new Date(),
      });

      mockKnex.mockResolvedValueOnce([]); // No V2 items

      await expect(
        service.getOrderDetail("order-123", "user-456")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getOrders", () => {
    it("should return list of orders with V2 variant information", async () => {
      const userId = "user-456";

      // Mock count query
      mockKnex.count.mockResolvedValueOnce([{ count: "2" }]);

      // Mock orders query
      mockKnex.mockResolvedValueOnce([
        {
          order_id: "order-1",
          buyer_id: userId,
          seller_id: "seller-1",
          status: "in-progress",
          total_price: "10000",
          created_at: new Date("2024-01-01"),
          item_count: "3",
          quality_tier_min: "2",
          quality_tier_max: "4",
        },
        {
          order_id: "order-2",
          buyer_id: userId,
          seller_id: "seller-2",
          status: "fulfilled",
          total_price: "5000",
          created_at: new Date("2024-01-02"),
          item_count: "1",
          quality_tier_min: "3",
          quality_tier_max: "3",
        },
      ]);

      const result = await service.getOrders(userId, {
        page: 1,
        page_size: 20,
      });

      expect(result.orders).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.orders[0].quality_tier_range).toEqual({ min: 2, max: 4 });
      expect(result.orders[1].quality_tier_range).toEqual({ min: 3, max: 3 });
    });

    it("should filter orders by role (buyer)", async () => {
      const userId = "user-456";

      mockKnex.count.mockResolvedValueOnce([{ count: "1" }]);
      mockKnex.mockResolvedValueOnce([
        {
          order_id: "order-1",
          buyer_id: userId,
          seller_id: "seller-1",
          status: "in-progress",
          total_price: "10000",
          created_at: new Date(),
          item_count: "3",
          quality_tier_min: "2",
          quality_tier_max: "4",
        },
      ]);

      const result = await service.getOrders(userId, {
        role: "buyer",
        page: 1,
        page_size: 20,
      });

      expect(result.orders).toHaveLength(1);
      expect(mockKnex.where).toHaveBeenCalledWith("o.customer_id", userId);
    });

    it("should filter orders by status", async () => {
      const userId = "user-456";

      mockKnex.count.mockResolvedValueOnce([{ count: "1" }]);
      mockKnex.mockResolvedValueOnce([
        {
          order_id: "order-1",
          buyer_id: userId,
          seller_id: "seller-1",
          status: "fulfilled",
          total_price: "10000",
          created_at: new Date(),
          item_count: "3",
          quality_tier_min: "2",
          quality_tier_max: "4",
        },
      ]);

      const result = await service.getOrders(userId, {
        status: "fulfilled",
        page: 1,
        page_size: 20,
      });

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].status).toBe("fulfilled");
    });

    it("should filter orders by quality tier", async () => {
      const userId = "user-456";

      mockKnex.count.mockResolvedValueOnce([{ count: "1" }]);
      mockKnex.mockResolvedValueOnce([
        {
          order_id: "order-1",
          buyer_id: userId,
          seller_id: "seller-1",
          status: "in-progress",
          total_price: "10000",
          created_at: new Date(),
          item_count: "3",
          quality_tier_min: "2",
          quality_tier_max: "4",
        },
      ]);

      const result = await service.getOrders(userId, {
        quality_tier: 3,
        page: 1,
        page_size: 20,
      });

      expect(result.orders).toHaveLength(1);
      expect(mockKnex.havingRaw).toHaveBeenCalled();
    });

    it("should apply pagination correctly", async () => {
      const userId = "user-456";

      mockKnex.count.mockResolvedValueOnce([{ count: "50" }]);
      mockKnex.mockResolvedValueOnce([]);

      await service.getOrders(userId, {
        page: 3,
        page_size: 10,
      });

      expect(mockKnex.limit).toHaveBeenCalledWith(10);
      expect(mockKnex.offset).toHaveBeenCalledWith(20); // (3-1) * 10
    });

    it("should apply sorting correctly", async () => {
      const userId = "user-456";

      mockKnex.count.mockResolvedValueOnce([{ count: "10" }]);
      mockKnex.mockResolvedValueOnce([]);

      await service.getOrders(userId, {
        page: 1,
        page_size: 20,
        sort_by: "total_price",
        sort_order: "asc",
      });

      expect(mockKnex.orderBy).toHaveBeenCalledWith("o.cost", "asc");
    });
  });
});
