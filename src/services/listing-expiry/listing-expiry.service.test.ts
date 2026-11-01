import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: vi.fn() }))
vi.mock("../notify/dispatcher.js", () => ({ notify: vi.fn() }))
vi.mock("../notify/recipients.js", () => ({ orgMembersWithPermission: vi.fn() }))

import {
  EXPIRY_CUTOVER,
  LISTING_LIFETIME,
  MIN_NOTICE_HOURS,
  NOTICE_DAYS_BEFORE,
  batchByShop,
  listingExpiryEnabled,
  noticeDm,
  renewPath,
  renewalColumns,
} from "./listing-expiry.service.js"

const row = (listing: string, shop: string, title = `Listing ${listing}`) => ({
  listing_id: listing,
  title,
  expires_at: new Date("2026-12-01T00:00:00Z"),
  shop_id: shop,
  shop_slug: `${shop}-slug`,
  shop_name: `Shop ${shop}`,
  owner_user_id: "u1",
  owner_contractor_id: null,
})

describe("rules", () => {
  it("V1's expiry length is unchanged; notice 3 days before; never pause without a day's notice", () => {
    expect(LISTING_LIFETIME).toBe("1 month")
    expect(NOTICE_DAYS_BEFORE).toBe(3)
    expect(MIN_NOTICE_HOURS).toBeGreaterThanOrEqual(24)
    expect(EXPIRY_CUTOVER.toISOString()).toBe("2026-11-02T00:00:00.000Z")
  })
})

describe("batchByShop", () => {
  it("one batch per shop, capped per run", () => {
    const { batches, capped } = batchByShop([row("l1", "s1"), row("l2", "s1"), row("l3", "s2"), row("l4", "s3")], 2)
    expect(batches.map((b) => [b.shop_id, b.listings.map((l) => l.listing_id)])).toEqual([
      ["s1", ["l1", "l2"]],
      ["s2", ["l3"]],
    ])
    expect(capped).toBe(1)
    expect(new Set(batches.map((b) => b.batch_id)).size).toBe(2)
  })
})

describe("renew link and DM", () => {
  it("one-click renew goes to the seller's listings page with the listings to renew", () => {
    expect(renewPath("my shop", ["a", "b"])).toBe("/shop/my%20shop/listings?renew=a,b")
  })
  it("says what happens and links the renew; no mentions or markdown injection", () => {
    const { batches } = batchByShop([row("l1", "s1", "**Bold** [link](x)"), row("l2", "s1")])
    const dm = noticeDm(batches[0])
    expect(dm.allowed_mentions).toEqual({ parse: [] })
    expect(dm.embeds[0].title).toBe("Still selling? 2 listings expire in 3 days")
    expect(dm.embeds[0].description).toContain("• Bold linkx")
    expect(dm.embeds[0].description).toContain(
      "[Renew them in one click](https://sc-market.space/shop/s1-slug/listings?renew=l1,l2)",
    )
    expect(dm.embeds[0].description).toContain("paused (hidden from the market, not deleted)")
  })
})

describe("off until the owner turns it on", () => {
  it("LISTING_EXPIRY_ENABLED=true only", () => {
    expect(listingExpiryEnabled({})).toBe(false)
    expect(listingExpiryEnabled({ LISTING_EXPIRY_ENABLED: "1" })).toBe(false)
    expect(listingExpiryEnabled({ LISTING_EXPIRY_ENABLED: "true" })).toBe(true)
  })
  it("edits and renews don't write expires_at while off", () => {
    const saved = process.env.LISTING_EXPIRY_ENABLED
    delete process.env.LISTING_EXPIRY_ENABLED
    try {
      expect(renewalColumns({ raw: (sql: string) => sql } as never)).toEqual({})
      process.env.LISTING_EXPIRY_ENABLED = "true"
      expect(renewalColumns({ raw: (sql: string) => sql } as never)).toEqual({ expires_at: "now() + INTERVAL '1 month'" })
    } finally {
      if (saved === undefined) delete process.env.LISTING_EXPIRY_ENABLED
      else process.env.LISTING_EXPIRY_ENABLED = saved
    }
  })
})
