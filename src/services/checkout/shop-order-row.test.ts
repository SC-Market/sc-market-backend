import { describe, it, expect } from "vitest"
import { shopOrderRow } from "./shop-order-row.js"

const buyer = { user_id: "buyer", username: "Khuzdul" }

describe("shopOrderRow", () => {
  it("a personal shop's order: linked to the shop, assigned to the owner", () => {
    expect(
      shopOrderRow({ shop_id: "shop-1", owner_user_id: "seller", owner_contractor_id: null }, buyer, 1000),
    ).toEqual({
      kind: "Delivery",
      cost: 1000,
      title: "Items Sold to Khuzdul",
      description: "",
      customer_id: "buyer",
      shop_id: "shop-1",
      contractor_id: null,
      assigned_id: "seller",
    })
  })

  it("an org shop's order: linked to shop and org, unassigned for members to claim", () => {
    expect(
      shopOrderRow({ shop_id: "shop-2", owner_user_id: null, owner_contractor_id: "org-1" }, buyer, 30),
    ).toMatchObject({ shop_id: "shop-2", contractor_id: "org-1", assigned_id: null, cost: 30 })
  })

  it("only sets columns the orders table has, and leaves status/timestamp to its defaults", () => {
    const row = shopOrderRow({ shop_id: "s", owner_user_id: "u", owner_contractor_id: null }, buyer, 1)
    expect(row).not.toHaveProperty("created_at")
    expect(row).not.toHaveProperty("updated_at")
    expect(row).not.toHaveProperty("status")
  })

  it("keeps the title within orders.title's 100 characters", () => {
    const row = shopOrderRow(
      { shop_id: "s", owner_user_id: "u", owner_contractor_id: null },
      { user_id: "b", username: "x".repeat(100) },
      1,
    )
    expect(row.title).toHaveLength(100)
  })
})
