/**
 * Item acquisition hub on the FULL schema: the reward-resolution query, the
 * mission_item_reward_keys() SQL function (and its GIN index) against
 * rewardKeys(), and the acquisition document's real SQL.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"

process.env.TZ = "UTC"

const DB = "pgtest_item_acquisition"
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

const resolution = await import("./reward-resolution.js")
const svc = await import("./item-acquisition.service.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const VERSION = uuid("a", 1)
const OLD_VERSION = uuid("a", 2)
const SHIP = uuid("1", 1) // the item under test
const SHIP_P4K = "41494cbf-8d90-4bb5-abd3-3b20cd694fc9"
const RIFLE = uuid("1", 2) // resolved by class name only
const TWIN_A = uuid("1", 3) // two items share one class name: ambiguous
const TWIN_B = uuid("1", 4)
const ORE = uuid("1", 5) // ingredient and resource
const SHIP_REF =
  "file://./../../../../../libs/foundry/records/entities/spaceships/ANVL_Hornet_F7_Mk2_Collector_Mod.json"
const SELLER = uuid("b", 1)
const TESTER = uuid("b", 9)
const SHOP = uuid("c", 1)
const TEST_SHOP = uuid("c", 9)
const OLD = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

function db() {
  return state.db!
}

let seq = 0
async function mission(
  name: string,
  item_rewards: unknown,
  opts: { version?: string; legal_status?: string; star_system?: string } = {},
) {
  seq++
  const mission_id = uuid("d", seq)
  await db()("missions").insert({
    mission_id,
    version_id: opts.version ?? VERSION,
    mission_code: `ia_mission_${seq}`,
    mission_name: name,
    category: "Delivery",
    mission_giver_org: "Wikelo",
    star_system: opts.star_system ?? "Nyx",
    legal_status: opts.legal_status ?? "LEGAL",
    item_rewards: item_rewards === null ? null : JSON.stringify(item_rewards),
  })
  return mission_id
}

async function listing(shop: string, owner: string, price: number, qty = 2) {
  seq++
  const listing_id = uuid("e", seq)
  const item_id = uuid("f", seq)
  await db()("listings").insert({
    listing_id,
    seller_id: owner,
    seller_type: "user",
    shop_id: shop,
    title: `Hornet ${seq}`,
    status: "active",
    sale_type: "fixed",
    visibility: "public",
    created_at: OLD,
  })
  await db()("listing_items").insert({
    item_id,
    listing_id,
    game_item_id: SHIP,
    pricing_mode: "unified",
    base_price: price,
  })
  const [v] = await db()("item_variants")
    .insert({ game_item_id: SHIP, attributes: { quality_tier: seq } })
    .returning("variant_id")
  await db()("listing_item_lots").insert({
    item_id,
    variant_id: v.variant_id,
    quantity_total: qty,
    owner_id: owner,
    listed: true,
  })
  return listing_id
}

const missionIds: Record<string, string> = {}

describe.skipIf(!PG_TEST_URL)("item acquisition (real SQL)", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 4 },
    })

    await db()("game_versions").insert([
      {
        version_id: VERSION,
        version_type: "LIVE",
        version_number: "4.10.2-LIVE.1",
        is_active: true,
        last_data_update: OLD,
      },
      {
        version_id: OLD_VERSION,
        version_type: "PTU",
        version_number: "4.10.3-PTU.1",
        is_active: true,
      },
    ])
    await db()("game_items").insert([
      {
        id: SHIP,
        name: "Anvil F7 Hornet Mk Wikelo",
        type: "Ship",
        p4k_id: SHIP_P4K,
        p4k_file: "anvl_hornet_f7_mk2_collector_mod",
      },
      {
        id: RIFLE,
        name: "P4-AR Rifle",
        type: "Weapon",
        p4k_file: "BEHR_Rifle_Ballistic_01",
      },
      { id: TWIN_A, name: "Twin A", type: "Other", p4k_file: "twin_item" },
      { id: TWIN_B, name: "Twin B", type: "Other", p4k_file: "twin_item" },
      { id: ORE, name: "Quantainium", type: "Commodity" },
    ])

    // Direct item rewards: by p4k id (with a misleading ref), by class name only.
    missionIds.byId = await mission("Wikelo Navy F7", [
      {
        name: "Anvil F7 Hornet Mk Wikelo",
        ref: "file://./x/unknown_record.json",
        itemId: SHIP_P4K.toUpperCase(),
      },
    ])
    missionIds.byFile = await mission(
      "Hornet Delivery",
      [
        { name: "anvl_hornet_f7_mk2_collector_mod", ref: SHIP_REF },
        { name: "rifle", ref: "file://./weapons/behr_rifle_ballistic_01.json" },
      ],
      { legal_status: "ILLEGAL", star_system: "Pyro" },
    )
    missionIds.ambiguous = await mission("Twin Reward", [
      { name: "twin", ref: "twin_item.json" },
    ])
    missionIds.other = await mission("Rifle Only", [
      { name: "rifle", ref: "behr_rifle_ballistic_01.json" },
    ])
    missionIds.nothing = await mission("No Items", null)
    missionIds.ptu = await mission(
      "PTU Hornet",
      [{ name: "x", ref: SHIP_REF }],
      { version: OLD_VERSION },
    )

    // Blueprint for the ship, rewarded by two missions (one guaranteed).
    const [bp] = await db()("blueprints")
      .insert({
        version_id: VERSION,
        blueprint_code: "bp_hornet",
        blueprint_name: "Hornet Blueprint",
        output_game_item_id: SHIP,
        tier: 2,
      })
      .returning("blueprint_id")
    await db()("blueprint_ingredients").insert({
      blueprint_id: bp.blueprint_id,
      ingredient_game_item_id: ORE,
      quantity_required: 4,
      display_order: 0,
    })
    missionIds.bp1 = await mission("Bounty A", null)
    missionIds.bp2 = await mission("Bounty B", null)
    await db()("mission_blueprint_rewards").insert([
      {
        mission_id: missionIds.bp1,
        blueprint_id: bp.blueprint_id,
        reward_pool_size: 4,
        drop_probability: 25,
      },
      {
        mission_id: missionIds.bp2,
        blueprint_id: bp.blueprint_id,
        reward_pool_size: 1,
        drop_probability: 100,
        is_guaranteed: true,
      },
    ])

    await db()("resources").insert({
      version_id: VERSION,
      game_item_id: SHIP,
      resource_category: "Test",
      can_be_purchased: true,
      purchase_locations: JSON.stringify({ Stanton: ["Area18"] }),
    })

    // Listings: a real shop's (counted) and a test shop's (excluded).
    await db()("accounts").insert([
      {
        user_id: SELLER,
        username: "ia_seller",
        display_name: "IA Seller Person",
      },
      {
        user_id: TESTER,
        username: "~ia_tester",
        display_name: "Tester",
        is_test: true,
      },
    ])
    await db()("shops").insert([
      {
        shop_id: SHOP,
        slug: "ia-shop",
        name: "IA Shop Name",
        owner_user_id: SELLER,
      },
      {
        shop_id: TEST_SHOP,
        slug: "ia-test-shop",
        name: "IA Test Shop",
        owner_user_id: TESTER,
      },
    ])
    missionIds.listing = await listing(SHOP, SELLER, 250_000)
    await listing(TEST_SHOP, TESTER, 100)
  }, 240_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("mission_item_reward_keys() in SQL equals rewardKeys() in TS", async () => {
    const samples = [
      [{ name: "a", ref: SHIP_REF, itemId: SHIP_P4K.toUpperCase() }],
      [
        { name: "b", ref: "BEHR_Rifle_Ballistic_01.JSON" },
        { name: "c", ref: "", itemId: "nope" },
      ],
      [{ name: "d", ref: "dir/" }, "junk", null],
      { not: "an array" },
    ]
    for (const s of samples) {
      const { rows } = await db().raw(
        "SELECT mission_item_reward_keys(?::jsonb) AS k",
        [JSON.stringify(s)],
      )
      const expected = [
        ...new Set(
          resolution
            .parseStoredRewards(s)
            .flatMap((r) => resolution.rewardKeys(r)),
        ),
      ].sort()
      expect(rows[0].k).toEqual(expected)
    }
  })

  it("resolves rewards exactly: p4k id first, else a unique class name, else null", async () => {
    const got = await resolution.resolveItemRewards(db(), [
      {
        name: "by id",
        ref: "file://./x/unknown_record.json",
        itemId: SHIP_P4K,
      },
      { name: "by file", ref: SHIP_REF },
      { name: "rifle", ref: "file://./weapons/BEHR_RIFLE_BALLISTIC_01.json" },
      { name: "twin", ref: "twin_item.json" },
      { name: "unknown", ref: "nothing_like_it.json", itemId: uuid("9", 9) },
      { name: "empty", ref: "" },
    ])
    expect(got.map((g) => g?.id ?? null)).toEqual([
      SHIP,
      SHIP,
      RIFLE,
      null,
      null,
      null,
    ])
    expect(got[0]).toEqual({
      id: SHIP,
      slug: "10000000--anvil-f7-hornet-mk-wikelo",
      name: "Anvil F7 Hornet Mk Wikelo",
    })
  })

  it("the reverse lookup uses the GIN index and agrees with the resolver", async () => {
    await db().raw("ANALYZE missions")
    const plan = await db().transaction(async (trx) => {
      await trx.raw("SET LOCAL enable_seqscan = off")
      const { rows } = await trx.raw(
        "EXPLAIN SELECT mission_id FROM missions WHERE mission_item_reward_keys(item_rewards) && ARRAY[?]::text[]",
        [["file:twin_item"]],
      )
      return rows
        .map((r: { "QUERY PLAN": string }) => r["QUERY PLAN"])
        .join("\n")
    })
    expect(plan).toContain("idx_missions_item_reward_keys")

    const ship = await db()("game_items")
      .where("id", SHIP)
      .first("id", "name", "type", "p4k_id", "p4k_file")
    const missions = await svc.missionsRewardingItem(db(), ship, VERSION)
    expect(missions.map((m) => m.mission_id).sort()).toEqual(
      [missionIds.byId, missionIds.byFile].sort(),
    )
    const twin = await db()("game_items")
      .where("id", TWIN_A)
      .first("id", "name", "type", "p4k_id", "p4k_file")
    expect(await svc.missionsRewardingItem(db(), twin, VERSION)).toEqual([])
  })

  it("builds the acquisition document from the active LIVE version, real shops only", async () => {
    const doc = await svc.buildAcquisitionDocument(SHIP.slice(0, 8), db())
    expect(doc).not.toBeNull()
    expect(doc!.item).toMatchObject({
      id: SHIP,
      slug: "10000000--anvil-f7-hornet-mk-wikelo",
    })
    expect(doc!.freshness).toMatchObject({ game_version: "4.10.2-LIVE.1" })
    expect(doc!.listings).toMatchObject({
      count: 1,
      seller_count: 1,
      quantity_available: 2,
      lowest_ask: 250_000,
    })
    expect(doc!.listings.top.map((l) => l.listing_id)).toEqual([
      missionIds.listing,
    ])
    expect(doc!.price.current).toMatchObject({
      seller_count: 1,
      lowest_ask: 250_000,
    })

    expect(doc!.missions.total).toBe(4)
    // Item rewards first (by name), then blueprints by guaranteed and drop chance.
    expect(
      doc!.missions.top.map((m) => [
        m.mission_name,
        m.reward_kind,
        m.drop_probability,
        m.is_guaranteed,
      ]),
    ).toEqual([
      ["Hornet Delivery", "item", null, null],
      ["Wikelo Navy F7", "item", null, null],
      ["Bounty B", "blueprint", 100, true],
      ["Bounty A", "blueprint", 25, false],
    ])
    const delivery = doc!.missions.top.find(
      (m) => m.mission_name === "Hornet Delivery",
    )!
    expect(delivery).toMatchObject({
      legal_status: "ILLEGAL",
      star_system: "Pyro",
      mission_giver_org: "Wikelo",
    })

    expect(doc!.blueprints.total).toBe(1)
    expect(doc!.blueprints.items[0]).toMatchObject({
      blueprint_name: "Hornet Blueprint",
      mission_count: 2,
      ingredients: [{ game_item_id: ORE, name: "Quantainium", quantity: 4 }],
    })
    expect(doc!.resource).toMatchObject({
      can_be_purchased: true,
      purchase_locations: { Stanton: ["Area18"] },
    })
    expect(doc!.in_game_shops).toEqual({ total: 0, shops: [] })

    const text = JSON.stringify(svc.toPublicDocument(doc!))
    for (const secret of [
      "IA Shop Name",
      "ia-shop",
      "IA Seller Person",
      "ia_seller",
      "IA Test Shop",
      SELLER,
      SHOP,
      TESTER,
      missionIds.listing,
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(JSON.stringify(doc)).not.toContain("IA Shop Name")
  })

  it("an unknown item is null", async () => {
    expect(await svc.buildAcquisitionDocument(uuid("7", 7), db())).toBeNull()
  })
})
