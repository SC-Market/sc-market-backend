/**
 * /api/public/prices: the public, read-only player-market price feed
 * (design: drafts/price-oracle-design.md).
 *
 *   GET /api/public/prices/index.json   every priced item (latest daily snapshot)
 *   GET /api/public/prices/index.csv    the same, CSV
 *   GET /api/public/prices/index.md     the same, a Markdown table (LLM-friendly)
 *   GET /api/public/prices/{slug}.json  one game item (short slug, 8-hex prefix or UUID)
 *
 * No auth, on purpose: it is public, aggregate-only data, made to be read and
 * cited by anyone. It is NOT under /api/public/v1 (token-only), and server.ts
 * mounts it before the session, cookie, CORS, CSRF and passport middleware,
 * so it never reads a browser credential or opens a session. Bounded load:
 * per-IP rate limit (in memory), an in-process response cache, edge-cacheable
 * Cache-Control, and the handlers read only the snapshot table plus one
 * per-item current-ask query under a 2s statement timeout.
 */

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express"
import { LRUCache } from "lru-cache"
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible"
import logger from "../../../logger/logger.js"
import {
  getPriceDocument,
  getPriceIndex,
  priceIndexCsv,
  priceIndexMarkdown,
} from "../../../services/price-oracle/price-oracle.service.js"

/** Per IP, per instance. Edge caching absorbs normal traffic before this. */
export const PRICE_FEED_RATE_LIMIT = { points: 60, duration: 60 } as const

/** Successful responses: browsers 5 min, the edge 15 min, then stale for 1 h while revalidating. */
export const PRICE_FEED_CACHE_CONTROL =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=3600, stale-if-error=86400"
/** Unknown items: short, so a newly imported item shows up soon. */
export const PRICE_FEED_NOT_FOUND_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300"

/** In-process cache TTL; under the edge's s-maxage. */
const MEMORY_TTL_MS = 5 * 60 * 1000

/**
 * Per-IP limiter (in memory, per instance: no DB round trip) for the feed and
 * GET /api/v2/game-items/{id}/price-stats. Over the limit: 429, Retry-After,
 * never cached.
 */
export function createPriceFeedRateLimit(keyPrefix = "price_feed_ip") {
  const limiter = new RateLimiterMemory({ keyPrefix, ...PRICE_FEED_RATE_LIMIT })
  return async function priceFeedRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const r = await limiter.consume(req.ip || "unknown")
      res.setHeader("X-RateLimit-Limit", String(PRICE_FEED_RATE_LIMIT.points))
      res.setHeader("X-RateLimit-Remaining", String(r.remainingPoints))
      next()
    } catch (e) {
      if (!(e instanceof RateLimiterRes)) return next(e)
      const retryAfter = Math.max(1, Math.ceil(e.msBeforeNext / 1000))
      res.setHeader("Retry-After", String(retryAfter))
      res.setHeader("X-RateLimit-Limit", String(PRICE_FEED_RATE_LIMIT.points))
      res.setHeader("X-RateLimit-Remaining", "0")
      res.setHeader("Cache-Control", "no-store")
      res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests",
          retry_after: retryAfter,
        },
      })
    }
  }
}

/**
 * `provisional`: a result that may change any moment, e.g. the index before
 * the first snapshot of a fresh deployment. Never kept in the in-process
 * cache, and sent with the short Cache-Control so the edge doesn't keep it
 * either.
 */
type Body = {
  type: string
  body: string
  status: number
  provisional?: boolean
}

/** An index with no snapshot or no priced items yet is provisional. */
const isProvisionalIndex = (index: { date: string | null; count: number }) =>
  index.date === null || index.count === 0

export interface PriceFeedDeps {
  getPriceDocument: typeof getPriceDocument
  getPriceIndex: typeof getPriceIndex
}

export function createPublicPricesRouter(
  deps: PriceFeedDeps = { getPriceDocument, getPriceIndex },
): express.Router {
  const router = express.Router()
  const cache = new LRUCache<string, Body>({ max: 2000, ttl: MEMORY_TTL_MS })

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD")
      res.status(405).json({
        error: { code: "METHOD_NOT_ALLOWED", message: "Read-only feed" },
      })
      return
    }
    next()
  })
  router.use(createPriceFeedRateLimit())

  // Public data, readable from any origin; no credentials are ever involved.
  router.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
    res.setHeader("X-Content-Type-Options", "nosniff")
    next()
  })

  const send = (res: Response, b: Body) => {
    res.status(b.status)
    res.setHeader("Content-Type", b.type)
    res.setHeader(
      "Cache-Control",
      b.status === 200 && !b.provisional
        ? PRICE_FEED_CACHE_CONTROL
        : PRICE_FEED_NOT_FOUND_CACHE_CONTROL,
    )
    res.send(b.body)
  }

  const cached =
    (key: string, build: () => Promise<Body>) =>
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        let b = cache.get(key)
        if (!b) {
          b = await build()
          if (!b.provisional) cache.set(key, b)
        }
        send(res, b)
      } catch (error) {
        logger.error("Price feed request failed", { error, key })
        next(error)
      }
    }

  const json = (v: unknown, status = 200): Body => ({
    type: "application/json; charset=utf-8",
    body: JSON.stringify(v),
    status,
  })

  router.get(
    "/index.json",
    cached("index.json", async () => {
      const index = await deps.getPriceIndex()
      return { ...json(index), provisional: isProvisionalIndex(index) }
    }),
  )
  router.get(
    "/index.csv",
    cached("index.csv", async () => {
      const index = await deps.getPriceIndex()
      return {
        type: "text/csv; charset=utf-8",
        body: priceIndexCsv(index),
        status: 200,
        provisional: isProvisionalIndex(index),
      }
    }),
  )
  router.get(
    "/index.md",
    cached("index.md", async () => {
      const index = await deps.getPriceIndex()
      return {
        type: "text/markdown; charset=utf-8",
        body: priceIndexMarkdown(index),
        status: 200,
        provisional: isProvisionalIndex(index),
      }
    }),
  )

  router.get("/:slug.json", (req, res, next) => {
    const slug = String(req.params.slug ?? "").toLowerCase()
    if (!/^[0-9a-f][0-9a-z_-]{0,199}$/.test(slug)) {
      send(
        res,
        json({ error: { code: "NOT_FOUND", message: "Unknown item" } }, 404),
      )
      return
    }
    return cached(`item:${slug}`, async () => {
      const doc = await deps.getPriceDocument(slug)
      return doc
        ? json(doc)
        : json({ error: { code: "NOT_FOUND", message: "Unknown item" } }, 404)
    })(req, res, next)
  })

  router.use((_req, res) => {
    res.setHeader("Cache-Control", PRICE_FEED_NOT_FOUND_CACHE_CONTROL)
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "No such price feed file" },
    })
  })

  router.use(
    (_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.setHeader("Cache-Control", "no-store")
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Price feed unavailable" },
      })
    },
  )

  return router
}

export const publicPricesRouter = createPublicPricesRouter()
