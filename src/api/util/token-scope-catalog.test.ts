import { describe, expect, it, vi } from "vitest"
import { RETIRED_SCOPES, effectiveTokenScopes } from "./token-scope-catalog.js"

describe("retired token scopes", () => {
  it("are filtered out of a token's effective scopes", () => {
    expect(
      effectiveTokenScopes(["orgs:read", "market:read", "services:photos"]),
    ).toEqual(["market:read"])
    expect(effectiveTokenScopes(undefined)).toEqual([])
  })

  it("are not enforced by any route (otherwise they aren't dead)", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs")
    const { join } = await import("node:path")
    const root = join(import.meta.dirname, "..", "..")
    const files: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p)
      }
    }
    walk(join(root, "api"))
    const allowed =
      /token-scope-catalog\.ts$|tokens[\\/](controller|openapi)\.ts$/
    for (const scope of RETIRED_SCOPES) {
      const users = files.filter(
        (f) =>
          !allowed.test(f) && readFileSync(f, "utf8").includes(`"${scope}"`),
      )
      expect(users, scope).toEqual([])
    }
  })

  it("cannot be granted to new tokens", async () => {
    vi.resetModules()
    const src = (await import("node:fs")).readFileSync(
      new URL("../routes/v1/tokens/controller.ts", import.meta.url),
      "utf8",
    )
    const valid = src.slice(
      src.indexOf("const VALID_SCOPES"),
      src.indexOf("] as const"),
    )
    for (const scope of RETIRED_SCOPES)
      expect(valid).not.toContain(`"${scope}"`)
  })
})
