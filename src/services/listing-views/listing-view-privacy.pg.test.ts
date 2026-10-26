/**
 * listing_views privacy: what trackListingView stores, the column migrations
 * and the anonymous-view purge, against a real, throwaway Postgres.
 *
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/services/listing-views/listing-view-privacy.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { createHash } from "node:crypto"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"

const DB = "pgtest_listing_view_privacy"
const state: { db: Knex | null } = { db: null }

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {},
}))

import {
  ANONYMOUS_VIEW_RETENTION_DAYS,
  PURGE_BATCH_SIZE,
  USER_AGENT_MAX_LENGTH,
  hashViewerIp,
  purgeAnonymousListingViews,
  referrerOrigin,
  truncateUserAgent,
} from "./listing-view-privacy.js"
import * as addColumns from "../../../migrations/20261027010000_listing_views_hashed_ip.js"
import * as dropRaw from "../../../migrations/20261027020000_listing_views_drop_raw_ip.js"

describe("hashViewerIp", () => {
  const day = new Date("2026-10-26T12:00:00Z")
  const secret = "test-secret"

  it("is a keyed HMAC, not a plain hash", () => {
    const h = hashViewerIp("203.0.113.7", day, secret)!
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toBe(hashViewerIp("203.0.113.7", day, "other-secret"))
    expect(h).not.toBe(createHash("sha256").update("203.0.113.7").digest("hex"))
  })

  it("matches within a UTC day and not across days", () => {
    const morning = new Date("2026-10-26T00:00:01Z")
    const night = new Date("2026-10-26T23:59:59Z")
    const nextDay = new Date("2026-10-27T00:00:01Z")
    expect(hashViewerIp("203.0.113.7", morning, secret)).toBe(
      hashViewerIp("203.0.113.7", night, secret),
    )
    expect(hashViewerIp("203.0.113.7", morning, secret)).not.toBe(
      hashViewerIp("203.0.113.7", nextDay, secret),
    )
  })

  it("treats IPv4-mapped IPv6 as the same client", () => {
    expect(hashViewerIp("::ffff:203.0.113.7", day, secret)).toBe(
      hashViewerIp("203.0.113.7", day, secret),
    )
  })

  it("stores nothing without an IP or a secret", () => {
    expect(hashViewerIp(undefined, day, secret)).toBeNull()
    expect(hashViewerIp("203.0.113.7", day, undefined)).toBeNull()
  })
})

describe("referrerOrigin / truncateUserAgent", () => {
  it("keeps only the origin", () => {
    expect(referrerOrigin("https://sc-market.space/market/abc?ref=me#x")).toBe(
      "https://sc-market.space",
    )
    expect(referrerOrigin("http://localhost:3000/a")).toBe(
      "http://localhost:3000",
    )
    expect(referrerOrigin("android-app://com.discord/")).toBeNull()
    expect(referrerOrigin("not a url")).toBeNull()
    expect(referrerOrigin(undefined)).toBeNull()
  })

  it("truncates the user agent", () => {
    expect(truncateUserAgent("x".repeat(5000))).toHaveLength(
      USER_AGENT_MAX_LENGTH,
    )
    expect(truncateUserAgent("Mozilla/5.0")).toBe("Mozilla/5.0")
    expect(truncateUserAgent(undefined)).toBeNull()
  })
})

describe.skipIf(!PG_TEST_URL)("listing_views migrations and purge", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 2 },
    })
    // The table as config/postgres/0-schema.sql creates it.
    await state.db.raw(`
      CREATE TABLE accounts (user_id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE listing_views (
        view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_type VARCHAR(20) NOT NULL CHECK (listing_type IN ('market', 'service')),
        listing_id UUID NOT NULL,
        viewer_id UUID REFERENCES accounts(user_id),
        viewer_ip INET,
        user_agent TEXT,
        referrer TEXT,
        timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
        session_id TEXT,
        is_unique BOOLEAN DEFAULT true
      );
      CREATE INDEX idx_listing_views_timestamp ON listing_views(timestamp);
      CREATE VIEW listing_view_stats AS
        SELECT listing_type, listing_id, COUNT(*) AS total_views,
               COUNT(DISTINCT viewer_id) AS unique_viewers,
               COUNT(DISTINCT session_id) AS unique_sessions
        FROM listing_views GROUP BY listing_type, listing_id;
    `)
    await state.db("listing_views").insert({
      listing_type: "market",
      listing_id: "00000000-0000-4000-8000-000000000001",
      viewer_ip: "203.0.113.7",
      referrer: "https://example.com/private/path?token=abc",
    })
  })

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  const columns = async () =>
    (
      await state.db!.raw(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'listing_views'`,
      )
    ).rows.map((r: { column_name: string }) => r.column_name)

  it("adds the hash/origin columns, then drops the raw ones; both idempotent", async () => {
    const db = state.db!
    await db.transaction((trx) => addColumns.up(trx))
    await db.transaction((trx) => addColumns.up(trx))
    expect(await columns()).toEqual(
      expect.arrayContaining([
        "viewer_ip",
        "referrer",
        "viewer_ip_hash",
        "referrer_origin",
      ]),
    )

    await db.transaction((trx) => dropRaw.up(trx))
    await db.transaction((trx) => dropRaw.up(trx))
    const after = await columns()
    expect(after).toEqual(
      expect.arrayContaining([
        "viewer_ip_hash",
        "referrer_origin",
        "user_agent",
      ]),
    )
    expect(after).not.toContain("viewer_ip")
    expect(after).not.toContain("referrer")
    // The stats view survives.
    const [{ total_views }] = (
      await db.raw("SELECT total_views FROM listing_view_stats")
    ).rows
    expect(Number(total_views)).toBe(1)

    await db.transaction((trx) => dropRaw.down(trx))
    expect(await columns()).toEqual(
      expect.arrayContaining(["viewer_ip", "referrer"]),
    )
    await db.transaction((trx) => dropRaw.up(trx))
  })

  it("purges only logged-out views past retention, in batches", async () => {
    const db = state.db!
    await db("listing_views").delete()
    const [{ user_id }] = await db("accounts").insert({}).returning("user_id")
    const old = db.raw(
      `NOW() - INTERVAL '${ANONYMOUS_VIEW_RETENTION_DAYS + 1} days'`,
    )
    const recent = db.raw(
      `NOW() - INTERVAL '${ANONYMOUS_VIEW_RETENTION_DAYS - 1} days'`,
    )
    const row = (viewer_id: string | null, timestamp: Knex.Raw) => ({
      listing_type: "market",
      listing_id: "00000000-0000-4000-8000-000000000001",
      viewer_id,
      timestamp,
    })
    const oldAnon = Array.from({ length: PURGE_BATCH_SIZE + 7 }, () =>
      row(null, old),
    )
    for (let i = 0; i < oldAnon.length; i += 1000) {
      await db("listing_views").insert(oldAnon.slice(i, i + 1000))
    }
    await db("listing_views").insert([
      row(null, recent),
      row(user_id, old),
      row(user_id, recent),
    ])

    expect(await purgeAnonymousListingViews()).toBe(PURGE_BATCH_SIZE + 7)
    const left = await db("listing_views").select("viewer_id")
    expect(left).toHaveLength(3)
    expect(left.filter((r) => r.viewer_id === null)).toHaveLength(1)
    expect(await purgeAnonymousListingViews()).toBe(0)
  })
})
