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

    it("returns null domain for v2-only routes (level-only enforcement)", () => {
      for (const p of [
        "/dashboard",
        "/cart",
        "/inventory",
        "/auctions",
        "/buy-orders",
        "/requisitions",
        "/suppliers",
        "/availability",
        "/onboarding",
        "/images",
        "/debug",
        "/integrations/scmdb/ingest",
        "/game-data/wishlists",
      ]) {
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

    it("any write scope satisfies a write", () => {
      expect(
        tokenSatisfiesScope(["orders:write"], { domain: null, level: "write" }),
      ).toBe(true)
      expect(
        tokenSatisfiesScope(["market:read"], { domain: null, level: "write" }),
      ).toBe(false)
      expect(
        tokenSatisfiesScope(["full"], { domain: null, level: "write" }),
      ).toBe(true)
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
      } catch (e: any) {
        expect(e.status).toBe(403)
        expect(e.message).toMatch(/insufficient/i)
      }
    })

    it("throws 403 for a non-admin token on an admin route", () => {
      try {
        enforceTokenScopes(token(["full"]), "GET", "/admin/feature-flags")
        throw new Error("expected to throw")
      } catch (e: any) {
        expect(e.status).toBe(403)
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
