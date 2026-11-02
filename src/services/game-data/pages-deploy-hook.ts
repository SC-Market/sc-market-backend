/**
 * Rebuild the frontend after a game-data import: POST the Cloudflare Pages
 * deploy hook (CF_PAGES_DEPLOY_HOOK_URL), so the pages the frontend
 * prerenders from the game data (the wiki, blueprint and mission hubs and
 * detail pages; sc-market-frontend docs/prerender.md) are rebuilt with the
 * new patch's data.
 *
 * - Called once per successful import (AdminController.runImport). A failed
 *   import never triggers it.
 * - At most one POST per MIN_INTERVAL_MS (30 min). The first request after
 *   a quiet period fires at once; requests within the interval of the last
 *   POST are coalesced into one more POST when the interval ends, so a
 *   burst of imports costs at most two builds and the last import is always
 *   built.
 * - Unset variable: skipped (one warning at startup, logPagesDeployHookConfig).
 * - The hook URL is a secret (whoever has it can start builds): it is never
 *   logged, and it is stripped from error messages.
 * - A failure is logged and reported to Bugsnag; it never fails the import.
 * - State is in memory (like the import jobs): the admin import page shows
 *   the last POST and any pending one (GET /admin/pages-deploy-hook).
 */
import { createRequire } from "node:module"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

const require = createRequire(import.meta.url)
const Bugsnag = require("@bugsnag/js") as {
  notify: (
    error: Error,
    onError?: (event: { addMetadata: (section: string, values: Record<string, unknown>) => void }) => void,
  ) => void
}

export const PAGES_DEPLOY_HOOK_ENV = "CF_PAGES_DEPLOY_HOOK_URL"
/** At most one deploy hook POST per this many ms. */
export const MIN_INTERVAL_MS = 30 * 60 * 1000
const HOOK_TIMEOUT_MS = 15_000

/** What the admin import page shows (GET /admin/pages-deploy-hook). */
export interface PagesDeployHookStatus {
  /** CF_PAGES_DEPLOY_HOOK_URL is set. */
  configured: boolean
  /** When the hook was last POSTed (ISO), whatever the result. */
  last_triggered_at: string | null
  last_result: "ok" | "failed" | null
  /** Why the last POST failed (never contains the hook URL). */
  last_error: string | null
  /** When a coalesced POST is due (ISO), if one is pending. */
  next_trigger_at: string | null
}

interface State {
  lastAttemptMs: number | null
  lastResult: "ok" | "failed" | null
  lastError: string | null
  pendingAtMs: number | null
  timer: ReturnType<typeof setTimeout> | null
}

const state: State = {
  lastAttemptMs: null,
  lastResult: null,
  lastError: null,
  pendingAtMs: null,
  timer: null,
}

function hookUrl(): string | undefined {
  return env.CF_PAGES_DEPLOY_HOOK_URL?.trim() || undefined
}

/** An error message with the hook URL (and its path, the secret part) removed. */
export function redact(message: string, url: string | undefined = hookUrl()): string {
  if (!url) return message
  let out = message.split(url).join("[deploy hook url]")
  try {
    const { pathname } = new URL(url)
    if (pathname.length > 1) out = out.split(pathname).join("[deploy hook path]")
  } catch {
    // Not a URL: the full-string replacement is all there is.
  }
  return out
}

/** Startup: warn once when the variable is unset (imports then skip the rebuild). */
export function logPagesDeployHookConfig(): void {
  if (!hookUrl()) {
    logger.warn(
      `${PAGES_DEPLOY_HOOK_ENV} is not set: game-data imports won't trigger a frontend rebuild (prerendered pages keep the previous data until the next deploy)`,
    )
  }
}

export function getPagesDeployHookStatus(): PagesDeployHookStatus {
  return {
    configured: !!hookUrl(),
    last_triggered_at: state.lastAttemptMs === null ? null : new Date(state.lastAttemptMs).toISOString(),
    last_result: state.lastResult,
    last_error: state.lastError,
    next_trigger_at: state.pendingAtMs === null ? null : new Date(state.pendingAtMs).toISOString(),
  }
}

function reportFailure(message: string): void {
  logger.error("pages deploy hook failed", { error: message })
  if (env.NODE_ENV === "development") return
  try {
    const reported = new Error(`Pages deploy hook failed: ${message}`)
    reported.name = "PagesDeployHookError"
    Bugsnag.notify(reported, (event) => {
      event.addMetadata("pages_deploy_hook", { last_triggered_at: getPagesDeployHookStatus().last_triggered_at })
    })
  } catch {
    // Bugsnag not started (tests, scripts): the log line is enough.
  }
}

async function post(): Promise<void> {
  const url = hookUrl()
  if (!url) return
  state.lastAttemptMs = Date.now()
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`deploy hook answered HTTP ${res.status}`)
    state.lastResult = "ok"
    state.lastError = null
    logger.info("pages deploy hook triggered: frontend rebuild started")
  } catch (error) {
    const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    const message = redact(raw, url)
    state.lastResult = "failed"
    state.lastError = message
    reportFailure(message)
  }
}

export type DeployHookRequest = "skipped" | "triggered" | "scheduled" | "coalesced"

/**
 * Ask for a frontend rebuild (after a successful import). Never throws and
 * never waits for the POST: the import's result doesn't depend on it.
 */
export function requestPagesRebuild(now: number = Date.now()): DeployHookRequest {
  if (!hookUrl()) {
    logger.info(`${PAGES_DEPLOY_HOOK_ENV} is not set: no frontend rebuild after this import`)
    return "skipped"
  }
  if (state.timer) return "coalesced"
  const dueAt = state.lastAttemptMs === null ? now : state.lastAttemptMs + MIN_INTERVAL_MS
  if (dueAt <= now) {
    void post()
    return "triggered"
  }
  state.pendingAtMs = dueAt
  state.timer = setTimeout(() => {
    state.timer = null
    state.pendingAtMs = null
    void post()
  }, dueAt - now)
  state.timer.unref?.()
  logger.info("pages deploy hook: rebuild scheduled (one per 30 minutes)", {
    next_trigger_at: new Date(dueAt).toISOString(),
  })
  return "scheduled"
}

/** Tests only: forget every POST and pending timer. */
export function resetPagesDeployHookForTests(): void {
  if (state.timer) clearTimeout(state.timer)
  state.lastAttemptMs = null
  state.lastResult = null
  state.lastError = null
  state.pendingAtMs = null
  state.timer = null
}
