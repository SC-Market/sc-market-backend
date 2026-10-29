/**
 * The public spec's security is enforced at build time
 * (scripts/check-public-spec.ts runs publicSpecProblems on the generated
 * spec): every operation is a catalogued public one, with exactly
 * @Security("apiToken", [its catalog scopes]).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  PUBLIC_OPERATIONS,
  PUBLIC_SCOPES,
  PUBLIC_TOKEN_PRESETS,
  publicSpecProblems,
} from "./scope-catalog.js"

const here = dirname(fileURLToPath(import.meta.url))
const generated = () =>
  JSON.parse(readFileSync(join(here, "generated", "swagger.json"), "utf-8"))

describe("public API spec", () => {
  it("the generated spec is sound", () => {
    expect(publicSpecProblems(generated())).toEqual([])
  })

  it("lists only public paths, under the public base path", () => {
    const spec = generated()
    expect(spec.servers).toEqual([{ url: "/api/public/v1" }])
    const ops = Object.entries(
      spec.paths as Record<string, Record<string, unknown>>,
    ).flatMap(([p, o]) => Object.keys(o).map((m) => `${m.toUpperCase()} ${p}`))
    expect(ops.sort()).toEqual(Object.keys(PUBLIC_OPERATIONS).sort())
    expect(spec.components.securitySchemes.apiToken).toMatchObject({
      type: "http",
      scheme: "bearer",
    })
  })

  it("fails an operation without security", () => {
    const spec = generated()
    delete spec.paths["/me"].get.security
    expect(publicSpecProblems(spec)).toEqual([
      expect.stringContaining("GET /me: must declare"),
    ])
  })

  it("fails an operation with another security scheme or wrong scopes", () => {
    const spec = generated()
    const viaSession = generated()
    viaSession.paths["/me"].get.security = [{ loggedin: [] }]
    expect(publicSpecProblems(viaSession)).toEqual([
      expect.stringContaining("GET /me: must declare"),
    ])
    spec.paths["/me"].get.security = [{ apiToken: ["orders:read"] }]
    expect(publicSpecProblems(spec)).toEqual([
      expect.stringContaining("GET /me: declares scopes [orders:read], catalog says []"),
    ])
  })

  it("fails when an internal path leaks into the spec", () => {
    const spec = generated()
    spec.paths["/admin/users"] = { get: { security: [{ apiToken: [] }] } }
    spec.paths["/listings/mine"] = { get: { security: [{ loggedin: [] }] } }
    const problems = publicSpecProblems(spec)
    expect(problems).toContainEqual(
      expect.stringContaining("GET /admin/users: not a public operation"),
    )
    expect(problems).toContainEqual(
      expect.stringContaining("GET /listings/mine: not a public operation"),
    )
  })

  it("fails when a catalogued operation is missing", () => {
    const spec = generated()
    delete spec.paths["/me"]
    expect(publicSpecProblems(spec)).toEqual([
      expect.stringContaining(
        "GET /me: in PUBLIC_OPERATIONS but not in the spec",
      ),
    ])
  })

  it("presets name only public scopes, and there is no full or readonly", () => {
    for (const scopes of Object.values(PUBLIC_TOKEN_PRESETS)) {
      for (const s of scopes) expect(PUBLIC_SCOPES).toContain(s)
    }
    expect(PUBLIC_SCOPES).not.toContain("full" as never)
    expect(PUBLIC_SCOPES).not.toContain("readonly" as never)
  })
})
