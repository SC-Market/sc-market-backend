import { describe, it, expect } from "vitest"
import { shopSeller } from "./shop-seller.js"

describe("shopSeller", () => {
  it("an org shop sells as its org", () => {
    expect(
      shopSeller({ owner_user_id: null, owner_contractor_id: "org-1" }),
    ).toEqual({ type: "contractor", id: "org-1" })
  })
  it("a personal shop sells as its owner", () => {
    expect(
      shopSeller({ owner_user_id: "u1", owner_contractor_id: null }),
    ).toEqual({ type: "user", id: "u1" })
  })
  it("the org wins if both were ever set", () => {
    expect(
      shopSeller({ owner_user_id: "u1", owner_contractor_id: "org-1" }),
    ).toEqual({ type: "contractor", id: "org-1" })
  })
})
