import { describe, expect, it } from "vitest"
import { evaluateBranding } from "./branding.js"
import { buildChecklist } from "./onboarding.js"

describe("storefront onboarding checklist", () => {
  it("marks each step from the org's data, in order", () => {
    const branding = evaluateBranding({
      spectrum_id: "NEWORG",
      member_count: 1,
      recent_listings: 0,
      recent_orders: 0,
      granted: false,
      custom_domain: null,
    })
    const list = buildChecklist(branding, { shop_slug: "neworg", active_listings: 0, discord_connected: false })
    expect(list.steps).toEqual([
      { key: "verify", done: true },
      { key: "shop", done: true },
      { key: "listing", done: false },
      { key: "discord", done: false },
      { key: "members", done: false },
      { key: "branding", done: false },
    ])
    expect(list).toMatchObject({ done_count: 2, total: 6, shop_slug: "neworg" })
  })

  it("is complete for an active, verified org with Discord connected", () => {
    const branding = evaluateBranding({
      spectrum_id: "BWINCORP",
      member_count: 12,
      recent_listings: 4,
      recent_orders: 1,
      granted: false,
      custom_domain: null,
    })
    const list = buildChecklist(branding, { shop_slug: "bwincorp", active_listings: 4, discord_connected: true })
    expect(list.done_count).toBe(list.total)
  })
})
