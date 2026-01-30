import { PaymentTypes } from "../../api/routes/v1/types/payment-types.js"

export type OrderStatus =
  | "fulfilled"
  | "in-progress"
  | "not-started"
  | "cancelled"

export interface DBUser {
  discord_id: string | null
  user_id: string
  display_name: string
  profile_description: string
  role: "user" | "admin"
  banned: boolean
  username: string
  avatar: string
  banner: string
  balance: string
  created_at: Date
  locale: string

  rsi_confirmed: boolean
  spectrum_user_id: string | null
  discord_access_token?: string | null
  discord_refresh_token?: string | null
  official_server_id: string | null
  discord_thread_channel_id: string | null
  // discord_invite: string | null,

  market_order_template: string
  donor_start_date?: Date | null
  supported_languages: string[] | null // Array of ISO 639-1 language codes (default ['en'])
}

export interface DBAccountSettings {
  user_id: string
  discord_order_share: boolean
  discord_public: boolean
}

export interface MinimalUser {
  username: string
  avatar: string
  display_name: string
  rating: Rating
  badges?: BadgeData | null
  // discord_profile?: any
}

export interface DBOrderComment {
  author: string
  content: string
  order_id: string
  comment_id: string
  timestamp: Date
}

export interface DBReview {
  user_author: string | null
  contractor_author: string | null
  content: string
  order_id: string
  review_id: string
  timestamp: Date
  rating: number
  role: "customer" | "contractor"
  revision_requested: boolean
  revision_requested_at: Date | null
  last_modified_at: Date
  revision_message: string | null
}

export interface DBOrderApplicant {
  order_id: string
  user_applicant_id: string | null
  org_applicant_id: string | null
  timestamp: Date
  message: string
}

export interface OrderApplicantResponse {
  order_id: string
  user_applicant?: MinimalUser | null
  org_applicant?: MinimalContractor | null
  timestamp: Date
  message: string
}

export interface DBPost {
  post_id: string
  user_id: string
  caption: string
  description: string
}

export interface DBPostPhoto {
  post_id: string
  filename: string
}

export interface DBChat {
  chat_id: string
  icon: string
  name: string
  order_id: string
  session_id: string
}

export interface DBChatParticipant {
  chat_id: string
  user_id: string
}

export interface DBMessage {
  author: string | null
  chat_id: string
  timestamp: Date
  content: string
  attachments: string[]
  message_id: string
}

export interface DBFollow {
  user_id: string
  followed: string
}

export interface DBBlocklist {
  id: string
  blocker_id: string // DEPRECATED: Use blocker_user_id or blocker_contractor_id
  blocker_user_id: string | null
  blocker_contractor_id: string | null
  blocked_id: string
  blocker_type: "user" | "contractor"
  created_at: Date
  reason: string
}

export interface DBContractorMember {
  contractor_id: string
  user_id: string
  role: string
}

export interface DBContractorRole {
  name: string
  contractor_id: string
  position: number
  role_id: string
  manage_roles: boolean
  manage_orders: boolean
  kick_members: boolean
  manage_invites: boolean
  manage_org_details: boolean
  manage_stock: boolean
  manage_market: boolean
  manage_recruiting: boolean
  manage_webhooks: boolean
  manage_blocklist: boolean
}

export interface DBContractorMemberRole {
  user_id: string
  role_id: string
}

export interface DBContractorInvite {
  contractor_id: string
  user_id: string
  message: string
  timestamp: number
  invite_id: string
}

export interface DBContractor {
  contractor_id: string
  spectrum_id: string
  kind: string
  size: number
  name: string
  description: string
  avatar: string
  balance: string
  default_role: string
  owner_role: string
  official_server_id: string | null
  discord_thread_channel_id: string | null
  // discord_invite: string | null,
  banner: string
  market_order_template: string
  locale: string
  archived: boolean
  supported_languages: string[] | null // Array of ISO 639-1 language codes (default ['en'])
}

export interface DBContractorArchiveDetails {
  contractor_id: string
  archived_at: Date
  archived_by: string
  archived_label: string
  original_name: string
  original_spectrum_id: string | null
  reason: string | null
  member_count_removed: number
}

