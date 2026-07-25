import { gunzipSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../api/routes/v1/contractors/database.js", () => ({
  getContractorListings: vi.fn(async () => []),
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUsersWhere: vi.fn(async () => []),
}))
vi.mock("../../api/routes/v1/recruiting/database.js", () => ({
  getAllRecruitingPosts: vi.fn(async () => []),
}))

function createChainMock(resolveValue: any = []) {
  const chain: any = {}
  const methods = ["select", "where", "whereNot", "whereNotNull", "groupBy", "limit", "orderBy"]
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: any) => resolve(resolveValue)
  chain[Symbol.iterator] = function* () { yield* resolveValue }
  return chain
}

const mockKnex: any = vi.fn(() => createChainMock([]))

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => mockKnex,
}))

const bugsnagNotify = vi.fn()
vi.mock("@bugsnag/js", () => ({ default: { notify: bugsnagNotify } }))

vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

import { generateSitemapCache } from "./sitemap.service.js"

describe("generateSitemapCache", () => {
  it("produces a valid sitemap index with section-based keys", async () => {
    const { index, sitemaps } = await generateSitemapCache()

    const indexXml = gunzipSync(index).toString("utf8")
    expect(indexXml).toContain("<sitemapindex")
    expect(indexXml).toContain("sitemap-static-0.xml")

    expect(sitemaps.has("static-0")).toBe(true)

    const staticXml = gunzipSync(sitemaps.get("static-0")!).toString("utf8")
    expect(staticXml).toContain("<url>")
    expect(staticXml).toContain("/market</loc>")
    expect(staticXml).toContain("/shops</loc>")
  })

  it("isolates a failing section instead of aborting the whole sitemap", async () => {
    bugsnagNotify.mockClear()
    // Make the shops query throw; every other db(...) call still returns [].
    mockKnex.mockImplementation((table: string) => {
      if (table === "shops") {
        const chain = createChainMock([])
        chain.then = (_resolve: any, reject: any) =>
          reject(new Error("shops query blew up"))
        return chain
      }
      return createChainMock([])
    })

    // Must not throw — the failing section is swallowed.
    const { index, sitemaps } = await generateSitemapCache()

    const indexXml = gunzipSync(index).toString("utf8")
    // Static section (never fails) is still present…
    expect(sitemaps.has("static-0")).toBe(true)
    expect(indexXml).toContain("sitemap-static-0.xml")
    // …and shops is absent rather than 500-ing the whole index.
    expect(sitemaps.has("shops-0")).toBe(false)

    // Reset for any subsequent tests.
    mockKnex.mockImplementation(() => createChainMock([]))
  })
})
