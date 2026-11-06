import { describe, expect, it, vi } from "vitest"
import { SitemapStream, streamToPromise } from "sitemap"

vi.mock("../../logger/logger.js", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { CONTENT_LOCALES, manifestToSitemapPages, type ContentManifest } from "./content-manifest.js"

const guide = "/guides/buying/buy-an-item"
const alternates = [
  { hreflang: "en", path: guide },
  { hreflang: "de", path: `${guide}?lng=de` },
  { hreflang: "zh-CN", path: `${guide}?lng=zh-CN` },
  { hreflang: "x-default", path: guide },
]

function paths(pages: ContentManifest["pages"]): string[] {
  return manifestToSitemapPages({ version: 1, pages }).map((page) => String(page.url))
}

async function render(manifest: ContentManifest): Promise<string> {
  const stream = new SitemapStream({ hostname: "https://sc-market.space/" })
  for (const page of manifestToSitemapPages(manifest)) stream.write(page)
  stream.end()
  return (await streamToPromise(stream)).toString("utf8")
}

describe("manifestToSitemapPages: translated guides", () => {
  it.each(CONTENT_LOCALES)("keeps a ?lng=%s translation", (locale) => {
    expect(paths([{ path: `${guide}?lng=${locale}`, updated: "2026-11-01", lang: locale }])).toEqual([
      `${guide}?lng=${locale}`,
    ])
  })

  it.each([
    ["an unknown locale", `${guide}?lng=pt`],
    ["English (the page without ?lng=)", `${guide}?lng=en`],
    ["a locale in the wrong case", `${guide}?lng=zh-cn`],
    ["an empty locale", `${guide}?lng=`],
    ["another parameter", `${guide}?utm_source=x`],
    ["an extra parameter after lng", `${guide}?lng=de&x=1`],
    ["a parameter before lng", `${guide}?x=1&lng=de`],
    ["a fragment", `${guide}?lng=de#top`],
    ["an encoded injection", `${guide}?lng=de%22%3E`],
    ["a bare ?", `${guide}?`],
  ])("rejects %s", (_label, path) => {
    expect(paths([{ path, updated: "2026-11-01" }])).toEqual([])
  })

  it("turns alternates into hreflang links, dropping unknown languages and non-content paths", () => {
    const [page] = manifestToSitemapPages({
      version: 1,
      pages: [
        {
          path: guide,
          updated: "2026-11-01",
          alternates: [
            ...alternates,
            { hreflang: "pt", path: `${guide}?lng=pt` },
            { hreflang: "fr", path: "https://evil.example/x" },
            { hreflang: "fr", path: `${guide}?lng=fr&x=1` },
            { hreflang: 3, path: guide },
            null,
          ] as never,
        },
      ],
    })
    expect(page.links).toEqual([
      { lang: "en", url: guide },
      { lang: "de", url: `${guide}?lng=de` },
      { lang: "zh-CN", url: `${guide}?lng=zh-CN` },
      { lang: "x-default", url: guide },
    ])
  })

  it("adds no links key when a page has no (usable) alternates", () => {
    const pages = manifestToSitemapPages({
      version: 1,
      pages: [
        { path: "/guides", updated: "2026-11-01" },
        { path: "/about", updated: "2026-11-01", alternates: [] },
        { path: "/blog", updated: "2026-11-01", alternates: "nope" as never },
      ],
    })
    expect(pages.map((page) => "links" in page)).toEqual([false, false, false])
  })
})

describe("content sitemap XML", () => {
  it("emits xhtml:link hreflang alternates, with the xhtml namespace declared", async () => {
    const xml = await render({
      version: 1,
      pages: [
        { path: guide, updated: "2026-11-01", alternates },
        { path: `${guide}?lng=de`, updated: "2026-11-02", lang: "de", alternates },
      ],
    })
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml).toContain(`<loc>https://sc-market.space${guide}?lng=de</loc>`)
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="de" href="https://sc-market.space${guide}?lng=de"/>`,
    )
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="zh-CN" href="https://sc-market.space${guide}?lng=zh-CN"/>`,
    )
    expect(xml).toContain(
      `<xhtml:link rel="alternate" hreflang="x-default" href="https://sc-market.space${guide}"/>`,
    )
    // Both language versions list every alternate (hreflang is reciprocal).
    expect(xml.match(/<xhtml:link /g)).toHaveLength(alternates.length * 2)
  })

  it("is unchanged for pages without translations", async () => {
    const xml = await render({
      version: 1,
      pages: [
        { path: "/guides", updated: "2026-11-01" },
        { path: guide, updated: "2026-10-24" },
      ],
    })
    expect(xml).not.toContain("<xhtml:link")
    expect(xml).toContain(
      `<url><loc>https://sc-market.space${guide}</loc><lastmod>2026-10-24T00:00:00.000Z</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`,
    )
  })
})
