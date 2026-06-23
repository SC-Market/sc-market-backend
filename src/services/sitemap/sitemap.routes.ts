import type { Application } from "express"
import { gunzipSync } from "node:zlib"

import logger from "../../logger/logger.js"
import { getSitemapCache } from "./sitemap.service.js"

export function setupSitemapRoutes(app: Application): void {
  app.get("/sitemap.xml", async function (_req, res) {
    try {
      const { index } = await getSitemapCache()
      const xml = gunzipSync(index)
      res.set("Content-Type", "application/xml; charset=utf-8")
      res.send(xml)
    } catch (error) {
      logger.error("Error generating sitemap index", { error })
      res.status(500).json({ error: "Failed to generate sitemap index" }).end()
    }
  })

  app.get("/sitemap-:index.xml", async function (req, res) {
    const sitemapIndex = Number.parseInt(req.params.index, 10)
    if (!Number.isInteger(sitemapIndex) || sitemapIndex < 0) {
      res.status(404).json({ error: "Sitemap not found" }).end()
      return
    }

    try {
      const { sitemaps } = await getSitemapCache()
      const sitemap = sitemaps.get(sitemapIndex)
      if (!sitemap) {
        res.status(404).json({ error: "Sitemap not found" }).end()
        return
      }

      const xml = gunzipSync(sitemap)
      res.set("Content-Type", "application/xml; charset=utf-8")
      res.send(xml)
    } catch (error) {
      logger.error("Error generating sitemap file", {
        error,
        sitemapIndex,
      })
      res.status(500).json({ error: "Failed to generate sitemap file" }).end()
    }
  })
}
