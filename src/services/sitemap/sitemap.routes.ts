import type { Application, Response } from "express"

import logger from "../../logger/logger.js"
import { getSitemapCache } from "./sitemap.service.js"

function sendGzippedXml(res: Response, body: Buffer): void {
  res.set("Content-Type", "application/xml")
  res.set("Content-Encoding", "gzip")
  res.send(body)
}

export function setupSitemapRoutes(app: Application): void {
  app.get("/sitemap.xml", async function (_req, res) {
    try {
      const { index } = await getSitemapCache()
      sendGzippedXml(res, index)
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

      sendGzippedXml(res, sitemap)
    } catch (error) {
      logger.error("Error generating sitemap file", {
        error,
        sitemapIndex,
      })
      res.status(500).json({ error: "Failed to generate sitemap file" }).end()
    }
  })
}
