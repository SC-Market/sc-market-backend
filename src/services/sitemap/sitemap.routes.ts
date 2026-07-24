import type { Application } from "express"
import { gunzipSync } from "node:zlib"

import logger from "../../logger/logger.js"
import { getSitemapCache } from "./sitemap.service.js"

// Served at api.sc-market.space/robots.txt (a different host than the frontend's
// public/robots.txt at sc-market.space). This host serves only the JSON API and
// the sitemap files, so we allow crawlers (including AI/answer-engine bots) to
// fetch the sitemaps but keep them out of the API surface. App-page crawl rules
// live in the frontend's public/robots.txt.
const ROBOTS_TXT = `User-agent: *
Allow: /sitemap
Disallow: /api/

Sitemap: https://api.sc-market.space/sitemap.xml
`

export function setupSitemapRoutes(app: Application): void {
  app.get("/robots.txt", function (_req, res) {
    res.set("Content-Type", "text/plain; charset=utf-8")
    res.set("Cross-Origin-Resource-Policy", "cross-origin")
    res.send(ROBOTS_TXT)
  })
  app.get("/sitemap.xml", async function (_req, res) {
    try {
      const { index } = await getSitemapCache()
      const xml = gunzipSync(index)
      res.set("Content-Type", "application/xml; charset=utf-8")
      res.set("Cross-Origin-Resource-Policy", "cross-origin")
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
      const { sitemaps } = await getSitemapCache()
      const sitemap = sitemaps.get(key)
      if (!sitemap) {
        res.status(404).json({ error: "Sitemap not found" }).end()
        return
      }

      const xml = gunzipSync(sitemap)
      res.set("Content-Type", "application/xml; charset=utf-8")
      res.set("Cross-Origin-Resource-Policy", "cross-origin")
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
