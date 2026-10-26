/**
 * Log record building and redaction, shared by the production JSON format
 * and the development pretty format (logger.ts).
 *
 * Production writes ONE JSON object per line:
 *   {"ts","level","msg","request_id","method","route","user_id",...meta,"error"}
 * Container stdout is split per line by Lightsail, so a multi-line message,
 * stack or pretty-printed object used to become several unrelated events.
 *
 * Redaction: values under secret-looking keys (tokens, secrets, passwords,
 * cookies, authorization, MFA/OAuth codes) become "[REDACTED]", and strings
 * (messages, stacks, values) are scrubbed of bearer/API tokens, JWTs, secret
 * query parameters and the token segment of token-in-path routes. Values
 * already shortened by util/redact.ts redactToken() are kept as is.
 */

import type { Request } from "express"
import type { LogContext } from "./log-context.js"

export const REDACTED = "[REDACTED]"

const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 50
const MAX_STRING_LENGTH = 8000

// Output of redactToken(): "abcd…[32]".
const ALREADY_REDACTED = /^.{0,4}…\[\d+\]$/

const SECRET_KEY =
  /secret|passw(or)?d|authorization|cookie|otpauth|qr_data_url|manual_key|recovery|api_?key|access_?key|private_?key|credential/i
const CODE_KEY =
  /^(code|codes|otp|totp)$|(mfa|auth|oauth|recovery|verification|backup)_?codes?$/i
const TOKEN_KEY = /token/i
// Token metadata that is not the token itself.
const TOKEN_METADATA_KEY =
  /(_id|Id|_ids|Ids|_count|Count|_type|Type|_name|Name|_prefix|Prefix|_scopes?|Scopes?)$/

export function isSensitiveKey(key: string): boolean {
  if (SECRET_KEY.test(key) || CODE_KEY.test(key)) return true
  return TOKEN_KEY.test(key) && !TOKEN_METADATA_KEY.test(key)
}

