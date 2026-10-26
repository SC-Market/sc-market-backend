/**
 * discord_channel_setups against a real, throwaway Postgres: the migration's
 * backfill, order-thread routing, alert channels and the bot's /setup routes.
 *
 * Needs a disposable database, e.g. one on a unix socket:
 *   initdb -D /tmp/pg && pg_ctl -D /tmp/pg -o "-k /tmp/pg -c listen_addresses=''" start
 *   createdb -h /tmp/pg botb
 *   DISCORD_SETUPS_PG_SOCKET=/tmp/pg DISCORD_SETUPS_PG_DB=botb npx vitest run src/services/discord/channel-setups.pg.test.ts
 * The test drops and recreates every table it uses, so never point it at a real database.
 *
 * The seed data copies the shapes found in production (read-only counts, Oct 2026):
 * bigint IDs on accounts/contractors and varchar IDs on shops, the shared
 * official channel registered with other servers, server-only and
 * channel-only values, users whose discord integration settings differ from
 * their legacy columns, shops that copy their owner, and alert
 * subscriptions in a channel the same owner also uses for threads.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import express from "express"
import request from "supertest"

const SOCKET = process.env.DISCORD_SETUPS_PG_SOCKET
const DB = process.env.DISCORD_SETUPS_PG_DB

const state: { db: Knex | null } = { db: null }
const perms: { allow: Set<string> } = { allow: new Set() }

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {},
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUserByDiscordId: vi.fn(async (discord_id: string) => {
    const row = await state.db!("accounts").where({ discord_id }).first()
    return row ? { user_id: row.user_id, username: row.username, role: row.role } : null
  }),
}))
vi.mock("../../api/routes/v1/contractors/database.js", () => ({
  getContractor: vi.fn(async (where: Record<string, string>) => {
    const row = await state.db!("contractors").where(where).first()
    if (!row) throw new Error("Invalid contractor")
    return row
  }),
}))
vi.mock("../../api/routes/v1/util/permissions.js", () => ({
  has_permission: vi.fn(
    async (contractor_id: string, user_id: string, permission: string) =>
      perms.allow.has(`${contractor_id}:${user_id}:${permission}`),
  ),
}))
vi.mock("../../api/routes/v1/util/webhooks.js", () => ({}))
vi.mock("../../clients/aws/sqs.js", () => ({ sendMessage: vi.fn() }))
vi.mock("../../clients/aws/sqs-config.js", () => ({ checkDiscordSQSConfiguration: vi.fn() }))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { up, down } from "../../../migrations/20261026030000_discord_channel_setups.js"
import { discordService } from "./discord.service.js"
import { getAlertChannels, getThreadChannel, setThreadChannel } from "./channel-setups.js"
import { channelSetupRouter } from "../../clients/discord_api/channel-setups.js"

// Discord snowflakes (18-19 digits), like production.
const OFFICIAL_GUILD = "1003056231591727264"
const OFFICIAL_CHANNEL = "1072580369251041330"
const g = (n: number) => `11${String(n).padStart(16, "0")}`
const c = (n: number) => `22${String(n).padStart(16, "0")}`
const d = (n: number) => `33${String(n).padStart(16, "0")}`
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const ORG = (n: number) => uuid("a", n)
const USER = (n: number) => uuid("b", n)
const SHOP = (n: number) => uuid("c", n)

/** Pre-migration schema: just the columns this migration reads, with production's types. */
async function createLegacySchema(db: Knex) {
  await db.raw(`
    DROP TABLE IF EXISTS discord_channel_setups, order_alert_subscriptions, account_integrations,
      orders, shops, contractors, accounts CASCADE;
    CREATE TABLE accounts (
      user_id UUID PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
      discord_id TEXT, official_server_id BIGINT, discord_thread_channel_id BIGINT,
      deleted_at TIMESTAMPTZ);
    CREATE TABLE contractors (
      contractor_id UUID PRIMARY KEY, spectrum_id TEXT NOT NULL, name TEXT NOT NULL,
      official_server_id BIGINT, discord_thread_channel_id BIGINT);
    CREATE TABLE shops (
      shop_id UUID PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL,
      owner_user_id UUID REFERENCES accounts(user_id),
      owner_contractor_id UUID REFERENCES contractors(contractor_id),
      status TEXT NOT NULL DEFAULT 'active',
      official_server_id VARCHAR(30), discord_thread_channel_id VARCHAR(30));
    CREATE TABLE account_integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      integration_type VARCHAR(50) NOT NULL, settings JSONB NOT NULL DEFAULT '{}',
      enabled BOOLEAN DEFAULT true,
      CONSTRAINT unique_integration_per_user UNIQUE (user_id, integration_type));
    CREATE TABLE order_alert_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel_id BIGINT NOT NULL, guild_id BIGINT NOT NULL,
      contractor_id UUID REFERENCES contractors(contractor_id) ON DELETE CASCADE,
      user_id UUID REFERENCES accounts(user_id) ON DELETE CASCADE,
      created_by_discord_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT order_alert_sub_channel_unique UNIQUE (channel_id));
    CREATE TABLE orders (
      order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id UUID, contractor_id UUID, assigned_id UUID);
  `)
}

