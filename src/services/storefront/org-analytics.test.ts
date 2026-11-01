import { describe, expect, it } from "vitest"
import { conversionRate, sortMembersByName, toOrgCustomers } from "./org-analytics.js"

describe("org analytics", () => {
  it("orders per member are listed by name, never ranked by count", () => {
    const rows = [
      { username: "zed", display_name: "Zed", assigned: 50, completed: 40, open: 2 },
      { username: "amy", display_name: "amy", assigned: 1, completed: 1, open: 0 },
      { username: "bob", display_name: "", assigned: 9, completed: 3, open: 6 },
    ]
    expect(sortMembersByName(rows).map((r) => r.username)).toEqual(["amy", "bob", "zed"])
  })

  it("conversion is sales over views in percent, 0 without views", () => {
    expect(conversionRate(3, 200)).toBe(1.5)
    expect(conversionRate(3, 0)).toBe(0)
  })

  it("org customers keep their own stats: two customers, different orders, different numbers", () => {
    // COUNT/SUM of bigint come back from Postgres as strings.
    const customers = toOrgCustomers([
      {
        user_id: "u1",
        username: "alice",
        display_name: "Alice",
        avatar: null,
        orders: "2",
        fulfilled_orders: "1",
        total_value: "1500000",
        last_order_at: new Date("2026-10-30T12:00:00Z"),
      },
      {
        user_id: "u2",
        username: "bob",
        display_name: null,
        avatar: "https://cdn.test/b.png",
        orders: "7",
        fulfilled_orders: "7",
        total_value: "32000000",
        last_order_at: "2026-10-31T08:00:00Z",
      },
    ])
    expect(customers).toEqual([
      {
        user_id: "u2",
        username: "bob",
        display_name: "",
        avatar: "https://cdn.test/b.png",
        orders: 7,
        fulfilled_orders: 7,
        total_value: 32_000_000,
        last_order_at: "2026-10-31T08:00:00.000Z",
      },
      {
        user_id: "u1",
        username: "alice",
        display_name: "Alice",
        avatar: null,
        orders: 2,
        fulfilled_orders: 1,
        total_value: 1_500_000,
        last_order_at: "2026-10-30T12:00:00.000Z",
      },
    ])
    expect(typeof customers[0].total_value).toBe("number")
  })
})
