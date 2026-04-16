/**
 * Purchase Service for Market V2
 *
 * Handles V2 market listing purchases with variant support.
 * Creates offer sessions using V1 createOffer helper with V2-specific validation.
 */

import { Knex } from "knex";
import { getKnex } from "../../clients/database/knex-db.js";
import { AvailabilityValidationService } from "./availability-validation.service.js";
import { PriceConsistencyService } from "./price-consistency.service.js";
import { NotFoundError, OrderValidationError } from "./errors.js";
import { createOffer, validateAvailabilityRequirement, validateOrderLimits } from "../../api/routes/v1/orders/helpers.js";

export interface PurchaseItem {
  listing_id: string;
  variant_id: string;
  quantity: number;
}

export interface PurchaseRequest {
  items: PurchaseItem[];
  offer_amount?: number;
  buyer_note?: string;
}

export interface PurchaseResponse {
  offer_id: string;
  session_id: string;
  discord_invite: string | null;
  total_price: number;
}

export class PurchaseService {
  private knex: Knex;
  private availabilityService: AvailabilityValidationService;
  private priceService: PriceConsistencyService;

  constructor(knex?: Knex) {
    this.knex = knex || getKnex();
    this.availabilityService = new AvailabilityValidationService(this.knex);
    this.priceService = new PriceConsistencyService(this.knex);
  }

  /**
   * Purchase V2 market listings with variant support
   * Creates offer session using V1 createOffer helper
   * Note: V2 variant tracking happens when offer is accepted (in initiateOrder)
   */
  async purchaseItems(
    userId: string,
    request: PurchaseRequest
  ): Promise<PurchaseResponse> {
    // 1. Fetch listing items and validate all items are from same seller
    const listingsData = await Promise.all(
      request.items.map(async (item) => {
        const listing = await this.knex("listings")
          .where({ listing_id: item.listing_id })
          .first();

        if (!listing) {
          throw new NotFoundError(`Listing not found: ${item.listing_id}`);
        }

        const listingItem = await this.knex("listing_items")
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
          listing: listing,
        };
      })
    );

    // Verify all items are from same seller
    const firstSeller = listingsData[0].listing.user_seller_id;
    const firstContractor = listingsData[0].listing.contractor_seller_id;
    const allSameSeller = listingsData.every(
      (item) =>
        item.listing.user_seller_id === firstSeller &&
        item.listing.contractor_seller_id === firstContractor
    );

    if (!allSameSeller) {
      throw new OrderValidationError(
        "All items must be from the same seller"
      );
    }

    // 2. Validate availability and snapshot prices in transaction
    const { validation, itemsWithPrices, totalPrice } = await this.knex.transaction(async (trx) => {
      // Validate availability for all items with row locks
      const validation = await this.availabilityService.validateForOrderCreation(
        listingsData.map((item) => ({
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

      // Snapshot prices for all items
      const itemsWithPrices = await this.priceService.snapshotPricesForOrder(
        listingsData.map((item) => ({
          item_id: item.item_id,
          variant_id: item.variant_id,
          listing_id: item.listing_id,
          quantity: item.quantity,
        }))
      );

      // Calculate total price
      const totalPrice = itemsWithPrices.reduce(
        (sum, item) => {
          const itemData = listingsData.find(
            (d) => d.variant_id === item.variant_id && d.listing_id === item.listing_id
          );
          return sum + item.price_per_unit * (itemData?.quantity || 0);
        },
        0
      );

      return { validation, itemsWithPrices, totalPrice };
    });

    // 3. Calculate total quantity for order limits validation
    const totalQuantity = request.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    // 4. Validate availability requirement
    await validateAvailabilityRequirement(
      userId,
      firstContractor,
      firstSeller
    );

    // 6. Validate order limits
    const offerValue = request.offer_amount !== undefined ? request.offer_amount : totalPrice;
    await validateOrderLimits(
      firstContractor,
      firstSeller,
      totalQuantity,
      offerValue
    );

    // 7. Build description message
    let message = "**Items:**\n";
    for (const item of listingsData) {
      const priceSnapshot = itemsWithPrices.find(
        (p) => p.variant_id === item.variant_id && p.listing_id === item.listing_id
      );
      message += `- ${item.quantity}x ${item.listing.title} @ ${priceSnapshot?.price_per_unit.toLocaleString("en-us")} aUEC each\n`;
    }
    message += `\n**Total:** ${totalPrice.toLocaleString("en-us")} aUEC\n`;

    if (request.buyer_note) {
      message += `\n**Buyer Note:** ${request.buyer_note}\n`;
    }

    // 8. Fetch complete listing objects for createOffer
    // Note: createOffer expects listings with full structure (aggregate/unique/multiple)
    const listingsForOffer = await Promise.all(
      listingsData.map(async (item) => {
        // Fetch complete listing with all related data
        const listing = await this.knex("listings as l")
          .leftJoin("listing_items as li", "l.listing_id", "li.listing_id")
          .leftJoin("game_items as gi", "li.game_item_id", "gi.game_item_id")
          .select(
            "l.*",
            "li.item_id",
            "li.game_item_id",
            "li.base_price",
            "li.pricing_mode",
            "gi.name as game_item_name",
            "gi.type as game_item_type"
          )
          .where("l.listing_id", item.listing_id)
          .first();

        // Return in the format expected by createOffer
        // For V2, we're treating all listings as "unique" type for simplicity
        return {
          quantity: item.quantity,
          listing: {
            listing: listing,
            details: [],
            images: [],
          } as any, // Type assertion to satisfy createOffer signature
        };
      })
    );

    // 9. Create offer using V1 helper
    // This creates offer session with chat, Discord thread, and notifications
    const { offer, session, discord_invite } = await createOffer(
      {
        customer_id: userId,
        assigned_id: firstSeller,
        contractor_id: firstContractor,
      },
      {
        actor_id: userId,
        kind: "Delivery",
        cost: (request.offer_amount !== undefined ? request.offer_amount : totalPrice).toString(),
        title: "Market Purchase",
        description: message,
      },
      listingsForOffer
    );

    // 10. Store V2 variant info for when offer is accepted
    // This allows initiateOrder to create order_market_items_v2 entries
    for (const item of request.items) {
      await this.knex("offer_market_items_v2").insert({
        offer_id: offer.id,
        listing_id: item.listing_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        created_at: this.knex.fn.now(),
      });
    }

    // 11. Return offer response
    return {
      offer_id: offer.id,
      session_id: session.id,
      discord_invite: discord_invite,
      total_price: Number(totalPrice),
    };
  }
}
