import { describe, it, expect } from "vitest"
import {
  requiredScope,
  tokenSatisfiesScope,
  enforceTokenScopes,
  isAdminPath,
  TokenInfo,
} from "./token-scopes.js"

describe("v2 token scope enforcement", () => {
  describe("requiredScope (derivation)", () => {
    it("maps HTTP method to read/write level", () => {
      expect(requiredScope("GET", "/listings").level).toBe("read")
      expect(requiredScope("HEAD", "/listings").level).toBe("read")
      expect(requiredScope("POST", "/listings").level).toBe("write")
      expect(requiredScope("PUT", "/listings/1").level).toBe("write")
      expect(requiredScope("PATCH", "/listings/1").level).toBe("write")
      expect(requiredScope("DELETE", "/listings/1").level).toBe("write")
    })

    it("maps v1-grounded prefixes to their domain", () => {
      expect(requiredScope("GET", "/listings/abc").domain).toBe("market")
      expect(requiredScope("GET", "/stock-lots").domain).toBe("market")
      expect(requiredScope("POST", "/orders").domain).toBe("orders")
      expect(requiredScope("POST", "/offers/1/accept").domain).toBe("offers")
      expect(requiredScope("GET", "/accounts/deletion-status").domain).toBe(
        "profile",
      )
    })

    it("matches admin and its sub-paths to the admin domain (longest prefix)", () => {
      expect(requiredScope("POST", "/admin").domain).toBe("admin")
      expect(requiredScope("GET", "/admin/feature-flags").domain).toBe("admin")
      expect(requiredScope("POST", "/admin/imports/x").domain).toBe("admin")
    })

    it("maps the v2 write surfaces to a v1 domain", () => {
      const expected: Record<string, string> = {
        "/shops/abc": "market",
        "/buy-orders": "market",
        "/auctions": "market",
        "/inventory": "market",
        "/images": "market",
        "/suppliers": "market",
        "/cart/checkout": "orders",
        "/requisitions": "orders",
        "/availability": "profile",
        "/onboarding": "profile",
        "/dashboard": "profile",
        "/game-data/wishlists": "profile",
        "/my-domain": "contractors",
      }
      for (const [p, domain] of Object.entries(expected)) {
        expect(requiredScope("POST", p).domain).toBe(domain)
      }
    })

    it("returns null domain for unmapped catalog routes", () => {
      for (const p of ["/game-items/x", "/game-data/wiki/items", "/debug"]) {
        expect(requiredScope("GET", p).domain).toBeNull()
      }
    })

    it("does not match on partial segment names", () => {
      // "administrators" must NOT match the "admin" prefix
      expect(requiredScope("GET", "/administrators").domain).toBeNull()
    })
  })

  describe("isAdminPath", () => {
    it("is true for admin and its sub-paths", () => {
      expect(isAdminPath("/admin")).toBe(true)
      expect(isAdminPath("/admin/feature-flags")).toBe(true)
      expect(isAdminPath("/admin/imports/spectrum")).toBe(true)
    })

    it("is false for non-admin and lookalike paths", () => {
      expect(isAdminPath("/administrators")).toBe(false)
      expect(isAdminPath("/listings")).toBe(false)
      expect(isAdminPath("/dashboard")).toBe(false)
    })
  })

  describe("tokenSatisfiesScope — v1-grounded domains", () => {
    it("accepts exact domain:level", () => {
      expect(
        tokenSatisfiesScope(["market:read"], { domain: "market", level: "read" }),
      ).toBe(true)
      expect(
        tokenSatisfiesScope(["market:write"], {
          domain: "market",
          level: "write",
        }),
      ).toBe(true)
    })

    it("rejects wrong domain or wrong level", () => {
      expect(
        tokenSatisfiesScope(["market:read"], {
          domain: "market",
          level: "write",
        }),
      ).toBe(false)
      expect(
        tokenSatisfiesScope(["orders:write"], {
          domain: "market",
          level: "write",
        }),
      ).toBe(false)
    })

    it("honors wildcard scopes", () => {
      expect(
        tokenSatisfiesScope(["admin"], { domain: "market", level: "write" }),
      ).toBe(true)
      expect(
        tokenSatisfiesScope(["full"], { domain: "orders", level: "write" }),
      ).toBe(true)
      expect(
        tokenSatisfiesScope(["readonly"], { domain: "market", level: "read" }),
      ).toBe(true)
      // readonly does not grant writes
      expect(
        tokenSatisfiesScope(["readonly"], { domain: "market", level: "write" }),
      ).toBe(false)
    })
  })

  describe("tokenSatisfiesScope — admin fails closed", () => {
    it("accepts only the literal `admin` scope", () => {
      expect(
        tokenSatisfiesScope(["admin"], { domain: "admin", level: "read" }),
      ).toBe(true)
      expect(
        tokenSatisfiesScope(["admin"], { domain: "admin", level: "write" }),
      ).toBe(true)
    })

    it("rejects full, readonly, and admin:* sub-scopes on the admin surface", () => {
      for (const scopes of [
        ["full"],
        ["readonly"],
        ["admin:read"],
        ["admin:write"],
        ["admin:stats"],
        ["market:write"],
        [],
      ]) {
        expect(
          tokenSatisfiesScope(scopes, { domain: "admin", level: "read" }),
        ).toBe(false)
        expect(
          tokenSatisfiesScope(scopes, { domain: "admin", level: "write" }),
        ).toBe(false)
      }
    })
  })

  describe("tokenSatisfiesScope — v2-only level-only", () => {
    it("any read scope satisfies a read", () => {
      expect(
        tokenSatisfiesScope(["market:read"], { domain: null, level: "read" }),
      ).toBe(true)
      expect(
        tokenSatisfiesScope(["readonly"], { domain: null, level: "read" }),
      ).toBe(true)
      expect(
        tokenSatisfiesScope(["orders:write"], { domain: null, level: "read" }),
      ).toBe(false) // write-only scope can't read
    })

    it("writes to an unmapped route fail closed (full/admin only)", () => {
      expect(
        tokenSatisfiesScope(["orders:write"], { domain: null, level: "write" }),
      ).toBe(false)
      expect(
        tokenSatisfiesScope(["comments:write"], { domain: null, level: "write" }),
      ).toBe(false)
      expect(
        tokenSatisfiesScope(["market:read"], { domain: null, level: "write" }),
      ).toBe(false)
      expect(
        tokenSatisfiesScope(["full"], { domain: null, level: "write" }),
      ).toBe(true)
    })

    it("an unrelated write scope cannot edit a shop or check out a cart", () => {
      expect(() =>
        enforceTokenScopes(
          { id: "t", name: "t", scopes: ["comments:write"] },
          "PUT",
          "/shops/abc",
        ),
      ).toThrow(/insufficient/i)
      expect(() =>
        enforceTokenScopes(
          { id: "t", name: "t", scopes: ["comments:write"] },
          "POST",
          "/cart/checkout",
        ),
      ).toThrow(/insufficient/i)
      expect(() =>
        enforceTokenScopes(
          { id: "t", name: "t", scopes: ["market:write"] },
          "PUT",
          "/shops/abc",
        ),
      ).not.toThrow()
    })

    it("admin:* alone does not satisfy non-admin v2-only routes", () => {
      // admin:read is an admin scope; it should not grant generic read access
      expect(
        tokenSatisfiesScope(["admin:read"], { domain: null, level: "read" }),
      ).toBe(false)
    })
  })

  describe("enforceTokenScopes", () => {
    const token = (scopes: string[]): TokenInfo => ({
      id: "t",
      name: "test",
      scopes,
    })

    it("is a no-op for non-token (session/JWT) requests", () => {
      expect(() =>
        enforceTokenScopes(undefined, "POST", "/admin/imports"),
      ).not.toThrow()
      expect(() =>
        enforceTokenScopes(undefined, "DELETE", "/listings/1"),
      ).not.toThrow()
    })

    it("throws 403 when a token lacks the required scope", () => {
      try {
        enforceTokenScopes(token(["market:read"]), "POST", "/listings")
        throw new Error("expected to throw")
      } catch (e) {
        const err = e as Error & { status?: number }
        expect(err.status).toBe(403)
        expect(err.message).toMatch(/insufficient/i)
      }
    })

    it("throws 403 for a non-admin token on an admin route", () => {
      try {
        enforceTokenScopes(token(["full"]), "GET", "/admin/feature-flags")
        throw new Error("expected to throw")
      } catch (e) {
        const err = e as Error & { status?: number }
        expect(err.status).toBe(403)
      }
    })

    it("allows a correctly-scoped token", () => {
      expect(() =>
        enforceTokenScopes(token(["market:write"]), "POST", "/listings"),
      ).not.toThrow()
      expect(() =>
        enforceTokenScopes(token(["admin"]), "POST", "/admin/imports"),
      ).not.toThrow()
    })
  })
})

