import type { Application, Request, Response } from "express"
import { gunzipSync } from "node:zlib"

import logger from "../../logger/logger.js"
import { getSitemapCache } from "./sitemap.service.js"

function sendSitemapXml(req: Request, res: Response, body: Buffer): void {
  res.set("Content-Type", "application/xml; charset=utf-8")
  const acceptsGzip = req.headers["accept-encoding"]?.includes("gzip")
  if (acceptsGzip) {
    res.set("Content-Encoding", "gzip")
    res.send(body)
  } else {
    res.send(gunzipSync(body))
  }
}

export function setupSitemapRoutes(app: Application): void {
  app.get("/sitemap.xml", async function (req, res) {
    try {
      const { index } = await getSitemapCache()
      sendSitemapXml(req, res, index)
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

      sendSitemapXml(req, res, sitemap)
    } catch (error) {
      logger.error("Error generating sitemap file", {
        error,
        sitemapIndex,
      })
      res.status(500).json({ error: "Failed to generate sitemap file" }).end()
    }
  })
}
