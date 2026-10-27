/**
 * Pure parts of shop slug handling (shop-slug.service.ts): normalization,
 * format rules, reserved words, who a reserved name belongs to, and spotting
 * the unique violation a lost create/rename race raises. The database side
 * is in src/api/routes/v2/shops/shop-slugs.pg.test.ts.
 */
import { describe, expect, it } from "vitest"
import {
  isShopSlugUniqueViolation,
  normalizeShopSlug,
  reservationVerdict,
  shopSlugFormatProblem,
  type OrgHolder,
  type UserHolder,
} from "./shop-slug.service.js"
import { RESERVED_SHOP_SLUGS, reservedShopSlug } from "./reserved-shop-slugs.js"

const ACME: OrgHolder = {
  contractor_id: "org-acme",
  spectrum_id: "ACME",
  norm: "acme",
}
const ALICE: UserHolder = {
  user_id: "u-alice",
  username: "Alice_Smith",
  norm: "alice-smith",
}
const ACME_USER: UserHolder = {
  user_id: "u-acme",
  username: "acme",
  norm: "acme",
}

describe("normalizeShopSlug", () => {
  it.each([
    ["Alice_Smith", "alice-smith"],
    ["~TESTAGENT", "testagent"],
    ["  Foo  Bar!! ", "foo-bar"],
    ["--x--", "x"],
    ["MiXeD-Case", "mixed-case"],
  ])("%s -> %s", (input, slug) => {
    expect(normalizeShopSlug(input)).toBe(slug)
  })
})

describe("shopSlugFormatProblem", () => {
  it("accepts lowercase letters, digits and inner hyphens, 3 to 50 long", () => {
    expect(shopSlugFormatProblem("abc")).toBeUndefined()
    expect(shopSlugFormatProblem("a-1-b")).toBeUndefined()
    expect(shopSlugFormatProblem("a".repeat(50))).toBeUndefined()
  })

  it.each(["ab", "a".repeat(51), "Abc", "-abc", "abc-", "a_b", "a b"])(
    "rejects %j",
    (slug) => {
      expect(shopSlugFormatProblem(slug)).toBeTruthy()
    },
  )

  it("rejects a UUID, which /shops/{shopId} routes would read as an id", () => {
    expect(
      shopSlugFormatProblem("6f1c2c3e-1b2a-4c5d-8e9f-0a1b2c3d4e5f"),
    ).toMatch(/id/)
  })
})

describe("reserved words", () => {
  it("are lowercase valid slugs, so the check can't be bypassed by format", () => {
    for (const word of RESERVED_SHOP_SLUGS) {
      expect(word).toBe(word.toLowerCase())
      expect(shopSlugFormatProblem(word), word).toBeUndefined()
    }
  })

  it("match case-insensitively", () => {
    expect(reservedShopSlug("MINE")).toBe("mine")
    expect(reservedShopSlug("by-owner")).toBe("by-owner")
    expect(reservedShopSlug("mine-2")).toBeUndefined()
  })
})

describe("reservationVerdict", () => {
  it("reserves an org's Spectrum ID for that org only", () => {
    expect(
      reservationVerdict("acme", { userId: "u-bob" }, [ACME], []),
    ).toMatchObject({
      reason: "reserved_org",
      reserved_for: "ACME",
    })
    expect(
      reservationVerdict("acme", { contractorId: "org-other" }, [ACME], []),
    ).toMatchObject({
      reason: "reserved_org",
    })
    expect(
      reservationVerdict("acme", { contractorId: "org-acme" }, [ACME], []),
    ).toBeUndefined()
  })

  it("reserves <username>-shop and <username> for that user's personal shop", () => {
    expect(
      reservationVerdict("alice-smith-shop", { userId: "u-bob" }, [], [ALICE]),
    ).toMatchObject({
      reason: "reserved_user",
      reserved_for: "Alice_Smith",
    })
    expect(
      reservationVerdict("alice-smith", { userId: "u-bob" }, [], [ALICE]),
    ).toMatchObject({
      reason: "reserved_user",
    })
    expect(
      reservationVerdict(
        "alice-smith-shop",
        { userId: "u-alice" },
        [],
        [ALICE],
      ),
    ).toBeUndefined()
    expect(
      reservationVerdict("alice-smith", { userId: "u-alice" }, [], [ALICE]),
    ).toBeUndefined()
    // An org shop is not the user's personal shop.
    expect(
      reservationVerdict(
        "alice-smith-shop",
        { contractorId: "org-acme" },
        [],
        [ALICE],
      ),
    ).toMatchObject({
      reason: "reserved_user",
    })
  })

  it("gives a plain username way to an org's Spectrum ID", () => {
    expect(
      reservationVerdict(
        "acme",
        { contractorId: "org-acme" },
        [ACME],
        [ACME_USER],
      ),
    ).toBeUndefined()
    expect(
      reservationVerdict("acme", { userId: "u-acme" }, [ACME], [ACME_USER]),
    ).toMatchObject({
      reason: "reserved_org",
    })
    // ...but the user's -shop slug stays theirs.
    expect(
      reservationVerdict(
        "acme-shop",
        { userId: "u-acme" },
        [ACME],
        [ACME_USER],
      ),
    ).toBeUndefined()
  })

  it("gives a plain username way to another user's <username>-shop", () => {
    const plain: UserHolder = {
      user_id: "u-plain",
      username: "alice-smith-shop",
      norm: "alice-smith-shop",
    }
    expect(
      reservationVerdict(
        "alice-smith-shop",
        { userId: "u-alice" },
        [],
        [ALICE, plain],
      ),
    ).toBeUndefined()
    expect(
      reservationVerdict(
        "alice-smith-shop",
        { userId: "u-plain" },
        [],
        [ALICE, plain],
      ),
    ).toMatchObject({
      reason: "reserved_user",
      reserved_for: "Alice_Smith",
    })
  })

  it("leaves unrelated slugs free", () => {
    expect(
      reservationVerdict("rockets", { userId: "u-bob" }, [ACME], [ALICE]),
    ).toBeUndefined()
  })
})

describe("isShopSlugUniqueViolation", () => {
  it("spots 23505 on shops.slug only", () => {
    expect(
      isShopSlugUniqueViolation({
        code: "23505",
        constraint: "shops_slug_unique",
      }),
    ).toBe(true)
    expect(isShopSlugUniqueViolation({ code: "23505", table: "shops" })).toBe(
      true,
    )
    expect(
      isShopSlugUniqueViolation({
        code: "23505",
        constraint: "shop_blocklist_pkey",
      }),
    ).toBe(false)
    expect(
      isShopSlugUniqueViolation({
        code: "23503",
        constraint: "shops_slug_unique",
      }),
    ).toBe(false)
    expect(isShopSlugUniqueViolation(new Error("boom"))).toBe(false)
    expect(isShopSlugUniqueViolation(null)).toBe(false)
  })
})
