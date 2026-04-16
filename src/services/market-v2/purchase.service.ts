/**
 * Purchase Service for Market V2
 *
 * Handles V2 market listing purchases with variant support.
 * Creates orders in V1 orders table with V2-specific validation and stock allocation.
 */

import { Knex } from "knex";
import { getKnex } from "../../clients/database/knex-db.js";
import { AvailabilityValidationService } from "./availability-validation.service.js";
import { PriceConsistencyService } from "./price-consistency.service.js";
import { StockAllocationService } from "./stock-allocation.service.js";
import { NotFoundError, OrderValidationError } from "./errors.js";

export interface PurchaseItem {
  listing_id: string;
  variant_id: string;
  quantity: number;
}

export interface PurchaseRequest {
  items: PurchaseItem[];
}

export interface PurchaseResponse {
  order_id: string;
  session_id?: string;
  discord_invite?: string;
  total_price: number;
}

export class PurchaseService {
  private knex: Knex;
  private availabilityService: AvailabilityValidationService;
  private priceService: PriceConsistencyService;
  private stockService: StockAllocationService;

  constructor(knex?: Knex) {
    this.knex = knex || getKnex();
    this.availabilityService = new AvailabilityValidationService(this.knex);
    this.priceService = new PriceConsistencyService(this.knex);
    this.stockService = new StockAllocationService(this.knex);
  }

  /**
   * Purchase V2 market listings with variant support
   * Creates order in V1 orders table with V2 order items
   */
  async purchaseItems(
    userId: string,
    request: PurchaseRequest
  ): Promise<PurchaseResponse> {
    return await this.knex.transaction(async (trx) => {
      // 1. Fetch listing items to get item_id for each listing
      const itemsWithIds = await Promise.all(
        request.items.map(async (item) => {
          const listingItem = await trx("listing_items")
            .where({ listing_id: item.listing_id })
            .first();

          if (!listingItem) {
            throw new NotFoundError(
              `Listing item not found for listing ${item.listing_id}`
            );
          }

          return {
            ...item,
            item_id: listingItem.item_id,
          };
        })
      );

      // 2. Validate availability for all items (with row locks)
      const validation = await this.availabilityService.validateForOrderCreation(
        itemsWithIds.map((item) => ({
          item_id: item.item_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
        })),
        trx
      );

      if (!validation.valid) {
        const errorMessages = validation.item_errors
          .map((err) => `${err.variant_id}: ${err.error_message}`)
          .join("; ");
        throw new OrderValidationError(
          `Purchase validation failed: ${errorMessages}`
        );
      }

      // 3. Snapshot prices for all items
      const itemsWithPrices = await this.priceService.snapshotPricesForOrder(
        itemsWithIds.map((item) => ({
          item_id: item.item_id,
          variant_id: item.variant_id,
          listing_id: item.listing_id,
          quantity: item.quantity,
        }))
      );

      // 4. Get seller_id from first listing
      const firstListing = await trx("listings")
        .where({ listing_id: request.items[0].listing_id })
        .first();

      if (!firstListing) {
        throw new NotFoundError("Listing not found");
      }

      // 5. Calculate total price
      const totalPrice = itemsWithPrices.reduce(
        (sum, item) => sum + item.price_per_unit * item.quantity,
        0
      );

      // 6. Create order in V1 orders table
      const [order] = await trx("orders")
        .insert({
          customer_id: userId,
          contractor_id: null,
          assigned_id: null,
          kind: "market",
          title: "Market Purchase",
          description: "Purchase from SC Market",
          cost: totalPrice,
          collateral: 0,
          payment_type: "one-time",
          status: "not-started",
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning("*");

      // 7. Allocate stock and create V2 order items
      for (const item of itemsWithIds) {
        const priceSnapshot = itemsWithPrices.find(
          (p) => p.variant_id === item.variant_id && p.listing_id === item.listing_id
        );

        if (!priceSnapshot) {
          throw new Error(`Price snapshot not found for variant ${item.variant_id}`);
        }

        // Allocate stock using FIFO
        await this.stockService.allocateStock(item.variant_id, item.quantity, trx);

        // Create V2 order item
        await trx("order_market_items_v2").insert({
          order_id: order.order_id,
          listing_id: item.listing_id,
          item_id: item.item_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          price_per_unit: priceSnapshot.price_per_unit,
          fulfillment_status: "pending",
          created_at: trx.fn.now(),
        });
      }

      // 8. Return purchase response
      return {
        order_id: order.order_id,
        total_price: Number(totalPrice),
      };
    });
  }
}
