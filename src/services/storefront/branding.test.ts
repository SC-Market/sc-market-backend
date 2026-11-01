import { describe, expect, it } from "vitest"
import { evaluateBranding, isRsiVerifiedOrg, type BrandingInputs } from "./branding.js"

const base: BrandingInputs = {
  spectrum_id: "BWINCORP",
  is_test: false,
  member_count: 3,
  recent_listings: 1,
  recent_orders: 0,
  granted: false,
  custom_domain: null,
}

describe("isRsiVerifiedOrg", () => {
  it("is an RSI spectrum ID, not a ~custom identifier or a test org", () => {
    expect(isRsiVerifiedOrg({ spectrum_id: "BWINCORP" })).toBe(true)
    expect(isRsiVerifiedOrg({ spectrum_id: "~MYORG" })).toBe(false)
    expect(isRsiVerifiedOrg({ spectrum_id: "TESTORG", is_test: true })).toBe(false)
    expect(isRsiVerifiedOrg({ spectrum_id: "" })).toBe(false)
  })
})

describe("evaluateBranding", () => {
  it("unlocks a verified org with 3 members and a listing in the last 30 days", () => {
    const status = evaluateBranding(base)
    expect(status).toMatchObject({
      unlocked: true,
      source: "criteria",
      eligible: true,
      missing: [],
      reason: "Unlocked: RSI-verified, 3 members, active in the last 30 days.",
    })
    expect(status.criteria.members).toEqual({ met: true, count: 3, required: 3 })
  })

  it("counts an order as activity too", () => {
    expect(evaluateBranding({ ...base, recent_listings: 0, recent_orders: 2 }).unlocked).toBe(true)
  })

  it("says what is missing, in order", () => {
    const status = evaluateBranding({
      ...base,
      spectrum_id: "~MYORG",
      member_count: 1,
      recent_listings: 0,
    })
    expect(status.unlocked).toBe(false)
    expect(status.source).toBeNull()
    expect(status.missing).toEqual(["rsi_verified", "members", "activity"])
    expect(status.reason).toBe(
      "Locked: needs RSI verification; 2 more members on SC Market; a listing or an order in the last 30 days.",
    )
  })

  it("1 more member, singular", () => {
    expect(evaluateBranding({ ...base, member_count: 2 }).reason).toBe(
      "Locked: needs 1 more member on SC Market.",
    )
  })

  it("a staff grant unlocks whatever the criteria say, and reports both", () => {
    const status = evaluateBranding({
      ...base,
      member_count: 1,
      granted: true,
      custom_domain: "bwincorp.sc-market.space",
    })
    expect(status).toMatchObject({
      unlocked: true,
      source: "grant",
      eligible: false,
      missing: ["members"],
      custom_domain: "bwincorp.sc-market.space",
    })
  })

  it("never unlocks a test org by criteria", () => {
    const status = evaluateBranding({ ...base, spectrum_id: "~TESTORG", is_test: true })
    expect(status.unlocked).toBe(false)
    expect(status.missing).toEqual(["rsi_verified"])
  })
})
