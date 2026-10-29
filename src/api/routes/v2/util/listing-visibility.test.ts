import { describe, it, expect } from "vitest"
import knexFactory from "knex"
import {
  listingPubliclyListed,
  listingVisibleTo,
  visibleActiveListingCountQuery,
} from "./listing-visibility.js"

// SQL is only compiled, never run: no connection is needed for toSQL().
const knex = knexFactory({ client: "pg" })

const LS_COLUMNS = {
  visibility: "ls.visibility",
  ownerContractorId: "ls.shop_owner_contractor_id",
  shopId: "ls.shop_id",
}

// Test shops (services/test-accounts) are hidden from everyone but test accounts.
const NOT_TEST_SHOP =
  "(NOT EXISTS (SELECT 1 FROM shops _ts WHERE _ts.shop_id = ls.shop_id AND _ts.is_test))"

describe("listing visibility", () => {
  // Regression: /market showed unlisted (link-only) listings to anonymous
  // visitors because the rule was "visibility != 'private'".
  it("shows anonymous viewers public listings only (no private, no unlisted)", () => {
    const q = knex("listing_search as ls")
      .where(listingVisibleTo(knex, undefined, null, LS_COLUMNS))
      .toSQL()
    expect(q.sql).toBe(
      `select * from "listing_search" as "ls" where (${NOT_TEST_SHOP} and "ls"."visibility" = ?)`,
    )
    expect(q.bindings).toEqual(["public"])
  })

  it("shows test shops' listings to test viewers only", () => {
    const q = knex("listing_search as ls")
      .where(listingVisibleTo(knex, "user-1", null, LS_COLUMNS))
      .toSQL()
    expect(q.sql).toContain(
      "((NOT EXISTS (SELECT 1 FROM shops _ts WHERE _ts.shop_id = ls.shop_id AND _ts.is_test)) OR EXISTS (SELECT 1 FROM accounts _tv WHERE _tv.user_id = ? AND _tv.is_test))",
    )
    expect(q.bindings[0]).toBe("user-1")
  })

  it("lets a signed-in viewer see private listings only of orgs they belong to, never unlisted ones", () => {
    const q = knex("listing_search as ls")
      .where(listingVisibleTo(knex, "user-1", null, LS_COLUMNS))
      .toSQL()
    expect(q.sql).toContain(
      '"ls"."visibility" = ? or ("ls"."visibility" = ? and "ls"."shop_owner_contractor_id" is not null and exists',
    )
    expect(q.sql).toContain('contractor_members.contractor_id = "ls"."shop_owner_contractor_id"')
    expect(q.sql).toContain('"contractor_members"."user_id" = ?')
    expect(q.bindings).toEqual(["user-1", "public", "private", "user-1"])
    expect(q.bindings).not.toContain("unlisted")
  })

  it("publicly listed = active and public", () => {
    const q = knex("listing_search as ls")
      .where(listingPubliclyListed(knex, { ...LS_COLUMNS, status: "ls.status" }))
      .toSQL()
    expect(q.sql).toBe(
      'select * from "listing_search" as "ls" where ("ls"."status" = ? and ("ls"."visibility" = ?) and NOT EXISTS (SELECT 1 FROM shops _ts WHERE _ts.shop_id = ls.shop_id AND _ts.is_test))',
    )
    expect(q.bindings).toEqual(["active", "public"])
  })
})

describe("visibleActiveListingCountQuery (shop header / shop card count)", () => {
  // Regression: /shops/medrunner showed "3 listings" to anonymous visitors
  // while the grid said "No active listings" — the count included the
  // org-internal (private) listings the grid hides.
  it("counts only active, public listings for anonymous viewers", () => {
    const q = visibleActiveListingCountQuery(knex, "shop-1", undefined, null)
      .count("* as count")
      .toSQL()
    expect(q.sql).toBe(
      `select count(*) as "count" from "listing_search" as "ls" where "ls"."shop_id" = ? and "ls"."status" = ? and (${NOT_TEST_SHOP} and "ls"."visibility" = ?)`,
    )
    expect(q.bindings).toEqual(["shop-1", "active", "public"])
  })

  it("applies exactly the grid's visibility filter for signed-in viewers", () => {
    const count = visibleActiveListingCountQuery(knex, "shop-1", "user-1", null).toSQL()
    const grid = knex("listing_search as ls")
      .where("ls.shop_id", "shop-1")
      .where("ls.status", "active")
      .where(listingVisibleTo(knex, "user-1", null, LS_COLUMNS))
      .toSQL()
    expect(count.sql).toBe(grid.sql)
    expect(count.bindings).toEqual(grid.bindings)
  })

  it("correlates with the outer shops query when given a column ref", () => {
    const sub = visibleActiveListingCountQuery(knex, knex.ref("s.shop_id"), undefined, null)
      .select(knex.raw("COUNT(*)::integer"))
      .as("listing_count")
    const q = knex("shops as s").select("s.shop_id", sub).toSQL()
    expect(q.sql).toContain(
      `(select COUNT(*)::integer from "listing_search" as "ls" where "ls"."shop_id" = "s"."shop_id" and "ls"."status" = ? and (${NOT_TEST_SHOP} and "ls"."visibility" = ?)) as "listing_count"`,
    )
  })
})
