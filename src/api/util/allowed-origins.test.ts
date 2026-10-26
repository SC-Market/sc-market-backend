import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildStaticAllowlist, customDomainOrigins } from "./allowed-origins.js"

describe("buildStaticAllowlist", () => {
  const prodConfig = {
    backendUrl: new URL("https://api.sc-market.space"),
    frontendUrl: new URL("https://sc-market.space"),
    premiumHosts: "Shop.Example.com, other.example.org",
    production: true,
  }

  it("is https-only in production", () => {
    const list = buildStaticAllowlist(prodConfig)
    expect(list).toContain("https://api.sc-market.space")
    expect(list).toContain("https://sc-market.space")
    expect(list.some((o) => o.startsWith("http://"))).toBe(false)
  })

  it("does not allow discord.com", () => {
    expect(buildStaticAllowlist(prodConfig)).not.toContain(
      "https://discord.com",
    )
  })

  it("adds PREMIUM_HOSTS as lower-cased https origins", () => {
    const list = buildStaticAllowlist(prodConfig)
    expect(list).toContain("https://shop.example.com")
    expect(list).toContain("https://other.example.org")
    expect(list).not.toContain("http://shop.example.com")
  })

  it("allows http for localhost outside production only", () => {
    const dev = buildStaticAllowlist({
      backendUrl: new URL("http://localhost:7000"),
      frontendUrl: new URL("http://localhost:5173"),
      production: false,
    })
    expect(dev).toContain("http://localhost:5173")
    expect(dev).toContain("http://localhost:7000")

    const prodLocal = buildStaticAllowlist({
      backendUrl: new URL("http://localhost:7000"),
      frontendUrl: new URL("http://localhost:5173"),
      production: true,
    })
    expect(prodLocal.some((o) => o.startsWith("http://"))).toBe(false)
  })

  it("never allows http for non-loopback hosts, even outside production", () => {
    const list = buildStaticAllowlist({ ...prodConfig, production: false })
    expect(list.some((o) => o.startsWith("http://"))).toBe(false)
  })
})

describe("customDomainOrigins", () => {
  it("produces https origins only, lower-cased", () => {
    expect(customDomainOrigins(["Shop.Example.com", " x.org ", ""])).toEqual([
      "https://shop.example.com",
      "https://x.org",
    ])
  })
})

describe("custom domain cache", () => {
  let rows: Array<{ custom_domain: string }> | Error

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    rows = [{ custom_domain: "shop.example.com" }]
    vi.doMock("../../clients/database/knex-db.js", () => {
      const builder = {
        whereNotNull: () => builder,
        whereNull: () => builder,
        select: async () => {
          if (rows instanceof Error) throw rows
          return rows
        },
      }
      return { getKnex: () => () => builder }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock("../../clients/database/knex-db.js")
  })

  it("allows a registered https custom domain and never its http twin", async () => {
    const m = await import("./allowed-origins.js")
    expect(await m.isOriginAllowedAsync("https://shop.example.com")).toBe(true)
    expect(await m.isOriginAllowedAsync("http://shop.example.com")).toBe(false)
    expect(m.isOriginAllowed("http://shop.example.com")).toBe(false)
  })

  it("drops custom domains (keeps static origins) when the DB refresh fails", async () => {
    const m = await import("./allowed-origins.js")
    expect(await m.isOriginAllowedAsync("https://shop.example.com")).toBe(true)

    rows = new Error("db down")
    vi.advanceTimersByTime(61_000)
    expect(await m.isOriginAllowedAsync("https://shop.example.com")).toBe(false)
    expect(m.isOriginAllowed("https://shop.example.com")).toBe(false)
    expect(m.isOriginAllowed(m.staticAllowlist[0])).toBe(true)
  })

  it("stops trusting a cache that has not refreshed for 5 minutes", async () => {
    const m = await import("./allowed-origins.js")
    await m.refreshCustomDomainCache()
    expect(m.isOriginAllowed("https://shop.example.com")).toBe(true)
    vi.advanceTimersByTime(5 * 60_000 + 1)
    expect(m.isOriginAllowed("https://shop.example.com")).toBe(false)
  })

  it("picks up a revoked domain on the next check after invalidation", async () => {
    const m = await import("./allowed-origins.js")
    expect(await m.isOriginAllowedAsync("https://shop.example.com")).toBe(true)
    rows = []
    m.invalidateCustomDomainCache()
    expect(await m.isOriginAllowedAsync("https://shop.example.com")).toBe(false)
  })
})

describe("normalizeCustomDomain", () => {
  it.each([
    ["Shop.Example.COM", "shop.example.com"],
    ["  shop.example.com.  ", "shop.example.com"],
    ["a-b.c.example.org", "a-b.c.example.org"],
  ])("accepts %j as %j", async (input, expected) => {
    const { normalizeCustomDomain } = await import("./allowed-origins.js")
    expect(normalizeCustomDomain(input)).toEqual({ ok: true, domain: expected })
  })

  it.each([
    "localhost",
    "foo.localhost",
    "127.0.0.1",
    "10.0.0.5",
    "intranet",
    "https://shop.example.com",
    "shop.example.com/path",
    "-bad.example.com",
    "",
  ])("rejects %j", async (input) => {
    const { normalizeCustomDomain } = await import("./allowed-origins.js")
    expect(normalizeCustomDomain(input).ok).toBe(false)
  })

  it("rejects the main site's own zone", async () => {
    vi.resetModules()
    const prev = process.env.FRONTEND_URL
    process.env.FRONTEND_URL = "https://sc-market.space"
    try {
      const { normalizeCustomDomain } = await import("./allowed-origins.js")
      expect(normalizeCustomDomain("sc-market.space").ok).toBe(false)
      expect(normalizeCustomDomain("evil.sc-market.space").ok).toBe(false)
      expect(normalizeCustomDomain("sc-market.space.example.com").ok).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.FRONTEND_URL
      else process.env.FRONTEND_URL = prev
    }
  })
})
