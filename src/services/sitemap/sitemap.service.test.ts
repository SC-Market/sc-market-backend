import { gunzipSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: vi.fn(() => vi.fn()),
  database: {},
}))

import {
  generateSitemapsFromPages,
  SITEMAP_URL_LIMIT,
} from "./sitemap.service.js"

function makePages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    url: `/page-${index}`,
    changefreq: "weekly" as const,
    priority: 0.5,
  }))
}

describe("generateSitemapsFromPages", () => {
  it("creates a single sitemap file when under the limit", async () => {
    const pages = makePages(10)
    const { index, sitemaps } = await generateSitemapsFromPages(
      pages,
      "https://example.com/",
      SITEMAP_URL_LIMIT,
      "https://example.com/",
    )

    expect(sitemaps.size).toBe(1)
    expect(sitemaps.has(0)).toBe(true)

    const indexXml = gunzipSync(index).toString("utf8")
    expect(indexXml).toContain("<sitemapindex")
    expect(indexXml).toContain("<loc>https://example.com/sitemap-0.xml</loc>")
    expect(indexXml).not.toContain("sitemap-1.xml")
  })

  it("splits into multiple sitemap files when the limit is exceeded", async () => {
    const limit = 3
    const pages = makePages(limit + 1)
    const { index, sitemaps } = await generateSitemapsFromPages(
      pages,
      "https://example.com/",
      limit,
      "https://example.com/",
    )

    expect(sitemaps.size).toBe(2)
    expect(sitemaps.has(0)).toBe(true)
    expect(sitemaps.has(1)).toBe(true)

    const firstSitemapXml = gunzipSync(sitemaps.get(0)!).toString("utf8")
    const secondSitemapXml = gunzipSync(sitemaps.get(1)!).toString("utf8")
    const urlMatches = (xml: string) => xml.match(/<url>/g)?.length ?? 0

    expect(urlMatches(firstSitemapXml)).toBe(limit)
    expect(urlMatches(secondSitemapXml)).toBe(1)

    const indexXml = gunzipSync(index).toString("utf8")
    expect(indexXml).toContain("<loc>https://example.com/sitemap-0.xml</loc>")
    expect(indexXml).toContain("<loc>https://example.com/sitemap-1.xml</loc>")
  })
})
