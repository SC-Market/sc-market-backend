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
import { isCloudflareIp } from "../../middleware/cloudflare-only.js"
import {
  PUBLIC_FEED_LICENSE,
  getPriceDocument,
  getPriceIndex,
  priceIndexCsv,
  priceIndexMarkdown,
} from "../../../services/price-oracle/price-oracle.service.js"

/** Per IP, per instance. Edge caching absorbs normal traffic before this. */
export const PRICE_FEED_RATE_LIMIT = { points: 60, duration: 60 } as const

/**
 * The bucket for callers whose client IP is itself a Cloudflare address:
 * Cloudflare Workers / Pages Functions, i.e. our own SSR and bridge Functions
 * (sc-market-frontend src/ssr, src/bridge), which call these feeds
 * anonymously from Cloudflare's shared egress IPs. Under the 60/min per-IP
 * limit, one crawler burst through them would 429 every other crawler's item
 * pages. There is no shared secret between the Functions and this API (they
 * send only `Accept`), so this is not an exemption: one shared, larger bucket
 * (per instance) for all Cloudflare-originated traffic. The IP is
 * Cloudflare-asserted, not a header the caller picks: req.ip comes from the
 * X-Forwarded-For entry Cloudflare appends (trust proxy 2, and
 * cloudflare-only.ts rejects requests whose last hop isn't Cloudflare). Any
 * Cloudflare customer's Worker lands in this bucket too, which is why it is
 * bounded: these endpoints are read-only and served from in-process caches.
 */
export const PRICE_FEED_CLOUDFLARE_RATE_LIMIT = {
  points: 600,
  duration: 60,
} as const

/** Successful responses: browsers 5 min, the edge 15 min, then stale for 1 h while revalidating. */
export const PRICE_FEED_CACHE_CONTROL =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=3600, stale-if-error=86400"
/** Unknown items: short, so a newly imported item shows up soon. */
export const PRICE_FEED_NOT_FOUND_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300"

/** In-process cache TTL; under the edge's s-maxage. */
const MEMORY_TTL_MS = 5 * 60 * 1000

/**
 * Per-IP limiter (in memory, per instance: no DB round trip) for the feeds,
 * GET /api/v2/game-items/{id}/price-stats and /acquisition. Requests whose
 * client IP is a Cloudflare address (our edge Functions) share the larger
 * PRICE_FEED_CLOUDFLARE_RATE_LIMIT bucket instead. Over the limit: 429,
 * Retry-After, never cached.
 */
export function createPriceFeedRateLimit(
  keyPrefix = "price_feed_ip",
  limits: {
    perIp: { points: number; duration: number }
    cloudflare: { points: number; duration: number }
  } = {
    perIp: PRICE_FEED_RATE_LIMIT,
    cloudflare: PRICE_FEED_CLOUDFLARE_RATE_LIMIT,
  },
) {
  const perIp = new RateLimiterMemory({ keyPrefix, ...limits.perIp })
  const cloudflare = new RateLimiterMemory({
    keyPrefix: `${keyPrefix}:cloudflare`,
    ...limits.cloudflare,
  })
  return async function priceFeedRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const ip = req.ip || "unknown"
    const fromCloudflare = isCloudflareIp(ip)
    const limiter = fromCloudflare ? cloudflare : perIp
    const limit = fromCloudflare
      ? limits.cloudflare.points
      : limits.perIp.points
    try {
      const r = await limiter.consume(fromCloudflare ? "cloudflare" : ip)
      res.setHeader("X-RateLimit-Limit", String(limit))
      res.setHeader("X-RateLimit-Remaining", String(r.remainingPoints))
      next()
    } catch (e) {
      if (!(e instanceof RateLimiterRes)) return next(e)
      const retryAfter = Math.max(1, Math.ceil(e.msBeforeNext / 1000))
      res.setHeader("Retry-After", String(retryAfter))
      res.setHeader("X-RateLimit-Limit", String(limit))
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
 * What every public data feed router (/api/public/prices, /api/public/items)
 * starts with: read-only (405 otherwise), the per-IP limit (its own bucket
 * per feed), and headers for public data readable from any origin, with the
 * licence (CC BY 4.0) as a Link header on every response, CSV included.
 */
export function usePublicFeedBase(
  router: express.Router,
  rateLimitKeyPrefix: string,
): void {
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
  router.use(createPriceFeedRateLimit(rateLimitKeyPrefix))

  // Public data, readable from any origin; no credentials are ever involved.
  router.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("Link", `<${PUBLIC_FEED_LICENSE.url}>; rel="license"`)
    next()
  })
}

/** The 404 for unknown paths and the 500 handler (never cached) of a feed router. */
export function usePublicFeedFallbacks(
  router: express.Router,
  notFoundMessage: string,
): void {
  router.use((_req, res) => {
    res.setHeader("Cache-Control", PRICE_FEED_NOT_FOUND_CACHE_CONTROL)
    res.status(404).json({
      error: { code: "NOT_FOUND", message: notFoundMessage },
    })
  })

  router.use(
    (_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.setHeader("Cache-Control", "no-store")
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Feed unavailable" },
      })
    },
  )
}

/** Feed slugs: a short slug, an 8-hex prefix or a UUID, lower case. */
export const FEED_SLUG = /^[0-9a-f][0-9a-z_-]{0,199}$/

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

  usePublicFeedBase(router, "price_feed_ip")

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
    if (!FEED_SLUG.test(slug)) {
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

  usePublicFeedFallbacks(router, "No such price feed file")

  return router
}

export const publicPricesRouter = createPublicPricesRouter()
