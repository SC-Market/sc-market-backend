/**
 * Every column in the schema that points at a user, and what the data export
 * (user-data-export.ts) does with the rows it identifies.
 *
 * `export`: the export section(s) holding those rows.
 * `exclude`: why the rows aren't exported for the referenced user.
 *
 * user-data-export.pg.test.ts introspects the migrated schema (foreign keys
 * to accounts plus user-like column names) and fails when a column is
 * missing here, so a new table holding personal data can't ship without a
 * decision. Columns that hold a secret are listed in SECRET_COLUMNS and
 * asserted absent from the export.
 */
export type ColumnClass = { export: string } | { exclude: string }

const STAFF =
  "staff/org-admin attribution on an org or site record, not the user's personal data"
const OTHERS = "another user's private data about this user"

export const PERSONAL_DATA_COLUMNS: Record<string, ColumnClass> = {
  "accounts.user_id": { export: "profile" },
  "accounts.spectrum_user_id": { export: "profile" },
  "account_settings.user_id": { export: "settings.privacy" },
  "user_preferences.user_id": { export: "settings.preferences" },
  "user_availability.user_id": { export: "availability" },
  "user_contractor_settings.user_id": { export: "org_memberships" },
  "dashboard_layouts.owner_id": { export: "dashboard_layouts" },
  "dashboard_layouts.updated_by": { exclude: STAFF },
  "user_feature_overrides.user_id": { export: "feature_flag_overrides" },
  "activity_history.user_id": { export: "activity_days" },

  "user_emails.user_id": { export: "emails" },
  "email_verification_tokens.user_id": {
    export: "email_verification_requests",
  },
  "email_unsubscribe_tokens.user_id": { export: "email_unsubscribe_links" },
  "email_delivery_log.user_id": { export: "emails_sent" },
  "email_notification_preferences.user_id": {
    export: "notification_preferences.email",
  },

  "account_providers.user_id": { export: "linked_accounts" },
  "account_integrations.user_id": { export: "integrations" },
  "discord_channel_setups.owner_id": { export: "discord_channels" },
  "order_alert_subscriptions.user_id": { export: "discord_order_alerts" },
  "contract_alert_subscriptions.user_id": { export: "contract_alerts" },
  "notification_webhooks.user_id": { export: "webhooks" },

  "refresh_tokens.user_id": { export: "refresh_tokens" },
  "user_mfa_factors.user_id": { export: "mfa_factors" },
  "user_mfa_recovery_codes.user_id": { export: "mfa_recovery_codes" },
  "user_mfa_events.user_id": { export: "mfa_events" },
  "user_mfa_events.actor_user_id": {
    export: "mfa_events (actor_username, for events on your own account)",
  },
  "api_tokens.user_id": { export: "api_tokens" },
  "scmdb_sync_tokens.user_id": { export: "scmdb_sync_tokens" },
  "scmdb_events.user_id": { export: "scmdb_events" },
  "test_login_events.user_id": { export: "test_login_events" },

  "notification.notifier_id": { export: "notifications" },
  "notification_change.actor_id": {
    exclude:
      "fan-out record that the user caused another user's notification; the action itself is exported in its own section",
  },
  "push_notification_preferences.user_id": {
    export: "notification_preferences.push",
  },
  "notification_channel_preferences.user_id": {
    export: "notification_preferences.channels",
  },
  "notification_channel_org_preferences.user_id": {
    export: "notification_preferences.channels_by_org",
  },
  "notification_org_mutes.user_id": { export: "notification_preferences.org_mutes" },
  "push_subscriptions.user_id": { export: "push_subscriptions" },
  "notification_deliveries.user_id": { export: "notification_deliveries" },
  "dm_reminder_log.user_id": { export: "dm_reminders" },

  "contractor_members.user_id": { export: "org_memberships" },
  "contractor_member_roles.user_id": { export: "org_memberships.roles" },
  "contractor_invites.user_id": { export: "org_invites" },
  "shops.owner_user_id": { export: "shops" },

  "chat_participants.user_id": { export: "chats" },
  "messages.author": { export: "messages" },

  "orders.customer_id": { export: "orders" },
  "orders.assigned_id": { export: "orders" },
  "offer_sessions.customer_id": { export: "offers" },
  "offer_sessions.assigned_id": { export: "offers" },
  "order_offers.actor_id": { export: "offers" },
  "order_comments.author": { export: "order_comments" },
  "order_applicants.user_applicant_id": { export: "order_applications" },
  "order_applicants.org_applicant_id": { exclude: "org id, not a user" },
  "order_response_times.assigned_user_id": { export: "order_response_times" },
  "stock_allocation_log.allocated_by": { export: "stock_allocations_made" },
  "order_stock_allocations_v2.allocated_by": {
    export: "order_stock_allocations_made",
  },
  "public_contracts.customer_id": { export: "public_contracts" },
  "services.user_id": { export: "services" },
  "services.assigned_id": { export: "services" },
  "transactions.user_sender_id": { export: "transactions" },
  "transactions.user_recipient_id": { export: "transactions" },
  "transactions.contractor_sender_id": { exclude: "org id, not a user" },
  "transactions.contractor_recipient_id": { exclude: "org id, not a user" },

  "listings.seller_id": { export: "listings" },
  "market_listings.user_seller_id": { export: "market_listings_v1" },
  "market_listings.contractor_seller_id": { exclude: "org id, not a user" },
  "market_multiples.user_seller_id": { export: "market_multiples_v1" },
  "market_multiples.contractor_seller_id": { exclude: "org id, not a user" },
  "market_listings_legacy.user_seller_id": { export: "legacy_market_listings" },
  "market_listings_legacy.contractor_seller_id": {
    exclude: "org id, not a user",
  },
  "market_aggregate_listings_legacy.user_seller_id": {
    export: "legacy_market_listings",
  },
  "market_aggregate_listings_legacy.contractor_seller_id": {
    exclude: "org id, not a user",
  },
  "market_multiple.user_seller_id": { export: "legacy_market_listings" },
  "market_multiple.contractor_seller_id": { exclude: "org id, not a user" },
  "listing_item_lots.owner_id": { export: "stock_lots" },
  "listing_item_lots.crafted_by": { export: "stock_lots" },
  "stock_lots.owner_id": { export: "stock_lots_v1" },
  "locations.created_by": { export: "custom_locations" },
  "bids_v2.bidder_id": { export: "bids" },
  "market_bids.user_bidder_id": { export: "bids" },
  "market_bids.contractor_bidder_id": { exclude: "org id, not a user" },
  "buy_orders_v2.buyer_id": { export: "buy_orders" },
  "buy_orders_v2.declined_by": {
    exclude:
      "the supplier who declined a buyer's order; that buyer's export has declined_at",
  },
  "market_buy_orders.buyer_id": { export: "buy_orders_v1" },
  "buy_order_fulfillments.seller_id": { export: "buy_order_fulfillments" },
  "cart_items_v2.user_id": { export: "cart" },

  "watchlist_items.user_id": { export: "watchlist" },
  "wishlists.user_id": { export: "wishlists" },
  "user_blueprint_inventory.user_id": { export: "blueprint_inventory" },
  "crafting_history.user_id": { export: "crafting_history" },
  "mission_completions.user_id": { export: "mission_completions" },
  "mission_ratings.user_id": { export: "mission_ratings" },
  "ships.owner": { export: "ships" },
  "ship_checkins.user_id": { export: "ship_checkins" },

  "order_reviews.user_author": {
    export: "reviews_given (and reviews_received as the author's username)",
  },
  "order_reviews.contractor_author": { exclude: "org id, not a user" },
  "shop_ratings.reviewer_id": {
    export:
      "shop_ratings_given (and shop_ratings_received as the reviewer's username)",
  },

  "comments.author": { export: "comments" },
  "comment_votes.actor_id": { export: "comment_votes" },
  "recruiting_votes.actor_id": { export: "recruiting_votes" },
  "blocklist.blocker_user_id": { export: "blocklist" },
  "blocklist.blocker_id": { export: "blocklist" },
  "blocklist.blocked_id": { exclude: OTHERS },
  "shop_blocklist.blocked_user_id": { exclude: OTHERS },
  "content_reports.reporter_id": { export: "content_reports" },
  "content_reports.handled_by": { exclude: STAFF },

  "listing_views.viewer_id": { export: "listing_views" },
  "listing_views_v2.viewer_id": { export: "listing_views_v2" },
  "audit_logs.actor_id": { export: "audit_log" },
  "audit_logs.subject_id": { export: "audit_log" },
  "audit_trail.actor_id": { export: "org_audit_trail" },

  "admin_alerts.created_by": { exclude: STAFF },
  "org_premium_tiers.granted_by": { exclude: STAFF },
  "org_themes.updated_by": { exclude: STAFF },
  "org_whitelabel_config.updated_by": { exclude: STAFF },
  "contractor_archive_details.archived_by": { exclude: STAFF },
}

/**
 * Columns that are secrets or credentials; never in the export.
 * login_sessions is keyed by `sess->passport->user`, not a column, so it's
 * listed here and exported as login_sessions (expiry only).
 */
export const SECRET_COLUMNS = [
  "accounts.discord_access_token",
  "accounts.discord_refresh_token",
  "account_providers.access_token",
  "account_providers.refresh_token",
  "api_tokens.token_hash",
  "refresh_tokens.token_hash",
  "login_sessions.sid",
  "push_subscriptions.p256dh",
  "push_subscriptions.auth",
  "push_subscriptions.endpoint",
  "user_mfa_factors.secret_ciphertext",
  "user_mfa_factors.public_data",
  "user_mfa_recovery_codes.code_hash",
  "email_verification_tokens.token",
  "email_unsubscribe_tokens.token",
  "scmdb_sync_tokens.token_hash",
  "notification_webhooks.webhook_url",
  "wishlists.share_token",
  "listing_views.session_id",
  "listing_views.viewer_ip_hash",
] as const
