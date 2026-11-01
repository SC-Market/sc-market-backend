/**
 * /api/public/items: the public, read-only item acquisition feed ("how to
 * get <item>", services/item-acquisition).
 *
 *   GET /api/public/items/{slug}.json  one game item (short slug, 8-hex prefix or UUID)
 *
 * The document of GET /api/v2/game-items/{id}/acquisition without listing
 * references (PublicItemAcquisitionDocument): counts and prices of player
 * listings, missions, blueprints, in-game shops, freshness. Same envelope
 * (feed, as_of, CC BY 4.0), rate limit, caching and mount rules as the price
 * feed (../public-prices/router.ts): no auth, mounted in server.ts before
 * sessions, cookies, CORS, CSRF and passport.
 */

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express"
import logger from "../../../logger/logger.js"
import {
  getAcquisitionDocument,
  toPublicDocument,
} from "../../../services/item-acquisition/item-acquisition.service.js"
import {
  FEED_SLUG,
  PRICE_FEED_CACHE_CONTROL,
  PRICE_FEED_NOT_FOUND_CACHE_CONTROL,
  usePublicFeedBase,
  usePublicFeedFallbacks,
} from "../public-prices/router.js"

export interface ItemFeedDeps {
  getAcquisitionDocument: typeof getAcquisitionDocument
}

export function createPublicItemsRouter(
  deps: ItemFeedDeps = { getAcquisitionDocument },
): express.Router {
  const router = express.Router()
  usePublicFeedBase(router, "items_feed_ip")

  const notFound = (res: Response) => {
    res.setHeader("Cache-Control", PRICE_FEED_NOT_FOUND_CACHE_CONTROL)
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Unknown item" } })
  }

  // The document is cached in the service (5 minutes, shared with v2).
  router.get(
    "/:slug.json",
    async (req: Request, res: Response, next: NextFunction) => {
      const slug = String(req.params.slug ?? "").toLowerCase()
      if (!FEED_SLUG.test(slug)) return notFound(res)
      try {
        const doc = await deps.getAcquisitionDocument(slug)
        if (!doc) return notFound(res)
        res.setHeader("Cache-Control", PRICE_FEED_CACHE_CONTROL)
        res.setHeader("Content-Type", "application/json; charset=utf-8")
        res.send(JSON.stringify(toPublicDocument(doc)))
      } catch (error) {
        logger.error("Item feed request failed", { error, slug })
        next(error)
      }
    },
  )

  usePublicFeedFallbacks(router, "No such item feed file")
  return router
}

export const publicItemsRouter = createPublicItemsRouter()
