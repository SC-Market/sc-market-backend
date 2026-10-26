/**
 * The personal-data export against the full SC Market schema (legacy SQL +
 * every migration) in a throwaway Postgres:
 *
 * - every column that references a user is classified in
 *   PERSONAL_DATA_COLUMNS (a new one fails here until someone decides whether
 *   the export includes it), and no classification is stale;
 * - every export query runs against the real schema;
 * - the export contains the user's data, no secrets, and no other user's
 *   private data.
 *
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/services/data-export/user-data-export.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import knexFactory, { type Knex } from "knex"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"
import {
  PERSONAL_DATA_COLUMNS,
  SECRET_COLUMNS,
} from "./personal-data-columns.js"
import { PAGE_SIZE, writeUserDataExport } from "./user-data-export.js"

const DB = "pgtest_user_data_export"

/**
 * Columns that reference a user: foreign keys to accounts, plus uuid/text
 * columns whose name says they hold a user (no FK on many older tables).
 */
const USER_COLUMN_NAME =
  "(^|_)(user|author|actor|customer|buyer|seller|bidder|owner|reviewer|viewer|creator|recipient|sender|assigned|assignee|account|member|participant|reporter|invitee|inviter|blocked|blocker|requester|granted|created|updated|declined|handled|archived|allocated|crafted|notifier|applicant|subject)(_id|_by|_user_id)?$"

async function userColumns(db: Knex): Promise<string[]> {
  const { rows } = await db.raw(
    `
    SELECT c.conrelid::regclass::text || '.' || a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'public.accounts'::regclass
    UNION
    SELECT col.table_name || '.' || col.column_name
    FROM information_schema.columns col
    JOIN information_schema.tables t
      ON t.table_schema = col.table_schema AND t.table_name = col.table_name AND t.table_type = 'BASE TABLE'
    WHERE col.table_schema = 'public'
      AND col.udt_name IN ('uuid', 'text', 'varchar')
      AND col.column_name ~ ?
      AND col.table_name NOT IN ('knex_migrations', 'knex_migrations_lock')
    ORDER BY 1`,
    [USER_COLUMN_NAME],
  )
  return rows.map((r: { col: string }) => r.col)
}

async function allColumns(db: Knex): Promise<Set<string>> {
  const { rows } = await db.raw(
    `SELECT table_name || '.' || column_name AS col FROM information_schema.columns WHERE table_schema = 'public'`,
  )
  return new Set(rows.map((r: { col: string }) => r.col))
}

async function exportFor(
  db: Knex,
  userId: string,
): Promise<{ text: string; json: any }> {
  let text = ""
  await writeUserDataExport(
    userId,
    { write: async (c) => void (text += c) },
    {
      knex: db,
      resolveImage: async (id) => (id ? `https://cdn.test/${id}` : null),
    },
  )
  return { text, json: JSON.parse(text) }
}