async function seed(db: Knex) {
  await db("contractors").insert([
    // 1: its own server and channel
    { contractor_id: ORG(1), spectrum_id: "ORGONE", name: "Org One", official_server_id: g(1), discord_thread_channel_id: c(1) },
    // 2: the official channel ("Use Official Server")
    { contractor_id: ORG(2), spectrum_id: "ORGTWO", name: "Org Two", official_server_id: OFFICIAL_GUILD, discord_thread_channel_id: OFFICIAL_CHANNEL },
    // 3: official channel, but /register server pointed at another server
    { contractor_id: ORG(3), spectrum_id: "ORGTHREE", name: "Org Three", official_server_id: g(3), discord_thread_channel_id: OFFICIAL_CHANNEL },
    // 4: server only, 5: channel only, 6: nothing
    { contractor_id: ORG(4), spectrum_id: "ORGFOUR", name: "Org Four", official_server_id: g(4), discord_thread_channel_id: null },
    { contractor_id: ORG(5), spectrum_id: "ORGFIVE", name: "Org Five", official_server_id: null, discord_thread_channel_id: c(5) },
    { contractor_id: ORG(6), spectrum_id: "ORGSIX", name: "Org Six", official_server_id: null, discord_thread_channel_id: null },
    // 7: alerts in two other channels (like SCMARKET in production)
    { contractor_id: ORG(7), spectrum_id: "SCMARKET", name: "SC Market", official_server_id: OFFICIAL_GUILD, discord_thread_channel_id: OFFICIAL_CHANNEL },
    // 8: alerts in its own thread channel (merges into one row)
    { contractor_id: ORG(8), spectrum_id: "ORGEIGHT", name: "Org Eight", official_server_id: g(8), discord_thread_channel_id: c(8) },
  ])

  await db("accounts").insert([
    { user_id: USER(1), username: "alpha", discord_id: d(1), official_server_id: g(11), discord_thread_channel_id: c(11) },
    // integration says server-only; legacy columns say both (the integration wins)
    { user_id: USER(2), username: "bravo", discord_id: d(2), official_server_id: g(12), discord_thread_channel_id: c(12) },
    // no integration row: legacy columns are used
    { user_id: USER(3), username: "charlie", discord_id: d(3), official_server_id: g(13), discord_thread_channel_id: c(13) },
    // integration with a missing key
    { user_id: USER(4), username: "delta", discord_id: d(4), official_server_id: g(14), discord_thread_channel_id: null },
    // channel only
    { user_id: USER(5), username: "echo", discord_id: d(5), official_server_id: null, discord_thread_channel_id: c(15) },
    // personal alerts in their own thread channel
    { user_id: USER(6), username: "foxtrot", discord_id: d(6), official_server_id: g(16), discord_thread_channel_id: c(16) },
    // official channel with another server
    { user_id: USER(7), username: "golf", discord_id: d(7), official_server_id: g(17), discord_thread_channel_id: OFFICIAL_CHANNEL },
    // nothing set up
    { user_id: USER(8), username: "hotel", discord_id: d(8) },
    // site admin
    { user_id: USER(9), username: "india", discord_id: d(9), role: "admin" },
  ])

  await db("account_integrations").insert([
    { user_id: USER(1), integration_type: "discord", settings: { official_server_id: g(11), discord_thread_channel_id: c(11) } },
    { user_id: USER(2), integration_type: "discord", settings: { official_server_id: g(12), discord_thread_channel_id: null } },
    { user_id: USER(4), integration_type: "discord", settings: { official_server_id: g(14) } },
    { user_id: USER(5), integration_type: "discord", settings: { official_server_id: null, discord_thread_channel_id: c(15) } },
    { user_id: USER(6), integration_type: "discord", settings: { official_server_id: g(16), discord_thread_channel_id: c(16) } },
    { user_id: USER(7), integration_type: "discord", settings: { official_server_id: g(17), discord_thread_channel_id: OFFICIAL_CHANNEL } },
    { user_id: USER(8), integration_type: "discord", settings: {} },
  ])

  await db("shops").insert([
    // copies of the owner (the July backfill): no row of their own
    { shop_id: SHOP(1), slug: "org-one", name: "Org One Shop", owner_contractor_id: ORG(1), official_server_id: g(1), discord_thread_channel_id: c(1) },
    { shop_id: SHOP(2), slug: "alpha-shop", name: "Alpha Shop", owner_user_id: USER(1), official_server_id: g(11), discord_thread_channel_id: c(11) },
    { shop_id: SHOP(3), slug: "org-three", name: "Org Three Shop", owner_contractor_id: ORG(3), official_server_id: g(3), discord_thread_channel_id: OFFICIAL_CHANNEL },
    // its own channel
    { shop_id: SHOP(4), slug: "alpha-second", name: "Alpha Second", owner_user_id: USER(1), official_server_id: g(21), discord_thread_channel_id: c(21) },
    // its own channel; the owner has none
    { shop_id: SHOP(5), slug: "org-six", name: "Org Six Shop", owner_contractor_id: ORG(6), official_server_id: g(22), discord_thread_channel_id: c(22) },
    // incomplete: falls back to the owner
    { shop_id: SHOP(6), slug: "org-one-b", name: "Org One B", owner_contractor_id: ORG(1), official_server_id: null, discord_thread_channel_id: c(23) },
    { shop_id: SHOP(7), slug: "charlie-shop", name: "Charlie Shop", owner_user_id: USER(3), official_server_id: g(24), discord_thread_channel_id: "" },
    // user shop copying the legacy columns while the integration (server-only) wins: a row
    { shop_id: SHOP(8), slug: "bravo-shop", name: "Bravo Shop", owner_user_id: USER(2), official_server_id: g(12), discord_thread_channel_id: c(12) },
    // nothing
    { shop_id: SHOP(9), slug: "hotel-shop", name: "Hotel Shop", owner_user_id: USER(8) },
  ])

  await db("order_alert_subscriptions").insert([
    { channel_id: c(71), guild_id: g(71), contractor_id: ORG(7), created_by_discord_id: d(1) },
    { channel_id: c(72), guild_id: OFFICIAL_GUILD, contractor_id: ORG(7), created_by_discord_id: d(1) },
    { channel_id: c(8), guild_id: g(8), contractor_id: ORG(8), created_by_discord_id: d(3) },
    { channel_id: c(16), guild_id: g(16), user_id: USER(6), created_by_discord_id: d(6) },
  ])

  // One order per routing path, like production (an order's contractor and
  // assignee match its shop's owner).
  const orders = [
    { shop_id: SHOP(1), contractor_id: ORG(1) },
    { shop_id: SHOP(3), contractor_id: ORG(3) },
    { shop_id: SHOP(5), contractor_id: ORG(6) },
    { shop_id: SHOP(6), contractor_id: ORG(1) },
    { shop_id: SHOP(2), assigned_id: USER(1) },
    { shop_id: SHOP(4), assigned_id: USER(1) },
    { shop_id: SHOP(7), assigned_id: USER(3) },
    { shop_id: SHOP(8), assigned_id: USER(2) },
    { shop_id: SHOP(9), assigned_id: USER(8) },
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ contractor_id: ORG(n), assigned_id: USER(1) })),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ assigned_id: USER(n) })),
    {},
  ]
  await db("orders").insert(orders)
}

