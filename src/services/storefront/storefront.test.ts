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
  const { tagline, compareCards } = await import("./storefront.js")
  const card = (spectrum_id: string, completed_orders: number, active_listings = 1) => ({
    spectrum_id,
    name: spectrum_id,
    logo_url: null,
    tagline: "",
    fields: [],
    active_listings,
    completed_orders,
    avg_rating: null,
    rating_count: 0,
    showcase: false,
  })

  it("lists the showcase orgs first, then by completed orders and listings", () => {
    const sorted = [card("ZETA", 90), card("MEDRUNNER", 1), card("ALPHA", 90, 5), card("BWINCORP", 0)].sort(compareCards)
    expect(sorted.map((c) => c.spectrum_id)).toEqual(["BWINCORP", "MEDRUNNER", "ALPHA", "ZETA"])
  })

  it("taglines are the description's first plain line, capped", () => {
    expect(tagline("## **Haulers** of _Stanton_\n\nMore text")).toBe("Haulers of Stanton")
    expect(tagline(null)).toBe("")
    expect(tagline("x".repeat(200))).toHaveLength(140)
  })
})