const STRING_SCRUBBERS: Array<[RegExp, string]> = [
  // Secret query parameters (OAuth callback codes, share/unsubscribe tokens).
  [
    /([?&;](?:code|token|access_token|refresh_token|id_token|share_token|secret|client_secret|password|state)=)[^&\s"'#]+/gi,
    `$1${REDACTED}`,
  ],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`],
  // SC Market API tokens.
  [/\bscm_[A-Za-z0-9_-]{6,}/g, `scm_${REDACTED}`],
  // JWTs.
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
  // Routes with a bearer token in the path (scmdb ingest, unsubscribe).
  [/(\/(?:ingest|unsubscribe)\/)[^/?\s"']+/g, `$1${REDACTED}`],
]

export function scrubString(value: string): string {
  let s = value
  for (const [pattern, replacement] of STRING_SCRUBBERS) {
    s = s.replace(pattern, replacement)
  }
  return s.length > MAX_STRING_LENGTH
    ? `${s.slice(0, MAX_STRING_LENGTH)}…[truncated ${s.length - MAX_STRING_LENGTH}]`
    : s
}

export interface SerializedError {
  name: string
  message: string
  stack?: string
  code?: string | number
  cause?: unknown
}

export function serializeError(
  err: Error,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): SerializedError {
  seen.add(err)
  const out: SerializedError = {
    name: err.name || "Error",
    message: scrubString(String(err.message ?? "")),
  }
  if (err.stack) out.stack = scrubString(err.stack)
  const code = (err as { code?: unknown }).code
  if (typeof code === "string" || typeof code === "number") out.code = code
  const cause = (err as { cause?: unknown }).cause
  if (cause !== undefined) out.cause = toLoggable(cause, depth + 1, seen)
  return out
}

/**
 * JSON-safe, redacted copy of `value`: no circular references, no functions,
 * bounded depth, array length and string length.
 */
export function toLoggable(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) return value
  switch (typeof value) {
    case "string":
      return scrubString(value)
    case "number":
    case "boolean":
      return value
    case "bigint":
      return value.toString()
    case "function":
    case "symbol":
      return undefined
  }
  const obj = value as object
  if (obj instanceof Date) {
    return Number.isNaN(obj.getTime()) ? String(obj) : obj.toISOString()
  }
  if (Buffer.isBuffer(obj)) return `[Buffer ${obj.length} bytes]`
  if (seen.has(obj)) return "[Circular]"
  if (depth >= MAX_DEPTH) return "[Truncated]"
  if (obj instanceof Error) return serializeError(obj, depth, seen)
  seen.add(obj)
  if (Array.isArray(obj)) {
    const items = obj
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => toLoggable(item, depth + 1, seen))
    if (obj.length > MAX_ARRAY_ITEMS) {
      items.push(`[${obj.length - MAX_ARRAY_ITEMS} more]`)
    }
    return items
  }
  if (obj instanceof Map) {
    return toLoggable(Object.fromEntries(obj), depth, seen)
  }
  if (obj instanceof Set) return toLoggable([...obj], depth, seen)
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(obj)) {
    out[key] = redactValue(key, child, depth, seen)
  }
  return out
}

function redactValue(
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === undefined || value === null || value === "") return value
  if (isSensitiveKey(key)) {
    return typeof value === "string" && ALREADY_REDACTED.test(value)
      ? value
      : REDACTED
  }
  return toLoggable(value, depth + 1, seen)
}

/**
 * Route of the request: the matched route pattern when routing has happened
 * (low cardinality, no ids or tokens), otherwise the scrubbed path.
 */
export function requestRoute(req: Request): string | undefined {
  const pattern = (req.route as { path?: unknown } | undefined)?.path
  if (typeof pattern === "string") return `${req.baseUrl || ""}${pattern}`
  const path = (req.originalUrl || req.url || "").split("?")[0]
  return path ? scrubString(path) : undefined
}

/** Fields of the winston info object that are not metadata. */
const RESERVED_KEYS = new Set([
  "level",
  "message",
  "timestamp",
  "error",
  "stack",
  "cause",
])

export interface LogInfo {
  level: string
  message?: unknown
  timestamp?: string
  error?: unknown
  stack?: unknown
  cause?: unknown
  [key: string]: unknown
}

/** The production log record, in output key order. */
export function buildLogRecord(
  info: LogInfo,
  ctx: LogContext | undefined,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    ts: info.timestamp ?? new Date().toISOString(),
    level: info.level,
    msg:
      typeof info.message === "string"
        ? scrubString(info.message)
        : toLoggable(info.message),
  }

  if (ctx) {
    record.request_id = ctx.requestId
    const req = ctx.req
    if (req) {
      record.method = req.method
      record.route = requestRoute(req)
      const userId = req.user?.user_id
      if (userId) record.user_id = userId
    }
  }

  const seen = new WeakSet<object>()
  for (const key of Object.keys(info)) {
    if (RESERVED_KEYS.has(key)) continue
    const value = redactValue(key, info[key], 0, seen)
    if (value !== undefined) record[key] = value
  }

  const error = buildError(info, seen)
  if (error !== undefined) record.error = error
  return record
}

/**
 * The record's `error`: the `error` metadata, or the stack winston copies
 * onto the info object when an Error is logged directly
 * (`logger.error("msg", err)` / `logger.error(err)`), plus any `cause`.
 */
function buildError(info: LogInfo, seen: WeakSet<object>): unknown | undefined {
  let error: unknown
  if (info.error !== undefined && info.error !== null) {
    error =
      info.error instanceof Error
        ? serializeError(info.error, 0, seen)
        : toLoggable(info.error, 0, seen)
  }
  if (typeof info.stack === "string") {
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const e = error as Record<string, unknown>
      if (!e.stack) e.stack = scrubString(info.stack)
    } else if (error === undefined) {
      error = { stack: scrubString(info.stack) }
    } else {
      error = { value: error, stack: scrubString(info.stack) }
    }
  }
  if (info.cause !== undefined) {
    const cause = toLoggable(info.cause, 0, seen)
    if (error && typeof error === "object" && !Array.isArray(error)) {
      ;(error as Record<string, unknown>).cause ??= cause
    } else if (error === undefined) {
      error = { cause }
    }
  }
  return error
}
