# Webhooks and Discord alert posts through notify() (Phase 5)

Webhooks and Discord alert-channel posts are *destination* notifications:
they go to a configured place, not to a person. Since Phase 5 they go through
`notify()`'s destination side (`src/services/notify/`), with the same delivery
log, idempotency and failure handling as the user channels.

## What is covered

Each post is a **route**, `<channel>:<event>`:

| Route | What is posted | Who configures it |
|---|---|---|
| `webhook:order.created` | "Order Placed" | Shop webhooks with `order_create` |
| `webhook:order.assigned` | "Order Assigned" | Shop webhooks and the assignee's own (`order_assigned`) |
| `webhook:order.status_changed` | "Order Status Updated" | Shop, assignee and customer webhooks for that status |
| `webhook:offer.received` | "Offer Received" / "Counter Offer Received" | Shop webhooks with `order_create` |
| `webhook:order.review` | "Order Review" | Shop webhooks with `order_review` |
| `webhook:market.bid` | "Bid Received" (V1 and V2) | Seller (org/user) webhooks; V2 also the shop's |
| `webhook:contract.public_created` | "New Public Contract" | Webhooks with `public_contract_create` (site-wide feed) |
| `webhook:admin.storefront_enquiry` | "New storefront enquiry" | `STAFF_DISCORD_WEBHOOK_URL` |
| `discord_channel:order.created` | New order alert, Claim button | `/setup alerts` (unassigned shop/org orders) |
| `discord_channel:offer.received` | New offer alert, Claim button for org offers | `/setup alerts` |
| `discord_channel:contract.public_created` | New public contract | `/setup contracts` |

Destinations are gated by their own configuration (above), not by user
preferences or org mutes. Test accounts never post (unchanged). Order and offer
*threads* are conversations and stay outside `notify()`.

The payloads are unchanged: each plan uses the same resolver and body builder
as the legacy sender (`api/routes/v1/util/webhooks.ts`,
`services/discord/order-alerts.ts`, `services/contracts/public-contract-alerts.ts`,
`services/storefront/staff-alerts.ts`). There is no signing (these are Discord
webhook URLs; Discord authenticates the URL's token).

## Rollout: shadow, then live

`deliverDestinations()` (`services/notify/destination-delivery.ts`) picks the
path once per call:

- **Shadow (default).** The legacy sender posts. `notify()` builds the same
  plan and compares it with what legacy addressed. Nothing is written or
  posted for the plan. One log line per call:

  ```
  notify.destinations.shadow { route, entity_id, match, legacy, planned,
                               missing, extra, duplicated, payload_mismatch }
  ```

  Info when `match` is true, warn when not. Embed timestamps (the send time)
  are ignored. Refs are `webhook:<webhook_id>`, `webhook:staff` and
  `discord_channel:<channel id>`; webhook URLs are never logged.
- **Live.** `notifyDestinations()` (`services/notify/destinations.ts`) is the
  only sender. The legacy sender is not called.

| Variable | Values | Default |
|---|---|---|
| `NOTIFY_DESTINATIONS_LIVE` | `all` (or `*`); a comma-separated list of routes; `webhook:*` / `discord_channel:*`; `none` | unset = nothing live |
| `NOTIFY_DESTINATIONS_SHADOW` | `off` disables the comparison (legacy still posts) | on |

Unknown keys are logged (`NOTIFY_DESTINATIONS_LIVE: ignoring keys …`) and
ignored. Reverting a route is removing it from the list (or unsetting the
variable). This is a separate switch from `NOTIFY_LIVE_EVENTS` (user events).

Before turning a route live, check the logs: `notify.destinations.shadow`
lines for that route should all have `match: true`.

## Live behaviour

- **Delivery log.** One `notification_deliveries` row per destination and
  occurrence: `channel` = `webhook` / `discord_channel`, `destination_ref`,
  `user_id` null, `status` sent / skipped / failed, `last_error`
  (`permanent: …` or `retryable: …`).
- **Idempotency.** "Order Placed", order and offer alert posts, reviews, bids,
  contracts and staff alerts post once per occurrence: a retried request does
  not post again. Assignments and status changes can repeat legitimately, so
  each call is its own occurrence. A destination listed twice in one call is
  posted once (legacy could post twice, e.g. when the customer is also the
  assignee).
- **Failures.** Webhooks: 408, 429, 5xx, timeouts and network errors are
  retryable; a disallowed URL, a redirect and other 4xx (deleted webhook,
  revoked token, rejected body) are permanent and set
  `notification_webhooks.state = 'failing'` (back to `'ok'` on the next
  success; nothing filters on it yet). Discord channels: unknown channel or
  guild, missing access or permissions, invalid body and other 4xx are
  permanent; 429, 5xx and network errors are retryable. There is no
  in-process retry, as before. `@discordjs/rest` still waits out Discord's
  rate limits for channel posts.
- **Order.** Destinations are posted one after another, in the legacy order;
  one failure never stops the others.
- **Staff alert.** A failure is still logged and reported to Bugsnag, without
  the URL.

## Tests

- `src/services/notify/__tests__/destination-payloads.test.ts`: every post's
  JSON (snapshot written before Phase 5), legacy vs live through the real
  call sites.
- `src/services/notify/__tests__/destination-adapters.test.ts`,
  `destination-delivery.test.ts`: classification, state, idempotency, the
  switch and the comparison.
- `src/services/notifications/__characterization__/destinations.char.test.ts`
  (Postgres, `npm run test:notifications`): legacy vs live parity end to end.
