/**
 * Scrub Bugsnag events with the same redaction as the logs (format.ts).
 *
 * @bugsnag/plugin-express reports the full request URL, path, params, query
 * and body, so a token-in-path route (/api/v2/integrations/scmdb/ingest/
 * {token}, /api/email/unsubscribe/:token) or an OAuth `?code=`/`?state=`
 * would reach Bugsnag. redactedKeys alone can't help: it matches keys, not
 * URL text.
 *
 * Runs as the config onError. The plugin's per-request callbacks attach the
 * request info before it runs (checked against the real plugin; see
 * bugsnag-scrub.test.ts).
 */

import { REDACTED, scrubString, toLoggable } from "./format.js"

interface BugsnagEventLike {
  context?: string
  request?: Record<string, unknown>
  errors?: Array<{ errorMessage?: string }>
  breadcrumbs?: Array<{ message?: string; metadata?: Record<string, unknown> }>
  _metadata?: Record<string, unknown>
}

// Query parameters that are secrets in a URL (the same names format.ts
// scrubs from URL text). In a query object they are keys, and `state` isn't
// a sensitive key elsewhere (order state, ...), so handle them here.
const SECRET_QUERY_KEY =
  /^(code|token|access_token|refresh_token|id_token|share_token|secret|client_secret|password|state)$/i

function scrubQuery(record: Record<string, unknown>): void {
  const query = record.query
  if (!query || typeof query !== "object" || Array.isArray(query)) return
  for (const key of Object.keys(query)) {
    if (SECRET_QUERY_KEY.test(key)) {
      ;(query as Record<string, unknown>)[key] = REDACTED
    }
  }
}

function scrubRecord(value: unknown): Record<string, unknown> {
  const scrubbed = toLoggable(value)
  if (!scrubbed || typeof scrubbed !== "object" || Array.isArray(scrubbed)) {
    return {}
  }
  const record = scrubbed as Record<string, unknown>
  scrubQuery(record)
  return record
}

/** Mutates the event in place. Always returns true (send the event). */
export function scrubBugsnagEvent(bugsnagEvent: object): boolean {
  // Bugsnag's Event type keeps _metadata private; only these fields are read.
  const event = bugsnagEvent as BugsnagEventLike
  if (typeof event.context === "string") {
    event.context = scrubString(event.context)
  }
  if (event.request) {
    // headers are kept as is (Bugsnag's redactedKeys removes authorization
    // and cookie), the rest goes through key and string redaction.
    const { headers, ...rest } = event.request
    event.request = { ...scrubRecord(rest), ...(headers ? { headers } : {}) }
  }
  for (const error of event.errors ?? []) {
    if (typeof error.errorMessage === "string") {
      error.errorMessage = scrubString(error.errorMessage)
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (typeof crumb.message === "string") {
      crumb.message = scrubString(crumb.message)
    }
    if (crumb.metadata) crumb.metadata = scrubRecord(crumb.metadata)
  }
  if (event._metadata) {
    for (const [section, values] of Object.entries(event._metadata)) {
      event._metadata[section] = scrubRecord(values)
    }
  }
  return true
}
