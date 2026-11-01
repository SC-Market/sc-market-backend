/**
 * "Add Quick Listing" sends an empty description, and create rejected it with
 * 400 "Description is required", so quick-add always failed. A game item
 * already says what is sold, so the description is optional.
 */

import { describe, it, expect, vi } from "vitest"

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(),
  database: { knex: vi.fn() },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const { ListingsV2Controller } = await import("./ListingsV2Controller.js")

const base = {
  shop_id: "s1",
  title: "Arrowhead Sniper Rifle",
  game_item_id: "gi-1",
  pricing_mode: "unified" as const,
  base_price: 12000,
  lots: [{ quantity: 1, variant_attributes: {} }],
}

function validate(body: object) {
  return () =>
    new ListingsV2Controller()["validateCreateListingRequest"](body as never)
}

describe("create listing validation", () => {
  it("accepts an empty or missing description", () => {
    expect(validate({ ...base, description: "" })).not.toThrow()
    expect(validate(base)).not.toThrow()
  })

  it("still requires a title", () => {
    expect(validate({ ...base, title: "" })).toThrow()
  })
})