describe.skipIf(!PG_TEST_URL)("personal-data export", () => {
  let db: Knex
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 2 },
    })

    const [alice] = await db("accounts")
      .insert({
        username: "alice",
        display_name: "Alice",
        discord_access_token: "SECRET-discord-access",
        discord_refresh_token: "SECRET-discord-refresh",
      })
      .returning("user_id")
    const [bob] = await db("accounts")
      .insert({ username: "bob", display_name: "Bob" })
      .returning("user_id")
    ids.alice = alice.user_id
    ids.bob = bob.user_id
    const A = ids.alice
    const B = ids.bob

    await db("user_emails").insert({
      user_id: A,
      email: "alice@example.com",
      email_verified: true,
    })
    await db("account_providers").insert({
      user_id: A,
      provider_type: "discord",
      provider_id: "123456789012345678",
      access_token: "SECRET-provider-access",
      refresh_token: "SECRET-provider-refresh",
      metadata: { username: "alice_discord" },
    })
    await db("account_integrations").insert({
      user_id: A,
      integration_type: "discord",
      settings: {
        channel: "general",
        webhook_url: "https://discord.com/api/webhooks/1/SECRET-hook",
      },
    })
    await db("notification_webhooks").insert({
      user_id: A,
      name: "my hook",
      webhook_url: "https://discord.com/api/webhooks/2/SECRET-webhook",
    })
    await db("push_subscriptions").insert({
      user_id: A,
      endpoint: "https://fcm.googleapis.com/fcm/send/SECRET-endpoint-id",
      p256dh: "SECRET-p256dh",
      auth: "SECRET-push-auth",
      user_agent: "Firefox",
    })
    await db("refresh_tokens").insert({
      user_id: A,
      token_hash: "SECRET-refresh-hash",
      expires_at: new Date(Date.now() + 86400_000),
      user_agent: "Chrome",
      ip_address: "198.51.100.4",
    })
    await db("api_tokens").insert({
      user_id: A,
      name: "bot",
      token_hash: "SECRET-api-hash",
      scopes: ["market:read"],
    })
    await db("user_mfa_factors").insert({
      user_id: A,
      type: "totp",
      secret_ciphertext: "SECRET-mfa-cipher",
      public_data: { credential: "SECRET-mfa-public" },
    })
    await db("user_mfa_recovery_codes").insert([
      {
        user_id: A,
        batch_id: "00000000-0000-4000-8000-0000000000b1",
        code_hash: "SECRET-code-1",
      },
      {
        user_id: A,
        batch_id: "00000000-0000-4000-8000-0000000000b1",
        code_hash: "SECRET-code-2",
        used_at: new Date(),
      },
    ])
    await db("login_sessions").insert({
      sid: "SECRET-session-id",
      sess: JSON.stringify({ passport: { user: A } }),
      expire: new Date(Date.now() + 86400_000),
    })

    const [chat] = await db("chats")
      .insert({ name: "alice & bob" })
      .returning("chat_id")
    await db("chat_participants").insert([
      { chat_id: chat.chat_id, user_id: A },
      { chat_id: chat.chat_id, user_id: B },
    ])
    // More than one page of Alice's messages.
    const many = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => ({
      chat_id: chat.chat_id,
      author: A,
      content: `alice says ${i}`,
    }))
    for (let i = 0; i < many.length; i += 500)
      await db("messages").insert(many.slice(i, i + 500))
    await db("messages").insert({
      chat_id: chat.chat_id,
      author: B,
      content: "PRIVATE-bob-message",
    })
    // A chat Alice has left: her message is still hers.
    const [left] = await db("chats")
      .insert({ name: "old" })
      .returning("chat_id")
    await db("messages").insert({
      chat_id: left.chat_id,
      author: A,
      content: "alice in a chat she left",
    })

    const [order] = await db("orders")
      .insert({
        customer_id: A,
        assigned_id: B,
        title: "Haul",
        kind: "Delivery",
        cost: 100,
      })
      .returning("order_id")
    await db("order_reviews").insert([
      {
        order_id: order.order_id,
        user_author: A,
        content: "great seller",
        role: "customer",
        rating: 5,
      },
      {
        order_id: order.order_id,
        user_author: B,
        content: "great buyer",
        role: "contractor",
        rating: 4,
      },
    ])

    await db("listing_views").insert({
      listing_type: "market",
      listing_id: "00000000-0000-4000-8000-000000000001",
      viewer_id: A,
      session_id: "SECRET-view-session",
      viewer_ip_hash: "SECRET-ip-hash",
      referrer_origin: "https://sc-market.space",
    })
    await db("user_feature_overrides").insert({
      user_id: A,
      flag_name: "market_v2",
      enabled: true,
    })

    // Bob's private data that must not appear in Alice's export.
    await db("user_emails").insert({
      user_id: B,
      email: "PRIVATE-bob@example.com",
    })
    await db("blocklist").insert({
      blocker_id: B,
      blocker_user_id: B,
      blocked_id: A,
      blocker_type: "user",
      reason: "PRIVATE-bob-reason",
    })
  }, 300_000)

  afterAll(async () => {
    await db?.destroy()
    await dropTestDatabase(DB)
  })

  it("classifies every column that references a user", async () => {
    const found = await userColumns(db)
    const unclassified = found.filter((c) => !(c in PERSONAL_DATA_COLUMNS))
    expect(
      unclassified,
      "Add these to PERSONAL_DATA_COLUMNS (export them in user-data-export.ts, or exclude with a reason)",
    ).toEqual([])
  })

  it("has no stale classifications", async () => {
    const cols = await allColumns(db)
    const stale = [
      ...Object.keys(PERSONAL_DATA_COLUMNS),
      ...SECRET_COLUMNS,
    ].filter((c) => !cols.has(c))
    expect(stale).toEqual([])
  })

  it("exports the user's data across sections", async () => {
    const { json } = await exportFor(db, ids.alice)
    expect(json.profile).toMatchObject({
      username: "alice",
      display_name: "Alice",
      is_test_account: false,
    })
    expect(json.profile.avatar_url).toMatch(/^https:\/\/cdn\.test\//)
    expect(json.emails.map((e: any) => e.email)).toEqual(["alice@example.com"])
    expect(json.linked_accounts[0]).toMatchObject({
      provider_type: "discord",
      provider_id: "123456789012345678",
    })
    expect(json.integrations[0].settings).toEqual({
      channel: "general",
      webhook_url: "[redacted]",
    })
    expect(json.webhooks).toEqual([
      {
        name: "my hook",
        type: "private",
        webhook_origin: "https://discord.com",
      },
    ])
    expect(json.push_subscriptions[0]).toMatchObject({
      endpoint_origin: "https://fcm.googleapis.com",
      user_agent: "Firefox",
    })
    expect(json.refresh_tokens[0]).toMatchObject({
      user_agent: "Chrome",
      ip_address: "198.51.100.4",
    })
    expect(json.api_tokens[0]).toMatchObject({
      name: "bot",
      scopes: ["market:read"],
    })
    expect(json.mfa_factors[0]).toMatchObject({ type: "totp" })
    expect(json.mfa_recovery_codes).toEqual([
      expect.objectContaining({ codes: 2, used: 1 }),
    ])
    expect(json.login_sessions).toHaveLength(1)

    expect(json.chats).toHaveLength(1)
    expect(json.chats[0].participants).toEqual(["alice", "bob"])
    expect(json.messages).toHaveLength(PAGE_SIZE + 4)
    expect(new Set(json.messages.map((m: any) => m.message_id)).size).toBe(
      PAGE_SIZE + 4,
    )

    expect(json.orders).toEqual([
      expect.objectContaining({
        title: "Haul",
        customer: "alice",
        assigned: "bob",
      }),
    ])
    expect(json.reviews_given).toEqual([
      expect.objectContaining({ content: "great seller" }),
    ])
    expect(json.reviews_received).toEqual([
      expect.objectContaining({ content: "great buyer", author: "bob" }),
    ])
    expect(json.listing_views).toEqual([
      expect.objectContaining({
        listing_type: "market",
        referrer_origin: "https://sc-market.space",
      }),
    ])
    expect(json.feature_flag_overrides).toEqual([
      expect.objectContaining({ flag_name: "market_v2", enabled: true }),
    ])
  })

  it("contains no secrets and no other user's private data", async () => {
    const { text } = await exportFor(db, ids.alice)
    expect(text).not.toMatch(/SECRET-/)
    expect(text).not.toMatch(/PRIVATE-/)
  })

  it("exports the other party's own data to them", async () => {
    const { json } = await exportFor(db, ids.bob)
    expect(json.profile.username).toBe("bob")
    expect(json.messages.map((m: any) => m.content)).toEqual([
      "PRIVATE-bob-message",
    ])
    expect(json.blocklist).toEqual([
      expect.objectContaining({ blocked_user: "alice" }),
    ])
  })
})
