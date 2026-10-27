/**
 * The personal-data export behind GET /api/profile/my_data.
 *
 * Streams one JSON document, section by section, so a large account never
 * builds the whole export in memory. Large tables are read in keyset pages.
 *
 * What is included and what is left out is declared per column in
 * PERSONAL_DATA_COLUMNS (personal-data-columns.ts). user-data-export.pg.test.ts
 * fails when a table gains a column that references a user and nobody has
 * classified it there.
 *
 * Never exported: secrets (OAuth tokens, token hashes, session ids, push
 * subscription keys, MFA secrets and recovery code hashes, webhook URLs,
 * verification/unsubscribe tokens) and other users' private data. Other
 * people appear only as their public username where needed for context.
 */
import type { Knex } from "knex"

export const EXPORT_VERSION = 1
export const PAGE_SIZE = 1000

export interface ExportSink {
  /** Resolves once the chunk is accepted (waits for drain on backpressure). */
  write(chunk: string): Promise<void>
}

export interface ExportDeps {
  knex: Knex
  /** image_resources id -> URL (cdn.getFileLinkResource). */
  resolveImage: (
    resourceId: string | null | undefined,
  ) => Promise<string | null>
  now?: () => Date
}

type Row = Record<string, unknown>

/** Keys whose values are credentials in free-form settings JSON. */
const SECRET_KEY = /token|secret|password|webhook|url|key|auth/i

function redactSettings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSettings)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Row).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) ? "[redacted]" : redactSettings(v),
      ]),
    )
  }
  return value
}

function originOf(url: unknown): string | null {
  if (typeof url !== "string") return null
  try {
    const origin = new URL(url).origin
    return origin === "null" ? null : origin
  } catch {
    return null
  }
}

function username(knex: Knex, column: string, as: string) {
  return knex.raw(
    `(SELECT username FROM accounts WHERE accounts.user_id = ${column}) AS ??`,
    [as],
  )
}

/**
 * Rows of `query` in pages of PAGE_SIZE ordered by `key` (a unique column;
 * qualified name in `key`, result field name in `field`).
 */
async function* paged(
  query: () => Knex.QueryBuilder,
  key: string,
  field: string = key.split(".").pop()!,
): AsyncGenerator<Row> {
  let last: unknown = undefined
  for (;;) {
    const q = query().orderBy(key).limit(PAGE_SIZE)
    if (last !== undefined) q.where(key, ">", last as Knex.Value)
    const rows: Row[] = await q
    for (const r of rows) yield r
    if (rows.length < PAGE_SIZE) return
    last = rows[rows.length - 1][field]
  }
}

async function* all(
  query: Knex.QueryBuilder | Promise<Row[]>,
): AsyncGenerator<Row> {
  for (const r of (await query) as Row[]) yield r
}

class JsonWriter {
  private first = true
  constructor(private sink: ExportSink) {}

  async open() {
    await this.sink.write("{")
  }
  async close() {
    await this.sink.write("}\n")
  }
  private async key(name: string) {
    await this.sink.write(`${this.first ? "" : ","}\n${JSON.stringify(name)}:`)
    this.first = false
  }
  async value(name: string, value: unknown) {
    await this.key(name)
    await this.sink.write(JSON.stringify(value ?? null))
  }
  async array(
    name: string,
    rows: AsyncIterable<Row>,
    map: (r: Row) => unknown | Promise<unknown> = (r) => r,
  ) {
    await this.key(name)
    await this.sink.write("[")
    let n = 0
    for await (const r of rows) {
      await this.sink.write(
        `${n++ ? "," : ""}\n${JSON.stringify(await map(r))}`,
      )
    }
    await this.sink.write("]")
  }
}