/**
 * The pre-migration thread routing, in SQL (the old resolveThreadConfig):
 * the shop's values when both are set, else the org's, else the assigned
 * user's integration settings (or legacy columns). A thread needs both values.
 * The same query checks production after the deploy.
 */
const LEGACY_ROUTING_SQL = `
  WITH u AS (
    SELECT a.user_id,
           CASE WHEN i.user_id IS NOT NULL THEN NULLIF(i.settings->>'official_server_id', '') ELSE a.official_server_id::text END AS g,
           CASE WHEN i.user_id IS NOT NULL THEN NULLIF(i.settings->>'discord_thread_channel_id', '') ELSE a.discord_thread_channel_id::text END AS c
      FROM accounts a LEFT JOIN account_integrations i ON i.user_id = a.user_id AND i.integration_type = 'discord'),
  legacy AS (
    SELECT o.order_id, o.shop_id, o.contractor_id, o.assigned_id,
           CASE WHEN NULLIF(s.official_server_id,'') IS NOT NULL AND NULLIF(s.discord_thread_channel_id,'') IS NOT NULL THEN s.official_server_id
                WHEN o.contractor_id IS NOT NULL THEN ct.official_server_id::text
                WHEN o.assigned_id IS NOT NULL THEN u.g END AS g,
           CASE WHEN NULLIF(s.official_server_id,'') IS NOT NULL AND NULLIF(s.discord_thread_channel_id,'') IS NOT NULL THEN s.discord_thread_channel_id
                WHEN o.contractor_id IS NOT NULL THEN ct.discord_thread_channel_id::text
                WHEN o.assigned_id IS NOT NULL THEN u.c END AS c
      FROM orders o
      LEFT JOIN shops s ON s.shop_id = o.shop_id
      LEFT JOIN contractors ct ON ct.contractor_id = o.contractor_id
      LEFT JOIN u ON u.user_id = o.assigned_id)
  SELECT order_id, shop_id, contractor_id, assigned_id,
         CASE WHEN g IS NOT NULL AND c IS NOT NULL THEN g END AS guild_id,
         CASE WHEN g IS NOT NULL AND c IS NOT NULL THEN c END AS channel_id
    FROM legacy`

