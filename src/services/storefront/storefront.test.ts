import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(),
)

const { weightedByCompleted } = await import("./storefront.js")

describe("weightedByCompleted (org trust stats from shop metrics)", () => {
  it("weights each shop's metric by its completed orders", () => {
    expect(
      weightedByCompleted([
        { completed: 30, value: 90 },
        { completed: 10, value: 50 },
      ]),
    ).toBe(80)
  })

  it("skips shops without the metric or without completed orders", () => {
    expect(
      weightedByCompleted([
        { completed: 0, value: 10 },
        { completed: 5, value: null },
        { completed: 5, value: 40 },
      ]),
    ).toBe(40)
    expect(weightedByCompleted([])).toBeNull()
    expect(weightedByCompleted([{ completed: 0, value: 100 }])).toBeNull()
  })
})

describe("Storefronts hub", async () => {
  const { tagline, storefrontCardsQuery } = await import("./storefront.js")

  it("lists orgs with a public listing or an active service in a shown shop, with services counted", async () => {
    const { default: knexFactory } = await import("knex")
    const sql = storefrontCardsQuery(knexFactory({ client: "pg" })).toSQL().sql
    expect(sql).toContain(
      "(EXISTS (SELECT 1 FROM listing_search ls WHERE ls.status = 'active' AND ls.visibility = 'public'",
    )
    expect(sql).toMatch(/OR EXISTS \(SELECT 1 FROM services sv WHERE sv\.status = 'active' AND sv\.shop_id IN \(SELECT s\.shop_id FROM shops s WHERE s\.owner_contractor_id = c\.contractor_id AND s\.status = 'active' AND NOT EXISTS/)
    expect(sql).toContain("as active_services")
    expect(sql).toContain("as services_shop_slug")
  })

  it("taglines are the description's first plain line, capped", () => {
    expect(tagline("## **Haulers** of _Stanton_\n\nMore text")).toBe("Haulers of Stanton")
    expect(tagline(null)).toBe("")
    expect(tagline("x".repeat(200))).toHaveLength(140)
  })
})
