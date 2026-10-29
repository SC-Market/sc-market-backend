/**
 * Per-token usage, for legacy (api_tokens) and public (public_api_tokens)
 * tokens alike.
 *
 * Requests are counted in memory and flushed once a minute:
 * - api_token_usage_hourly: +N requests per (token, hour, API surface);
 * - last_used_at on the token row, at most once a minute per token per
 *   instance (it used to be written on every legacy token request).
 *
 * The counts set the legacy deprecation window from real use (design doc
 * §1, §7). A flush that fails is logged and dropped: usage numbers are
 * approximate by design and must never hold up a request.
 */

import type { Knex } from "knex"
import { database } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

export type TokenKind = "legacy" | "public"
export type ApiSurface = "v1" | "v2" | "public_v1" | "other"

const FLUSH_INTERVAL_MS = 60_000

interface Bucket {
  kind: TokenKind
  tokenId: string
  userId: string
  hour: Date
  surface: ApiSurface
  requests: number
}

/** The API surface of a request path (originalUrl). */
export function surfaceForPath(path: string): ApiSurface {
  if (/^\/api\/public\/v1(?:\/|$|\?)/.test(path)) return "public_v1"
  if (/^\/api\/v2(?:\/|$|\?)/.test(path)) return "v2"
  if (/^\/api(?:\/|$|\?)/.test(path)) return "v1"
  return "other"
}

function hourOf(at: Date): Date {
  const d = new Date(at)
  d.setUTCMinutes(0, 0, 0)
  return d
}

export class TokenUsageRecorder {
  private buckets = new Map<string, Bucket>()
  private lastUsed = new Map<string, { kind: TokenKind; at: Date }>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly db: () => Knex = () => database.serverKnex) {}

  record(
    kind: TokenKind,
    tokenId: string,
    userId: string,
    path: string,
    at = new Date(),
  ): void {
    const surface = surfaceForPath(path)
    const hour = hourOf(at)
    const key = `${kind}:${tokenId}:${hour.toISOString()}:${surface}`
    const bucket = this.buckets.get(key)
    if (bucket) bucket.requests++
    else
      this.buckets.set(key, {
        kind,
        tokenId,
        userId,
        hour,
        surface,
        requests: 1,
      })
    this.lastUsed.set(`${kind}:${tokenId}`, { kind, at })
    this.start()
  }

  /** Start the minute timer (lazily, so tests and scripts don't keep it). */
  private start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.flush().catch((error) =>
        logger.warn("Token usage flush failed", { error }),
      )
    }, FLUSH_INTERVAL_MS)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Write and clear the pending counts. */
  async flush(): Promise<void> {
    const buckets = [...this.buckets.values()]
    const lastUsed = [...this.lastUsed.entries()]
    this.buckets.clear()
    this.lastUsed.clear()
    if (!buckets.length && !lastUsed.length) return
    const db = this.db()

    for (const kind of ["legacy", "public"] as const) {
      const rows = buckets.filter((b) => b.kind === kind)
      if (rows.length) {
        const column = kind === "legacy" ? "legacy_token_id" : "public_token_id"
        const values = rows.map(() => "(?, ?, ?, ?, ?)").join(", ")
        const bindings = rows.flatMap((b) => [
          b.hour,
          b.surface,
          b.tokenId,
          b.userId,
          b.requests,
        ])
        await db
          .raw(
            `INSERT INTO api_token_usage_hourly (hour, surface, ${column}, user_id, requests)
             VALUES ${values}
             ON CONFLICT (${column}, hour, surface) WHERE ${column} IS NOT NULL
             DO UPDATE SET requests = api_token_usage_hourly.requests + EXCLUDED.requests`,
            bindings,
          )
          // e.g. a token deleted since (account deletion): its counts go with it.
          .catch((error: unknown) =>
            logger.warn("Token usage rollup write failed", { kind, error }),
          )
      }
    }

    for (const [key, { kind, at }] of lastUsed) {
      const id = key.slice(kind.length + 1)
      const table = kind === "legacy" ? "api_tokens" : "public_api_tokens"
      await db(table)
        .where("id", id)
        .update({ last_used_at: at })
        .catch((error: unknown) =>
          logger.warn("Token last_used_at write failed", { kind, error }),
        )
    }
  }
}

export const tokenUsage = new TokenUsageRecorder()
