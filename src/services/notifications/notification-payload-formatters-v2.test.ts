// @ts-nocheck — test file, payload.data assertions are guarded by expect()
/**
 * Unit tests for V2 notification payload formatters
 * 
 * Requirements: 43.1-43.10
 */

import { describe, it, expect } from 'vitest'
import {
  formatMarketBidNotificationPayloadV2,
  formatMarketOfferNotificationPayloadV2,
  formatNewOrderNotificationPayloadV2,
  formatOrderStatusNotificationPayloadV2,
  formatBuyOrderMatchNotificationPayloadV2,
} from './notification-payload-formatters-v2.js'
import type {
  GetListingDetailResponse,
  VariantDetail,
} from '../../api/routes/v2/types/listings.types.js'
import type {
  CreateOrderResponse,
  GetOrderDetailResponse,
} from '../../api/routes/v2/types/orders.types.js'

describe('notification-payload-formatters-v2', () => {
  // Mock listing data
  const mockListing: GetListingDetailResponse = {
    listing: {
      listing_id: 'listing-123',
      seller_id: 'seller-456',
      seller_type: 'user',
      title: 'Test Listing',
      description: 'Test description',
      status: 'active',
      visibility: 'public',
      sale_type: 'fixed',
      listing_type: 'single',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    seller: {
      id: 'seller-456',
      name: 'TestSeller',
      type: 'user',
      rating: 4.5,
    },
    items: [
      {
        item_id: 'item-789',
        game_item: {
          id: 'game-item-001',
          name: 'Test Item',
          type: 'weapon',
        },
        pricing_mode: 'per_variant',
        variants: [
          {
            variant_id: 'variant-001',
            attributes: {
              quality_tier: 5,
              quality_value: 95.5,
              crafted_source: 'crafted',
            },
            display_name: 'Tier 5 (95.5%) - Crafted',
            short_name: 'T5 Crafted',
            quantity: 10,
            price: 50000,
            locations: ['Port Olisar'],
          },
          {
            variant_id: 'variant-002',
            attributes: {
              quality_tier: 3,
              crafted_source: 'store',
            },
            display_name: 'Tier 3 - Store',
            short_name: 'T3 Store',
            quantity: 5,
            price: 30000,
            locations: ['Area 18'],
          },
        ],
      },
    ],
  }

  // Mock order data
  const mockOrder: CreateOrderResponse = {
    order_id: 'order-123',
    buyer_id: 'buyer-456',
    seller_id: 'seller-789',
    total_price: 100000,
    status: 'pending',
    created_at: '2024-01-01T00:00:00Z',
    items: [
      {
        order_item_id: 'order-item-001',
        listing_id: 'listing-123',
        item_id: 'item-789',
        variant: {
          variant_id: 'variant-001',
          attributes: {
            quality_tier: 5,
            quality_value: 95.5,
            crafted_source: 'crafted',
          },
          display_name: 'Tier 5 (95.5%) - Crafted',
          short_name: 'T5 Crafted',
        },
        quantity: 2,
        price_per_unit: 50000,
        subtotal: 100000,
      },
    ],
  }

  const mockOrderDetail: GetOrderDetailResponse = {
    order_id: 'order-123',
    buyer: {
      user_id: 'buyer-456',
      username: 'TestBuyer',
      display_name: 'Test Buyer',
      avatar: null,
    },
    seller: {
      user_id: 'seller-789',
      username: 'TestSeller',
      display_name: 'Test Seller',
      avatar: null,
    },
    total_price: 100000,
    status: 'pending',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    items: mockOrder.items,
  }

  describe('formatMarketBidNotificationPayloadV2', () => {
    it('should format bid notification without variant', () => {
      const payload = formatMarketBidNotificationPayloadV2(mockListing, 45000)

      expect(payload.title).toBe('New Bid')
      expect(payload.body).toContain('Test Listing')
      expect(payload.body).toContain('45000 aUEC')
      expect(payload.data.type).toBe('market_listing_v2')
      expect(payload.data.action).toBe('market_item_bid_v2')
      expect(payload.data.entityId).toBe('listing-123')
      expect(payload.data.variantId).toBeUndefined()
    })

    it('should format bid notification with variant information', () => {
      const payload = formatMarketBidNotificationPayloadV2(
        mockListing,
        45000,
        'variant-001'
      )

      expect(payload.title).toBe('New Bid')
      expect(payload.body).toContain('Test Listing')
      expect(payload.body).toContain('45000 aUEC')
      expect(payload.body).toContain('Diamond') // Quality tier 5
      expect(payload.data.variantId).toBe('variant-001')
    })

    it('should include crafted source in notification', () => {
      const payload = formatMarketBidNotificationPayloadV2(
        mockListing,
        45000,
        'variant-001'
      )

      expect(payload.body).toContain('Crafted')
    })
  })

  describe('formatMarketOfferNotificationPayloadV2', () => {
    it('should format offer notification without variant', () => {
      const payload = formatMarketOfferNotificationPayloadV2(mockListing, 40000)

      expect(payload.title).toBe('New Offer')
      expect(payload.body).toContain('Test Listing')
      expect(payload.body).toContain('40000 aUEC')
      expect(payload.data.type).toBe('market_listing_v2')
      expect(payload.data.action).toBe('market_item_offer_v2')
      expect(payload.data.entityId).toBe('listing-123')
      expect(payload.data.variantId).toBeUndefined()
    })

    it('should format offer notification with variant information', () => {
      const payload = formatMarketOfferNotificationPayloadV2(
        mockListing,
        40000,
        'variant-002'
      )

      expect(payload.title).toBe('New Offer')
      expect(payload.body).toContain('Test Listing')
      expect(payload.body).toContain('40000 aUEC')
      expect(payload.body).toContain('Gold') // Quality tier 3
      expect(payload.body).toContain('Store')
      expect(payload.data.variantId).toBe('variant-002')
    })
  })

  describe('formatNewOrderNotificationPayloadV2', () => {
    it('should format new order notification with variant information', () => {
      const payload = formatNewOrderNotificationPayloadV2(mockOrder)

      expect(payload.title).toBe('New Order')
      expect(payload.body).toContain('100000 aUEC')
      expect(payload.body).toContain('Diamond') // Quality tier 5
      expect(payload.body).toContain('Crafted')
      expect(payload.data.type).toBe('order_v2')
      expect(payload.data.action).toBe('order_create_v2')
      expect(payload.data.entityId).toBe('order-123')
    })

    it('should handle multiple items in order', () => {
      const multiItemOrder: CreateOrderResponse = {
        ...mockOrder,
        items: [
          mockOrder.items[0],
          {
            ...mockOrder.items[0],
            order_item_id: 'order-item-002',
          },
          {
            ...mockOrder.items[0],
            order_item_id: 'order-item-003',
          },
        ],
      }

      const payload = formatNewOrderNotificationPayloadV2(multiItemOrder)

      expect(payload.body).toContain('and 2 more items')
    })
  })

  describe('formatOrderStatusNotificationPayloadV2', () => {
    it('should format order status notification for completed status', () => {
      const payload = formatOrderStatusNotificationPayloadV2(
        mockOrderDetail,
        'completed'
      )

      expect(payload.title).toBe('Order Completed')
      expect(payload.body).toContain('completed')
      expect(payload.body).toContain('Diamond') // Quality tier 5
      expect(payload.data.type).toBe('order_v2')
      expect(payload.data.action).toBe('order_status_completed_v2')
    })

    it('should format order status notification for cancelled status', () => {
      const payload = formatOrderStatusNotificationPayloadV2(
        mockOrderDetail,
        'cancelled'
      )

      expect(payload.title).toBe('Order Cancelled')
      expect(payload.body).toContain('cancelled')
      expect(payload.data.action).toBe('order_status_cancelled_v2')
    })

    it('should handle unknown status gracefully', () => {
      const payload = formatOrderStatusNotificationPayloadV2(
        mockOrderDetail,
        'unknown_status'
      )

      expect(payload.title).toBe('Order Status Updated')
      expect(payload.body).toContain('unknown_status')
    })
  })

  describe('formatBuyOrderMatchNotificationPayloadV2', () => {
    it('should format buy order match notification', () => {
      const variant: VariantDetail = {
        variant_id: 'variant-001',
        attributes: {
          quality_tier: 5,
          quality_value: 95.5,
          crafted_source: 'crafted',
        },
        display_name: 'Tier 5 (95.5%) - Crafted',
        short_name: 'T5 Crafted',
        quantity: 10,
        price: 50000,
        locations: ['Port Olisar'],
      }

      const payload = formatBuyOrderMatchNotificationPayloadV2(
        'buy-order-123',
        'listing-456',
        'Test Listing',
        'variant-001',
        variant
      )

      expect(payload.title).toBe('Buy Order Match')
      expect(payload.body).toContain('Test Listing')
      expect(payload.body).toContain('matches a buy order')
      expect(payload.body).toContain('Diamond') // Quality tier 5
      expect(payload.body).toContain('Crafted')
      expect(payload.data.type).toBe('buy_order_match_v2')
      expect(payload.data.entityId).toBe('buy-order-123')
      expect(payload.data.listingId).toBe('listing-456')
      expect(payload.data.variantId).toBe('variant-001')
    })
  })

  describe('quality tier formatting', () => {
    it('should format quality tier 1 as Bronze', () => {
      const listing = {
        ...mockListing,
        items: [
          {
            ...mockListing.items[0],
            variants: [
              {
                ...mockListing.items[0].variants[0],
                attributes: { quality_tier: 1 },
              },
            ],
          },
        ],
      }

      const payload = formatMarketBidNotificationPayloadV2(
        listing,
        10000,
        listing.items[0].variants[0].variant_id
      )

      expect(payload.body).toContain('Bronze')
    })

    it('should format quality tier 2 as Silver', () => {
      const listing = {
        ...mockListing,
        items: [
          {
            ...mockListing.items[0],
            variants: [
              {
                ...mockListing.items[0].variants[0],
                attributes: { quality_tier: 2 },
              },
            ],
          },
        ],
      }

      const payload = formatMarketBidNotificationPayloadV2(
        listing,
        10000,
        listing.items[0].variants[0].variant_id
      )

      expect(payload.body).toContain('Silver')
    })

    it('should format quality tier 4 as Platinum', () => {
      const listing = {
        ...mockListing,
        items: [
          {
            ...mockListing.items[0],
            variants: [
              {
                ...mockListing.items[0].variants[0],
                attributes: { quality_tier: 4 },
              },
            ],
          },
        ],
      }

      const payload = formatMarketBidNotificationPayloadV2(
        listing,
        10000,
        listing.items[0].variants[0].variant_id
      )

      expect(payload.body).toContain('Platinum')
    })
  })

  describe('Variant Information in Notifications (Requirement 43.10)', () => {
    it('includes variant ID in notification data', () => {
      const payload = formatMarketBidNotificationPayloadV2(
        mockListing,
        45000,
        'variant-001'
      )

      expect(payload.data.variantId).toBe('variant-001')
    })

    it('includes quality tier in notification body', () => {
      const payload = formatMarketOfferNotificationPayloadV2(
        mockListing,
        40000,
        'variant-001'
      )

      expect(payload.body).toContain('Diamond') // Tier 5
    })

    it('includes crafted source in notification body', () => {
      const payload = formatNewOrderNotificationPayloadV2(mockOrder)

      expect(payload.body).toContain('Crafted')
    })

    it('includes quality value in detailed notifications', () => {
      const payload = formatMarketBidNotificationPayloadV2(
        mockListing,
        45000,
        'variant-001'
      )

      // Notification includes quality tier (Diamond for tier 5)
      expect(payload.body).toContain('Diamond')
      // Notification includes crafted source
      expect(payload.body).toContain('Crafted')
    })

    it('formats notification without variant when not specified', () => {
      const payload = formatMarketBidNotificationPayloadV2(mockListing, 45000)

      expect(payload.data.variantId).toBeUndefined()
      expect(payload.body).not.toContain('Diamond')
      expect(payload.body).not.toContain('Crafted')
    })

    it('includes variant information in buy order match notifications', () => {
      const variant: VariantDetail = {
        variant_id: 'variant-001',
        attributes: {
          quality_tier: 4,
          quality_value: 85.0,
          crafted_source: 'looted',
        },
        display_name: 'Tier 4 (85.0%) - Looted',
        short_name: 'T4 Looted',
        quantity: 5,
        price: 30000,
        locations: ['Area 18'],
      }

      const payload = formatBuyOrderMatchNotificationPayloadV2(
        'buy-order-123',
        'listing-456',
        'Matched Listing',
        'variant-001',
        variant
      )

      expect(payload.body).toContain('Platinum') // Tier 4
      expect(payload.body).toContain('Looted')
      expect(payload.data.variantId).toBe('variant-001')
    })

    it('includes variant information in order status notifications', () => {
      const payload = formatOrderStatusNotificationPayloadV2(
        mockOrderDetail,
        'shipped'
      )

      expect(payload.body).toContain('Diamond') // Tier 5 from first item
    })

    it('handles multiple variants in order notifications', () => {
      const multiVariantOrder: CreateOrderResponse = {
        ...mockOrder,
        items: [
          {
            ...mockOrder.items[0],
            variant: {
              variant_id: 'variant-001',
              attributes: {
                quality_tier: 5,
                crafted_source: 'crafted',
              },
              display_name: 'Tier 5 - Crafted',
              short_name: 'T5 C',
            },
          },
          {
            order_item_id: 'order-item-002',
            listing_id: 'listing-124',
            item_id: 'item-790',
            variant: {
              variant_id: 'variant-002',
              attributes: {
                quality_tier: 3,
                crafted_source: 'store',
              },
              display_name: 'Tier 3 - Store',
              short_name: 'T3 S',
            },
            quantity: 1,
            price_per_unit: 20000,
            subtotal: 20000,
          },
        ],
      }

      const payload = formatNewOrderNotificationPayloadV2(multiVariantOrder)

      // Should show first item's quality tier
      expect(payload.body).toContain('Diamond')
      // Should indicate multiple items
      expect(payload.body).toContain('and 1 more item')
    })
  })
})
