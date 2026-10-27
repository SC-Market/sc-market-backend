/**
 * Shop slugs against the FULL schema (src/test-utils/full-schema.ts):
 * reservation of org Spectrum IDs and usernames, reserved route words,
 * suggestions, GET /shops/slug-availability, and the create/rename race
 * (shops.slug UNIQUE, 23505) answered with a retry or a 409, never a 500.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
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
} from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"
import { BusinessLogicError } from "../../v1/util/errors.js"

const DB = "pgtest_v2_shop_slugs"
const state: { db: Knex | null; managers: Set<string> } = {
  db: null,
  managers: new Set(),
}

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: {
    getFileLinkResource: vi.fn(async (id: string) => `https://cdn.test/${id}`),
  },
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
// manage_market: "<contractor_id>:<user_id>" pairs in state.managers.
vi.mock("../../v1/util/permissions.js", () => ({
  has_permission: vi.fn(async (contractorId: string, userId: string) =>
    state.managers.has(`${contractorId}:${userId}`),
  ),
  is_member: vi.fn(async () => false),
}))

const { ShopsV2Controller } = await import("./ShopsV2Controller.js")
const slugService =
  await import("../../../../services/shops/shop-slug.service.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const ALICE = uuid("a", 1) // username Alice_Smith
const BOB = uuid("a", 2) // username bob
const CAROL = uuid("a", 3) // username carol, manages ACME
const ACME = uuid("c", 1) // spectrum_id ACME
const OTHER_ORG = uuid("c", 2) // spectrum_id OTHERORG

const asUser = (user_id: string) =>
  ({
    user: { user_id, role: "user", rsi_confirmed: true, banned: false },
  }) as never

/** The 409 a slug conflict answers with, or a failure. */
async function conflictOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error("expected a 409")
    },
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(BusinessLogicError)
  const e = error as BusinessLogicError
  expect(e.code).toBe("CONFLICT")
  return e.details as {
    reason: string
    suggestions: string[]
    reserved_for?: string
    reserved_word?: string
  }
}