describe("P0-6: private per-user prefixes are scoped, retired scopes grant nothing", () => {
  const can = (scopes: string[], method: string, path: string) =>
    tokenSatisfiesScope(scopes, requiredScope(method, path))

  it.each([
    ["/watchlist", "market"],
    ["/watchlist/items/1", "market"],
    ["/price-alerts", "market"],
    ["/contract-alerts", "market"],
    ["/notification-preferences", "notifications"],
    ["/integrations/scmdb/status", "profile"],
    ["/analytics/seller-stats", "market"],
    ["/analytics/listing-stats", "market"],
    ["/analytics/price-history", "market"],
    ["/analytics/quality-distribution", "market"],
  ])("%s needs %s:read, not any :read", (path, domain) => {
    expect(requiredScope("GET", path).domain).toBe(domain)
    expect(can([`${domain}:read`], "GET", path)).toBe(true)
    expect(can(["readonly"], "GET", path)).toBe(true)
    expect(can(["comments:read"], "GET", path)).toBe(false)
    expect(can(["chats:read"], "GET", path)).toBe(false)
  })

  it("retired scopes are ignored: orgs:read is no longer a read pass", () => {
    expect(can(["orgs:read"], "GET", "/game-data/wiki/items")).toBe(false)
    expect(can(["contractors:webhooks"], "GET", "/analytics/price-history")).toBe(false)
    expect(can(["orgs:manage"], "POST", "/shops/x/webhooks")).toBe(false)
    // ...while a token's other scopes keep working.
    expect(can(["orgs:read", "market:read"], "GET", "/listings/search")).toBe(true)
    expect(can(["orgs:read", "comments:read"], "GET", "/game-data/wiki/items")).toBe(true)
  })
})

describe("analytics reads are market:read, not any :read", () => {
  const can = (scopes: string[], method: string, path: string) =>
    tokenSatisfiesScope(scopes, requiredScope(method, path))

  it("fails closed for unrelated read scopes", () => {
    for (const path of ["/analytics/seller-stats", "/analytics/listing-stats?listing_id=x"]) {
      expect(can(["market:read"], "GET", path)).toBe(true)
      expect(can(["full"], "GET", path)).toBe(true)
      for (const scope of ["comments:read", "chats:read", "profile:read", "orders:read", "market:write"]) {
        expect(can([scope], "GET", path)).toBe(false)
      }
      const token: TokenInfo = { id: "t", name: "test", scopes: ["comments:read"] }
      expect(() => enforceTokenScopes(token, "GET", path)).toThrow(
        "Insufficient token permissions",
      )
    }
  })
})
