/**
 * Unit tests for Market Listings Models
 *
 * These tests verify that the TypeScript type definitions for market listings
 * are correctly structured and match the expected API response format.
 */

import { describe, it, expect } from "vitest"
import type {
  MarketListing,
  CreateMarketListingPayload,
  UpdateMarketListingPayload,
  MarketListingsResponse,
  MarketListingResponse,
  ListingStats,
  ListingStatsResponse,
  UpdateQuantityPayload,
  UpdateQuantityResponse,
  RefreshListingResponse,
  PlaceBidPayload,
  Bid,
  PlaceBidResponse,
  TrackViewResponse,
  UploadPhotosResponse,
} from "./market-listings.models.js"

describe("Market Listings Models", () => {
  describe("MarketListing", () => {
    it("should accept a valid market listing object", () => {
      const listing: MarketListing = {
        listing_id: "550e8400-e29b-41d4-a716-446655440000",
        listing_type: "unique",
        sale_type: "sale",
        status: "active",
        title: "Aegis Avenger Titan",
        description: "Great starter ship",
        item_type: "ship",
        item_name: "Aegis Avenger Titan",
        price: 50.0,
        quantity_available: 1,
        photos: ["https://cdn.sc-market.space/photo1.jpg"],
        user_seller_id: "user123",
        contractor_seller_id: null,
        internal: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }

      expect(listing.listing_id).toBe("550e8400-e29b-41d4-a716-446655440000")
      expect(listing.listing_type).toBe("unique")
      expect(listing.sale_type).toBe("sale")
      expect(listing.status).toBe("active")
      expect(listing.price).toBe(50.0)
    })

    it("should accept auction listing with optional fields", () => {
      const listing: MarketListing = {
        listing_id: "550e8400-e29b-41d4-a716-446655440000",
        listing_type: "unique",
        sale_type: "auction",
        status: "active",
        title: "Rare Ship",
        description: null,
        item_type: "ship",
        item_name: "Rare Ship",
        price: 100.0,
        quantity_available: 1,
        photos: [],
        user_seller_id: "user123",
        contractor_seller_id: null,
        internal: false,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        expires_at: "2024-12-31T23:59:59.000Z",
        minimum_bid_increment: 10.0,
        current_bid: 150.0,
      }

      expect(listing.sale_type).toBe("auction")
      expect(listing.expires_at).toBe("2024-12-31T23:59:59.000Z")
      expect(listing.minimum_bid_increment).toBe(10.0)
      expect(listing.current_bid).toBe(150.0)
    })
  })

  describe("CreateMarketListingPayload", () => {
    it("should accept a valid create payload", () => {
      const payload: CreateMarketListingPayload = {
        listing_type: "unique",
        sale_type: "sale",
        title: "New Listing",
        description: "Description",
        item_type: "ship",
        item_name: "Ship Name",
        price: 50.0,
        quantity_available: 1,
        photos: ["https://cdn.sc-market.space/photo1.jpg"],
        internal: false,
      }

      expect(payload.listing_type).toBe("unique")
      expect(payload.title).toBe("New Listing")
      expect(payload.price).toBe(50.0)
    })

    it("should accept auction payload with optional fields", () => {
      const payload: CreateMarketListingPayload = {
        listing_type: "unique",
        sale_type: "auction",
        title: "Auction Item",
        item_type: "ship",
        item_name: "Ship Name",
        price: 100.0,
        quantity_available: 1,
        expires_at: "2024-12-31T23:59:59.000Z",
        minimum_bid_increment: 10.0,
      }

      expect(payload.sale_type).toBe("auction")
      expect(payload.expires_at).toBe("2024-12-31T23:59:59.000Z")
      expect(payload.minimum_bid_increment).toBe(10.0)
    })
  })

  describe("UpdateMarketListingPayload", () => {
    it("should accept partial update payload", () => {
      const payload: UpdateMarketListingPayload = {
        title: "Updated Title",
        price: 55.0,
      }

      expect(payload.title).toBe("Updated Title")
      expect(payload.price).toBe(55.0)
    })

    it("should accept empty update payload", () => {
      const payload: UpdateMarketListingPayload = {}

      expect(Object.keys(payload).length).toBe(0)
    })
  })

  describe("MarketListingsResponse", () => {
    it("should accept a valid listings response", () => {
      const response: MarketListingsResponse = {
        data: {
          listings: [
            {
              listing_id: "550e8400-e29b-41d4-a716-446655440000",
              listing_type: "unique",
              sale_type: "sale",
              status: "active",
              title: "Listing 1",
              description: null,
              item_type: "ship",
              item_name: "Ship 1",
              price: 50.0,
              quantity_available: 1,
              photos: [],
              user_seller_id: "user123",
              contractor_seller_id: null,
              internal: false,
              created_at: "2024-01-01T00:00:00.000Z",
              updated_at: "2024-01-01T00:00:00.000Z",
            },
          ],
          total: 100,
          page: 1,
          limit: 20,
        },
      }

      expect(response.data.listings.length).toBe(1)
      expect(response.data.total).toBe(100)
      expect(response.data.page).toBe(1)
      expect(response.data.limit).toBe(20)
    })
  })

  describe("MarketListingResponse", () => {
    it("should accept a valid single listing response", () => {
      const response: MarketListingResponse = {
        data: {
          listing: {
            listing_id: "550e8400-e29b-41d4-a716-446655440000",
            listing_type: "unique",
            sale_type: "sale",
            status: "active",
            title: "Listing 1",
            description: null,
            item_type: "ship",
            item_name: "Ship 1",
            price: 50.0,
            quantity_available: 1,
            photos: [],
            user_seller_id: "user123",
            contractor_seller_id: null,
            internal: false,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
          },
        },
      }

      expect(response.data.listing.listing_id).toBe(
        "550e8400-e29b-41d4-a716-446655440000",
      )
    })
  })

  describe("ListingStats", () => {
    it("should accept valid listing stats", () => {
      const stats: ListingStats = {
        listing_id: "550e8400-e29b-41d4-a716-446655440000",
        views: 150,
        orders: 5,
        revenue: 250.0,
      }

      expect(stats.views).toBe(150)
      expect(stats.orders).toBe(5)
      expect(stats.revenue).toBe(250.0)
    })
  })

  describe("ListingStatsResponse", () => {
    it("should accept valid stats response", () => {
      const response: ListingStatsResponse = {
        data: {
          stats: [
            {
              listing_id: "550e8400-e29b-41d4-a716-446655440000",
              views: 150,
              orders: 5,
              revenue: 250.0,
            },
          ],
        },
      }

      expect(response.data.stats.length).toBe(1)
      expect(response.data.stats[0].views).toBe(150)
    })
  })

  describe("UpdateQuantityPayload", () => {
    it("should accept valid quantity update", () => {
      const payload: UpdateQuantityPayload = {
        quantity_available: 5,
      }

      expect(payload.quantity_available).toBe(5)
    })
  })

  describe("UpdateQuantityResponse", () => {
    it("should accept valid quantity update response", () => {
      const response: UpdateQuantityResponse = {
        data: {
          listing_id: "550e8400-e29b-41d4-a716-446655440000",
          quantity_available: 5,
        },
      }

      expect(response.data.quantity_available).toBe(5)
    })
  })

  describe("RefreshListingResponse", () => {
    it("should accept valid refresh response", () => {
      const response: RefreshListingResponse = {
        data: {
          listing_id: "550e8400-e29b-41d4-a716-446655440000",
          expires_at: "2024-12-31T23:59:59.000Z",
        },
      }

      expect(response.data.expires_at).toBe("2024-12-31T23:59:59.000Z")
    })
  })

  describe("PlaceBidPayload", () => {
    it("should accept valid bid payload", () => {
      const payload: PlaceBidPayload = {
        bid_amount: 100.0,
      }

      expect(payload.bid_amount).toBe(100.0)
    })
  })

  describe("Bid", () => {
    it("should accept valid bid object", () => {
      const bid: Bid = {
        bid_id: "550e8400-e29b-41d4-a716-446655440000",
        listing_id: "550e8400-e29b-41d4-a716-446655440000",
        user_id: "user123",
        bid_amount: 100.0,
        created_at: "2024-01-01T00:00:00.000Z",
      }

      expect(bid.bid_amount).toBe(100.0)
      expect(bid.user_id).toBe("user123")
    })
  })

  describe("PlaceBidResponse", () => {
    it("should accept valid bid response", () => {
      const response: PlaceBidResponse = {
        data: {
          bid: {
            bid_id: "550e8400-e29b-41d4-a716-446655440000",
            listing_id: "550e8400-e29b-41d4-a716-446655440000",
            user_id: "user123",
            bid_amount: 100.0,
            created_at: "2024-01-01T00:00:00.000Z",
          },
        },
      }

      expect(response.data.bid.bid_amount).toBe(100.0)
    })
  })

  describe("TrackViewResponse", () => {
    it("should accept valid track view response", () => {
      const response: TrackViewResponse = {
        data: {
          success: true,
        },
      }

      expect(response.data.success).toBe(true)
    })
  })

  describe("UploadPhotosResponse", () => {
    it("should accept valid upload photos response", () => {
      const response: UploadPhotosResponse = {
        data: {
          photos: [
            "https://cdn.sc-market.space/photo1.jpg",
            "https://cdn.sc-market.space/photo2.jpg",
          ],
        },
      }

      expect(response.data.photos.length).toBe(2)
      expect(response.data.photos[0]).toBe(
        "https://cdn.sc-market.space/photo1.jpg",
      )
    })
  })
})
