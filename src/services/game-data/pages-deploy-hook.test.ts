/**
 * The frontend rebuild after a game-data import (pages-deploy-hook.ts): one
 * POST to CF_PAGES_DEPLOY_HOOK_URL per successful import, at most one per 30
 * minutes with bursts coalesced, skipped when unset, failures logged and
 * reported but never thrown, and the hook URL never logged. No database:
 * fetch, the logger and Bugsnag are mocked.
 */
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

const h = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }))

vi.mock("../../logger/logger.js", () => ({
  default: { warn: h.warn, error: h.error, info: h.info, debug: vi.fn() },
}))

const { env } = await import("../../config/env.js")
const hook = await import("./pages-deploy-hook.js")
const Bugsnag = createRequire(import.meta.url)("@bugsnag/js") as { notify: (...args: unknown[]) => void }

const URL_ = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/9f1c-super-secret"
const SECRET = "9f1c-super-secret"

let fetchMock: Mock
let notify: ReturnType<typeof vi.spyOn>

/** Everything logged or reported, as one string. */
function allOutput(): string {
  return JSON.stringify([
    h.warn.mock.calls,
    h.error.mock.calls,
    h.info.mock.calls,
    notify.mock.calls.map(([e]) => (e as Error).message),
    hook.getPagesDeployHookStatus(),
  ])
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"))
  hook.resetPagesDeployHookForTests()
  env.CF_PAGES_DEPLOY_HOOK_URL = URL_
  env.NODE_ENV = "test"
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  notify = vi.spyOn(Bugsnag, "notify").mockImplementation(() => {})
})

afterEach(() => {
  hook.resetPagesDeployHookForTests()
  delete env.CF_PAGES_DEPLOY_HOOK_URL
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.clearAllMocks()
  notify.mockRestore()
})

describe("requestPagesRebuild", () => {
  it("POSTs the hook once, at once, after a quiet period", async () => {
    expect(hook.requestPagesRebuild()).toBe("triggered")
    await vi.runAllTimersAsync()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(URL_)
    expect(init).toMatchObject({ method: "POST", redirect: "error" })
    expect(hook.getPagesDeployHookStatus()).toMatchObject({
      configured: true,
      last_triggered_at: "2026-11-02T12:00:00.000Z",
      last_result: "ok",
      last_error: null,
      next_trigger_at: null,
    })
  })

  it("coalesces a burst into one more POST when the 30 minutes are up", async () => {
    hook.requestPagesRebuild()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(hook.requestPagesRebuild()).toBe("scheduled")
    expect(hook.requestPagesRebuild()).toBe("coalesced")
    expect(hook.requestPagesRebuild()).toBe("coalesced")
    expect(hook.getPagesDeployHookStatus().next_trigger_at).toBe("2026-11-02T12:30:00.000Z")

    await vi.advanceTimersByTimeAsync(25 * 60 * 1000 - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(hook.getPagesDeployHookStatus()).toMatchObject({
      last_triggered_at: "2026-11-02T12:30:00.000Z",
      next_trigger_at: null,
    })

    // Nothing else was asked for: no third POST.
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("fires at once again once 30 minutes have passed since the last POST", async () => {
    hook.requestPagesRebuild()
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    expect(hook.requestPagesRebuild()).toBe("triggered")
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("skips when the variable is unset or blank", async () => {
    delete env.CF_PAGES_DEPLOY_HOOK_URL
    expect(hook.requestPagesRebuild()).toBe("skipped")
    env.CF_PAGES_DEPLOY_HOOK_URL = "   "
    expect(hook.requestPagesRebuild()).toBe("skipped")
    await vi.runAllTimersAsync()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(hook.getPagesDeployHookStatus()).toMatchObject({ configured: false, last_triggered_at: null })
  })

  it("logs and reports a failed POST without throwing, and never the URL", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }))
    expect(() => hook.requestPagesRebuild()).not.toThrow()
    await vi.runAllTimersAsync()
    expect(hook.getPagesDeployHookStatus()).toMatchObject({
      last_result: "failed",
      last_error: "Error: deploy hook answered HTTP 500",
    })
    expect(h.error).toHaveBeenCalledWith("pages deploy hook failed", expect.anything())
    expect(notify).toHaveBeenCalledTimes(1)
    expect(allOutput()).not.toContain(SECRET)
  })

  it("strips the URL from a network error that quotes it", async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${URL_}`))
    hook.requestPagesRebuild()
    await vi.runAllTimersAsync()
    expect(hook.getPagesDeployHookStatus().last_error).toBe("TypeError: fetch failed for [deploy hook url]")
    expect(allOutput()).not.toContain(SECRET)
  })

  it("a failed POST still counts toward the 30 minutes", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"))
    hook.requestPagesRebuild()
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(hook.requestPagesRebuild()).toBe("scheduled")
  })
})

describe("redact", () => {
  it("removes the URL and its path", () => {
    expect(hook.redact(`a ${URL_} b`, URL_)).toBe("a [deploy hook url] b")
    expect(hook.redact(`POST /client/v4/pages/webhooks/deploy_hooks/${SECRET}`, URL_)).toBe(
      "POST [deploy hook path]",
    )
  })
})

describe("logPagesDeployHookConfig", () => {
  it("warns once when unset, not when set", () => {
    hook.logPagesDeployHookConfig()
    expect(h.warn).not.toHaveBeenCalled()
    delete env.CF_PAGES_DEPLOY_HOOK_URL
    hook.logPagesDeployHookConfig()
    expect(h.warn).toHaveBeenCalledTimes(1)
    expect(h.warn).toHaveBeenCalledWith(expect.stringContaining("CF_PAGES_DEPLOY_HOOK_URL is not set"))
  })
})
