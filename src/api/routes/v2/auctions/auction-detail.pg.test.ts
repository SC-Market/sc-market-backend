/**
 * GET /api/v2/auctions/{listingId} and POST .../bids against the FULL schema.
 *
 * The detail was anonymous and returned the seller's reserve_price and every
 * bidder's username, display name and avatar, for any listing: private org
 * listings and test shops' listings included, with every bid in one response.
 * Now:
 * - the auction is visible exactly when its listing is (public; unlisted by
 *   link; private to the owning org's members; test shops to test accounts);
 * - reserve_price is for the seller side only, everyone else gets
 *   has_reserve / reserve_met;
 * - bidders are "Bidder N" for everyone but the seller side, with the
 *   viewer's own bid marked is_you;
 * - bids are paginated.
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
} from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"

const DB = "pgtest_v2_auction_detail"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: (cb: (trx: Knex.Transaction) => Promise<unknown>) =>
    state.db!.transaction(cb),
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: {
    getFileLinkResource: vi.fn(async (id: string) => `https://cdn.test/${id}`),
  },
}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { createMarketBidNotificationV2: vi.fn() },
}))
// Org roles are not under test: org members here have no manage permission.
vi.mock("../../v1/util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(
    async (contractor_id: string, user_id: string) =>
      !!(await state.db!("contractor_members")
        .where({ contractor_id, user_id })
        .first()),
  ),
}))
vi.mock("../../v1/contractors/database.js", () => ({
  isContractorOwner: vi.fn(async () => false),
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { AuctionsV2Controller } = await import("./AuctionsV2Controller.js")
const { ValidationError } = await import("../../v1/util/errors.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const SELLER = uuid("b", 1)
const BIDDERS = [uuid("b", 2), uuid("b", 3), uuid("b", 4)]
const MEMBER = uuid("b", 5)
const OUTSIDER = uuid("b", 6)
const TESTER = uuid("b", 7)
const ORG = uuid("a", 1)
const SHOP = uuid("c", 1)
const ORG_SHOP = uuid("c", 2)
const TEST_SHOP = uuid("c", 3)
const PUBLIC = uuid("e", 1)
const PRIVATE = uuid("e", 2)
const UNLISTED = uuid("e", 3)
const TEST_LISTING = uuid("e", 4)
const NO_RESERVE = uuid("e", 5)

const anon = () => ({ headers: {} }) as never
const asUser = (user_id: string) =>
  ({
    headers: {},
    user: { user_id, role: "user", rsi_confirmed: true, banned: false },
  }) as never

function detail(
  listingId: string,
  req = anon(),
  page?: number,
  pageSize?: number,
) {
  const c = new AuctionsV2Controller()
  return c.getAuctionDetail(listingId, req, page, pageSize)
}

describe.skipIf(!PG_TEST_URL)("auction detail visibility and privacy", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 4 },
    })
    const db = state.db
    await db("accounts").insert([
      { user_id: SELLER, username: "auct_seller", display_name: "Seller" },
      ...BIDDERS.map((user_id, i) => ({
        user_id,
        username: `auct_bidder${i + 1}`,
        display_name: `Real Name ${i + 1}`,
      })),
      { user_id: MEMBER, username: "auct_member", display_name: "Member" },
      {
        user_id: OUTSIDER,
        username: "auct_outsider",
        display_name: "Outsider",
      },
      {
        user_id: TESTER,
        username: "~auct_tester",
        display_name: "Tester",
        is_test: true,
      },
    ])
    await db("contractors").insert({
      contractor_id: ORG,
      spectrum_id: "AUCTORG",
      kind: "Independent",
      size: 1,
      name: "Auction Org",
      // Seeded image_resources rows (the column defaults point at others).
      avatar: "5226c767-0599-419b-ae71-a7303c441db0",
      banner: "0008300c-fc6a-4e4e-9488-7d696f00e8b2",
    })
    await db("contractor_members").insert({
      contractor_id: ORG,
      user_id: MEMBER,
      role: "member",
    })
    await db("shops").insert([
      {
        shop_id: SHOP,
        slug: "auct-shop",
        name: "Seller Shop",
        owner_user_id: SELLER,
      },
      {
        shop_id: ORG_SHOP,
        slug: "auct-org-shop",
        name: "Org Shop",
        owner_contractor_id: ORG,
      },
      {
        shop_id: TEST_SHOP,
        slug: "auct-test-shop",
        name: "Test Shop",
        owner_user_id: TESTER,
      },
    ])
    const listing = (
      listing_id: string,
      shop_id: string,
      visibility: string,
      seller_id = SELLER,
    ) => ({
      listing_id,
      seller_id,
      seller_type: "user",
      shop_id,
      title: "Auction",
      status: "active",
      sale_type: "auction",
      visibility,
    })
    await db("listings").insert([
      listing(PUBLIC, SHOP, "public"),
      listing(PRIVATE, ORG_SHOP, "private"),
      listing(UNLISTED, SHOP, "unlisted"),
      listing(TEST_LISTING, TEST_SHOP, "public", TESTER),
      listing(NO_RESERVE, SHOP, "public"),
    ])
    const end_time = new Date(Date.now() + 86_400_000)
    await db("auction_details_v2").insert(
      [PUBLIC, PRIVATE, UNLISTED, TEST_LISTING].map((listing_id) => ({
        listing_id,
        end_time,
        min_bid_increment: 10,
        reserve_price: 2500,
      })),
    )
    await db("auction_details_v2").insert({
      listing_id: NO_RESERVE,
      end_time,
      min_bid_increment: 10,
    })
    // Bidder 1 bid first (then was outbid and re-bid), bidder 2 second, bidder 3 last.
    const t = (s: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, s))
    await db("bids_v2").insert([
      {
        listing_id: PUBLIC,
        bidder_id: BIDDERS[0],
        amount: 1000,
        is_active: false,
        created_at: t(1),
      },
      {
        listing_id: PUBLIC,
        bidder_id: BIDDERS[1],
        amount: 1500,
        is_active: true,
        created_at: t(2),
      },
      {
        listing_id: PUBLIC,
        bidder_id: BIDDERS[0],
        amount: 2000,
        is_active: true,
        created_at: t(3),
      },
      {
        listing_id: PUBLIC,
        bidder_id: BIDDERS[2],
        amount: 1800,
        is_active: true,
        created_at: t(4),
      },
      {
        listing_id: NO_RESERVE,
        bidder_id: BIDDERS[0],
        amount: 100,
        is_active: true,
        created_at: t(1),
      },
    ])
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("anonymous viewers get no reserve and no bidder identities", async () => {
    const res = await detail(PUBLIC)
    expect(res).not.toHaveProperty("reserve_price")
    expect(res).toMatchObject({
      has_reserve: true,
      reserve_met: false,
      is_seller: false,
      current_highest_bid: 2000,
      total_bids: 3,
      page: 1,
      page_size: 20,
    })
    expect(res.bids.map((b) => [b.amount, b.bidder])).toEqual([
      [
        2000,
        {
          username: null,
          display_name: "Bidder 1",
          avatar: null,
          bidder_number: 1,
          is_you: false,
        },
      ],
      [
        1800,
        {
          username: null,
          display_name: "Bidder 3",
          avatar: null,
          bidder_number: 3,
          is_you: false,
        },
      ],
      [
        1500,
        {
          username: null,
          display_name: "Bidder 2",
          avatar: null,
          bidder_number: 2,
          is_you: false,
        },
      ],
    ])
    const text = JSON.stringify(res)
    for (const leak of ["auct_bidder", "Real Name", "2500", ...BIDDERS])
      expect(text).not.toContain(leak)
  })

  it("a bidder sees their own bid marked, and no one else's identity", async () => {
    const res = await detail(PUBLIC, asUser(BIDDERS[2]))
    expect(res).not.toHaveProperty("reserve_price")
    expect(
      res.bids.map((b) => [b.bidder.display_name, b.bidder.is_you]),
    ).toEqual([
      ["Bidder 1", false],
      ["Bidder 3", true],
      ["Bidder 2", false],
    ])
    expect(JSON.stringify(res)).not.toContain("auct_bidder")
  })

  it("the seller sees the reserve and real bidders", async () => {
    const res = await detail(PUBLIC, asUser(SELLER))
    expect(res).toMatchObject({
      reserve_price: 2500,
      has_reserve: true,
      reserve_met: false,
      is_seller: true,
    })
    expect(res.bids.map((b) => b.bidder.username)).toEqual([
      "auct_bidder1",
      "auct_bidder3",
      "auct_bidder2",
    ])
    expect(res.bids[0].bidder.display_name).toBe("Real Name 1")
  })

  it("reserve_met is null without a reserve", async () => {
    const res = await detail(NO_RESERVE)
    expect(res).toMatchObject({ has_reserve: false, reserve_met: null })
  })

  it("paginates bids, keeping numbers and totals", async () => {
    const p1 = await detail(PUBLIC, anon(), 1, 2)
    const p2 = await detail(PUBLIC, anon(), 2, 2)
    expect(p1).toMatchObject({
      total_bids: 3,
      current_highest_bid: 2000,
      page: 1,
      page_size: 2,
    })
    expect(p1.bids.map((b) => b.amount)).toEqual([2000, 1800])
    expect(p2.bids.map((b) => [b.amount, b.bidder.display_name])).toEqual([
      [1500, "Bidder 2"],
    ])
    expect((await detail(PUBLIC, anon(), 1, 1000)).page_size).toBe(100)
  })

  it("rejects bad pagination with a 400", async () => {
    await expect(detail(PUBLIC, anon(), 1, -5)).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(detail(PUBLIC, anon(), 0, 10)).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(detail(PUBLIC, anon(), 100_000, 10)).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it("private org auctions: members only", async () => {
    await expect(detail(PRIVATE)).rejects.toMatchObject({
      name: "NotFoundError",
    })
    await expect(detail(PRIVATE, asUser(OUTSIDER))).rejects.toMatchObject({
      name: "NotFoundError",
    })
    await expect(detail(PRIVATE, asUser(MEMBER))).resolves.toMatchObject({
      listing_id: PRIVATE,
    })
  })

  it("unlisted auctions: by link, as on the listing page", async () => {
    await expect(detail(UNLISTED)).resolves.toMatchObject({
      listing_id: UNLISTED,
    })
  })

  it("test shops' auctions: test accounts only", async () => {
    await expect(detail(TEST_LISTING)).rejects.toMatchObject({
      name: "NotFoundError",
    })
    await expect(detail(TEST_LISTING, asUser(OUTSIDER))).rejects.toMatchObject({
      name: "NotFoundError",
    })
    await expect(detail(TEST_LISTING, asUser(TESTER))).resolves.toMatchObject({
      listing_id: TEST_LISTING,
    })
  })

  it("non-UUID ids are a 404, not a 500", async () => {
    await expect(detail("not-a-uuid")).rejects.toMatchObject({
      name: "NotFoundError",
    })
  })

  it("cannot bid on an auction the bidder cannot see", async () => {
    const c = new AuctionsV2Controller()
    await expect(
      c.placeBid(PRIVATE, { amount: 5000 }, asUser(OUTSIDER)),
    ).rejects.toMatchObject({
      name: "NotFoundError",
    })
    expect(
      await state.db!("bids_v2")
        .where({ listing_id: PRIVATE })
        .count("* as n")
        .first(),
    ).toMatchObject({ n: "0" })
  })
})
