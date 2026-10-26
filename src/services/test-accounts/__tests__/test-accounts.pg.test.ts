/**
 * Test accounts against a real, throwaway Postgres: the migration's DB rules
 * (role CHECK, immutable flags, realm triggers), the public-surface filters
 * executed as SQL, notification filtering, stats, and the admin + test-login
 * flow end to end (create account, TOTP, cookies, replay, generic failures,
 * delete).
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database:
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/services/test-accounts/__tests__/test-accounts.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import express from "express"
import cookieParser from "cookie-parser"
import request from "supertest"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../test-utils/pg-test-db.js"

const DB = "pgtest_test_accounts"

const h = vi.hoisted(() => {
  process.env.FRONTEND_URL = "https://sc-market.space"
  process.env.BACKEND_URL = "https://api.sc-market.space"
  process.env.MFA_ENC_KEYS = JSON.stringify({ k1: Buffer.alloc(32, 9).toString("base64") })
  process.env.MFA_ENC_ACTIVE_KID = "k1"
  return { db: null as unknown, logs: [] as unknown[] }
})

vi.mock("../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: {
    get knex() {
      return h.db
    },
  },
}))
vi.mock("../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: async () => null, createExternalResource: async () => null },
}))
vi.mock("../../../logger/logger.js", () => {
  const rec = (level: string) => (...args: unknown[]) => h.logs.push([level, ...args])
  const logger = { info: rec("info"), warn: rec("warn"), error: rec("error"), debug: rec("debug") }
  return { default: logger, logger }
})

import { up as mfaUp } from "../../../../migrations/20261026000000_create_user_mfa.js"
import { up, down } from "../../../../migrations/20261026100000_test_accounts.js"
import {
  up as prefixUp,
  down as prefixDown,
} from "../../../../migrations/20261027010000_reserved_username_prefix.js"
import { up as validatePrefixUp } from "../../../../migrations/20261027010100_validate_reserved_username_prefix.js"
import {
  assertSameRealm,
  deliverableRecipients,
  hiddenFromRealViewers,
  involvesTestParty,
  notTestContractor,
  notTestSeller,
  notTestShop,
  notTestUser,
  realmsOf,
  TEST_ISOLATION_SQLSTATE,
} from "../isolation.js"
import {
  listingPubliclyListed,
  listingVisibleTo,
  publiclyListedSql,
} from "../../../api/routes/v2/util/listing-visibility.js"
import { buyOrderVisibleTo } from "../../../api/routes/v2/buy-orders/buy-order-visibility.js"
import { insertNotifications } from "../../../api/routes/v1/notifications/database.js"
import { getOrderStats } from "../../../api/routes/v1/orders/database.js"
import { withRequestContext } from "../../../api/util/request-context.js"
import { errorHandler } from "../../../api/middleware/error-handler.js"
import { csrfProtection } from "../../../api/middleware/csrf.js"
import { customOriginGuard } from "../../../api/middleware/custom-origin.js"
import { MfaService } from "../../mfa/service.js"
import { knexMfaRepo } from "../../mfa/repo.js"
import { setMfaService } from "../../mfa/instance.js"
import { codeForStep, stepAt } from "../../mfa/providers/totp.js"
import { createTestAccount, deleteTestAccount, listTestAccounts } from "../admin.js"
import { createTestLoginHandler, defaultTestLoginDeps, GENERIC_FAILURE_MESSAGE } from "../test-login.js"
import type { Request } from "express"

const db = () => h.db as Knex
const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const USER = (n: number) => uuid("b", n)
const ORG = (n: number) => uuid("a", n)
const SHOP = (n: number) => uuid("c", n)

// Real: users 1-3 (3 is an admin), org 1, shops 1 (user 1) and 2 (org 1).
// Test: users 11-12, org 11, shops 11 (user 11) and 12 (org 11).
const REAL_USER = USER(1)
const REAL_USER_2 = USER(2)
const REAL_ADMIN = USER(3)
const TEST_USER = USER(11)
const TEST_USER_2 = USER(12)

async function createBaseSchema(knex: Knex) {
  await knex.raw(`
    DROP VIEW IF EXISTS listing_search, order_stats, order_week_stats;
    DROP TABLE IF EXISTS test_login_events, user_mfa_events, user_mfa_recovery_codes, user_mfa_factors,
      notification, notification_change, notification_object, audit_logs, login_sessions,
      api_tokens, refresh_tokens, supplier_relationships, buy_orders_v2, chat_participants, chats,
      offer_sessions, orders, listings, shops, contractor_members, contractors, account_settings,
      accounts CASCADE;
    DROP FUNCTION IF EXISTS scm_is_mixed_realm(uuid[], uuid[], uuid[]) CASCADE;
    DROP FUNCTION IF EXISTS scm_test_isolation_violation(text) CASCADE;
    CREATE TABLE accounts (
      user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(100) NOT NULL UNIQUE, display_name VARCHAR(100) NOT NULL DEFAULT '',
      role VARCHAR(30) NOT NULL DEFAULT 'user', banned BOOLEAN NOT NULL DEFAULT false,
      rsi_confirmed BOOLEAN NOT NULL DEFAULT false, discord_id BIGINT,
      is_tombstone BOOLEAN NOT NULL DEFAULT false, deleted_at TIMESTAMPTZ,
      locale VARCHAR(10) NOT NULL DEFAULT 'en', created_at TIMESTAMP DEFAULT now());
    CREATE TABLE account_settings (user_id UUID REFERENCES accounts(user_id) ON DELETE CASCADE);
    CREATE TABLE contractors (
      contractor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), spectrum_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, archived BOOLEAN NOT NULL DEFAULT false, supported_languages TEXT[]);
    CREATE TABLE contractor_members (
      contractor_id UUID NOT NULL REFERENCES contractors(contractor_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      role VARCHAR(30) NOT NULL DEFAULT 'member');
    CREATE TABLE shops (
      shop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT NOT NULL, name TEXT NOT NULL,
      owner_user_id UUID REFERENCES accounts(user_id) ON DELETE SET NULL,
      owner_contractor_id UUID REFERENCES contractors(contractor_id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      CONSTRAINT chk_shops_owner CHECK (
        (owner_user_id IS NOT NULL AND owner_contractor_id IS NULL) OR
        (owner_user_id IS NULL AND owner_contractor_id IS NOT NULL)));
    CREATE TABLE listings (
      listing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID NOT NULL REFERENCES shops(shop_id) ON DELETE SET NULL,
      seller_id UUID, seller_type TEXT,
      status TEXT NOT NULL DEFAULT 'active', visibility TEXT NOT NULL DEFAULT 'public');
    CREATE VIEW listing_search AS
      SELECT l.*, s.owner_user_id AS shop_owner_user_id, s.owner_contractor_id AS shop_owner_contractor_id
      FROM listings l JOIN shops s ON s.shop_id = l.shop_id;
    CREATE TABLE orders (
      order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      assigned_id UUID REFERENCES accounts(user_id) ON DELETE SET NULL,
      contractor_id UUID REFERENCES contractors(contractor_id) ON DELETE SET NULL,
      shop_id UUID REFERENCES shops(shop_id) ON DELETE SET NULL,
      cost BIGINT NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'not-started',
      "timestamp" TIMESTAMP NOT NULL DEFAULT now());
    CREATE VIEW order_stats AS
      SELECT count(*) AS total_orders,
        (SELECT COALESCE(sum(orders.cost), 0) FROM orders WHERE orders.status = 'fulfilled') AS total_order_value
      FROM orders t;
    CREATE VIEW order_week_stats AS
      SELECT count(*) AS week_orders,
        (SELECT COALESCE(sum(orders.cost), 0) FROM orders
          WHERE orders.status <> 'cancelled' AND orders."timestamp" > now() - interval '7 days') AS week_order_value
      FROM orders t WHERE t."timestamp" > now() - interval '7 days';
    CREATE TABLE offer_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      assigned_id UUID REFERENCES accounts(user_id) ON DELETE SET NULL,
      contractor_id UUID REFERENCES contractors(contractor_id) ON DELETE SET NULL,
      shop_id UUID REFERENCES shops(shop_id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active', "timestamp" TIMESTAMP NOT NULL DEFAULT now());
    CREATE TABLE chats (chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE chat_participants (
      chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE);
    CREATE TABLE buy_orders_v2 (
      buy_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active', visibility TEXT NOT NULL DEFAULT 'public',
      target_supplier_id UUID, target_supplier_contractor_id UUID);
    CREATE TABLE supplier_relationships (
      aggregator_id UUID, supplier_id UUID, supplier_contractor_id UUID, status TEXT);
    CREATE TABLE refresh_tokens (
      token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ,
      user_agent TEXT, ip_address TEXT);
    CREATE TABLE api_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      scopes TEXT[] NOT NULL DEFAULT '{}', revoked_at TIMESTAMPTZ);
    CREATE TABLE login_sessions (sid TEXT PRIMARY KEY, sess JSON NOT NULL);
    CREATE TABLE audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), action TEXT, actor_id UUID,
      subject_type TEXT, subject_id TEXT, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE notification_object (
      notification_object_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), action_type_id INT, entity_id UUID);
    CREATE TABLE notification_change (
      notification_object_id UUID REFERENCES notification_object(notification_object_id), actor_id UUID);
    CREATE TABLE notification (
      notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_object_id UUID REFERENCES notification_object(notification_object_id),
      notifier_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      read BOOLEAN NOT NULL DEFAULT false);
  `)
}

async function seed(knex: Knex) {
  await knex("accounts").insert([
    { user_id: REAL_USER, username: "alice" },
    { user_id: REAL_USER_2, username: "bob" },
    { user_id: REAL_ADMIN, username: "boss", role: "admin" },
    { user_id: TEST_USER, username: "~test-buyer", is_test: true, rsi_confirmed: true },
    { user_id: TEST_USER_2, username: "~test-seller", is_test: true, rsi_confirmed: true },
  ])
  await knex("contractors").insert([
    { contractor_id: ORG(1), spectrum_id: "REALORG", name: "Real Org" },
    { contractor_id: ORG(11), spectrum_id: "~TESTORG", name: "Test Org", is_test: true },
  ])
  await knex("contractor_members").insert([
    { contractor_id: ORG(1), user_id: REAL_USER_2 },
    { contractor_id: ORG(11), user_id: TEST_USER_2 },
  ])
  // is_test is not passed: the trigger derives it from the owner.
  await knex("shops").insert([
    { shop_id: SHOP(1), slug: "alice", name: "Alice", owner_user_id: REAL_USER },
    { shop_id: SHOP(2), slug: "realorg", name: "Real Org", owner_contractor_id: ORG(1) },
    { shop_id: SHOP(11), slug: "test-buyer", name: "Test Buyer", owner_user_id: TEST_USER },
    { shop_id: SHOP(12), slug: "testorg", name: "Test Org", owner_contractor_id: ORG(11) },
  ])
  await knex("listings").insert([
    { listing_id: uuid("d", 1), shop_id: SHOP(1), seller_id: REAL_USER, seller_type: "user" },
    { listing_id: uuid("d", 2), shop_id: SHOP(2), seller_id: ORG(1), seller_type: "contractor" },
    { listing_id: uuid("d", 11), shop_id: SHOP(11), seller_id: TEST_USER, seller_type: "user" },
    { listing_id: uuid("d", 12), shop_id: SHOP(12), seller_id: ORG(11), seller_type: "contractor" },
  ])
}

async function sqlstate(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return "ok"
  } catch (e) {
    return String((e as { code?: string }).code)
  }
}

describe.skipIf(!PG_TEST_URL)("test accounts on Postgres", () => {
  beforeAll(async () => {
    h.db = knexFactory({ client: "pg", connection: await createTestDatabase(DB) })
    await createBaseSchema(db())
    await mfaUp(db())
    await up(db())
    // A test account from before the reserved prefix, renamed by the migration.
    await db()("accounts").insert({ user_id: USER(19), username: "test-legacy", is_test: true })
    await db().transaction((trx) => prefixUp(trx))
    await validatePrefixUp(db())
    await seed(db())
  })

  afterAll(async () => {
    await db().transaction((trx) => prefixDown(trx))
    await down(db())
    await db().destroy()
    await dropTestDatabase(DB)
  })

  describe("schema rules", () => {
    it("a test account can never be an admin (CHECK), whether inserted or promoted", async () => {
      expect(await sqlstate(db()("accounts").insert({ username: "~test-admin", role: "admin", is_test: true }))).toBe("23514")
      expect(await sqlstate(db()("accounts").where({ user_id: TEST_USER }).update({ role: "admin" }))).toBe("23514")
      expect(await sqlstate(db()("accounts").where({ user_id: TEST_USER }).update({ role: "moderator" }))).toBe("23514")
      expect((await db()("accounts").where({ user_id: TEST_USER }).first()).role).toBe("user")
    })

    it('test usernames carry the reserved "~" prefix, and only they do', async () => {
      expect((await db()("accounts").where({ user_id: USER(19) }).first()).username).toBe("~test-legacy")
      const v = await db().raw(`SELECT convalidated FROM pg_constraint WHERE conname = 'accounts_test_username_prefix'`)
      expect(v.rows[0].convalidated).toBe(true)
      expect(await sqlstate(db()("accounts").insert({ username: "~sneaky" }))).toBe("23514")
      expect(await sqlstate(db()("accounts").insert({ username: "test-noprefix", is_test: true }))).toBe("23514")
      expect(await sqlstate(db()("accounts").where({ user_id: REAL_USER }).update({ username: "~alice" }))).toBe("23514")
      expect(await sqlstate(db()("accounts").where({ user_id: TEST_USER }).update({ username: "plain" }))).toBe("23514")
      // Running the migration again changes nothing.
      await db().transaction((trx) => prefixUp(trx))
      expect((await db()("accounts").where({ user_id: USER(19) }).first()).username).toBe("~test-legacy")
    })

    it("accounts.is_test and contractors.is_test cannot change", async () => {
      expect(await sqlstate(db()("accounts").where({ user_id: REAL_USER }).update({ is_test: true }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(db()("accounts").where({ user_id: TEST_USER }).update({ is_test: false }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(db()("contractors").where({ contractor_id: ORG(11) }).update({ is_test: false }))).toBe(TEST_ISOLATION_SQLSTATE)
      // Other columns still update.
      expect(await sqlstate(db()("accounts").where({ user_id: TEST_USER }).update({ display_name: "Buyer" }))).toBe("ok")
    })

    it("a shop's test flag comes from its owner and ownership never crosses realms", async () => {
      const flags = await db()("shops").orderBy("slug").select("slug", "is_test")
      expect(Object.fromEntries(flags.map((r) => [r.slug, r.is_test]))).toEqual({
        alice: false, realorg: false, "test-buyer": true, testorg: true,
      })
      expect(await sqlstate(db()("shops").insert({ slug: "fake", name: "x", owner_user_id: REAL_USER, is_test: true }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(db()("shops").where({ shop_id: SHOP(11) }).update({ owner_user_id: REAL_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(db()("shops").where({ shop_id: SHOP(1) }).update({ owner_user_id: TEST_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(db()("shops").where({ shop_id: SHOP(1) }).update({ is_test: true }))).toBe(TEST_ISOLATION_SQLSTATE)
      // test -> test and real -> real transfers are fine
      expect(await sqlstate(db()("shops").where({ shop_id: SHOP(11) }).update({ owner_user_id: TEST_USER_2 }))).toBe("ok")
      expect(await sqlstate(db()("shops").where({ shop_id: SHOP(11) }).update({ owner_user_id: TEST_USER }))).toBe("ok")
    })

    it.each(["orders", "offer_sessions"])("%s never mix test and real parties, in either direction", async (table) => {
      const row = (r: Record<string, string | null>) => db()(table).insert(r)
      // real buyer -> test shop / test seller / test org, and the reverse
      expect(await sqlstate(row({ customer_id: REAL_USER, shop_id: SHOP(11) }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(row({ customer_id: REAL_USER, assigned_id: TEST_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(row({ customer_id: REAL_USER, contractor_id: ORG(11) }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(row({ customer_id: TEST_USER, shop_id: SHOP(1) }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(row({ customer_id: TEST_USER, assigned_id: REAL_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(row({ customer_id: TEST_USER, contractor_id: ORG(1), shop_id: SHOP(2) }))).toBe(TEST_ISOLATION_SQLSTATE)
      // same realm is fine
      expect(await sqlstate(row({ customer_id: TEST_USER, assigned_id: TEST_USER_2, shop_id: SHOP(12), contractor_id: ORG(11) }))).toBe("ok")
      expect(await sqlstate(row({ customer_id: REAL_USER_2, shop_id: SHOP(1), assigned_id: REAL_USER }))).toBe("ok")
      // and a later reassignment across realms is refused
      const [{ customer_id }] = await db()(table).where({ customer_id: REAL_USER_2 }).select("customer_id")
      expect(customer_id).toBe(REAL_USER_2)
      expect(await sqlstate(db()(table).where({ customer_id: REAL_USER_2 }).update({ assigned_id: TEST_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      await db()(table).del()
    })

    it("org membership never mixes realms", async () => {
      expect(await sqlstate(db()("contractor_members").insert({ contractor_id: ORG(1), user_id: TEST_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(db()("contractor_members").insert({ contractor_id: ORG(11), user_id: REAL_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      expect(await sqlstate(db()("contractor_members").insert({ contractor_id: ORG(11), user_id: TEST_USER }))).toBe("ok")
      await db()("contractor_members").where({ contractor_id: ORG(11), user_id: TEST_USER }).del()
    })

    it("chats never mix realms, also within one multi-row insert", async () => {
      const [{ chat_id: a }] = await db()("chats").insert({}).returning("chat_id")
      await db()("chat_participants").insert({ chat_id: a, user_id: REAL_USER })
      expect(await sqlstate(db()("chat_participants").insert({ chat_id: a, user_id: TEST_USER }))).toBe(TEST_ISOLATION_SQLSTATE)
      const [{ chat_id: b }] = await db()("chats").insert({}).returning("chat_id")
      expect(
        await sqlstate(db()("chat_participants").insert([{ chat_id: b, user_id: TEST_USER }, { chat_id: b, user_id: REAL_USER }])),
      ).toBe(TEST_ISOLATION_SQLSTATE)
      expect(
        await sqlstate(db()("chat_participants").insert([{ chat_id: b, user_id: TEST_USER }, { chat_id: b, user_id: TEST_USER_2 }])),
      ).toBe("ok")
      await db()("chats").del()
    })

    it("the error handler answers a trigger refusal with the isolation 403", async () => {
      const app = express()
      app.post("/x", async (_req, _res, next) => {
        try {
          await db()("orders").insert({ customer_id: REAL_USER, shop_id: SHOP(11) })
        } catch (e) {
          next(e)
        }
      })
      app.use(errorHandler)
      const res = await request(app).post("/x")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.details).toEqual({ reason: "test_account_isolation" })
    })
  })

  describe("application realm checks", () => {
    it("realmsOf / assertSameRealm / involvesTestParty", async () => {
      expect([...(await realmsOf({ users: [REAL_USER, REAL_ADMIN], shops: [SHOP(1)] }))]).toEqual([false])
      expect(await realmsOf({ users: [TEST_USER], contractors: [ORG(11)], shops: [SHOP(12)] })).toEqual(new Set([true]))
      await expect(assertSameRealm({ users: [REAL_USER], shops: [SHOP(11)] })).rejects.toMatchObject({
        code: "FORBIDDEN",
        details: { reason: "test_account_isolation" },
      })
      await expect(assertSameRealm({ users: [TEST_USER], shops: [SHOP(1)] })).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(assertSameRealm({ users: [TEST_USER, null, undefined], shops: [SHOP(12)] })).resolves.toBeUndefined()
      expect(await involvesTestParty({ shops: [SHOP(12)] })).toBe(true)
      expect(await involvesTestParty({ users: [REAL_USER], contractors: [ORG(1)] })).toBe(false)
    })

    it("checkout refuses test buyer -> real shop and real buyer -> test shop", async () => {
      const { assertBuyerMayCheckout } = await import("../../checkout/checkout-guards.js")
      const shop = (id: string, user: string | null, org: string | null) => ({
        shop_id: id,
        owner_user_id: user,
        owner_contractor_id: org,
      })
      await expect(assertBuyerMayCheckout(TEST_USER, shop(SHOP(1), REAL_USER, null), 1, 1)).rejects.toMatchObject({
        details: { reason: "test_account_isolation" },
      })
      await expect(assertBuyerMayCheckout(REAL_USER, shop(SHOP(12), null, ORG(11)), 1, 1)).rejects.toMatchObject({
        details: { reason: "test_account_isolation" },
      })
    })

    it("offers (every v1/v2 offer path goes through createOffer) refuse mixed parties up front", async () => {
      const { createOffer } = await import("../../../api/routes/v1/orders/helpers.js")
      await expect(
        createOffer({ customer_id: REAL_USER, assigned_id: TEST_USER }, { actor_id: REAL_USER }),
      ).rejects.toMatchObject({ details: { reason: "test_account_isolation" } })
      await expect(
        createOffer({ customer_id: TEST_USER, shop_id: SHOP(1) }, { actor_id: TEST_USER }),
      ).rejects.toMatchObject({ details: { reason: "test_account_isolation" } })
    })

    it("test accounts, orgs and shops cannot create webhooks", async () => {
      const { createNotificationWebhook } = await import("../../../api/routes/v1/util/webhooks.js")
      for (const args of [
        [undefined, TEST_USER, undefined],
        [ORG(11), undefined, undefined],
        [undefined, undefined, SHOP(12)],
      ] as const) {
        await expect(
          createNotificationWebhook("x", "https://discord.com/api/webhooks/1/x", [], ...args),
        ).rejects.toMatchObject({ details: { reason: "test_account_restricted" } })
      }
    })

    it("Discord: no threads or alerts for orders involving a test party", async () => {
      const { discordService } = await import("../../discord/discord.service.js")
      const result = await discordService.queueThreadCreation({
        order_id: uuid("f", 1),
        customer_id: REAL_USER,
        shop_id: SHOP(12),
      } as never)
      expect(result).toEqual({ status: "failed", message: "Discord is not used for test accounts" })
    })
  })

  describe("public surfaces (SQL executed)", () => {
    const ids = (rows: Array<{ listing_id: string }>) => rows.map((r) => r.listing_id).sort()
    const REAL_LISTINGS = [uuid("d", 1), uuid("d", 2)]
    const ALL_LISTINGS = [...REAL_LISTINGS, uuid("d", 11), uuid("d", 12)]
    const COLS = { visibility: "ls.visibility", ownerContractorId: "ls.shop_owner_contractor_id", shopId: "ls.shop_id" }

    it("market grid: anonymous and real viewers never see test shops' listings; test viewers see both", async () => {
      const grid = (viewer?: string) =>
        db()("listing_search as ls").where("ls.status", "active").where(listingVisibleTo(db(), viewer, COLS)).select("ls.listing_id")
      expect(ids(await grid(undefined))).toEqual(REAL_LISTINGS)
      expect(ids(await grid(REAL_USER))).toEqual(REAL_LISTINGS)
      expect(ids(await grid(REAL_ADMIN))).toEqual(REAL_LISTINGS)
      expect(ids(await grid(TEST_USER))).toEqual(ALL_LISTINGS)
    })

    it("viewer-independent aggregates (sitemap, stats, alerts) never include test shops", async () => {
      const rows = await db()("listing_search as ls")
        .where(listingPubliclyListed(db(), { status: "ls.status", visibility: "ls.visibility", shopId: "ls.shop_id" }))
        .select("ls.listing_id")
      expect(ids(rows)).toEqual(REAL_LISTINGS)
      const raw = await db().raw(`SELECT l.listing_id FROM listings l WHERE ${publiclyListedSql("l")}`)
      expect(ids(raw.rows)).toEqual(REAL_LISTINGS)
    })

    it("seller, user, org and shop predicates", async () => {
      const bySeller = await db()("listings as l").whereRaw(notTestSeller("l.seller_type", "l.seller_id")).select("l.listing_id")
      expect(ids(bySeller)).toEqual(REAL_LISTINGS)
      const users = await db()("accounts as a").whereRaw(notTestUser("a.user_id")).orderBy("username").pluck("username")
      expect(users).toEqual(["alice", "bob", "boss"])
      const orgs = await db()("contractors as c").whereRaw(notTestContractor("c.contractor_id")).pluck("spectrum_id")
      expect(orgs).toEqual(["REALORG"])
      const shops = await db()("shops as s").whereRaw(notTestShop("s.shop_id")).orderBy("slug").pluck("slug")
      expect(shops).toEqual(["alice", "realorg"])
      const forTest = await db()("shops as s").whereRaw(hiddenFromRealViewers(db(), "NOT s.is_test", TEST_USER)).count("* as n")
      expect(Number(forTest[0].n)).toBe(4)
      expect(() => notTestUser("x; DROP TABLE accounts")).toThrow()
    })

    it("buy orders: test accounts' orders are visible to test viewers only", async () => {
      await db()("buy_orders_v2").insert([
        { buy_order_id: uuid("e", 1), buyer_id: REAL_USER },
        { buy_order_id: uuid("e", 11), buyer_id: TEST_USER },
      ])
      const visible = async (viewer?: string) =>
        (await db()("buy_orders_v2 as bo").where(buyOrderVisibleTo(db(), viewer)).pluck("bo.buy_order_id")).sort()
      expect(await visible(undefined)).toEqual([uuid("e", 1)])
      expect(await visible(REAL_USER_2)).toEqual([uuid("e", 1)])
      expect(await visible(TEST_USER_2)).toEqual([uuid("e", 1), uuid("e", 11)])
      await db()("buy_orders_v2").del()
    })

    it("user and org search hide test accounts and orgs from real viewers", async () => {
      // setupTests mocks these modules globally; this needs the real ones.
      const { searchUsers } = await vi.importActual<typeof import("../../../api/routes/v1/profiles/database.js")>(
        "../../../api/routes/v1/profiles/database.js",
      )
      const { searchContractors } = await vi.importActual<typeof import("../../../api/routes/v1/contractors/database.js")>(
        "../../../api/routes/v1/contractors/database.js",
      )
      expect((await searchUsers("test")).map((u) => u.username)).toEqual([])
      expect((await searchUsers("test", true)).map((u) => u.username).sort()).toEqual(["~test-buyer", "~test-legacy", "~test-seller"])
      expect((await searchUsers("ali")).map((u) => u.username)).toEqual(["alice"])
      expect((await searchContractors("ORG")).map((c) => c.spectrum_id)).toEqual(["REALORG"])
      expect((await searchContractors("ORG", undefined, true)).map((c) => c.spectrum_id).sort()).toEqual(["REALORG", "~TESTORG"])
    })

    it("/api/market/stats leaves test orders out", async () => {
      await db()("orders").insert([
        { customer_id: REAL_USER_2, shop_id: SHOP(1), cost: 100, status: "fulfilled" },
        { customer_id: TEST_USER, shop_id: SHOP(12), cost: 5000, status: "fulfilled" },
        { customer_id: TEST_USER, shop_id: SHOP(12), cost: 7000, status: "not-started" },
      ])
      const stats = await getOrderStats()
      expect(stats.total_orders).toBe(1)
      expect(stats.total_order_value).toBe(100)
      expect(stats.week_orders).toBe(1)
      expect(stats.week_order_value).toBe(100)
      await db()("orders").del()
    })
  })

  describe("notifications", () => {
    async function notify(actor: string, recipients: string[]) {
      const [obj] = await db()("notification_object").insert({ action_type_id: 1 }).returning("*")
      await db()("notification_change").insert({ notification_object_id: obj.notification_object_id, actor_id: actor })
      const rows = await insertNotifications(
        recipients.map((r) => ({ notification_object_id: obj.notification_object_id, notifier_id: r })),
      )
      return rows.map((r) => r.notifier_id).sort()
    }

    it("never reach a real user because of a test account, and still reach test accounts", async () => {
      expect(await notify(TEST_USER, [REAL_USER, TEST_USER_2])).toEqual([TEST_USER_2])
      expect(await notify(TEST_USER, [REAL_USER])).toEqual([])
      expect(await notify(REAL_USER, [REAL_USER_2, TEST_USER])).toEqual([REAL_USER_2, TEST_USER].sort())
    })

    it("also when only the request says the actor is a test account", async () => {
      const req = { user: { user_id: TEST_USER, is_test: true } } as unknown as Request
      const allowed = await withRequestContext(req, () => deliverableRecipients([REAL_USER, TEST_USER_2]))
      expect(allowed).toEqual([TEST_USER_2])
      expect(await deliverableRecipients([REAL_USER, TEST_USER_2])).toEqual([REAL_USER, TEST_USER_2])
    })
  })

  describe("admin create + test-login + delete, end to end", () => {
    let secret = ""
    let acceptedCode = ""
    let app: express.Express
    const ORIGIN = "https://sc-market.space"
    const now = () => Date.now() / 1000

    function codeFor(b32: string, offset = 0): string {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      let bits = ""
      for (const ch of b32.replace(/=+$/, "")) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0")
      const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
      return codeForStep(bytes, stepAt(now()) + offset)
    }

    beforeAll(async () => {
      process.env.TEST_LOGIN_ENABLED = "true"
      process.env.JWT_SECRET = "test-secret"
      const free = { consume: async () => undefined }
      setMfaService(new MfaService({ repo: knexMfaRepo(), verifyLimiter: free, enrollLimiter: free }))
      const deps = { ...defaultTestLoginDeps(), accountLimiter: free, ipLimiter: free }
      app = express()
      app.use(cookieParser())
      app.use(express.json())
      app.use(csrfProtection({ isOriginAllowed: (o) => [ORIGIN, "https://shop.example.com"].includes(o) }))
      app.use(customOriginGuard)
      app.post("/api/auth/test-login", (req, res, next) => {
        createTestLoginHandler(deps)(req, res).catch(next)
      })
      app.use(errorHandler)
    })

    afterAll(() => {
      delete process.env.TEST_LOGIN_ENABLED
      setMfaService(null)
    })

    const login = (username: string, code: string, origin = ORIGIN) =>
      request(app).post("/api/auth/test-login").set("Origin", origin).send({ username, code })

    it("creates a test account with an authenticator, returning the secret once", async () => {
      const created = await createTestAccount(
        { username: "test-agent", display_name: "Test Agent" },
        REAL_ADMIN,
        { ip: "203.0.113.1", userAgent: "vitest" },
      )
      secret = created.secret
      expect(created.otpauth_uri).toContain(`secret=${secret}`)
      const row = await db()("accounts").where({ username: "~test-agent" }).first()
      expect(row).toMatchObject({ is_test: true, role: "user", rsi_confirmed: true, discord_id: null })
      const [factor] = await db()("user_mfa_factors").where({ user_id: row.user_id })
      expect(factor.confirmed_at).not.toBeNull()
      expect(JSON.stringify(factor)).not.toContain(secret)
      const listed = await listTestAccounts()
      expect(listed.map((a) => a.username)).toContain("~test-agent")
      expect(listed.find((a) => a.username === "~test-agent")?.has_authenticator).toBe(true)
      // Only test-prefixed usernames, never a taken one.
      await expect(createTestAccount({ username: "agent", display_name: "x" }, REAL_ADMIN, { ip: null, userAgent: null })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
      await expect(createTestAccount({ username: "TEST-AGENT", display_name: "x" }, REAL_ADMIN, { ip: null, userAgent: null })).rejects.toMatchObject({ code: "CONFLICT" })
    })

    it("logs a test account in with its code and issues the normal session cookies", async () => {
      acceptedCode = codeFor(secret)
      const res = await login("~test-agent", acceptedCode)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true, username: "~test-agent" })
      const cookies = String(res.headers["set-cookie"])
      expect(cookies).toContain("scmarket.access=")
      expect(cookies).toContain("scmarket.refresh=")
      const user = await db()("accounts").where({ username: "~test-agent" }).first()
      expect(await db()("refresh_tokens").where({ user_id: user.user_id }).whereNull("revoked_at").count("* as n")).toEqual([{ n: "1" }])
    })

    it("fails identically for a replayed code, a wrong code, real accounts, admins and unknown names", async () => {
      // A real account and an admin with a valid authenticator of their own.
      const free = { consume: async () => undefined }
      const svc = new MfaService({ repo: knexMfaRepo(), verifyLimiter: free, enrollLimiter: free })
      const realFactor = await svc.enrollConfirmedFactor({ user_id: REAL_USER, username: "alice" }, "totp", "x", REAL_ADMIN, { ip: null, userAgent: null })
      const adminFactor = await svc.enrollConfirmedFactor({ user_id: REAL_ADMIN, username: "boss" }, "totp", "x", REAL_ADMIN, { ip: null, userAgent: null })
      const b32 = (d: { display: Record<string, string> }) => d.display.manual_key.replace(/\s+/g, "")

      const outcomes = [
        await login("~test-agent", acceptedCode), // replay
        await login("~test-agent", codeFor(secret, 3)),
        await login("~test-agent", "12345"),
        await login("alice", codeFor(b32(realFactor))),
        await login("boss", codeFor(b32(adminFactor))),
        await login("nobody-at-all", "123456"),
      ]
      for (const res of outcomes) {
        expect(res.status).toBe(401)
        expect(res.body).toEqual(outcomes[0].body)
        expect(res.headers["set-cookie"]).toBeUndefined()
      }
      expect(outcomes[0].body.error.message).toBe(GENERIC_FAILURE_MESSAGE)
      // Real accounts get no session even with a valid code.
      expect(await db()("refresh_tokens").where({ user_id: REAL_USER }).count("* as n")).toEqual([{ n: "0" }])
      expect(await db()("refresh_tokens").where({ user_id: REAL_ADMIN }).count("* as n")).toEqual([{ n: "0" }])
    })

    it("refuses custom-domain origins and requests without an origin", async () => {
      const custom = await login("~test-agent", codeFor(secret, 1), "https://shop.example.com")
      expect(custom.status).toBe(403)
      expect(custom.body.error.details).toEqual({ reason: "custom_domain_restricted" })
      const foreign = await login("~test-agent", codeFor(secret, 1), "https://evil.example")
      expect(foreign.status).toBe(403)
      const none = await request(app).post("/api/auth/test-login").send({ username: "~test-agent", code: codeFor(secret, 1) })
      expect(none.status).toBe(403)
    })

    it("audits every attempt and never stores or logs the code", async () => {
      const events = await db()("test_login_events").orderBy("created_at")
      expect(events.filter((e) => e.outcome === "success")).toHaveLength(1)
      expect(events.map((e) => e.reason)).toEqual(
        expect.arrayContaining(["not_test_account", "unknown_user", "mfa_invalid_code", "origin_not_main_site"]),
      )
      const mfaEvents = await db()("user_mfa_events").pluck("event")
      expect(mfaEvents).toEqual(expect.arrayContaining(["verify_ok", "verify_failed"]))
      const everything = JSON.stringify([events, h.logs])
      for (const offset of [-1, 0, 1, 3]) expect(everything).not.toContain(`"${codeFor(secret, offset)}"`)
    })

    it("the kill switch: anything but TEST_LOGIN_ENABLED=true answers 404", async () => {
      for (const value of [undefined, "", "1", "TRUE", "yes"]) {
        if (value === undefined) delete process.env.TEST_LOGIN_ENABLED
        else process.env.TEST_LOGIN_ENABLED = value
        const res = await login("~test-agent", codeFor(secret, 1))
        expect(res.status).toBe(404)
      }
      process.env.TEST_LOGIN_ENABLED = "true"
    })

    it("deletes a test account with its orgs, shops, listings and orders, and never a real account", async () => {
      const user = await db()("accounts").where({ username: "~test-agent" }).first()
      const [org] = await db()("contractors").insert({ spectrum_id: "~TESTAGENT", name: "Agent Org", is_test: true }).returning("*")
      await db()("contractor_members").insert({ contractor_id: org.contractor_id, user_id: user.user_id })
      const [shop] = await db()("shops").insert({ slug: "agent", name: "Agent", owner_contractor_id: org.contractor_id }).returning("*")
      await db()("listings").insert({ shop_id: shop.shop_id })
      await db()("orders").insert({ customer_id: TEST_USER, shop_id: shop.shop_id })

      expect(await deleteTestAccount("~test-agent", REAL_ADMIN)).toEqual({ mode: "deleted", orgs: 1, shops: 1 })
      expect(await db()("accounts").where({ user_id: user.user_id }).first()).toBeUndefined()
      expect(await db()("contractors").where({ contractor_id: org.contractor_id }).first()).toBeUndefined()
      expect(await db()("shops").where({ shop_id: shop.shop_id }).first()).toBeUndefined()
      expect(await db()("orders").where({ shop_id: shop.shop_id }).first()).toBeUndefined()

      await expect(deleteTestAccount("alice", REAL_ADMIN)).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(await db()("accounts").where({ username: "alice" }).first()).toBeDefined()
    })
  })
})
