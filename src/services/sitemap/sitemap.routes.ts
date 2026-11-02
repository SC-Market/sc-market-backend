import type { Application, Response } from "express"
import { gunzipSync } from "node:zlib"

import logger from "../../logger/logger.js"
import { getSitemapCache } from "./sitemap.service.js"

// Served at api.sc-market.space/robots.txt (a different host than the frontend's
// public/robots.txt at sc-market.space). App-page crawl rules live in the
// frontend's public/robots.txt.
// This host serves only the JSON API and the sitemap files. Block only the API
// surface; everything else (notably the sitemaps, which are not under /api/)
// stays crawlable by default. The public data feeds (/api/public/prices/,
// /api/public/items/) are meant to be read and cited, so they are allowed.
const ROBOTS_TXT = `User-agent: *
Allow: /api/public/prices/
Allow: /api/public/items/
Disallow: /api/

Sitemap: https://api.sc-market.space/sitemap.xml
`

/**
 * Browser/CDN lifetime of a sitemap file: an hour, like the main-host proxy's
 * edge cache (frontend src/bridge/sitemapProxy.ts). The files are rebuilt
 * every 6 hours, so neither layer can serve one stale for long.
 */
export const SITEMAP_CACHE_CONTROL = "public, max-age=3600"

/** Headers for a served sitemap file; Last-Modified lets crawlers send If-Modified-Since. */
function setSitemapHeaders(res: Response, lastmod: string | undefined): void {
  res.set("Content-Type", "application/xml; charset=utf-8")
  res.set("Cross-Origin-Resource-Policy", "cross-origin")
  res.set("Cache-Control", SITEMAP_CACHE_CONTROL)
  if (lastmod) res.set("Last-Modified", new Date(lastmod).toUTCString())
}

// Express answers HEAD with the GET handler (headers only).
export function setupSitemapRoutes(app: Application): void {
  app.get("/robots.txt", function (_req, res) {
    res.set("Content-Type", "text/plain; charset=utf-8")
    res.set("Cross-Origin-Resource-Policy", "cross-origin")
    res.send(ROBOTS_TXT)
  })
  app.get("/sitemap.xml", async function (_req, res) {
    try {
      const { index, indexLastmod } = await getSitemapCache()
      const xml = gunzipSync(index)
      setSitemapHeaders(res, indexLastmod)
      res.send(xml)
    } catch (error) {
      logger.error("Error generating sitemap index", { error })
      res.status(500).json({ error: "Failed to generate sitemap index" }).end()
    }
  })

  app.get("/sitemap-:key.xml", async function (req, res) {
    const key = req.params.key
    if (!key) {
      res.status(404).json({ error: "Sitemap not found" }).end()
      return
    }

    try {
      const { sitemaps, files, unavailable } = await getSitemapCache()
      if (unavailable.has(key)) {
        // Listed in the index, but its section hasn't built yet: retry soon.
        res.set("Retry-After", "600")
        res.set("Cache-Control", "no-store")
        res.status(503).json({ error: "Sitemap temporarily unavailable" }).end()
        return
      }
      const sitemap = sitemaps.get(key)
      if (!sitemap) {
        res.status(404).json({ error: "Sitemap not found" }).end()
        return
      }

      const xml = gunzipSync(sitemap)
      setSitemapHeaders(res, files.get(key)?.lastmod)
      res.send(xml)
    } catch (error) {
      logger.error("Error generating sitemap file", {
        error,
        key,
      })
      res.status(500).json({ error: "Failed to generate sitemap file" }).end()
    }
  })
}