/** Writes the export for `userId` to `sink`. */
export async function writeUserDataExport(
  userId: string,
  sink: ExportSink,
  deps: ExportDeps,
): Promise<void> {
  const { knex, resolveImage } = deps
  const now = deps.now ?? (() => new Date())
  const out = new JsonWriter(sink)
  const me = { user_id: userId }

  const account = await knex("accounts").where(me).first()
  if (!account) throw new Error("Account not found")

  // Shops the user owns personally: orders/offers/ratings on them are theirs.
  const myShopIds = knex("shops")
    .select("shop_id")
    .where({ owner_user_id: userId })

  await out.open()
  await out.value("export_version", EXPORT_VERSION)
  await out.value("generated_at", now().toISOString())

  // ── Profile and settings ────────────────────────────────────────────────
  await out.value("profile", {
    user_id: account.user_id,
    username: account.username,
    display_name: account.display_name,
    profile_description: account.profile_description,
    avatar_url: await resolveImage(account.avatar),
    banner_url: await resolveImage(account.banner),
    rsi_confirmed: account.rsi_confirmed,
    spectrum_user_id: account.spectrum_user_id,
    discord_id: account.discord_id,
    role: account.role,
    balance: account.balance,
    locale: account.locale,
    supported_languages: account.supported_languages,
    market_order_template: account.market_order_template,
    official_server_id: account.official_server_id,
    discord_thread_channel_id: account.discord_thread_channel_id,
    banned: account.banned,
    donor_start_date: account.donor_start_date,
    created_at: account.created_at,
    last_seen: account.last_seen,
    in_game: account.in_game,
    onboarding_completed_at: account.onboarding_completed_at,
    mfa_changed_at: account.mfa_changed_at,
    deletion_scheduled_at: account.deletion_scheduled_at,
    deleted_at: account.deleted_at,
    deletion_reason: account.deletion_reason,
    is_test_account: account.is_test,
  })
  await out.value("settings", {
    privacy:
      (await knex("account_settings")
        .where(me)
        .select("discord_order_share", "discord_public")
        .first()) ?? null,
    preferences:
      (await knex("user_preferences")
        .where(me)
        .select("market_version", "updated_at")
        .first()) ?? null,
  })
  await out.array(
    "availability",
    all(
      knex("user_availability as ua")
        .leftJoin("contractors as c", "c.contractor_id", "ua.contractor_id")
        .where("ua.user_id", userId)
        .select("ua.start", "ua.finish", "c.spectrum_id as org"),
    ),
  )
  await out.array(
    "dashboard_layouts",
    all(
      knex("dashboard_layouts")
        .where({ owner_type: "user", owner_id: userId })
        .select("config", "created_at", "updated_at"),
    ),
  )
  await out.array(
    "feature_flag_overrides",
    all(
      knex("user_feature_overrides")
        .where(me)
        .select("flag_name", "enabled", "updated_at"),
    ),
  )

  // ── Email ────────────────────────────────────────────────────────────────
  await out.array(
    "emails",
    all(
      knex("user_emails")
        .where(me)
        .select(
          "email",
          "email_verified",
          "is_primary",
          "verified_at",
          "created_at",
          "updated_at",
        ),
    ),
  )
  await out.array(
    "email_verification_requests",
    all(
      knex("email_verification_tokens")
        .where(me)
        .select("email", "created_at", "expires_at", "used_at"),
    ),
  )
  await out.array(
    "email_unsubscribe_links",
    all(
      knex("email_unsubscribe_tokens")
        .where(me)
        .select("email", "created_at", "used_at"),
    ),
  )
  await out.array(
    "emails_sent",
    paged(
      () =>
        knex("email_delivery_log")
          .where(me)
          .select(
            "log_id",
            "email",
            "notification_type",
            "status",
            "sent_at",
            "delivered_at",
          ),
      "log_id",
    ),
  )

  // ── Linked accounts and Discord ──────────────────────────────────────────
  await out.array(
    "linked_accounts",
    all(
      knex("account_providers")
        .where(me)
        .select(
          "provider_type",
          "provider_id",
          "metadata",
          "is_primary",
          "linked_at",
          "last_used_at",
        ),
    ),
  )
  await out.array(
    "integrations",
    all(
      knex("account_integrations")
        .where(me)
        .select(
          "integration_type",
          "settings",
          "enabled",
          "configured_at",
          "last_used_at",
        ),
    ),
    (r) => ({ ...r, settings: redactSettings(r.settings) }),
  )
  await out.array(
    "discord_channels",
    all(
      knex("discord_channel_setups")
        .where({ owner_type: "user", owner_id: userId })
        .select(
          "guild_id",
          "channel_id",
          "threads",
          "alerts",
          "contracts",
          "created_by_discord_id",
          "created_at",
          "updated_at",
        ),
    ),
  )
  await out.array(
    "discord_order_alerts",
    all(
      knex("order_alert_subscriptions")
        .where(me)
        .select(
          "guild_id",
          "channel_id",
          "created_by_discord_id",
          "created_at",
        ),
    ),
  )
  await out.array(
    "contract_alerts",
    all(
      knex("contract_alert_subscriptions as s")
        .leftJoin("contractors as c", "c.contractor_id", "s.contractor_id")
        .where("s.user_id", userId)
        .select(
          "c.spectrum_id as org",
          "s.kinds",
          "s.created_at",
          "s.updated_at",
        ),
    ),
  )
  await out.array(
    "webhooks",
    all(
      knex("notification_webhooks")
        .where(me)
        .select("name", "type", "webhook_url"),
    ),
    (r) => ({
      name: r.name,
      type: r.type,
      webhook_origin: originOf(r.webhook_url),
    }),
  )

  // ── Security: sessions, MFA, tokens ──────────────────────────────────────
  await out.array(
    "login_sessions",
    all(
      knex("login_sessions")
        .whereRaw("sess -> 'passport' ->> 'user' = ?", [userId])
        .select("expire"),
    ),
  )
  await out.array(
    "refresh_tokens",
    all(
      knex("refresh_tokens")
        .where(me)
        .select(
          "created_at",
          "expires_at",
          "revoked_at",
          "mfa_at",
          "amr",
          "user_agent",
          "ip_address",
        ),
    ),
  )
  await out.array(
    "mfa_factors",
    all(
      knex("user_mfa_factors")
        .where(me)
        .select(
          "type",
          "label",
          "created_at",
          "confirmed_at",
          "last_used_at",
          "failed_attempts",
          "locked_until",
        ),
    ),
  )
  await out.array(
    "mfa_recovery_codes",
    all(
      knex("user_mfa_recovery_codes")
        .where(me)
        .select(
          "batch_id",
          knex.raw("MIN(created_at) AS created_at"),
          knex.raw("COUNT(*)::int AS codes"),
          knex.raw("COUNT(used_at)::int AS used"),
        )
        .groupBy("batch_id"),
    ),
  )
  await out.array(
    "mfa_events",
    all(
      knex("user_mfa_events")
        .where(me)
        .select(
          "event",
          "factor_type",
          "ip",
          "user_agent",
          "created_at",
          username(knex, "user_mfa_events.actor_user_id", "actor_username"),
        )
        .orderBy("created_at"),
    ),
  )
  await out.array(
    "api_tokens",
    all(
      knex("api_tokens")
        .where(me)
        .select(
          "name",
          "description",
          "scopes",
          "contractor_ids",
          "created_at",
          "updated_at",
          "expires_at",
          "last_used_at",
          "revoked_at",
        ),
    ),
  )
  await out.array(
    "scmdb_sync_tokens",
    all(
      knex("scmdb_sync_tokens")
        .where(me)
        .select("is_active", "created_at", "last_event_at"),
    ),
  )
  await out.array(
    "scmdb_events",
    all(knex("scmdb_events").where(me).select("event_type", "received_at")),
  )
  await out.array(
    "test_login_events",
    all(
      knex("test_login_events")
        .where(me)
        .select(
          "username",
          "outcome",
          "reason",
          "ip",
          "user_agent",
          "origin",
          "created_at",
        ),
    ),
  )

  // ── Notifications ────────────────────────────────────────────────────────
  await out.array(
    "notifications",
    paged(
      () =>
        knex("notification as n")
          .join(
            "notification_object as o",
            "o.notification_object_id",
            "n.notification_object_id",
          )
          .leftJoin(
            "notification_actions as a",
            "a.action_type_id",
            "o.action_type_id",
          )
          .where("n.notifier_id", userId)
          .select(
            "n.notification_id",
            "a.action",
            "a.entity",
            "o.entity_id",
            "o.timestamp",
            "n.read",
          ),
      "n.notification_id",
    ),
  )
  await out.value("notification_preferences", {
    email: await knex("email_notification_preferences as p")
      .leftJoin(
        "notification_actions as a",
        "a.action_type_id",
        "p.action_type_id",
      )
      .where("p.user_id", userId)
      .select(
        "a.action",
        "p.contractor_id",
        "p.enabled",
        "p.frequency",
        "p.digest_time",
        "p.updated_at",
      ),
    push: await knex("push_notification_preferences as p")
      .leftJoin(
        "notification_actions as a",
        "a.action_type_id",
        "p.action_type_id",
      )
      .where("p.user_id", userId)
      .select("a.action", "p.contractor_id", "p.enabled", "p.updated_at"),
    channels: await knex("notification_channel_preferences as p")
      .leftJoin(
        "notification_actions as a",
        "a.action_type_id",
        "p.action_type_id",
      )
      .where("p.user_id", userId)
      .select("a.action", "p.channel", "p.enabled", "p.updated_at"),
  })
  await out.array(
    "push_subscriptions",
    all(
      knex("push_subscriptions")
        .where(me)
        .select("endpoint", "user_agent", "created_at", "updated_at"),
    ),
    (r) => ({
      endpoint_origin: originOf(r.endpoint),
      user_agent: r.user_agent,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }),
  )
  await out.array(
    "notification_deliveries",
    paged(
      () =>
        knex("notification_deliveries")
          .where(me)
          .select(
            "id",
            "event_key",
            "channel",
            "status",
            "created_at",
            "sent_at",
          ),
      "id",
    ),
    ({ id: _id, ...r }) => r,
  )
  await out.value(
    "dm_reminders",
    (await knex("dm_reminder_log")
      .where(me)
      .select("last_reminded_at")
      .first()) ?? null,
  )

  // ── Organizations and shops ──────────────────────────────────────────────
  await out.array(
    "org_memberships",
    all(
      knex("contractor_members as m")
        .join("contractors as c", "c.contractor_id", "m.contractor_id")
        .leftJoin("user_contractor_settings as s", function () {
          this.on("s.contractor_id", "m.contractor_id").andOn(
            "s.user_id",
            "m.user_id",
          )
        })
        .where("m.user_id", userId)
        .select(
          "c.spectrum_id",
          "c.name",
          "m.role",
          "s.display_membership",
          knex.raw(
            `ARRAY(SELECT r.name FROM contractor_member_roles mr JOIN contractor_roles r ON r.role_id = mr.role_id
                   WHERE mr.user_id = m.user_id AND r.contractor_id = m.contractor_id ORDER BY r.position) AS roles`,
          ),
        ),
    ),
  )
  await out.array(
    "org_invites",
    all(
      knex("contractor_invites as i")
        .join("contractors as c", "c.contractor_id", "i.contractor_id")
        .where("i.user_id", userId)
        .select("c.spectrum_id", "c.name", "i.message", "i.timestamp"),
    ),
  )
  await out.array(
    "shops",
    all(
      knex("shops")
        .where({ owner_user_id: userId })
        .select(
          "shop_id",
          "slug",
          "name",
          "description",
          "status",
          "tags",
          "supported_languages",
          "accepts_custom_orders",
          "market_order_template",
          "default_pickup_method",
          "official_server_id",
          "discord_thread_channel_id",
          "is_test",
          "created_at",
          "updated_at",
        ),
    ),
  )

  // ── Chats and messages ───────────────────────────────────────────────────
  // Thread metadata for every chat the user is in; message bodies only for
  // the user's own messages.
  const chats: Row[] = await knex("chat_participants as p")
    .join("chats as c", "c.chat_id", "p.chat_id")
    .where("p.user_id", userId)
    .select(
      "c.chat_id",
      "c.name",
      "c.order_id",
      "c.session_id",
      knex.raw(
        `ARRAY(SELECT a.username FROM chat_participants cp JOIN accounts a ON a.user_id = cp.user_id
               WHERE cp.chat_id = c.chat_id ORDER BY a.username) AS participants`,
      ),
    )
    .orderBy("c.chat_id")
  await out.array("chats", all(Promise.resolve(chats)))
  const chatIds = chats.map((c) => c.chat_id as string)
  await out.array(
    "messages",
    (async function* () {
      for (const r of [...new Set(chatIds)]) {
        yield* paged(
          () =>
            knex("messages")
              .where({ chat_id: r, author: userId })
              .select("message_id", "chat_id", "content", "timestamp"),
          "message_id",
        )
      }
      // Messages in chats the user has since left.
      yield* paged(
        () =>
          knex("messages")
            .where({ author: userId })
            .modify((q) => {
              if (chatIds.length) q.whereNotIn("chat_id", chatIds)
            })
            .select("message_id", "chat_id", "content", "timestamp"),
        "message_id",
      )
    })(),
    async (m) => ({
      ...m,
      attachments: (await knex("message_attachments")
        .where({ message_id: m.message_id })
        .pluck("resource_id")) as string[],
    }),
  )

  // ── Orders, offers, contracts, services ──────────────────────────────────
  const orderSelect = [
    "o.order_id",
    "o.title",
    "o.kind",
    "o.status",
    "o.description",
    "o.cost",
    "o.collateral",
    "o.payment_type",
    "o.rush",
    "o.departure",
    "o.destination",
    "o.timestamp",
    "o.fulfilled_at",
    "o.thread_id",
    "o.offer_session_id",
    "o.service_id",
    "o.shop_id",
  ]
  await out.array(
    "orders",
    paged(
      () =>
        knex("orders as o")
          .leftJoin("contractors as c", "c.contractor_id", "o.contractor_id")
          .where((q) =>
            q
              .where("o.customer_id", userId)
              .orWhere("o.assigned_id", userId)
              .orWhereIn("o.shop_id", myShopIds),
          )
          .select(
            ...orderSelect,
            "c.spectrum_id as seller_org",
            username(knex, "o.customer_id", "customer"),
            username(knex, "o.assigned_id", "assigned"),
          ),
      "o.order_id",
      "order_id",
    ),
  )
  await out.array(
    "offers",
    all(
      knex("offer_sessions as s")
        .where((q) =>
          q
            .where("s.customer_id", userId)
            .orWhere("s.assigned_id", userId)
            .orWhereIn("s.shop_id", myShopIds)
            .orWhereExists(
              knex("order_offers")
                .whereRaw("order_offers.session_id = s.id")
                .where("order_offers.actor_id", userId),
            ),
        )
        .select(
          "s.id as session_id",
          "s.status",
          "s.timestamp",
          "s.shop_id",
          "s.thread_id",
          username(knex, "s.customer_id", "customer"),
          username(knex, "s.assigned_id", "assigned"),
          knex.raw(
            `COALESCE((SELECT json_agg(json_build_object(
               'kind', oo.kind, 'title', oo.title, 'description', oo.description, 'cost', oo.cost,
               'collateral', oo.collateral, 'payment_type', oo.payment_type, 'status', oo.status,
               'timestamp', oo.timestamp,
               'actor', (SELECT username FROM accounts WHERE user_id = oo.actor_id))
               ORDER BY oo.timestamp) FROM order_offers oo WHERE oo.session_id = s.id), '[]') AS offers`,
          ),
        )
        .orderBy("s.timestamp"),
    ),
  )
  await out.array(
    "order_comments",
    all(
      knex("order_comments")
        .where({ author: userId })
        .select("order_id", "content", "timestamp"),
    ),
  )
  await out.array(
    "order_applications",
    all(
      knex("order_applicants")
        .where({ user_applicant_id: userId })
        .select("order_id", "message", "timestamp"),
    ),
  )
  await out.array(
    "order_response_times",
    all(
      knex("order_response_times")
        .where({ assigned_user_id: userId })
        .select(
          "order_id",
          "assigned_at",
          "responded_at",
          "response_time_minutes",
        ),
    ),
  )
  await out.array(
    "stock_allocations_made",
    all(
      knex("stock_allocation_log")
        .where({ allocated_by: userId })
        .select("order_id", "lot_id", "quantity_allocated", "allocated_at"),
    ),
  )
  // Stock the user allocated by hand to V2 order lines (automatic
  // allocations have no allocated_by).
  await out.array(
    "order_stock_allocations_made",
    all(
      knex("order_stock_allocations_v2")
        .where({ allocated_by: userId })
        .select(
          "order_id",
          "order_item_id",
          "lot_id",
          "quantity",
          "status",
          "created_at",
          "updated_at",
          "released_at",
        ),
    ),
  )
  await out.array(
    "public_contracts",
    all(
      knex("public_contracts")
        .where({ customer_id: userId })
        .select(
          "id",
          "title",
          "kind",
          "description",
          "cost",
          "collateral",
          "payment_type",
          "departure",
          "destination",
          "status",
          "timestamp",
          "expiration",
        ),
    ),
  )
  await out.array(
    "services",
    all(
      knex("services")
        .where((q) =>
          q.where({ user_id: userId }).orWhere({ assigned_id: userId }),
        )
        .select(
          "service_id",
          "service_name",
          "service_description",
          "title",
          "description",
          "kind",
          "cost",
          "offer",
          "collateral",
          "payment_type",
          "rush",
          "departure",
          "destination",
          "status",
          "timestamp",
          "shop_id",
        ),
    ),
  )
  await out.array(
    "transactions",
    all(
      knex("transactions")
        .where((q) =>
          q
            .where({ user_sender_id: userId })
            .orWhere({ user_recipient_id: userId }),
        )
        .select(
          "transaction_id",
          "kind",
          "amount",
          "status",
          "note",
          "timestamp",
          username(knex, "transactions.user_sender_id", "sender"),
          username(knex, "transactions.user_recipient_id", "recipient"),
        ),
    ),
  )

  // ── Listings, stock, bids, buy orders, cart ──────────────────────────────
  await out.array(
    "listings",
    all(
      knex("listings")
        .where({ seller_type: "user", seller_id: userId })
        .select(
          "listing_id",
          "title",
          "description",
          "status",
          "visibility",
          "sale_type",
          "listing_type",
          "shop_id",
          "created_at",
          "updated_at",
          "expires_at",
        ),
    ),
  )
  await out.array(
    "market_listings_v1",
    all(
      knex("market_listings")
        .where({ user_seller_id: userId })
        .select(
          "listing_id",
          "sale_type",
          "price",
          "quantity_available",
          "status",
          "internal",
          "timestamp",
          "expiration",
        ),
    ),
  )
  await out.array(
    "market_multiples_v1",
    all(
      knex("market_multiples")
        .where({ user_seller_id: userId })
        .select("multiple_id", "timestamp"),
    ),
  )
  await out.array(
    "legacy_market_listings",
    all(
      knex
        .select(
          knex.raw("'market_listings_legacy' AS source"),
          "listing_id",
          "title",
          "description",
          "price",
          "quantity_available",
          "status",
          "timestamp",
        )
        .from("market_listings_legacy")
        .where({ user_seller_id: userId })
        .unionAll((q) =>
          q
            .select(
              knex.raw("'market_aggregate_listings_legacy'"),
              "listing_id",
              knex.raw("NULL::varchar"),
              knex.raw("NULL::varchar"),
              "price",
              "quantity_available",
              "status",
              "timestamp",
            )
            .from("market_aggregate_listings_legacy")
            .where({ user_seller_id: userId }),
        )
        .unionAll((q) =>
          q
            .select(
              knex.raw("'market_multiple'"),
              "multiple_id",
              knex.raw("NULL::varchar"),
              knex.raw("NULL::varchar"),
              knex.raw("NULL::bigint"),
              knex.raw("NULL::int"),
              knex.raw("NULL::varchar"),
              knex.raw("NULL::timestamp"),
            )
            .from("market_multiple")
            .where({ user_seller_id: userId }),
        ),
    ),
  )
  await out.array(
    "stock_lots",
    all(
      knex("listing_item_lots")
        .where((q) =>
          q.where({ owner_id: userId }).orWhere({ crafted_by: userId }),
        )
        .select(
          "lot_id",
          "listing_id",
          "game_item_id",
          "variant_id",
          "quantity_total",
          "listed",
          "notes",
          "location_id",
          "crafted_at",
          "created_at",
          "updated_at",
        )
        .select(
          knex.raw("owner_id = ? AS owned", [userId]),
          knex.raw("crafted_by = ? AS crafted", [userId]),
        ),
    ),
  )
  await out.array(
    "stock_lots_v1",
    all(
      knex("stock_lots")
        .where({ owner_id: userId })
        .select(
          "lot_id",
          "listing_id",
          "quantity_total",
          "listed",
          "notes",
          "location_id",
          "created_at",
          "updated_at",
        ),
    ),
  )
  await out.array(
    "custom_locations",
    all(
      knex("locations")
        .where({ created_by: userId })
        .select("name", "created_at"),
    ),
  )
  await out.array(
    "bids",
    all(
      knex
        .select("listing_id", "amount", "is_active", "created_at")
        .from("bids_v2")
        .where({ bidder_id: userId, bidder_type: "user" })
        .unionAll((q) =>
          q
            .select(
              "listing_id",
              "bid",
              knex.raw("NULL::boolean"),
              knex.raw("timestamp::timestamptz"),
            )
            .from("market_bids")
            .where({ user_bidder_id: userId }),
        ),
    ),
  )
  await out.array(
    "buy_orders",
    all(
      knex("buy_orders_v2")
        .where({ buyer_id: userId })
        .select(
          "buy_order_id",
          "game_item_id",
          "quantity_desired",
          "quantity_fulfilled",
          "price_min",
          "price_max",
          "quality_tier_min",
          "quality_tier_max",
          "quality_value_min",
          "quality_value_max",
          "desired_attributes",
          "visibility",
          "negotiable",
          "status",
          "created_at",
          "updated_at",
          "expires_at",
          "declined_at",
        ),
    ),
  )
  await out.array(
    "buy_orders_v1",
    all(
      knex("market_buy_orders")
        .where({ buyer_id: userId })
        .select(
          "buy_order_id",
          "game_item_id",
          "quantity",
          "price",
          "negotiable",
          "created_timestamp",
          "expiry",
          "fulfilled_timestamp",
        ),
    ),
  )
  await out.array(
    "buy_order_fulfillments",
    all(
      knex("buy_order_fulfillments")
        .where({ seller_id: userId })
        .select(
          "buy_order_id",
          "order_id",
          "listing_id",
          "quantity",
          "price_per_unit",
          "created_at",
        ),
    ),
  )
  await out.array(
    "cart",
    all(
      knex("cart_items_v2")
        .where(me)
        .select(
          "listing_id",
          "item_id",
          "variant_id",
          "quantity",
          "price_per_unit",
          "created_at",
          "updated_at",
        ),
    ),
  )

  // ── Watchlist, wishlists, crafting, missions, ships ─────────────────────
  await out.array(
    "watchlist",
    all(
      knex("watchlist_items")
        .where(me)
        .select(
          "query",
          "game_item_id",
          "max_price",
          "created_at",
          "last_notified_at",
        ),
    ),
  )
  await out.array(
    "wishlists",
    all(
      knex("wishlists as w")
        .where("w.user_id", userId)
        .select(
          "w.wishlist_id",
          "w.wishlist_name",
          "w.wishlist_description",
          "w.is_public",
          "w.is_collaborative",
          "w.organization_id",
          "w.created_at",
          "w.updated_at",
          knex.raw(
            `COALESCE((SELECT json_agg(json_build_object(
               'game_item_id', i.game_item_id, 'blueprint_id', i.blueprint_id, 'desired_quantity', i.desired_quantity,
               'desired_quality_tier', i.desired_quality_tier, 'priority', i.priority, 'notes', i.notes,
               'is_acquired', i.is_acquired, 'acquired_quantity', i.acquired_quantity, 'created_at', i.created_at))
               FROM wishlist_items i WHERE i.wishlist_id = w.wishlist_id), '[]') AS items`,
          ),
        ),
    ),
  )
  await out.array(
    "blueprint_inventory",
    all(
      knex("user_blueprint_inventory")
        .where(me)
        .select(
          "blueprint_id",
          "blueprint_name",
          "is_owned",
          "acquisition_date",
          "acquisition_method",
          "acquisition_location",
          "acquisition_notes",
          "created_at",
          "updated_at",
        ),
    ),
  )
  await out.array(
    "crafting_history",
    all(
      knex("crafting_history")
        .where(me)
        .select(
          "blueprint_id",
          "crafting_date",
          "input_materials",
          "output_quality_tier",
          "output_quality_value",
          "output_quantity",
          "was_critical_success",
          "total_material_cost",
          "crafting_station_fee",
        ),
    ),
  )
  await out.array(
    "mission_completions",
    all(
      knex("mission_completions")
        .where(me)
        .select(
          "mission_id",
          "completion_date",
          "blueprints_rewarded",
          "completion_notes",
        ),
    ),
  )
  await out.array(
    "mission_ratings",
    all(
      knex("mission_ratings")
        .where(me)
        .select(
          "mission_id",
          "difficulty_rating",
          "satisfaction_rating",
          "rating_comment",
          "created_at",
          "updated_at",
        ),
    ),
  )
  await out.array(
    "ships",
    all(
      knex("ships").where({ owner: userId }).select("ship_id", "kind", "name"),
    ),
  )
  await out.array(
    "ship_checkins",
    all(
      knex("ship_checkins")
        .where(me)
        .select("ship_id", "timestamp", "location", "condition", "status"),
    ),
  )

  // ── Reviews and ratings ──────────────────────────────────────────────────
  await out.array(
    "reviews_given",
    all(
      knex("order_reviews")
        .where({ user_author: userId })
        .select(
          "order_id",
          "rating",
          "content",
          "role",
          "timestamp",
          "last_modified_at",
          "revision_requested",
          "revision_message",
        ),
    ),
  )
  await out.array(
    "reviews_received",
    all(
      knex("order_reviews as r")
        .join("orders as o", "o.order_id", "r.order_id")
        .where((q) =>
          q
            .where("o.customer_id", userId)
            .orWhere("o.assigned_id", userId)
            .orWhereIn("o.shop_id", myShopIds),
        )
        .where((q) =>
          q.whereNull("r.user_author").orWhereNot("r.user_author", userId),
        )
        .select(
          "r.order_id",
          "r.rating",
          "r.content",
          "r.role",
          "r.timestamp",
          username(knex, "r.user_author", "author"),
          knex.raw(
            "(SELECT spectrum_id FROM contractors WHERE contractor_id = r.contractor_author) AS author_org",
          ),
        ),
    ),
  )
  await out.array(
    "shop_ratings_given",
    all(
      knex("shop_ratings as r")
        .join("shops as s", "s.shop_id", "r.shop_id")
        .where("r.reviewer_id", userId)
        .select(
          "s.slug as shop",
          "r.order_id",
          "r.rating",
          "r.comment",
          "r.created_at",
        ),
    ),
  )
  await out.array(
    "shop_ratings_received",
    all(
      knex("shop_ratings as r")
        .whereIn("r.shop_id", myShopIds)
        .select(
          "r.shop_id",
          "r.order_id",
          "r.rating",
          "r.comment",
          "r.created_at",
          username(knex, "r.reviewer_id", "reviewer"),
        ),
    ),
  )

  // ── Comments, votes, blocklist, reports ─────────────────────────────────
  await out.array(
    "comments",
    all(
      knex("comments")
        .where({ author: userId })
        .select("comment_id", "reply_to", "content", "deleted", "timestamp"),
    ),
  )
  await out.array(
    "comment_votes",
    all(
      knex("comment_votes")
        .where({ actor_id: userId })
        .select("comment_id", "upvote", "timestamp"),
    ),
  )
  await out.array(
    "recruiting_votes",
    all(
      knex("recruiting_votes")
        .where({ actor_id: userId })
        .select("post_id", "upvote", "timestamp"),
    ),
  )
  await out.array(
    "blocklist",
    all(
      knex("blocklist as b")
        .where("b.blocker_user_id", userId)
        .select(
          "b.blocker_type",
          "b.reason",
          "b.created_at",
          username(knex, "b.blocked_id", "blocked_user"),
        ),
    ),
  )
  await out.array(
    "content_reports",
    all(
      knex("content_reports")
        .where({ reporter_id: userId })
        .select(
          "reported_url",
          "report_reason",
          "report_details",
          "status",
          "created_at",
          "handled_at",
        ),
    ),
  )

  // ── Activity ─────────────────────────────────────────────────────────────
  await out.array(
    "activity_days",
    paged(() => knex("activity_history").where(me).select("date"), "date"),
    (r) => r.date,
  )
  await out.array(
    "listing_views",
    paged(
      () =>
        knex("listing_views")
          .where({ viewer_id: userId })
          .select(
            "view_id",
            "listing_type",
            "listing_id",
            "timestamp",
            "user_agent",
            "referrer_origin",
          ),
      "view_id",
    ),
    ({ view_id: _v, ...r }) => r,
  )
  await out.array(
    "listing_views_v2",
    paged(
      () =>
        knex("listing_views_v2")
          .where({ viewer_id: userId })
          .select("view_id", "listing_id", "viewed_at"),
      "view_id",
    ),
    ({ view_id: _v, ...r }) => r,
  )
  await out.array(
    "audit_log",
    all(
      knex("audit_logs")
        .where((q) =>
          q
            .where({ actor_id: userId })
            .orWhere((w) =>
              w.where({ subject_type: "user", subject_id: userId }),
            ),
        )
        .select(
          "action",
          "subject_type",
          "created_at",
          knex.raw("actor_id = ? AS by_you", [userId]),
        )
        .orderBy("created_at"),
    ),
  )
  await out.array(
    "org_audit_trail",
    all(
      knex("audit_trail as t")
        .leftJoin("contractors as c", "c.contractor_id", "t.contractor_id")
        .where("t.actor_id", userId)
        .select(
          "t.entity_type",
          "t.entity_id",
          "t.action",
          "c.spectrum_id as org",
          "t.created_at",
        )
        .orderBy("t.created_at"),
    ),
  )

  await out.close()
}
