import { VariantAttributes } from './listings.types.js';

/** V2 serialization of an offer session with variant-enriched market listings */
export interface OfferSessionV2 {
  session_id: string;
  status: string;
  created_at: string;
  order_id?: string;
  discord_invite?: string | null;
  customer: UserSummary;
  assigned_to: UserSummary | null;
  contractor: OrgSummary | null;
  offers: OfferV2[];
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
  /** Username of the user who created this offer */
  actor_username: string;
  /** V1 market listings (always present) */
  market_listings: OfferMarketListingV2[];
  service?: { service_id: string; title: string } | null;
}

export interface OfferMarketListingV2 {
  listing_id: string;
  quantity: number;
  title: string;
  price: number;
  /** V2 variant items for this listing (empty if no V2 data) */
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

export interface UserSummary {
  username: string;
  display_name?: string;
  avatar?: string | null;
}

export interface OrgSummary {
  spectrum_id: string;
  name: string;
  avatar?: string | null;
}

export interface GetOfferSessionV2Response extends OfferSessionV2 {}

export interface SearchOffersV2Response {
  offers: OfferSessionV2[];
  total: number;
  page: number;
  page_size: number;
}
