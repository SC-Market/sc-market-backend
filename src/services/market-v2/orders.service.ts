/**
 * Orders Service for Market V2
 *
 * Handles V2 order display with variant information.
 * Reads from V1 orders table and enriches with V2 variant data.
 */

import { Knex } from "knex";
import { getKnex } from "../../clients/database/knex-db.js";
import { NotFoundError } from "./errors.js";

export interface OrderItemV2 {
  order_item_id: string;
  listing_id: string;
  item_id: string;
  variant_id: string;
  quantity: number;
  price_per_unit: number;
  fulfillment_status: string;
  game_item: {
    game_item_id: string;
    name: string;
    type: string;
  };
  variant: {
    variant_id: string;
    display_name: string;
    attributes: Record<string, any>;
    quality_tier: number;
  };
}

export interface OrderDetailV2Response {
  order: {
    order_id: string;
    buyer_id: string;
    seller_id: string;
    status: string;
    total_price: string;
    created_at: Date;
    updated_at: Date;
  };
  items: OrderItemV2[];
}

export interface OrderListItemV2 {
  order_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  total_price: string;
  created_at: Date;
  item_count: number;
  quality_tier_range: {
    min: number;
    max: number;
  };
}

export interface OrderListV2Response {
  orders: OrderListItemV2[];
  total: number;
  page: number;
  page_size: number;
}

export interface GetOrdersFilters {
  role?: 'buyer' | 'seller';
  status?: string;
  quality_tier?: number;
  date_from?: Date;
  date_to?: Date;
  page?: number;
  page_size?: number;
  sort_by?: 'created_at' | 'total_price' | 'quality_tier';
  sort_order?: 'asc' | 'desc';
}

export class OrdersService {
  private knex: Knex;

  constructor(knex?: Knex) {
    this.knex = knex || getKnex();
  }

  /**
   * Get order detail with V2 variant information
   * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
   */
  async getOrderDetail(orderId: string, userId: string): Promise<OrderDetailV2Response> {
    // Fetch order from V1 orders table
    const order = await this.knex("orders")
      .where({ order_id: orderId })
      .first();

    if (!order) {
      throw new NotFoundError(`Order not found: ${orderId}`);
    }

    // Check if user has access to this order (buyer or seller)
    if (order.customer_id !== userId && order.assigned_id !== userId) {
      throw new NotFoundError(`Order not found: ${orderId}`);
    }

    // Fetch V2 order items with variant details
    const v2Items = await this.knex("order_market_items_v2 as omi")
      .select(
        "omi.order_item_id",
        "omi.listing_id",
        "omi.item_id",
        "omi.variant_id",
        "omi.quantity",
        "omi.price_per_unit",
        "omi.fulfillment_status",
        "gi.game_item_id",
        "gi.name as game_item_name",
        "gi.type as game_item_type",
        "iv.display_name as variant_display_name",
        "iv.attributes as variant_attributes"
      )
      .join("listing_items as li", "omi.item_id", "li.item_id")
      .join("game_items as gi", "li.game_item_id", "gi.game_item_id")
      .join("item_variants as iv", "omi.variant_id", "iv.variant_id")
      .where("omi.order_id", orderId);

    // If no V2 items found, this is not a V2 order
    if (v2Items.length === 0) {
      throw new NotFoundError(`No V2 items found for order: ${orderId}`);
    }

    // Map to response format
    const items: OrderItemV2[] = v2Items.map((item) => ({
      order_item_id: item.order_item_id,
      listing_id: item.listing_id,
      item_id: item.item_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      price_per_unit: Number(item.price_per_unit),
      fulfillment_status: item.fulfillment_status,
      game_item: {
        game_item_id: item.game_item_id,
        name: item.game_item_name,
        type: item.game_item_type,
      },
      variant: {
        variant_id: item.variant_id,
        display_name: item.variant_display_name,
        attributes: item.variant_attributes,
        quality_tier: item.variant_attributes?.quality_tier || 1,
      },
    }));

    return {
      order: {
        order_id: order.order_id,
        buyer_id: order.customer_id,
        seller_id: order.assigned_id,
        status: order.status,
        total_price: order.cost,
        created_at: order.timestamp,
        updated_at: order.updated_at || order.timestamp,
      },
      items,
    };
  }

  /**
   * Get list of orders with V2 variant information
   * Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.9, 31.10
   */
  async getOrders(
    userId: string,
    filters: GetOrdersFilters
  ): Promise<OrderListV2Response> {
    const {
      role,
      status,
      quality_tier,
      date_from,
      date_to,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = filters;

    // Build base query for orders with V2 items
    let query = this.knex("orders as o")
      .select(
        "o.order_id",
        "o.customer_id as buyer_id",
        "o.assigned_id as seller_id",
        "o.status",
        "o.cost as total_price",
        "o.timestamp as created_at",
        this.knex.raw("COUNT(DISTINCT omi.order_item_id) as item_count"),
        this.knex.raw(
          "MIN((omi_iv.attributes->>'quality_tier')::integer) as quality_tier_min"
        ),
        this.knex.raw(
          "MAX((omi_iv.attributes->>'quality_tier')::integer) as quality_tier_max"
        )
      )
      .join("order_market_items_v2 as omi", "o.order_id", "omi.order_id")
      .join("item_variants as omi_iv", "omi.variant_id", "omi_iv.variant_id")
      .groupBy("o.order_id");

    // Filter by role (buyer or seller)
    if (role === 'buyer') {
      query = query.where("o.customer_id", userId);
    } else if (role === 'seller') {
      query = query.where("o.assigned_id", userId);
    } else {
      // Default: show orders where user is buyer or seller
      query = query.where((builder) => {
        builder.where("o.customer_id", userId).orWhere("o.assigned_id", userId);
      });
    }

    // Filter by status
    if (status) {
      query = query.where("o.status", status);
    }

    // Filter by quality tier
    if (quality_tier) {
      query = query.havingRaw(
        "? BETWEEN MIN((omi_iv.attributes->>'quality_tier')::integer) AND MAX((omi_iv.attributes->>'quality_tier')::integer)",
        [quality_tier]
      );
    }

    // Filter by date range
    if (date_from) {
      query = query.where("o.timestamp", ">=", date_from);
    }
    if (date_to) {
      query = query.where("o.timestamp", "<=", date_to);
    }

    // Get total count before pagination
    const countQuery = query.clone().clearSelect().clearOrder().count("* as count");
    const [{ count }] = await countQuery;
    const total = Number(count);

    // Apply sorting
    const sortColumn = sort_by === 'total_price' ? 'o.cost' : `o.${sort_by}`;
    query = query.orderBy(sortColumn, sort_order);

    // Apply pagination
    const offset = (page - 1) * page_size;
    query = query.limit(page_size).offset(offset);

    // Execute query
    const orders = await query;

    // Map to response format
    const orderList: OrderListItemV2[] = orders.map((order) => ({
      order_id: order.order_id,
      buyer_id: order.buyer_id,
      seller_id: order.seller_id,
      status: order.status,
      total_price: order.total_price,
      created_at: order.created_at,
      item_count: Number(order.item_count),
      quality_tier_range: {
        min: Number(order.quality_tier_min),
        max: Number(order.quality_tier_max),
      },
    }));

    return {
      orders: orderList,
      total,
      page,
      page_size,
    };
  }
}