export interface Rating {
  avg_rating: number
  rating_count: number
  streak: number
  total_rating: number
  total_orders?: number // Optional - available in badge metadata
  response_rate?: number // Optional - available in badge metadata
  total_assignments?: number // Optional - available in badge metadata
}

export interface BadgeMetadata {
  avg_rating: number
  rating_count: number
  rating_streak: number
  total_orders: number
  fulfilled_orders: number
  total_assignments: number
  response_rate: number
  total_rating: number
  orders_last_30_days: number
  orders_last_90_days: number
  avg_completion_time_hours: number | null
  account_age_months: number
  account_created_at: string | null
  donor_duration_months: number | null
  calculated_at: string
}

export interface BadgeData {
  badge_ids: string[]
  metadata?: BadgeMetadata // Optional - only included in profile responses, not search results
}

export interface MinimalContractor {
  spectrum_id: string
  name: string
  avatar: string
  rating: Rating
  badges?: BadgeData | null
}

export interface DBImageResource {
  resource_id: string
  filename: string
  external_url?: string | null
}

export interface DBOrderSetting {
  id: string
  entity_type: "user" | "contractor"
  entity_id: string
  setting_type:
    | "offer_message"
    | "order_message"
    | "require_availability"
    | "stock_subtraction_timing"
    | "min_order_size"
    | "max_order_size"
    | "min_order_value"
    | "max_order_value"
  message_content: string
  enabled: boolean
  created_at: Date
  updated_at: Date
}

export interface DBOrder {
  order_id: string
  kind: string
  cost: string | number
  title: string
  description: string
  assigned_id: string | null
  customer_id: string
  contractor_id: string | null
  timestamp: Date
  status: string
  collateral?: string | number | null
  departure?: string | null
  destination?: string | null
  service_id: string
  rush: boolean
  payment_type: PaymentTypes
  thread_id: string | null
  offer_session_id: string | null
}

export interface OrderStub {
  order_id: string
  contractor: MinimalContractor | null
  assigned_to: MinimalUser | null
  customer: MinimalUser
  status: OrderStatus
  timestamp: string
  service_name: string | null
  cost: string
  title: string
  payment_type: string
  count: number
}

export interface DBOfferSession {
  id: string
  assigned_id: string | null
  customer_id: string
  contractor_id: string | null
  thread_id: string | null
  timestamp: Date
  status: string
  discord_invite: string | null
}

export interface DBOffer {
  id: string
  session_id: string
  kind: string
  cost: string
  title: string
  description: string
  timestamp: Date
  status: string
  collateral?: string | number | null
  service_id: string
  payment_type: PaymentTypes
  actor_id: string
}

export type DBOfferWithTimestamp = Omit<DBOffer, "timestamp"> & {
  timestamp: Date | string
}

export interface DBOfferMarketListing {
  listing_id: string
  offer_id: string
  quantity: number
}

export interface DBBuyOrder {
  buy_order_id: string
  game_item_id: string
  quantity: number
  price: number | null
  negotiable: boolean
  buyer_id: string
  expiry: Date
  fulfilled_timestamp: Date | null
  created_timestamp: Date
}

export interface DBPriceHistory {
  game_item_id: string
  price: number
  date: Date
  quantity_available: number
}

export interface DBService {
  service_id: string
  timestamp: Date
  service_name: string
  service_description: string
  title: string
  rush: boolean
  description: string
  kind: string | null
  collateral: number
  departure: string | null
  destination: string | null
  cost: number
  payment_type: PaymentTypes
  offer: number
  contractor_id?: string | null
  user_id?: string | null
  assigned_to?: string | null
  status: string
}

export interface DBNotificationWebhook {
  webhook_id: string
  contractor_id?: string | null
  user_id?: string | null
  name: string
  webhook_url: string
}

export interface DBWebhookActions {
  webhook_id: string
  action_type_id: string
}

export interface DBContractorInviteCode {
  contractor_id: string
  invite_id: string
  max_uses: number
  times_used: number
  timestamp: Date
}