describe.skipIf(!PG_TEST_URL)("shop slugs on the full schema", () => {
  const db = () => state.db!
  const controller = () => new ShopsV2Controller()

  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 8 },
    })
    await db()("accounts").insert([
      { user_id: ALICE, username: "Alice_Smith", display_name: "Alice" },
      { user_id: BOB, username: "bob", display_name: "Bob" },
      { user_id: CAROL, username: "carol", display_name: "Carol" },
    ])
    // The default org avatar and banner the contractors columns fall back to.
    await db()("image_resources")
      .insert([
        {
          resource_id: "3d3db169-6b57-4936-94e2-f2534b29663a",
          filename: "default-avatar.png",
        },
        {
          resource_id: "0008300c-fc6a-4e4e-9488-7d696f00e8b2",
          filename: "default-banner.png",
        },
      ])
      .onConflict("resource_id")
      .ignore()
    await db()("contractors").insert([
      {
        contractor_id: ACME,
        spectrum_id: "ACME",
        name: "Acme Corp",
        kind: "independent",
        size: 1,
      },
      {
        contractor_id: OTHER_ORG,
        spectrum_id: "OTHERORG",
        name: "Other Org",
        kind: "independent",
        size: 1,
      },
    ])
    state.managers.add(`${ACME}:${CAROL}`)
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  beforeEach(async () => {
    await db()("shops")
      .whereIn("owner_user_id", [ALICE, BOB, CAROL])
      .orWhereIn("owner_contractor_id", [ACME, OTHER_ORG])
      .del()
  })

  it("normalizes names in SQL exactly like normalizeShopSlug", async () => {
    const names = [
      "Alice_Smith",
      "~TESTAGENT",
      "--A..B--",
      "Ünïcode Org",
      "x__y",
      "MiXeD-Case",
    ]
    for (const name of names) {
      const { rows } = await db().raw(
        `SELECT ${slugService.normalizeShopSlugSql("?::text")} AS n`,
        [name],
      )
      expect(rows[0].n, name).toBe(slugService.normalizeShopSlug(name))
    }
  })

  describe("reservation", () => {
    it("reserves an org's Spectrum ID for that org, case-insensitively", async () => {
      const bob = await conflictOf(
        controller().createShop(asUser(BOB), { name: "Acme", slug: "acme" }),
      )
      expect(bob).toMatchObject({
        reason: "reserved_org",
        reserved_for: "ACME",
      })

      const shop = await controller().createShop(asUser(CAROL), {
        name: "Acme",
        slug: "acme",
        contractor_id: ACME,
      })
      expect(shop.slug).toBe("acme")
    })

    it("reserves <username>-shop and plain <username> for that user's personal shop", async () => {
      const taken = await conflictOf(
        controller().createShop(asUser(BOB), {
          name: "x",
          slug: "alice-smith-shop",
        }),
      )
      expect(taken).toMatchObject({
        reason: "reserved_user",
        reserved_for: "Alice_Smith",
      })
      const plain = await conflictOf(
        controller().createShop(asUser(BOB), {
          name: "x",
          slug: "alice-smith",
        }),
      )
      expect(plain).toMatchObject({ reason: "reserved_user" })

      expect(
        (
          await controller().createShop(asUser(ALICE), {
            name: "x",
            slug: "alice-smith-shop",
          })
        ).slug,
      ).toBe("alice-smith-shop")
    })

    it("keeps a user's name for their personal shop, not an org shop they manage", async () => {
      const details = await conflictOf(
        controller().createShop(asUser(CAROL), {
          name: "x",
          slug: "carol-shop",
          contractor_id: ACME,
        }),
      )
      expect(details.reason).toBe("reserved_user")
    })

    it("rejects a rename onto someone else's reserved name, allows the owner's own", async () => {
      const shop = await controller().createShop(asUser(BOB), {
        name: "Bob's Things",
      })
      const details = await conflictOf(
        controller().updateShop(asUser(BOB), shop.shop_id, {
          slug: "OTHERORG".toLowerCase(),
        }),
      )
      expect(details).toMatchObject({
        reason: "reserved_org",
        reserved_for: "OTHERORG",
      })

      const renamed = await controller().updateShop(asUser(BOB), shop.shop_id, {
        slug: "bob",
      })
      expect(renamed.slug).toBe("bob")
    })

    it("lets an existing shop keep a reserved slug it already holds", async () => {
      // Grandfathered: created before the reservation rules.
      const [legacy] = await db()("shops")
        .insert({ slug: "acme-legacy", name: "Squat", owner_user_id: BOB })
        .returning("*")
      await db()("shops")
        .where("shop_id", legacy.shop_id)
        .update({ slug: "acme" })

      const saved = await controller().updateShop(asUser(BOB), legacy.shop_id, {
        slug: "acme",
        name: "Renamed",
      })
      expect(saved).toMatchObject({ slug: "acme", name: "Renamed" })
      expect(await controller().getShop("acme")).toMatchObject({
        shop_id: legacy.shop_id,
      })

      const conflicts = await slugService.findSlugReservationConflicts(db())
      expect(conflicts).toContainEqual({
        shop_id: legacy.shop_id,
        slug: "acme",
        kind: "reserved_org",
        holder: "ACME",
      })

      // Once renamed away, only ACME can take it back.
      await controller().updateShop(asUser(BOB), legacy.shop_id, {
        slug: "bob-squat",
      })
      expect(
        (
          await conflictOf(
            controller().updateShop(asUser(BOB), legacy.shop_id, {
              slug: "acme",
            }),
          )
        ).reason,
      ).toBe("reserved_org")
    })
  })

  describe("reserved words", () => {
    it.each(["mine", "by-owner", "slug-availability", "create", "admin"])(
      "rejects %s",
      async (slug) => {
        const details = await conflictOf(
          controller().createShop(asUser(BOB), { name: "x", slug }),
        )
        expect(details).toMatchObject({
          reason: "reserved_word",
          reserved_word: slug,
        })
        expect(details.suggestions.length).toBeGreaterThan(0)
      },
    )

    it("skips reserved words and UUID shapes when generating a slug", async () => {
      expect(
        (await controller().createShop(asUser(BOB), { name: "Admin" })).slug,
      ).toBe("admin-2")
      await expect(
        controller().createShop(asUser(BOB), {
          name: "x",
          slug: "6f1c2c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f",
        }),
      ).rejects.toMatchObject({ name: "ValidationError" })
    })
  })

  describe("suggestions and availability", () => {
    it("suggests free alternatives for a taken slug", async () => {
      await controller().createShop(asUser(ALICE), {
        name: "x",
        slug: "rockets",
      })
      await controller().createShop(asUser(ALICE), {
        name: "x",
        slug: "rockets-2",
      })

      const details = await conflictOf(
        controller().createShop(asUser(BOB), { name: "x", slug: "rockets" }),
      )
      expect(details.reason).toBe("taken")
      expect(details.suggestions).toEqual([
        "rockets-shop",
        "rockets-bob",
        "bob-rockets",
        "rockets-3",
      ])
    })

    it("uses the org's Spectrum ID in suggestions for an org shop", async () => {
      await controller().createShop(asUser(BOB), { name: "x", slug: "ships" })
      const answer = await controller().getShopSlugAvailability(
        asUser(CAROL),
        "ships",
        ACME,
      )
      expect(answer).toMatchObject({ available: false, reason: "taken" })
      expect(answer.suggestions).toContain("ships-acme")
    })

    it("answers availability for the caller, an org, or a shop being renamed", async () => {
      expect(
        await controller().getShopSlugAvailability(asUser(BOB), "fresh-name"),
      ).toEqual({
        slug: "fresh-name",
        available: true,
        suggestions: [],
      })
      expect(
        await controller().getShopSlugAvailability(asUser(BOB), "acme"),
      ).toMatchObject({
        available: false,
        reason: "reserved_org",
      })
      expect(
        await controller().getShopSlugAvailability(asUser(CAROL), "acme", ACME),
      ).toMatchObject({ available: true })
      await expect(
        controller().getShopSlugAvailability(asUser(BOB), "acme", ACME),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      })

      const shop = await controller().createShop(asUser(BOB), {
        name: "x",
        slug: "bobs-own",
      })
      expect(
        await controller().getShopSlugAvailability(asUser(BOB), "bobs-own"),
      ).toMatchObject({ reason: "taken" })
      expect(
        await controller().getShopSlugAvailability(
          asUser(BOB),
          "bobs-own",
          undefined,
          shop.shop_id,
        ),
      ).toMatchObject({
        available: true,
      })
      expect(
        await controller().getShopSlugAvailability(asUser(BOB), "Has Spaces"),
      ).toMatchObject({
        available: false,
        reason: "invalid",
      })
      expect(
        (await controller().getShopSlugAvailability(asUser(BOB), "Has Spaces"))
          .suggestions[0],
      ).toBe("has-spaces")
    })
  })

  describe("races", () => {
    it("two concurrent creates of one chosen slug: one shop, one 409 with suggestions", async () => {
      const results = await Promise.allSettled([
        controller().createShop(asUser(ALICE), {
          name: "x",
          slug: "contested",
        }),
        controller().createShop(asUser(BOB), { name: "x", slug: "contested" }),
      ])
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      )
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason).toBeInstanceOf(BusinessLogicError)
      expect(rejected[0].reason).toMatchObject({
        code: "CONFLICT",
        details: { reason: "taken" },
      })
      expect(rejected[0].reason.details.suggestions.length).toBeGreaterThan(0)
      expect(
        await db()("shops").where("slug", "contested").count("* as n"),
      ).toEqual([{ n: "1" }])
    })

    it("concurrent auto-generated creates all succeed with distinct slugs", async () => {
      const shops = await Promise.all(
        [ALICE, BOB, CAROL, ALICE, BOB, CAROL].map((user) =>
          controller().createShop(asUser(user), { name: "Same Name" }),
        ),
      )
      const slugs = shops.map((s) => s.slug)
      expect(new Set(slugs).size).toBe(6)
      expect(slugs).toContain("same-name")
    })

    it("an insert that loses the race (23505) is a conflict with suggestions, or a retry for auto slugs", async () => {
      await db()("shops").insert({
        slug: "raced",
        name: "First",
        owner_user_id: ALICE,
      })

      // Checked free a moment ago, taken by the time it's inserted.
      const error = await slugService
        .insertShopWithChosenSlug(
          db(),
          "raced",
          { userId: BOB },
          { name: "Second", owner_user_id: BOB },
        )
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(slugService.ShopSlugConflictError)
      expect(
        (error as InstanceType<typeof slugService.ShopSlugConflictError>)
          .availability,
      ).toMatchObject({
        reason: "taken",
        suggestions: expect.arrayContaining(["raced-2"]),
      })

      const shop = await slugService.insertShopWithAutoSlug(
        db(),
        "raced",
        { userId: BOB },
        {
          name: "Second",
          owner_user_id: BOB,
        },
      )
      expect(shop.slug).toBe("raced-2")
    })

    it("a create that loses the race on the INSERT is a 409, an auto slug retries", async () => {
      // Same trick as the rename below: an uncommitted insert the checks can't see.
      const sniper = await db().transaction()
      await sniper("shops").insert({
        slug: "hot-name",
        name: "Sniper",
        owner_user_id: ALICE,
      })
      const chosen = controller().createShop(asUser(BOB), {
        name: "x",
        slug: "hot-name",
      })
      const auto = controller().createShop(asUser(CAROL), { name: "Hot Name" })
      await new Promise((resolve) => setTimeout(resolve, 500))
      await sniper.commit()
      const details = await conflictOf(chosen)
      const autoSlug = (await auto).slug
      expect(autoSlug).toMatch(/^hot-name-\d$/)
      expect(details.reason).toBe("taken")
      expect(details.suggestions.length).toBeGreaterThan(0)
    })

    it("a rename that loses the race is a 409, not a 500", async () => {
      const shop = await controller().createShop(asUser(BOB), {
        name: "x",
        slug: "rename-me",
      })
      // Another shop's insert of the slug is in flight (uncommitted, so the
      // availability check can't see it); the UPDATE waits on the unique
      // index and fails with 23505 once that insert commits.
      const sniper = await db().transaction()
      await sniper("shops").insert({
        slug: "wanted",
        name: "Sniper",
        owner_user_id: ALICE,
      })
      const rename = controller().updateShop(asUser(BOB), shop.shop_id, {
        slug: "wanted",
      })
      await new Promise((resolve) => setTimeout(resolve, 500))
      await sniper.commit()
      const details = await conflictOf(rename)
      expect(details.reason).toBe("taken")
      expect(details.suggestions).toContain("wanted-2")
    })
  })

  it("quick-create gives an org its Spectrum ID and a user <username>-shop", async () => {
    const org = await controller().quickCreateShop(asUser(CAROL), {
      owner_type: "contractor",
      contractor_id: ACME,
    })
    expect(org.slug).toBe("acme")
    const personal = await controller().quickCreateShop(asUser(ALICE), {
      owner_type: "user",
    })
    expect(personal.slug).toBe("alice-smith-shop")
  })
})
