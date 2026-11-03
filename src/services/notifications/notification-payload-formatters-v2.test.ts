/**
 * Unit tests for V2 notification payload formatters
 * 
 * Requirements: 43.1-43.10
 */

import { describe, it, expect } from 'vitest'
import {
  formatMarketBidNotificationPayloadV2,
  formatBuyOrderMatchNotificationPayloadV2,
} from './notification-payload-formatters-v2.js'
import type {
  GetListingDetailResponse,
  VariantDetail,
} from '../../api/routes/v2/types/listings.types.js'
import type { PushNotificationPayload } from '../push-notifications/push-notification.service.types.js'

/**
 * Every formatter under test populates `data`, but PushNotificationPayload
 * declares it optional. Narrow it here rather than optional-chaining at each
 * assertion, so a formatter that stopped emitting `data` fails loudly instead of
 * silently comparing against undefined.
 */
function payloadData(
  payload: PushNotificationPayload,
): NonNullable<PushNotificationPayload['data']> {
  const { data } = payload
  if (!data) {
    throw new Error('notification payload is missing `data`')
  }
  return data
}

describe('notification-payload-formatters-v2', () => {
  // Mock listing data
  const mockListing: GetListingDetailResponse = {
    listing: {
      listing_id: 'listing-123',
      shop_id: 'shop-456',
      title: 'Test Listing',
      description: 'Test description',
      status: 'active',
      visibility: 'public',
      sale_type: 'fixed',
      listing_type: 'single',
      quantity_unit: 'unit',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    seller: {
      shop_id: 'shop-456',
      name: 'TestSeller',
      slug: 'test-seller',
      rating: 4.5,
      languages: ['en'],
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

  describe('formatMarketBidNotificationPayloadV2', () => {
    it('should format bid notification without variant', () => {
      const payload = formatMarketBidNotificationPayloadV2(mockListing, 45000)

      expect(payload.title).toBe('New Bid')
      expect(payload.body).toContain('Test Listing')
      expect(payload.body).toContain('45000 aUEC')
      expect(payloadData(payload).type).toBe('market_listing_v2')
      expect(payloadData(payload).action).toBe('market_item_bid_v2')
      expect(payloadData(payload).entityId).toBe('listing-123')
      expect(payloadData(payload).variantId).toBeUndefined()
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
      expect(payloadData(payload).variantId).toBe('variant-001')
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
      expect(payloadData(payload).type).toBe('buy_order_match_v2')
      expect(payloadData(payload).entityId).toBe('buy-order-123')
      expect(payloadData(payload).listingId).toBe('listing-456')
      expect(payloadData(payload).variantId).toBe('variant-001')
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

      expect(payloadData(payload).variantId).toBe('variant-001')
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

      expect(payloadData(payload).variantId).toBeUndefined()
      expect(payload.body).not.toContain('Diamond')
      expect(payload.body).not.toContain('Crafted')
    })

  })
})
