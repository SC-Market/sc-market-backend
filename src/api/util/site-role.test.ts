import { describe, it, expect, vi, beforeEach } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { Request } from "express"
import {
  SiteRole,
  SITE_ROLES,
  isSiteAdmin,
  isKnownSiteRole,
} from "./site-role.js"

// enhanced-ratelimiting builds Postgres-backed limiters at import time.
vi.mock("rate-limiter-flexible", () => {
  class FakeLimiter {
    consume() {
      return Promise.resolve()
    }
  }
  return { RateLimiterPostgres: FakeLimiter, RateLimiterMemory: FakeLimiter }
})

describe("site role", () => {
  it("defines exactly the two roles stored in accounts.role", () => {
    expect(SiteRole.User).toBe("user")
    expect(SiteRole.Admin).toBe("admin")
    expect([...SITE_ROLES].sort()).toEqual(["admin", "user"])
  })

  it.each([
    [{ role: "admin" }, true],
    [{ role: "user" }, false],
    [{ role: "Admin" }, false],
    [{ role: "owner" }, false],
    [{ role: "" }, false],
    [{ role: null }, false],
    [{}, false],
    [null, false],
    [undefined, false],
  ])("isSiteAdmin(%j) === %s", (user, expected) => {
    expect(isSiteAdmin(user)).toBe(expected)
  })

  it.each([
    ["user", true],
    ["admin", true],
    ["owner", false],
    ["", false],
    [undefined, false],
  ])("isKnownSiteRole(%j) === %s", (role, expected) => {
    expect(isKnownSiteRole(role)).toBe(expected)
  })
})

/**
 * Guard against the scattered inline checks coming back. Every site-admin
 * decision must go through isSiteAdmin() so a single policy (e.g. MFA role
 * masking) covers all of them.
 */
describe("no inline site-admin role checks", () => {
  const SRC = join(__dirname, "..", "..")
  const INLINE = [
    /\.role\s*[!=]==?\s*["']admin["']/,
    /["']admin["']\s*[!=]==?\s*[\w.?]*\.role\b/,
    /\[\s*["']admin["']\s*\]\.includes\(\s*[\w.?]*\.role\s*\)/,
    /\.role\s*[!=]==?\s*["']user["']/,
  ]

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        return name === "generated" || name === "test-utils" ? [] : walk(path)
      }
      return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : []
    })
  }

  it("finds none outside site-role.ts", () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (file.endsWith("site-role.ts")) continue
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (INLINE.some((re) => re.test(line))) {
            offenders.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`)
          }
        })
    }
    expect(offenders).toEqual([])
  })
})

/**
 * Behaviour of the consolidated gates must match the old inline checks:
 * admins pass, users and anonymous requests don't.
 */
describe("consolidated admin gates keep their behaviour", () => {
  beforeEach(() => vi.resetModules())

  it("has_permission short-circuits to true for a site admin only", async () => {
    vi.doMock("../routes/v1/profiles/database.js", () => ({
      getUser: async ({ user_id }: { user_id: string }) => ({
        user_id,
        role: user_id === "admin-1" ? "admin" : "user",
      }),
    }))
    vi.doMock("../routes/v1/contractors/database.js", () => ({
      getMemberRoles: async () => [],
      getContractorMembers: async () => [],
    }))
    const { has_permission } = await import("../routes/v1/util/permissions.js")
    expect(await has_permission("c1", "admin-1", "manage_orders")).toBe(true)
    expect(await has_permission("c1", "user-1", "manage_orders")).toBe(false)
    vi.doUnmock("../routes/v1/profiles/database.js")
    vi.doUnmock("../routes/v1/contractors/database.js")
  })

  it("detectUserTier gives admins the admin tier", async () => {
    const { detectUserTier } = await import(
      "../middleware/enhanced-ratelimiting.js"
    )
    const req = (user?: object) => ({ user }) as unknown as Request
    expect(detectUserTier(req({ role: "admin" }))).toBe("admin")
    expect(detectUserTier(req({ role: "user" }))).toBe("authenticated")
    expect(detectUserTier(req())).toBe("anonymous")
  })

  it("v2 admin paths require the admin role; other paths don't", async () => {
    const { expressAuthentication } = await import(
      "../routes/v2/middleware/tsoa-auth.js"
    )
    const req = (role: string, path: string) =>
      ({ user: { role }, path, method: "GET" }) as unknown as Request
    await expect(
      expressAuthentication(req("admin", "/admin/imports"), "loggedin"),
    ).resolves.toMatchObject({ role: "admin" })
    await expect(
      expressAuthentication(req("user", "/admin/imports"), "loggedin"),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      expressAuthentication(req("user", "/listings"), "loggedin"),
    ).resolves.toMatchObject({ role: "user" })
  })

  it("canViewV2DebugInternals is admin-only outside development", async () => {
    const { canViewV2DebugInternals } = await import(
      "../routes/v2/util/openapi-debug-visibility.js"
    )
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      const req = (user?: object) => ({ user }) as unknown as Request
      expect(canViewV2DebugInternals(req({ role: "admin" }))).toBe(true)
      expect(canViewV2DebugInternals(req({ role: "user" }))).toBe(false)
      expect(canViewV2DebugInternals(req())).toBe(false)
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
