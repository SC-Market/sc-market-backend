import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: vi.fn() }))

const { checkSubdomain } = await import("./enquiries.js")

describe("storefront subdomain rules (<name>.sc-market.space)", () => {
  it("accepts a spectrum ID, lower-cased, with or without the suffix", () => {
    expect(checkSubdomain("MEDRUNNER")).toEqual({ ok: true, subdomain: "medrunner" })
    expect(checkSubdomain(" bwincorp.sc-market.space ")).toEqual({ ok: true, subdomain: "bwincorp" })
    expect(checkSubdomain("red-fleet-7")).toEqual({ ok: true, subdomain: "red-fleet-7" })
  })

  it("takes one DNS label only", () => {
    for (const bad of ["a.b", "my_org", "-org", "org-", "o", "x".repeat(64), "", "org!", "~test", "a--b"]) {
      expect(checkSubdomain(bad).ok, bad).toBe(false)
    }
    expect(checkSubdomain("x".repeat(63)).ok).toBe(true)
  })

  it("refuses the site's own names", () => {
    for (const name of ["www", "api", "cdn", "admin", "staging", "storefronts"]) {
      expect(checkSubdomain(name).ok, name).toBe(false)
    }
  })
})