export interface DBTransaction {
  transaction_id: string
  kind: string // e.g. transfer, payment, refund
  timestamp: Date
  amount: string
  status: string
  contractor_sender_id: string
  contractor_recipient_id: string
  user_sender_id: string
  user_recipient_id: string
}

export interface DBShip {
  ship_id: string
  size: string
  kind: string
  manufacturer: string
  owner: string
  name: string
}

export interface DBDelivery {
  ship_id: string
  location: string
  departure: string
  destination: string
  status: string
  progress: number
  delivery_id: string
  order_id: string | null
}

export interface DBShipCheckin {
  ship_id: string
  timestamp: Date
  location: string
  condition: string // e.g. good, damaged, destroyed
  status: string // e.g. docked, transit, etc
}

export interface DBMarketListing {
  listing_id: string
  sale_type: string
  price: number
  quantity_available: number
  status: string
  internal: boolean
  user_seller_id?: string | null
  contractor_seller_id?: string | null
  timestamp: Date
  expiration: Date
}

export interface DBMarketAggregate {
  game_item_id: string
  details_id: string
}

export interface DBMarketAggregateListing {
  aggregate_listing_id: string
  aggregate_id: string
}

export interface DBMarketMultiple {
  multiple_id: string
  user_seller_id: string | null
  contractor_seller_id: string | null
  details_id: string
  default_listing_id: string
}

export interface DBMarketMultipleListing {
  multiple_id: string
  multiple_listing_id: string
  details_id: string
}

export interface DBMarketListingImage {
  details_id: string
  resource_id: string
}

export interface DBServiceImage {
  service_id: string
  resource_id: string
}

export interface DBUniqueListing {
  listing_id: string
  accept_offers: boolean
  details_id: string
}

export type DBUniqueListingRaw = DBUniqueListing &
  DBMarketListing &
  DBMarketListingDetails

export type DBUniqueListingComplete = DBUniqueListing & {
  listing: DBMarketListing
  details: DBMarketListingDetails
  images: DBMarketListingImage[]
}

export type DBAggregateRaw = DBMarketAggregate & DBMarketListingDetails

export type DBAggregateComplete = DBMarketAggregate & {
  listings: DBMarketListing[]
  buy_orders: DBBuyOrder[]
  details: DBMarketListingDetails
  images: DBMarketListingImage[]
}

export type DBMultipleRaw = DBMarketMultiple & DBMarketListingDetails

export type DBMultipleComplete = DBMarketMultiple & {
  listings: DBMultipleListingComplete[]
  details: DBMarketListingDetails
  default_listing: DBMultipleListingComplete
}

export type DBAggregateListingRaw = DBMarketAggregate &
  DBMarketListing &
  DBMarketListingDetails

export type DBAggregateListingComplete = {
  listing: DBMarketListing
  aggregate: DBMarketAggregate
  details: DBMarketListingDetails
  images: DBMarketListingImage[]
}

export type DBMultipleListingRaw = DBMarketMultiple &
  DBMarketListing &
  DBMarketListingDetails & {
    multiple_details_id: string
  }

export type DBMultipleListingComplete = {
  listing: DBMarketListing
  details: DBMarketListingDetails
  images: DBMarketListingImage[]
}

export type DBMultipleListingCompositeComplete = {
  listing: DBMarketListing
  multiple: DBMarketMultiple
  details: DBMarketListingDetails
  images: DBMarketListingImage[]
}

export type DBMarketListingComplete =
  | DBUniqueListingComplete
  | DBAggregateListingComplete
  | DBMultipleListingCompositeComplete

export interface DBMarketOrder {
  listing_id: string
  order_id: string
  quantity: number
}

export interface DBMarketBid {
  bid_id: string
  user_bidder_id?: string
  contractor_bidder_id?: string
  listing_id: string
  timestamp: Date
  bid: number
}

export interface DBAuctionDetails {
  listing_id: string
  status: string
  minimum_bid_increment: number
  end_time: Date
  buyout_price: number
}

export interface DBMarketOffer {
  offer_id: string
  buyer_user_id?: string
  buyer_contractor_id?: string
  seller_user_id?: string
  seller_contractor_id?: string
  listing_id: string
  timestamp: Date
  offer: number
}

