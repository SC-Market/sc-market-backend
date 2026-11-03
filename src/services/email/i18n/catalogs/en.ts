/** English email strings: the reference catalog (see ../index.ts). */
const en = {
  // Base layout: footer and the one-time defaults notice.
  "layout.unsubscribe": "Unsubscribe",
  "layout.manage_preferences": "Manage Preferences",
  "layout.defaults_notice": "We turned on email for order updates, offers and unread messages. Turn off with one click:",
  "layout.turn_off": "Turn these emails off",

  // Shared lines and labels.
  "common.greeting": "Hello {name},",
  "common.status": "Status:",
  "common.value": "Value:",
  "common.rating": "Rating:",
  "common.message": "Message:",
  "common.subdomain": "Subdomain:",
  "common.offer_number": "Offer #{id}",
  "common.untitled": "Untitled",
  "common.view_order": "View Order",
  "common.view_offer": "View Offer",
  "common.view_listing": "View Listing",
  "common.and_more": "…and {count} more",
  "common.duration_days_one": "{count} day",
  "common.duration_days_other": "{count} days",
  "common.duration_hours_one": "{count} hour",
  "common.duration_hours_other": "{count} hours",

  // Order and offer statuses, as the site names them.
  "status.order.not-started": "Queued",
  "status.order.in-progress": "Being fulfilled",
  "status.order.fulfilled": "Fulfilled",
  "status.order.cancelled": "Cancelled",
  "status.offer.active": "Active",
  "status.offer.closed": "Closed",

  // account_identity_changed: an admin changed your account's identity (security notice, mandatory).
  "account_identity_changed.subject.username_released": "Your SC Market username was changed",
  "account_identity_changed.subject.discord_unlinked": "Discord was unlinked from your SC Market account",
  "account_identity_changed.subject.spectrum_cleared": "Your RSI account link was removed",
  "account_identity_changed.subject.spectrum_set": "Your RSI account link was updated",
  "account_identity_changed.subject.account_deactivated": "Your SC Market account was deactivated",
  "account_identity_changed.subject.discord_link_skipped": "Your Discord wasn't linked to SC Market",
  "account_identity_changed.subject.account_reactivated": "Your SC Market account was reactivated",
  "account_identity_changed.body.username_released":
    "An admin released your username. Your username is now {username}. Use Sync handle in Settings to get your current RSI handle back.",
  "account_identity_changed.body.discord_unlinked":
    "An admin unlinked Discord from your account. You can link a Discord account again in Settings.",
  "account_identity_changed.body.spectrum_cleared":
    "An admin removed the RSI link from your account. Verify your RSI account again in Settings.",
  "account_identity_changed.body.spectrum_set": "An admin updated the RSI link on your account.",
  "account_identity_changed.body.account_deactivated": "An admin deactivated your account.",
  "account_identity_changed.body.discord_link_skipped":
    "Your Discord account is already linked to another SC Market account, so it wasn't linked to this one. If both accounts are yours, contact SC Market support.",
  "account_identity_changed.body.account_reactivated": "An admin reactivated your account.",
  "account_identity_changed.security_note":
    "This is a security notice about your SC Market account, so it is sent even if you turned email notifications off. If you didn't expect it, contact SC Market support.",
  "account_identity_changed.action": "Open Settings",

  // admin_alert
  "admin_alert.subject": "Admin Alert",
  "admin_alert.preheader": "You have a new admin alert: {title}",
  "admin_alert.heading": "Admin Alert",
  "admin_alert.intro": "You have a new admin alert:",
  "admin_alert.action": "View Alert",

  // buy_order_filled: a seller filled your buy order (also its push).
  "buy_order_filled.subject": "Your buy order was filled",
  "buy_order_filled.body": "{seller} filled your buy order: {quantity} × {item} for {total} aUEC. An order has been created for it.",
  "buy_order_filled.open": "{remaining} more still wanted: your buy order stays open.",
  "buy_order_filled.complete": "Your buy order is now complete.",
  "buy_order_filled.action": "View order",

  // listing_paused_by_wipe: the admin's wipe paused your listings (also its push and Discord DM).
  "listing_paused_by_wipe.subject": "Your listings were paused for the wipe",
  "listing_paused_by_wipe.body": "Your listings were paused for the wipe. Relist them in one tap.",
  "listing_paused_by_wipe.tap": "Relist them in one tap.",
  "listing_paused_by_wipe.action": "Relist my listings",

  // contract_offer_received
  "contract_offer_received.subject": "New Offer on Your Contract",
  "contract_offer_received.preheader": "Someone made an offer on your public contract.",
  "contract_offer_received.heading": "New Offer on Your Contract",
  "contract_offer_received.intro": "Someone made an offer on your public contract:",

  // contractor_invite: an org invited you.
  "contractor_invite.subject": "Contractor Invitation",
  "contractor_invite.preheader": "You have been invited to join {org}.",
  "contractor_invite.heading": "Contractor Invitation",
  "contractor_invite.intro": "You have been invited to join a contractor organization.",
  "contractor_invite.action": "View Invitation",

  // counter_offer_create
  "counter_offer_create.subject": "Counter Offer Received",
  "counter_offer_create.preheader": "You received a counter offer.",
  "counter_offer_create.heading": "Counter Offer Received",
  "counter_offer_create.intro": "A counter offer has been created:",

  // dm_reminder: messages unread for a few hours.
  "dm_reminder.subject.single": "You have an unread message on SC Market",
  "dm_reminder.subject.multiple_other": "You have unread messages in {count} conversations on SC Market",
  "dm_reminder.heading": "Unread messages",
  "dm_reminder.body.single": "A conversation on SC Market has a message waiting for your reply.",
  "dm_reminder.body.multiple_other": "{count} conversations on SC Market have messages waiting for your reply.",
  "dm_reminder.nudge": "Don't leave your trading partners hanging: a quick reply keeps the trade moving.",
  "dm_reminder.action": "View messages",

  // market_item_bid
  "market_item_bid.subject": "New Bid on Market Listing",
  "market_item_bid.preheader": "Someone placed a bid on \"{title}\".",
  "market_item_bid.heading": "New Bid on Market Listing",
  "market_item_bid.intro": "Someone placed a bid on your market listing:",
  "market_item_bid.amount": "Bid Amount:",

  // market_item_offer
  "market_item_offer.subject": "New Offer on Market Listing",
  "market_item_offer.preheader": "Someone made an offer on \"{title}\".",
  "market_item_offer.heading": "New Offer on Market Listing",
  "market_item_offer.intro": "Someone made an offer on your market listing:",
  "market_item_offer.amount": "Offer Amount:",

  // offer_accepted
  "offer_accepted.subject": "Offer Accepted",
  "offer_accepted.preheader": "Your offer was accepted.",
  "offer_accepted.heading": "Offer Accepted",
  "offer_accepted.intro": "Your offer was accepted:",

  // offer_create
  "offer_create.subject": "New Offer Created",
  "offer_create.preheader": "A new offer has been created.",
  "offer_create.heading": "New Offer Created",
  "offer_create.intro": "A new offer has been created:",

  // offer_message
  "offer_message.subject": "New Message on Offer",
  "offer_message.preheader": "{author} sent a message on your offer.",
  "offer_message.heading": "New Message on Offer",
  "offer_message.intro": "A new message has been sent on your offer:",
  "offer_message.sent": "<b>{author}</b> sent a message:",

  // offer_pending_reminder: offers waiting for the seller side's reply (first nudge).
  "offer_pending_reminder.subject.single": "An offer is waiting for your reply",
  "offer_pending_reminder.subject.multiple_other": "{count} offers are waiting for your reply",
  "offer_pending_reminder.body.single":
    "{buyer} has waited {waited} for a reply to \"{title}\". Accept, decline, counter or reply in the chat.",
  "offer_pending_reminder.body.multiple_other": "{count} buyers are waiting for a reply. Accept, decline, counter or reply in the chat.",
  "offer_pending_reminder.action": "Reply to the Offer",

  // offer_pending_final_reminder: the last nudge, before the buyer is told.
  "offer_pending_final_reminder.subject.single": "Last reminder: an offer is still waiting for your reply",
  "offer_pending_final_reminder.subject.multiple_other": "Last reminder: {count} offers are still waiting for your reply",
  "offer_pending_final_reminder.body.single":
    "{buyer} has waited {waited} for a reply to \"{title}\". If it stays unanswered, the buyer will be told it's still waiting.",
  "offer_pending_final_reminder.body.multiple_other":
    "{count} buyers are waiting for a reply. If they stay unanswered, the buyers will be told they're still waiting.",
  "offer_pending_final_reminder.action": "Reply to the Offer",

  // offer_waiting_buyer: to the buyer, the seller hasn't replied.
  "offer_waiting_buyer.subject.single": "Your offer is still waiting for the seller",
  "offer_waiting_buyer.subject.multiple_other": "{count} of your offers are still waiting for the seller",
  "offer_waiting_buyer.body.single":
    "{seller} hasn't replied to \"{title}\" in {waited}. Keep waiting, message the seller, or withdraw the offer.",
  "offer_waiting_buyer.body.multiple": "The sellers haven't replied in a few days. Keep waiting, message them, or withdraw.",
  "offer_waiting_buyer.action": "Message the Seller",
  "offer_waiting_buyer.withdraw_prompt": "No longer need it? <link>Withdraw the offer</link>.",
  "offer_waiting_buyer.withdraw": "Withdraw the offer",
  "offer_waiting_buyer.keep_waiting": "To keep waiting, you don't need to do anything.",

  // offer_rejected
  "offer_rejected.subject": "Offer Rejected",
  "offer_rejected.preheader": "Your offer was rejected.",
  "offer_rejected.heading": "Offer Rejected",
  "offer_rejected.intro": "Your offer was rejected:",

  // order_assigned
  "order_assigned.subject": "Order Assigned",
  "order_assigned.preheader": "You have been assigned to order \"{title}\".",
  "order_assigned.heading": "Order Assigned to You",
  "order_assigned.intro": "You have been assigned to a new order:",
  "order_assigned.outro": "Please review the order details and begin work when ready.",

  // order_create
  "order_create.subject": "New Order Created",
  "order_create.preheader": "A new order \"{title}\" has been created.",
  "order_create.heading": "New Order Created",
  "order_create.intro": "A new order has been created:",

  // order_message
  "order_message.subject": "New Message on Order",
  "order_message.preheader": "{author} sent a message on order \"{title}\".",
  "order_message.heading": "New Message on Order",
  "order_message.intro": "<b>{author}</b> sent a message on order \"{title}\":",
  "order_message.action": "View Order & Reply",

  // order_review
  "order_review.subject": "New Review on Order",
  "order_review.preheader": "{author} left a review on your order.",
  "order_review.heading": "New Order Review",
  "order_review.intro": "A new review has been submitted for your order:",
  "order_review.by": "By:",

  // order_review_revision_requested
  "order_review_revision_requested.subject": "Review Revision Requested",
  "order_review_revision_requested.preheader": "A revision has been requested for your review on order \"{title}\".",
  "order_review_revision_requested.heading": "Review Revision Requested",
  "order_review_revision_requested.intro": "A revision has been requested for your review on order \"{title}\":",
  "order_review_revision_requested.your_review": "Your Review:",
  "order_review_revision_requested.request": "Revision Request:",

  // order_status_*
  "order_status_cancelled.subject": "Order Cancelled",
  "order_status_cancelled.heading": "Order Cancelled",
  "order_status_cancelled.intro": "Order \"{title}\" has been cancelled.",
  "order_status_fulfilled.subject": "Order Fulfilled",
  "order_status_fulfilled.heading": "Order Fulfilled",
  "order_status_fulfilled.intro": "Order \"{title}\" has been fulfilled.",
  "order_status_in_progress.subject": "Order Being Fulfilled",
  "order_status_in_progress.heading": "Order Being Fulfilled",
  "order_status_in_progress.intro": "Order \"{title}\" is now being fulfilled.",
  "order_status_not_started.subject": "Order Status Updated",
  "order_status_not_started.heading": "Order Queued",
  "order_status_not_started.intro": "Order \"{title}\" status has been updated to Queued.",

  // price_alert: a watchlist item hit its target price.
  "price_alert.subject": "Price Alert: {title} is {price} aUEC",
  "price_alert.preheader": "{title} is listed at {price} aUEC, at or below your target of {target} aUEC.",
  "price_alert.heading": "Price Alert",
  "price_alert.intro": "A listing on your watchlist hit your target price:",
  "price_alert.price": "Price:",
  "price_alert.target": "Your target:",
  "price_alert.quantity": "Quantity:",
  "price_alert.seller": "Seller:",

  // staff_storefront_enquiry: to the staff address (English, see staff-alerts.ts).
  "staff_storefront_enquiry.subject": "New storefront enquiry: {name}",
  "staff_storefront_enquiry.preheader": "{requester} asked for {subdomain}",
  "staff_storefront_enquiry.heading": "New storefront enquiry",
  "staff_storefront_enquiry.intro": "{requester} asked SC Market staff for a branded storefront.",
  "staff_storefront_enquiry.target_org": "Org:",
  "staff_storefront_enquiry.target_shop": "Shop:",
  "staff_storefront_enquiry.requested_by": "Requested by:",
  "staff_storefront_enquiry.contact": "Contact:",
  "staff_storefront_enquiry.contact_discord": "Discord",
  "staff_storefront_enquiry.contact_message": "Message on SC Market",
  "staff_storefront_enquiry.action": "Open in Admin",

  // storefront_enquiry_accepted / _declined: to whoever sent the enquiry.
  "storefront_enquiry_accepted.subject": "Storefront enquiry accepted",
  "storefront_enquiry_accepted.preheader": "SC Market staff accepted your branded storefront enquiry for {name} ({subdomain}).",
  "storefront_enquiry_accepted.heading": "Storefront Enquiry Accepted",
  "storefront_enquiry_accepted.intro": "SC Market staff accepted your branded storefront enquiry:",
  "storefront_enquiry_accepted.action": "Open Storefront Settings",
  "storefront_enquiry_declined.subject": "Storefront enquiry declined",
  "storefront_enquiry_declined.preheader": "SC Market staff declined your branded storefront enquiry for {name} ({subdomain}).",
  "storefront_enquiry_declined.heading": "Storefront Enquiry Declined",
  "storefront_enquiry_declined.intro": "SC Market staff declined your branded storefront enquiry:",
  "storefront_enquiry_declined.retry": "You can send a new enquiry from your storefront settings.",
  "storefront_enquiry_declined.action": "Open Storefront Settings",

  // verification: confirm the email address (transactional).
  "verification.subject": "Verify Your Email Address - SC Market",
  "verification.preheader": "Confirm this address to get SC Market emails.",
  "verification.heading": "Verify Your Email Address",
  "verification.intro":
    "Thank you for adding your email address to your SC Market account. Please verify your email address by clicking the button below:",
  "verification.intro_text":
    "Thank you for adding your email address to your SC Market account. Please verify your email address by visiting the link below:",
  "verification.action": "Verify Email Address",
  "verification.copy_link": "Or copy and paste this link into your browser:",
  "verification.expires": "This verification link will expire in 24 hours.",
  "verification.ignore": "If you didn't request this email, you can safely ignore it.",
} as const

export default en
