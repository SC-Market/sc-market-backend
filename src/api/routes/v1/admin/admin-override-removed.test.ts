import { describe, it, expect } from "vitest"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * `?admin_override=<username>` used to swap req.user for any user on any route
 * when the caller was an admin, including Bearer API-token requests, so any
 * admin-owned token could impersonate anyone. It had no frontend caller and was
 * deleted; this keeps it from coming back.
 */
describe("admin_override is gone", () => {
  const SRC = join(__dirname, "..", "..", "..", "..")

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return walk(path)
      return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : []
    })
  }

  it("has no middleware module", () => {
    expect(existsSync(join(__dirname, "middleware.ts"))).toBe(false)
  })

  it("is not read anywhere in src", () => {
    const hits = walk(SRC).filter((f) =>
      /admin_override|adminOverride/.test(readFileSync(f, "utf8")),
    )
    expect(hits).toEqual([])
  })
})
