/**
 * SCMDB ingest tokens are stored hashed (migrations 20261027211000 and
 * 20261027212000), against the FULL schema.
 *
 * - The migration backfills token_hash/token_hint from existing plaintext,
 *   idempotently, and a trigger hashes tokens the previous container still
 *   inserts in plaintext during the rollout.
 * - New tokens are stored as hash + hint only; the ingest lookup is by hash.
 * - The status endpoint never returns the URL; connect/regenerate return it
 *   once, and connect on an existing connection is a 409.
 * - Step 2 hashes anything left, clears the plaintext and drops the column;
 *   every token keeps working.
 *
 * The full schema has both steps applied, so the file first steps back to
 * the state between the two deploys (step 2 down, step 1 up again).
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import crypto from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"

const DB = "pgtest_scmdb_token_hash"
const state: { db: Knex | null } = { db: null }

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { scmdbSyncService, hashScmdbToken } =
  await import("./scmdb-sync.service.js")
const { ScmdbSyncController } =
  await import("../../api/routes/v2/integrations/scmdb/ScmdbSyncController.js")
const migration =
  await import("../../../migrations/20261027211000_scmdb_token_hash.js")
const dropPlaintext =
  await import("../../../migrations/20261027212000_scmdb_token_drop_plaintext.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const LEGACY_USER = uuid("b", 1)
const ROLLOUT_USER = uuid("b", 2)
const NEW_USER = uuid("b", 3)
const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex")
const asUser = (user_id: string) =>
  ({ headers: {}, user: { user_id, role: "user" } }) as never
const snapshot = (event_id: string) =>
  JSON.stringify({
    schema: 1,
    event_id,
    event: "unknown.event",
    user: { id: "x", handle: null },
    ts: 0,
    payload: {},
  })

describe.skipIf(!PG_TEST_URL)("SCMDB ingest tokens are stored hashed", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 4 },
    })
    await state.db("accounts").insert([
      {
        user_id: LEGACY_USER,
        username: "scmdb_legacy",
        display_name: "Legacy",
      },
      {
        user_id: ROLLOUT_USER,
        username: "scmdb_rollout",
        display_name: "Rollout",
      },
      { user_id: NEW_USER, username: "scmdb_new", display_name: "New" },
    ])
    // Between the two deploys: plaintext column back, rollout trigger on.
    await state.db.transaction((trx) => dropPlaintext.down(trx))
    await state.db.transaction((trx) => migration.up(trx))
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  const db = () => state.db!

  it("backfills hash and hint from plaintext, idempotently", async () => {
    const legacy = "a".repeat(60) + "beef"
    await db()("scmdb_sync_tokens").insert({
      user_id: LEGACY_USER,
      token: legacy,
    })
    // A row from before the migration: plaintext only.
    await db()("scmdb_sync_tokens")
      .where({ user_id: LEGACY_USER })
      .update({ token_hash: null, token_hint: null })

    await db().transaction((trx) => migration.up(trx))
    await db().transaction((trx) => migration.up(trx))

    const row = await db()("scmdb_sync_tokens")
      .where({ user_id: LEGACY_USER })
      .first()
    expect(row).toMatchObject({ token_hash: sha(legacy), token_hint: "beef" })
    // The migrated token keeps working through the hash lookup.
    expect(
      await scmdbSyncService.processEvent(legacy, snapshot("evt-legacy")),
    ).toEqual({ status: "unknown_event" })
  })

  it("hashes tokens the previous container inserts in plaintext during rollout", async () => {
    const t = "c".repeat(60) + "1234"
    await db()("scmdb_sync_tokens").insert({ user_id: ROLLOUT_USER, token: t })
    expect(
      await db()("scmdb_sync_tokens").where({ user_id: ROLLOUT_USER }).first(),
    ).toMatchObject({
      token_hash: sha(t),
      token_hint: "1234",
    })
  })

  it("stores new tokens as hash and hint only", async () => {
    const { token, ingest_url } = await scmdbSyncService.generateToken(NEW_USER)
    expect(ingest_url).toContain(`/ingest/${token}`)
    const row = await db()("scmdb_sync_tokens")
      .where({ user_id: NEW_USER, is_active: true })
      .first()
    expect(row.token).toBeNull()
    expect(row.token_hash).toBe(hashScmdbToken(token))
    expect(row.token_hint).toBe(token.slice(-4))
    expect(JSON.stringify(row)).not.toContain(token)

    expect(
      await scmdbSyncService.processEvent(token, snapshot("evt-new")),
    ).toEqual({ status: "unknown_event" })
    expect(
      await scmdbSyncService.processEvent("f".repeat(64), snapshot("evt-x")),
    ).toEqual({ status: "token_not_found" })
    expect(
      await scmdbSyncService.processEvent("../../etc", snapshot("evt-y")),
    ).toEqual({ status: "token_not_found" })
    // The hash itself is not a credential.
    expect(
      await scmdbSyncService.processEvent(row.token_hash, snapshot("evt-z")),
    ).toEqual({
      status: "token_not_found",
    })
  })

  it("status never returns the URL; connect and regenerate show it once", async () => {
    const c = new ScmdbSyncController()
    const status = await c.getConnectionStatus(asUser(NEW_USER))
    expect(status).toMatchObject({ is_connected: true, ingest_url: null })
    expect(status.token_hint).toMatch(/^[0-9a-f]{4}$/)

    await expect(c.connect(asUser(NEW_USER))).rejects.toMatchObject({
      code: "CONFLICT",
    })

    const { ingest_url } = await c.regenerate(asUser(NEW_USER))
    const token = ingest_url.split("/").pop()!
    expect((await c.getConnectionStatus(asUser(NEW_USER))).token_hint).toBe(
      token.slice(-4),
    )
    expect(
      JSON.stringify(await c.getConnectionStatus(asUser(NEW_USER))),
    ).not.toContain(token)
    expect(
      await scmdbSyncService.processEvent(token, snapshot("evt-regen")),
    ).toEqual({ status: "unknown_event" })
  })
  it("step 2 clears the plaintext and drops the column; tokens keep working", async () => {
    // A plaintext-only row that somehow escaped step 1 and its trigger.
    const straggler = "d".repeat(60) + "9999"
    await db().raw(
      "ALTER TABLE scmdb_sync_tokens DISABLE TRIGGER scmdb_sync_tokens_hash_token",
    )
    await db()("scmdb_sync_tokens")
      .where({ user_id: ROLLOUT_USER })
      .update({ token: straggler, token_hash: null, token_hint: null })

    await db().transaction((trx) => dropPlaintext.up(trx))
    await db().transaction((trx) => dropPlaintext.up(trx))

    expect(await db().schema.hasColumn("scmdb_sync_tokens", "token")).toBe(
      false,
    )
    const { rows } = await db().raw(
      "SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'scmdb_sync_tokens_hash_token'",
    )
    expect(rows[0].n).toBe(0)
    expect(
      await scmdbSyncService.processEvent(straggler, snapshot("evt-straggler")),
    ).toEqual({
      status: "unknown_event",
    })
    expect(
      await scmdbSyncService.processEvent(
        "a".repeat(60) + "beef",
        snapshot("evt-legacy-2"),
      ),
    ).toEqual({ status: "unknown_event" })
    const { token } = await scmdbSyncService.regenerateToken(LEGACY_USER)
    expect(
      await scmdbSyncService.processEvent(token, snapshot("evt-after")),
    ).toEqual({
      status: "unknown_event",
    })
  })
})
