/**
 * Account tombstoning against a real, throwaway Postgres: the
 * accounts_discord_id_unique constraint, savepoints around the per-table
 * cleanup (most of those tables don't exist here), and skipping accounts
 * recorded in account_tombstone_failures.
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/services/account-deletion/account-deletion.pg.test.ts
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import knexFactory, { type Knex } from "knex"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"

let db: Knex

vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: () => db }))
vi.mock("../discord/channel-setups.js", () => ({
  deleteOwner: vi.fn(async () => undefined),
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { processExpiredDeletions } =
  await import("./account-deletion.service.js")
const migration =
  await import("../../../migrations/20261028230000_account_tombstone_failures.js")

const DB = "pgtest_account_deletion"

const A = "11111111-1111-1111-1111-111111111111"
const B = "22222222-2222-2222-2222-222222222222"
const C = "33333333-3333-3333-3333-333333333333"
const OLD_TOMBSTONE = "44444444-4444-4444-4444-444444444444"

describe.skipIf(!PG_TEST_URL)("processExpiredDeletions (Postgres)", () => {
  beforeAll(async () => {
    const connection = await createTestDatabase(DB)
    db = knexFactory({ client: "pg", connection, pool: { min: 0, max: 2 } })
    await db.raw(`
      CREATE TABLE accounts (
        user_id uuid PRIMARY KEY,
        username text NOT NULL,
        display_name text,
        profile_description text,
        avatar text,
        banner text,
        discord_id bigint DEFAULT NULL,
        discord_access_token text,
        discord_refresh_token text,
        spectrum_user_id text,
        official_server_id bigint,
        discord_thread_channel_id bigint,
        market_order_template text,
        balance numeric DEFAULT 0,
        rsi_confirmed boolean DEFAULT false,
        locale text,
        supported_languages text[],
        is_tombstone boolean NOT NULL DEFAULT false,
        deleted_at timestamptz,
        deletion_scheduled_at timestamptz,
        CONSTRAINT accounts_discord_id_unique UNIQUE (discord_id)
      );
      CREATE TABLE listings (seller_id uuid, seller_type text, status text);
      CREATE TABLE refresh_tokens (user_id uuid);
    `)
    await db.transaction((trx) => migration.up(trx))
  })

  afterAll(async () => {
    await db?.destroy()
    if (PG_TEST_URL) await dropTestDatabase(DB)
  })

  beforeEach(async () => {
    await db.raw(
      "TRUNCATE accounts, listings, refresh_tokens, account_tombstone_failures",
    )
    const due = {
      deleted_at: new Date("2026-09-01"),
      deletion_scheduled_at: new Date("2026-10-01"),
    }
    await db("accounts").insert([
      {
        user_id: OLD_TOMBSTONE,
        username: "[deleted_44444444]",
        is_tombstone: true,
        discord_id: null,
      },
      { user_id: A, username: "a", discord_id: "100000000000000001", ...due },
      { user_id: B, username: "b", discord_id: "100000000000000002", ...due },
    ])
    await db("refresh_tokens").insert([{ user_id: A }, { user_id: B }])
  })

  it("tombstones every due account, nulling discord_id", async () => {
    await expect(processExpiredDeletions()).resolves.toBe(2)

    const rows = await db("accounts")
      .whereIn("user_id", [A, B])
      .select("is_tombstone", "discord_id")
    expect(rows).toEqual([
      { is_tombstone: true, discord_id: null },
      { is_tombstone: true, discord_id: null },
    ])
    // Cleanup of the tables that do exist still happened, despite the
    // missing ones (each delete runs in its own savepoint).
    expect(await db("refresh_tokens").count("* as n").first()).toEqual({
      n: "0",
    })
  })

  it("records a permanent failure once and then skips the account", async () => {
    // A third due account whose tombstone username collides with an existing one.
    await db.raw(
      "ALTER TABLE accounts ADD CONSTRAINT accounts_username_unique UNIQUE (username)",
    )
    try {
      await db("accounts").insert([
        {
          user_id: "33333333-0000-0000-0000-000000000000",
          username: `[deleted_33333333]`,
        },
        {
          user_id: C,
          username: "c",
          deleted_at: new Date("2026-09-01"),
          deletion_scheduled_at: new Date("2026-10-01"),
        },
      ])

      await expect(processExpiredDeletions()).resolves.toBe(2)
      const failures = await db("account_tombstone_failures").select(
        "user_id",
        "error",
      )
      expect(failures).toEqual([
        {
          user_id: C,
          error: expect.stringContaining("accounts_username_unique"),
        },
      ])

      // Next run: C is skipped, nothing else is due.
      await expect(processExpiredDeletions()).resolves.toBe(0)
      expect(
        await db("accounts").where("user_id", C).first("is_tombstone"),
      ).toEqual({ is_tombstone: false })
    } finally {
      await db.raw(
        "ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_username_unique",
      )
    }
  })

  it("migration clears the old discord_id = 0 placeholder on tombstones", async () => {
    await db("accounts")
      .where("user_id", OLD_TOMBSTONE)
      .update({ discord_id: 0 })
    await db.transaction((trx) => migration.up(trx))
    expect(
      await db("accounts").where("user_id", OLD_TOMBSTONE).first("discord_id"),
    ).toEqual({ discord_id: null })
  })
})
