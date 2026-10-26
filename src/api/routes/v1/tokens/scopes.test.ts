import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Request, Response } from "express"
import {
  createToken,
  getAvailableScopes,
  isAdminOnlyScope,
} from "./controller.js"

// createToken counts the user's tokens before validating scopes.
vi.mock("../../../../clients/database/knex-db.js", () => {
  const builder: Record<string, unknown> = {}
  for (const m of ["where", "whereNull", "count"]) builder[m] = () => builder
  builder.first = async () => ({ count: 0 })
  return { database: { knex: () => builder }, getKnex: () => () => builder }
})

const LEGACY = ["admin:read", "admin:write", "admin:spectrum", "admin:stats"]

function mockRes() {
  const out: { status: number; body: any } = { status: 200, body: null }
  const res = {
    status(code: number) {
      out.status = code
      return res
    },
    json(body: unknown) {
      out.body = body
      return res
    },
  } as unknown as Response
  return { res, out }
}

describe("API token scopes", () => {
  it("only admin and moderation scopes are admin-only", () => {
    expect(isAdminOnlyScope("admin")).toBe(true)
    expect(isAdminOnlyScope("moderation:read")).toBe(true)
    expect(isAdminOnlyScope("moderation:write")).toBe(true)
    expect(isAdminOnlyScope("full")).toBe(false)
    expect(isAdminOnlyScope("market:read")).toBe(false)
  })

  it("no longer offers the dead admin:* sub-scopes, even to admins", async () => {
    const { res, out } = mockRes()
    await getAvailableScopes(
      { user: { user_id: "a", role: "admin" } } as unknown as Request,
      res,
    )
    const scopes: string[] = out.body.data.scopes
    expect(scopes).toContain("admin")
    for (const s of LEGACY) expect(scopes).not.toContain(s)
  })

  it("hides admin and moderation scopes from regular users", async () => {
    const { res, out } = mockRes()
    await getAvailableScopes(
      { user: { user_id: "u", role: "user" } } as unknown as Request,
      res,
    )
    const scopes: string[] = out.body.data.scopes
    expect(scopes.some(isAdminOnlyScope)).toBe(false)
    expect(scopes).toContain("full")
  })

  it.each(LEGACY)("rejects %s as an invalid scope on creation", async (scope) => {
    const { res, out } = mockRes()
    await createToken(
      {
        user: { user_id: "a", role: "admin" },
        body: { name: "t", scopes: [scope] },
      } as unknown as Request,
      res,
    )
    expect(out.status).toBe(400)
    expect(JSON.stringify(out.body)).toContain("Invalid scopes")
  })
})

describe("Prometheus / Grafana support is gone", () => {
  const v1 = join(__dirname, "..")
  it("is not mounted on either v1 router", () => {
    for (const file of ["api-router.ts", "api-v1-router.ts"]) {
      expect(readFileSync(join(v1, file), "utf8")).not.toMatch(/prometheus/i)
    }
  })

  it("has no grafana/prometheus output formats on admin or market stats", () => {
    for (const file of ["admin/controller.ts", "market/controller.ts"]) {
      expect(readFileSync(join(v1, file), "utf8")).not.toMatch(
        /grafana|prometheus/i,
      )
    }
  })
})