function app() {
  const a = express()
  a.use(express.json())
  a.use("/channel-setups", channelSetupRouter)
  return a
}

describe.skipIf(!SOCKET || !DB)("discord_channel_setups on Postgres", () => {
  beforeAll(async () => {
    state.db = knexFactory({ client: "pg", connection: { host: SOCKET, database: DB } })
    await createLegacySchema(state.db)
    await seed(state.db)
    await up(state.db)
  })

  afterAll(async () => {
    await state.db?.destroy()
  })

  describe("backfill", () => {
    it("creates one row per thread owner with both values, plus the alert rows", async () => {
      const rows = await state.db!("discord_channel_setups")
        .select("owner_type", "owner_id", "guild_id", "channel_id", "threads", "alerts", "created_by_discord_id")
        .orderBy(["owner_type", "owner_id", "channel_id"])

      const key = (r: { owner_type: string; owner_id: string; channel_id: string }) =>
        `${r.owner_type}:${r.owner_id}:${r.channel_id}`
      const byKey = Object.fromEntries(rows.map((r) => [key(r), r]))

      expect(Object.keys(byKey).sort()).toEqual(
        [
          // orgs with both values (3 keeps its server even though the channel is the official one)
          `org:${ORG(1)}:${c(1)}`,
          `org:${ORG(2)}:${OFFICIAL_CHANNEL}`,
          `org:${ORG(3)}:${OFFICIAL_CHANNEL}`,
          `org:${ORG(7)}:${OFFICIAL_CHANNEL}`,
          `org:${ORG(8)}:${c(8)}`,
          // SC Market's two alert channels
          `org:${ORG(7)}:${c(71)}`,
          `org:${ORG(7)}:${c(72)}`,
          // users: integration settings when present, else legacy columns
          `user:${USER(1)}:${c(11)}`,
          `user:${USER(3)}:${c(13)}`,
          `user:${USER(6)}:${c(16)}`,
          `user:${USER(7)}:${OFFICIAL_CHANNEL}`,
          // shops that differ from their owner
          `shop:${SHOP(4)}:${c(21)}`,
          `shop:${SHOP(5)}:${c(22)}`,
          `shop:${SHOP(8)}:${c(12)}`,
        ].sort(),
      )

      expect(byKey[`org:${ORG(3)}:${OFFICIAL_CHANNEL}`]).toMatchObject({ guild_id: g(3), threads: true, alerts: false })
      expect(byKey[`org:${ORG(7)}:${c(71)}`]).toMatchObject({ guild_id: g(71), threads: false, alerts: true, created_by_discord_id: d(1) })
      // merged: thread row + alert subscription in the same channel
      expect(byKey[`org:${ORG(8)}:${c(8)}`]).toMatchObject({ guild_id: g(8), threads: true, alerts: true, created_by_discord_id: d(3) })
      expect(byKey[`user:${USER(6)}:${c(16)}`]).toMatchObject({ threads: true, alerts: true, created_by_discord_id: d(6) })
      expect(byKey[`user:${USER(1)}:${c(11)}`]).toMatchObject({ guild_id: g(11), created_by_discord_id: null })
    })

    it("routes every order exactly like the old columns did", async () => {
      const legacy = (await state.db!.raw(LEGACY_ROUTING_SQL)).rows as {
        order_id: string
        shop_id: string | null
        contractor_id: string | null
        assigned_id: string | null
        guild_id: string | null
        channel_id: string | null
      }[]
      expect(legacy.length).toBeGreaterThan(20)
      expect(legacy.filter((o) => o.channel_id).length).toBeGreaterThan(10)

      for (const order of legacy) {
        const routed = await discordService.resolveThreadConfig(order)
        const expected = order.channel_id ? { guild_id: order.guild_id, channel_id: order.channel_id } : null
        expect(routed, `order ${JSON.stringify(order)}`).toEqual(expected)
      }
    })

    it("keeps every alert subscription posting to the same channels", async () => {
      expect(await getAlertChannels({ contractor_id: ORG(7) })).toEqual(expect.arrayContaining([c(71), c(72)]))
      expect((await getAlertChannels({ contractor_id: ORG(7) })).length).toBe(2)
      expect(await getAlertChannels({ contractor_id: ORG(8) })).toEqual([c(8)])
      expect(await getAlertChannels({ user_id: USER(6) })).toEqual([c(16)])
      expect(await getAlertChannels({ contractor_id: ORG(1) })).toEqual([])
      // org work never reads the assignee's personal channels
      expect(await getAlertChannels({ contractor_id: ORG(1), user_id: USER(6) })).toEqual([])
    })

    it("down drops the table and leaves the old data alone", async () => {
      await down(state.db!)
      expect(await state.db!.schema.hasTable("discord_channel_setups")).toBe(false)
      expect((await state.db!("order_alert_subscriptions").count("* as n"))[0].n).toBe("4")
      await up(state.db!)
      expect((await state.db!("discord_channel_setups").count("* as n"))[0].n).toBe("14")
    })
  })

  describe("thread channel per owner", () => {
    it("moving threads keeps alerts in the old channel and removes an empty row", async () => {
      const org8 = { owner_type: "org" as const, owner_id: ORG(8) }
      const moved = await setThreadChannel(org8, { guild_id: g(81), channel_id: c(81) }, d(3))
      expect(moved).toEqual({ guild_id: g(8), channel_id: c(8) })
      expect(await getThreadChannel(org8)).toEqual({ guild_id: g(81), channel_id: c(81) })
      expect(await getAlertChannels({ contractor_id: ORG(8) })).toEqual([c(8)])

      const org1 = { owner_type: "org" as const, owner_id: ORG(1) }
      await setThreadChannel(org1, { guild_id: g(91), channel_id: c(91) }, d(1))
      expect(await state.db!("discord_channel_setups").where({ owner_id: ORG(1), channel_id: c(1) }).first()).toBeUndefined()
    })

    it("refuses a second thread channel for the same owner at the database level", async () => {
      await expect(
        state.db!("discord_channel_setups").insert({
          owner_type: "org", owner_id: ORG(2), channel_id: c(99), guild_id: g(99), threads: true,
        }),
      ).rejects.toThrow(/discord_channel_setups_one_thread_channel/)
    })
  })

  describe("bot routes", () => {
    const channel = c(500)
    const guild = g(500)

    it("refuses members without a linked account", async () => {
      const res = await request(app())
        .post("/channel-setups")
        .send({ discord_id: d(404), channel_id: channel, guild_id: guild, kind: "alerts" })
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/isn't linked to SC Market/)
    })

    it("needs the org permission for its kind, and names it", async () => {
      const res = await request(app())
        .post("/channel-setups")
        .send({ discord_id: d(2), channel_id: channel, guild_id: guild, kind: "threads", spectrum_id: "ORGSIX" })
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/Manage Webhooks permission in Org Six/)

      perms.allow.add(`${ORG(6)}:${USER(2)}:manage_orders`)
      const threads = await request(app())
        .post("/channel-setups")
        .send({ discord_id: d(2), channel_id: channel, guild_id: guild, kind: "threads", spectrum_id: "ORGSIX" })
      expect(threads.status).toBe(403)

      const alerts = await request(app())
        .post("/channel-setups")
        .send({ discord_id: d(2), channel_id: channel, guild_id: guild, kind: "alerts", spectrum_id: "ORGSIX" })
      expect(alerts.status).toBe(200)
      expect(alerts.body.data).toMatchObject({ kind: "alerts", owner_type: "org", owner_label: "Org Six (ORGSIX)" })
    })

    it("sets up personal threads and reports the channel they moved from", async () => {
      const res = await request(app())
        .post("/channel-setups")
        .send({ discord_id: d(1), channel_id: channel, guild_id: guild, kind: "threads" })
      expect(res.status).toBe(200)
      expect(res.body.data.moved_from).toEqual({ guild_id: g(11), channel_id: c(11) })
      expect(await discordService.resolveThreadConfig({ shop_id: null, contractor_id: null, assigned_id: USER(1) }))
        .toEqual({ guild_id: guild, channel_id: channel })
    })

    it("lists what the channel has, with readable owners", async () => {
      const res = await request(app()).get(`/channel-setups/${channel}`)
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([
        expect.objectContaining({ owner_type: "org", owner_label: "Org Six (ORGSIX)", spectrum_id: "ORGSIX", threads: false, alerts: true }),
        expect.objectContaining({ owner_type: "user", owner_label: "alpha", spectrum_id: null, threads: true, alerts: false }),
      ])

      const shop = await request(app()).get(`/channel-setups/${c(21)}`)
      expect(shop.body.data).toEqual([
        expect.objectContaining({ owner_type: "shop", owner_label: "the shop Alpha Second", threads: true }),
      ])
    })

    it("removes only what was asked, and says what is there when nothing matches", async () => {
      const missing = await request(app())
        .delete(`/channel-setups/${channel}`)
        .send({ discord_id: d(1), kind: "alerts" })
      expect(missing.status).toBe(404)
      expect(missing.body.error).toBe(
        "This channel has no order alerts for you. It has: order alerts for Org Six (ORGSIX), order threads for alpha.",
      )

      // creator of the org alerts may remove them; a stranger may not
      const stranger = await request(app())
        .delete(`/channel-setups/${channel}`)
        .send({ discord_id: d(8), kind: "alerts", spectrum_id: "ORGSIX" })
      expect(stranger.status).toBe(403)
      expect(stranger.body.error).toMatch(/Manage Orders or Manage Webhooks permission in Org Six/)

      const creator = await request(app())
        .delete(`/channel-setups/${channel}`)
        .send({ discord_id: d(2), kind: "alerts", spectrum_id: "ORGSIX" })
      expect(creator.status).toBe(200)

      const mine = await request(app())
        .delete(`/channel-setups/${channel}`)
        .send({ discord_id: d(1), kind: "threads" })
      expect(mine.status).toBe(200)
      expect((await request(app()).get(`/channel-setups/${channel}`)).body.data).toEqual([])
    })

    it("lets an org manager remove a backfilled row that has no creator", async () => {
      perms.allow.add(`${ORG(2)}:${USER(3)}:manage_webhooks`)
      const res = await request(app())
        .delete(`/channel-setups/${OFFICIAL_CHANNEL}`)
        .send({ discord_id: d(3), kind: "threads", spectrum_id: "ORGTWO" })
      expect(res.status).toBe(200)
      expect(await getThreadChannel({ owner_type: "org", owner_id: ORG(2) })).toBeNull()
      // other owners of the shared official channel are untouched
      expect(await getThreadChannel({ owner_type: "org", owner_id: ORG(7) })).toEqual({
        guild_id: OFFICIAL_GUILD,
        channel_id: OFFICIAL_CHANNEL,
      })
    })

    it("rejects malformed input", async () => {
      const res = await request(app())
        .post("/channel-setups")
        .send({ discord_id: d(1), channel_id: "general", guild_id: guild, kind: "threads" })
      expect(res.status).toBe(400)
      const kind = await request(app())
        .post("/channel-setups")
        .send({ discord_id: d(1), channel_id: channel, guild_id: guild, kind: "webhook" })
      expect(kind.status).toBe(400)
    })
  })
})
