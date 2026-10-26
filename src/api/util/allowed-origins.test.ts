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
  beforeEach(() => {
    vi.resetModules()
    vi.doMock("../../clients/database/knex-db.js", () => {
      const builder = {
        whereNotNull: () => builder,
        whereNull: () => builder,
        select: async () => [{ custom_domain: "shop.example.com" }],
      }
      return { getKnex: () => () => builder }
    })
  })

  afterEach(() => {
    vi.doUnmock("../../clients/database/knex-db.js")
  })

  it("allows a registered https custom domain and never its http twin", async () => {
    const m = await import("./allowed-origins.js")
    expect(await m.isOriginAllowedAsync("https://shop.example.com")).toBe(true)
    expect(await m.isOriginAllowedAsync("http://shop.example.com")).toBe(false)
    expect(m.isOriginAllowed("http://shop.example.com")).toBe(false)
  })
})
