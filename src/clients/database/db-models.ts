export type OrderStatus =
  | "fulfilled"
  | "in-progress"
  | "not-started"
  | "cancelled"

export interface DBUser {
  discord_id: string
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

  rsi_confirmed: boolean
  discord_access_token?: string | null
  discord_refresh_token?: string | null
  official_server_id: string | null
  discord_thread_channel_id: string | null
  // discord_invite: string | null,
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
  manage_discord_integration: boolean
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
}

export interface Rating {
  avg_rating: number
  rating_count: number
  streak: number
  total_orders: number
}

export interface MinimalContractor {
  spectrum_id: string
  name: string
  avatar: string
  rating: Rating
}

export interface DBImageResource {
  resource_id: string
  filename: string
  external_url?: string | null
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
  payment_type: "one-time" | "hourly" | "daily"
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
  payment_type: "one-time" | "hourly" | "daily"
  actor_id: string
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
  price: number
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
  payment_type: "one-time" | "hourly" | "daily"
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
  contractor_seller_id: string | null
  user_seller_id: string | null
  auction_end_time: Date | null
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
}
