import { describe, it, expect, vi } from "vitest"
import express from "express"
import request from "supertest"
import {
  decideWhiteLabelAccess,
  isGateExempt,
  whiteLabelMembershipGate,
  type WhiteLabelSiteAccess,
} from "./whitelabel-membership.js"

// FRONTEND_URL is unset in tests, so the main site is http://localhost:5173.
const MAIN = "http://localhost:5173"
const CUSTOM = "https://ops.example-org.com"

const internalMembers: WhiteLabelSiteAccess = {
  contractor_id: "org-1",
  focus_mode: "internal",
  require_membership: true,
}

function gated(opts: {
  site: WhiteLabelSiteAccess | null
  userId?: string
  member?: boolean
}) {
  const siteFor = vi.fn().mockResolvedValue(opts.site)
  const isMember = vi.fn().mockResolvedValue(!!opts.member)
  const a = express()
  a.use((req, _res, next) => {
    if (opts.userId) req.user = { user_id: opts.userId } as Express.User
    next()
  })
  a.use("/api", whiteLabelMembershipGate({ siteFor, isMember }))
  a.all("*", (_req, res) => res.json({ ok: true }))
  return { app: a, siteFor, isMember }
}

describe("decideWhiteLabelAccess (same rule as WhiteLabelAuthGate)", () => {
  const yes = async () => true
  const no = async () => false
  it("allows non-white-label hosts and Public sites", async () => {
    expect(await decideWhiteLabelAccess(null, undefined, no)).toBe("allow")
    expect(
      await decideWhiteLabelAccess({ ...internalMembers, focus_mode: "public" }, undefined, no),
    ).toBe("allow")
    // No config row yet: the domain API reports "public".
    expect(
      await decideWhiteLabelAccess({ ...internalMembers, focus_mode: null }, undefined, no),
    ).toBe("allow")
  })
  it("needs a login on an Internal site", async () => {
    expect(await decideWhiteLabelAccess(internalMembers, undefined, yes)).toBe("login_required")
  })
  it("lets any signed-in user in when membership isn't required", async () => {
    expect(
      await decideWhiteLabelAccess({ ...internalMembers, require_membership: false }, "u", no),
    ).toBe("allow")
  })
  it("needs membership when required", async () => {
    expect(await decideWhiteLabelAccess(internalMembers, "u", no)).toBe("membership_required")
    expect(await decideWhiteLabelAccess(internalMembers, "u", yes)).toBe("allow")
  })
})

describe("whiteLabelMembershipGate", () => {
  it("401s an anonymous caller from a gated custom domain", async () => {
    const { app } = gated({ site: internalMembers })
    const res = await request(app).get("/api/v2/shops/abc/listings").set("Origin", CUSTOM)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe("UNAUTHORIZED")
    expect(res.body.error.details.reason).toBe("whitelabel_login_required")
  })

  it("403s a signed-in non-member, and lets a member through", async () => {
    const out = gated({ site: internalMembers, userId: "u1", member: false })
    const res = await request(out.app).get("/api/contractors/ORG").set("Origin", CUSTOM)
    expect(res.status).toBe(403)
    expect(res.body.error.details.reason).toBe("whitelabel_membership_required")
    expect(out.isMember).toHaveBeenCalledWith("org-1", "u1")

    const ok = gated({ site: internalMembers, userId: "u1", member: true })
    expect((await request(ok.app).get("/api/contractors/ORG").set("Origin", CUSTOM)).status).toBe(200)
  })

  it("uses Referer when Origin is absent", async () => {
    const { app } = gated({ site: internalMembers })
    const res = await request(app).get("/api/market/listings").set("Referer", `${CUSTOM}/market`)
    expect(res.status).toBe(401)
  })

  it("leaves the main site and origin-less requests alone (the org stays public there)", async () => {
    const main = gated({ site: internalMembers })
    expect((await request(main.app).get("/api/contractors/ORG").set("Origin", MAIN)).status).toBe(200)
    expect((await request(main.app).get("/api/contractors/ORG")).status).toBe(200)
    expect(main.siteFor).not.toHaveBeenCalled()
  })

  it("leaves Public white-label sites alone", async () => {
    const { app } = gated({ site: { ...internalMembers, focus_mode: "public" } })
    expect((await request(app).get("/api/contractors/ORG").set("Origin", CUSTOM)).status).toBe(200)
  })

  it.each([
    ["GET", "/api/auth/session"],
    ["POST", "/api/auth/refresh"],
    ["GET", "/api/profile"],
    ["GET", "/api/domain/ops.example-org.com"],
    ["GET", "/api/contractors/ORG/theme"],
    ["GET", "/api/v1/contractors/ORG/whitelabel"],
    ["POST", "/api/csp-report"],
  ])("keeps what the gate screen needs open: %s %s", async (method, path) => {
    const { app } = gated({ site: internalMembers })
    const res = await request(app)[method.toLowerCase() as "get" | "post"](path).set("Origin", CUSTOM)
    expect(res.status).toBe(200)
  })

  it("does not exempt writes or other org subroutes", () => {
    expect(isGateExempt("PUT", "/api/contractors/ORG/theme")).toBe(false)
    expect(isGateExempt("GET", "/api/contractors/ORG/whitelabel/sidebar")).toBe(false)
    expect(isGateExempt("GET", "/api/contractors/ORG/members")).toBe(false)
    expect(isGateExempt("PUT", "/api/profile")).toBe(false)
  })
})
