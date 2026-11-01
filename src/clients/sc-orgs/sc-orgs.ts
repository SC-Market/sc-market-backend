/**
 * The SC Orgs (sc-orgs.space, our sister site for running orgs) community
 * page of an org, if it has one. Both sites key orgs by RSI spectrum ID, so
 * the page is https://sc-orgs.space/communities/<SID>, but only when SC
 * Orgs' public API (no key needed) confirms an org with that SID.
 *
 * Answers are cached in memory; a failed lookup means "no link", never an
 * error, and is retried sooner than a found / not-found answer. The same
 * lookup the edge bridge makes for crawlers (sc-market-frontend
 * src/bridge/pages.ts, `org`).
 */
import { LRUCache } from "lru-cache"
import logger from "../../logger/logger.js"

export const SC_ORGS_API = "https://api.sc-orgs.space"
export const SC_ORGS_SITE = "https://sc-orgs.space"

const TIMEOUT_MS = 1500
/** Found / not found: reused this long. */
export const SC_ORGS_ANSWER_TTL_MS = 6 * 60 * 60 * 1000
/** Failed lookups (timeout, 5xx, 429): retried after this. */
export const SC_ORGS_ERROR_TTL_MS = 5 * 60 * 1000

/** RSI spectrum IDs (the only ids SC Orgs can have for us). */
const SID = /^[A-Za-z0-9_-]{1,32}$/

export type ScOrgsFetch = (
  url: string,
) => Promise<{ status: number; body: unknown }>

const defaultFetch: ScOrgsFetch = async (url) => {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return {
    status: res.status,
    body: res.status === 200 ? await res.json() : null,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The community page URL from an API body, or null if it isn't this SID. */
export function communityUrlFrom(sid: string, body: unknown): string | null {
  const data = isObject(body) ? body.data : undefined
  if (!isObject(data) || typeof data.sid !== "string") return null
  if (data.sid.toLowerCase() !== sid.toLowerCase() || !SID.test(data.sid))
    return null
  return `${SC_ORGS_SITE}/communities/${encodeURIComponent(data.sid)}`
}

export class ScOrgsClient {
  private cache = new LRUCache<string, { url: string | null }>({
    max: 5000,
    ttl: SC_ORGS_ANSWER_TTL_MS,
  })

  constructor(private fetchOrg: ScOrgsFetch = defaultFetch) {}

  /** SC Orgs community page of the org with this spectrum ID, or null. Never throws. */
  async communityUrl(sid: string): Promise<string | null> {
    if (!SID.test(sid)) return null
    const key = sid.toLowerCase()
    const hit = this.cache.get(key)
    if (hit) return hit.url

    let url: string | null = null
    let ttl = SC_ORGS_ANSWER_TTL_MS
    try {
      const res = await this.fetchOrg(
        `${SC_ORGS_API}/api/v1/orgs/${encodeURIComponent(sid)}`,
      )
      if (res.status === 200) url = communityUrlFrom(sid, res.body)
      else if (res.status !== 404) ttl = SC_ORGS_ERROR_TTL_MS
    } catch (error) {
      logger.warn("SC Orgs community lookup failed", {
        sid,
        error: error instanceof Error ? error.message : String(error),
      })
      ttl = SC_ORGS_ERROR_TTL_MS
    }
    this.cache.set(key, { url }, { ttl })
    return url
  }
}

export const scOrgsClient = new ScOrgsClient()
