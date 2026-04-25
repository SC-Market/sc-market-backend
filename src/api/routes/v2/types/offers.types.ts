import { VariantAttributes } from './listings.types.js';
import { MinimalUser, MinimalContractor, Rating, DBAvailabilityEntry } from '../../../../clients/database/db-models.js';

export interface OfferAvailability {
  customer: DBAvailabilityEntry[] | null;
  assigned: DBAvailabilityEntry[] | null;
}

/** V2 serialization of an offer session with variant-enriched market listings */
export interface OfferSessionV2 {
  session_id: string;
  status: string;
  created_at: string;
  order_id?: string;
  contract_id?: string | null;
  discord_thread_id?: string | null;
  discord_server_id?: string | null;
  discord_invite?: string | null;
  customer: MinimalUser;
  assigned_to: MinimalUser | null;
  contractor: MinimalContractor | null;
  offers: OfferV2[];
  availability?: OfferAvailability | null;
}

export interface OfferV2 {
  offer_id: string;
  kind: string;
  cost: number;
  title: string;
  description: string;
  payment_type: string;
  status: string;
  created_at: string;
  collateral?: number;
  /** Username of the user who created this offer */
  actor_username: string;
  /** V1 market listings from offer_market_items (empty when V2 data exists) */
  market_listings: OfferMarketListingV1[];
  /** V2 market listings with variant data from offer_market_items_v2 */
  market_listings_v2: OfferMarketListingV2[];
  service?: { service_id: string; title: string } | null;
}

export interface OfferMarketListingV1 {
  listing_id: string;
  quantity: number;
  title: string;
  price: number;
}

export interface OfferMarketListingV2 {
  listing_id: string;
  quantity: number;
  title: string;
  price: number;
  /** First photo URL */
  photo?: string;
  /** V2 variant items for this listing */
  v2_variants: OfferVariantItem[];
}

export interface OfferVariantItem {
  variant_id: string;
  quantity: number;
  price_per_unit: number;
  attributes: VariantAttributes;
  display_name: string;
  short_name: string;
}

export interface GetOfferSessionV2Response extends OfferSessionV2 {}

export interface SearchOffersV2Response {
  offers: OfferSessionV2[];
  total: number;
  page: number;
  page_size: number;
}
