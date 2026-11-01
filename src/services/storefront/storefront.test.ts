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
