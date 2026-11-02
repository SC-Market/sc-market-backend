import { gzipSync } from "node:zlib"
import express from "express"
import request from "supertest"
import { describe, expect, it, vi } from "vitest"

import type { SitemapCache } from "./sitemap.service.js"

const INDEX =
  '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  "<sitemap><loc>https://api.sc-market.space/sitemap-shops-0.xml</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod></sitemap>" +
  "<sitemap><loc>https://api.sc-market.space/sitemap-users-0.xml</loc></sitemap></sitemapindex>"

const cache: SitemapCache = {
  index: gzipSync(INDEX),
  sitemaps: new Map([
    ["shops-0", gzipSync('<?xml version="1.0" encoding="UTF-8"?><urlset/>')],
  ]),
  files: new Map([
    [
      "shops-0",
      {
        hash: "h",
        changedAt: "2026-11-01T00:00:00.000Z",
        lastmod: "2026-10-01T00:00:00.000Z",
      },
    ],
  ]),
  unavailable: new Set(["users-0"]),
  sectionPages: new Map(),
  indexLastmod: "2026-10-01T00:00:00.000Z",
  ttlMs: 1,
}

vi.mock("./sitemap.service.js", () => ({
  getSitemapCache: vi.fn(async () => cache),
}))

const { setupSitemapRoutes, SITEMAP_CACHE_CONTROL } =
  await import("./sitemap.routes.js")
const app = express()
setupSitemapRoutes(app)

describe("sitemap routes", () => {
  it("serves the index with Cache-Control and Last-Modified, on GET and HEAD", async () => {
    const get = await request(app).get("/sitemap.xml")
    expect(get.status).toBe(200)
    expect(get.headers["content-type"]).toBe("application/xml; charset=utf-8")
    expect(get.headers["cache-control"]).toBe(SITEMAP_CACHE_CONTROL)
    expect(get.headers["last-modified"]).toBe("Thu, 01 Oct 2026 00:00:00 GMT")
    expect(get.text).toBe(INDEX)

    const head = await request(app).head("/sitemap.xml")
    expect(head.status).toBe(200)
    expect(head.headers["cache-control"]).toBe(SITEMAP_CACHE_CONTROL)
    expect(head.text ?? "").toBe("")
  })

  it("answers 304 to If-Modified-Since for an unchanged file", async () => {
    const res = await request(app)
      .get("/sitemap-shops-0.xml")
      .set("If-Modified-Since", "Thu, 01 Oct 2026 00:00:00 GMT")
    expect(res.status).toBe(304)
  })

  it("answers 503 (never cached) for a listed file whose section hasn't built yet", async () => {
    const res = await request(app).get("/sitemap-users-0.xml")
    expect(res.status).toBe(503)
    expect(res.headers["retry-after"]).toBe("600")
    expect(res.headers["cache-control"]).toBe("no-store")
  })

  it("404s an unknown file", async () => {
    expect((await request(app).get("/sitemap-nope-0.xml")).status).toBe(404)
  })
})
