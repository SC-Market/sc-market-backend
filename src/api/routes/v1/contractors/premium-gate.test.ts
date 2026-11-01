import { describe, it, expect, vi } from "vitest"
import express from "express"
import request from "supertest"
import { hasWhiteLabelTier, whiteLabelTierGuard } from "./premium-gate.js"

/**
 * The white-label site settings PUT, sidebar PUT and theme DELETE didn't
 * check the premium tier (only theme PUT did). All four now share this guard.
 */
function app(lookup: (id: string) => Promise<{ tier: string } | null>) {
  const a = express()
  a.use((req, _res, next) => {
    req.contractor = { contractor_id: "org-1" } as typeof req.contractor
    next()
  })
  a.all("*", whiteLabelTierGuard(lookup as never), (_req, res) => res.json({ ok: true }))
  return a
}

describe("hasWhiteLabelTier", () => {
  it("only accepts an active white_label row", () => {
    expect(hasWhiteLabelTier({ tier: "white_label" })).toBe(true)
    expect(hasWhiteLabelTier({ tier: "other" } as never)).toBe(false)
    expect(hasWhiteLabelTier(null)).toBe(false)
  })
})

describe("whiteLabelTierGuard", () => {
  it("passes an org with the white_label tier", async () => {
    const lookup = vi.fn().mockResolvedValue({ tier: "white_label" })
    const res = await request(app(lookup)).put("/")
    expect(res.status).toBe(200)
    expect(lookup).toHaveBeenCalledWith("org-1")
  })

  it.each(["put", "delete"] as const)("403s %s for an org without the tier, same shape as theme PUT", async (m) => {
    const res = await request(app(vi.fn().mockResolvedValue(null)))[m]("/")
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("FORBIDDEN")
    expect(res.body.error.message).toBe("Organization does not have white_label premium tier")
  })

  it("500s when the lookup fails", async () => {
    const res = await request(app(vi.fn().mockRejectedValue(new Error("db")))).put("/")
    expect(res.status).toBe(500)
  })
})
