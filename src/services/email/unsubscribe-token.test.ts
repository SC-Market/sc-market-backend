import { afterEach, describe, expect, it } from "vitest"
import {
  createUnsubscribeToken,
  isLegacyUnsubscribeToken,
  listUnsubscribeHeaders,
  unsubscribeLinksFor,
  unsubscribeScopeFor,
  verifyUnsubscribeToken,
} from "./unsubscribe-token.js"
import { env } from "../../config/env.js"

const SECRET = "test-secret"
const USER = "11111111-2222-4333-8444-555555555555"
const ORG = "99999999-2222-4333-8444-555555555555"

describe("signed unsubscribe tokens", () => {
  it("round-trips the user, scope and preference scope", () => {
    const token = createUnsubscribeToken(
      { userId: USER, scope: { kind: "category", category: "orders" }, contractorId: ORG },
      SECRET,
    )
    expect(token).toMatch(/^u1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({
      userId: USER,
      scope: { kind: "category", category: "orders" },
      contractorId: ORG,
    })
    const keyDefaults = createUnsubscribeToken({ userId: USER, scope: { kind: "key_defaults" }, contractorId: null }, SECRET)
    expect(verifyUnsubscribeToken(keyDefaults, SECRET)?.scope).toEqual({ kind: "key_defaults" })
  })

  it("rejects a token signed with another key, tampered or malformed", () => {
    const token = createUnsubscribeToken(
      { userId: USER, scope: { kind: "category", category: "orders" }, contractorId: null },
      SECRET,
    )
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull()
    const [p, payload, sig] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ u: "someone-else", s: "cat:orders", c: null })).toString("base64url")
    expect(verifyUnsubscribeToken(`${p}.${forged}.${sig}`, SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(`${p}.${payload}.${sig.slice(0, -2)}`, SECRET)).toBeNull()
    expect(verifyUnsubscribeToken("u1.abc", SECRET)).toBeNull()
    expect(verifyUnsubscribeToken("a".repeat(64), SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(token, undefined)).toBeNull()
  })

  it("tells the stored 64-hex tokens of older emails apart", () => {
    expect(isLegacyUnsubscribeToken("ab".repeat(32))).toBe(true)
    expect(isLegacyUnsubscribeToken("u1.x.y")).toBe(false)
  })
})

describe("what a link turns off", () => {
  it("is the email's catalog category", () => {
    expect(unsubscribeScopeFor("order_status_fulfilled")).toEqual({ kind: "category", category: "orders" })
    expect(unsubscribeScopeFor("counter_offer_create")).toEqual({ kind: "category", category: "offers" })
    expect(unsubscribeScopeFor("dm_reminder")).toEqual({ kind: "category", category: "reminders" })
    expect(unsubscribeScopeFor("contractor_invite")).toEqual({ kind: "category", category: "org" })
  })

  it("is the action alone when it is not in the catalog", () => {
    expect(unsubscribeScopeFor("market_item_offer")).toEqual({ kind: "action", action: "market_item_offer" })
  })

  it("is the announcements category (owner decision 2026-11-01: announcement emails respect unsubscribes)", () => {
    expect(unsubscribeScopeFor("admin_alert")).toEqual({ kind: "category", category: "announcements" })
  })
})

describe("links and RFC 8058 headers", () => {
  const saved = { ...env }
  afterEach(() => {
    env.BACKEND_URL = saved.BACKEND_URL
    env.FRONTEND_URL = saved.FRONTEND_URL
    env.SESSION_SECRET = saved.SESSION_SECRET
  })

  it("gives a no-login page link, a manage link and one-click headers", () => {
    env.BACKEND_URL = "https://api.sc-market.space"
    env.FRONTEND_URL = "https://sc-market.space"
    env.SESSION_SECRET = SECRET
    const links = unsubscribeLinksFor(USER, "offer_create", null)
    expect(links.unsubscribeUrl).toMatch(/^https:\/\/sc-market\.space\/email\/unsubscribe\/u1\./)
    expect(links.preferencesUrl).toBe("https://sc-market.space/settings?tab=email")
    const token = links.unsubscribeUrl!.split("/").pop()!
    expect(links.headers).toEqual({
      "List-Unsubscribe": `<https://api.sc-market.space/api/v1/email/unsubscribe/${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })
    expect(verifyUnsubscribeToken(token)?.scope).toEqual({ kind: "category", category: "offers" })
  })

  it("gives announcements an unsubscribe link and one-click headers", () => {
    env.BACKEND_URL = "https://api.sc-market.space"
    env.FRONTEND_URL = "https://sc-market.space"
    env.SESSION_SECRET = SECRET
    const links = unsubscribeLinksFor(USER, "admin_alert", null)
    expect(links.unsubscribeUrl).toMatch(/^https:\/\/sc-market\.space\/email\/unsubscribe\/u1\./)
    const token = links.unsubscribeUrl!.split("/").pop()!
    expect(links.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    expect(verifyUnsubscribeToken(token)?.scope).toEqual({ kind: "category", category: "announcements" })
  })

  it("sends no List-Unsubscribe header without an https backend URL", () => {
    env.BACKEND_URL = "http://localhost:7000"
    expect(listUnsubscribeHeaders("u1.a.b")).toEqual({})
  })
})
