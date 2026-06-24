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
  const methods = ["select", "where", "whereNotNull", "groupBy", "limit", "orderBy"]
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
  })
})
