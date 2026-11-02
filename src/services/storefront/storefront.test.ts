import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: vi.fn() }))

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
  const { tagline, compareCards, storefrontCardsQuery } = await import("./storefront.js")
  const card = (spectrum_id: string, completed_orders: number, active_listings = 1, active_services = 0) => ({
    spectrum_id,
    name: spectrum_id,
    logo_url: null,
    tagline: "",
    fields: [],
    active_listings,
    active_services,
    services_shop_slug: null,
    completed_orders,
    avg_rating: null,
    rating_count: 0,
    showcase: false,
  })

  it("lists the showcase orgs first, then by completed orders and listings", () => {
    const sorted = [card("ZETA", 90), card("MEDRUNNER", 1), card("ALPHA", 90, 5), card("BWINCORP", 0)].sort(compareCards)
    expect(sorted.map((c) => c.spectrum_id)).toEqual(["BWINCORP", "MEDRUNNER", "ALPHA", "ZETA"])
  })

  it("service-only orgs sort after orgs with listings, by services", () => {
    const sorted = [card("SVC1", 0, 0, 1), card("LIST", 0, 1), card("SVC3", 0, 0, 3)].sort(compareCards)
    expect(sorted.map((c) => c.spectrum_id)).toEqual(["LIST", "SVC3", "SVC1"])
  })

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
