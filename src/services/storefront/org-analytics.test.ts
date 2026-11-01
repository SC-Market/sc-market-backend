import { describe, expect, it } from "vitest"
import { conversionRate, sortMembersByName } from "./org-analytics.js"

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
})