export interface DBMarketOfferListing {
  offer_id: string
  listing_id: string
  quantity: number
}

export interface DBNotification {
  notification_id: string
  notification_object_id: string
  notifier_id: string
  read: boolean
}

export interface DBNotificationActions {
  action_type_id: string
  action: string
  entity: string
}

export interface DBNotificationChange {
  notification_change_id: string
  actor_id: string
  notification_object_id: string
}

export interface DBNotificationObject {
  notification_object_id: string
  action_type_id: string
  entity_id: string
  timestamp: Date
}

export interface DBRecruitingPost {
  post_id: string
  contractor_id: string
  title: string
  body: string
  timestamp: Date
}

export interface DBRecruitingVote {
  post_id: string
  actor_id: string
  upvote: boolean
  timestamp: Date
}

export interface DBAdminAlert {
  alert_id: string
  title: string
  content: string
  link: string | null
  target_type:
    | "all_users"
    | "org_members"
    | "org_owners"
    | "admins_only"
    | "specific_org"
  target_contractor_id: string | null
  created_by: string
  created_at: Date
  active: boolean
}

export interface DBComment {
  author: string
  content: string
  comment_id: string
  timestamp: Date
  reply_to: string
  deleted: boolean
}

export interface DBCommentVote {
  comment_id: string
  actor_id: string
  upvote: boolean
  timestamp: Date
}

export interface AvailabilitySpan {
  start: number
  finish: number
}

export interface AvailabilityBody {
  contractor: string | null
  selections: AvailabilitySpan[]
}

export interface DBAvailabilityEntry {
  contractor_id: string | null
  user_id: string
  start: number
  finish: number
}

export interface DBMarketListingDetailsBase {
  details_id: string
  item_type: string
  game_item_id: string | null
  title: string
  description: string
}

export interface DBMarketListingDetails {
  details_id: string
  item_type: string
  item_name: string | null
  game_item_id: string | null
  title: string
  description: string
}

export interface DBMarketSearchResult {
  listing_id: string
  listing_type: string
  item_type: string
  sale_type: string
  price: string
  minimum_price: string
  maximum_price: string
  quantity_available: number
  title: string
  photo: string
  timestamp: Date
  full_count: number
  status: string
  total_rating: number
  avg_rating: number
  rating_count: number | null
  rating_streak: number | null
  total_orders: number | null
  // Add responsive badge data
  total_assignments: number | null
  response_rate: number | null
  contractor_seller_id: string | null
  user_seller_id: string | null
  auction_end_time: Date | null
  // Seller information from the database view
  user_seller: string | null
  contractor_seller: string | null
  // Additional fields from the view
  item_name: string | null
  game_item_id: string | null
  expiration: Date | null
  details_id: string | null
  internal: boolean
  // Badge data (optional, added via join)
  badges?: BadgeData | null
}

export interface DBMarketCategory {
  category: string
  subcategory: string
}

export interface DBMarketItem {
  type: string
  name: string
  id: string
  details_id: string
  description: string | null
}

export interface DBContentReport {
  report_id: string
  reporter_id: string
  reported_url: string
  report_reason?: string
  report_details?: string
  status: "pending" | "in_progress" | "resolved" | "dismissed"
  created_at: Date
  handled_at?: Date
  handled_by?: string
  notes?: string
}

export interface DBAccountProvider {
  id: string
  user_id: string
  provider_type: string
  provider_id: string
  access_token: string | null
  refresh_token: string | null
  token_expires_at: Date | null
  metadata: Record<string, any> | null
  is_primary: boolean
  linked_at: Date
  last_used_at: Date | null
}

export interface DBAccountIntegration {
  id: string
  user_id: string
  integration_type: string
  settings: Record<string, any>
  enabled: boolean
  configured_at: Date
  last_used_at: Date | null
}

export interface DBUserEmail {
  email_id: string
  user_id: string
  email: string
  email_verified: boolean
  is_primary: boolean
  created_at: Date
  updated_at: Date
  verified_at: Date | null
}
