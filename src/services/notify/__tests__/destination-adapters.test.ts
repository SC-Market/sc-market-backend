/**
 * Destination adapters and notifyDestinations() (Phase 5): failure
 * classification (retryable vs permanent), the webhook failure state,
 * idempotency, and that one failure never stops the other destinations.
 * Mocked transports and DB.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  testAccount: false,
  webhookResponses: [] as (number | Error)[],
  webhookCalls: [] as string[],
  discordErrors: new Map<string, { status?: number; code?: number }>(),
  discordCalls: [] as string[],
  stateUpdates: [] as { where: unknown; state: string }[],
  claimed: new Set<string>(),
  finished: [] as { key: string; status: string; error?: string }[],
  warn: [] as unknown[],
  error: [] as unknown[],
}))

vi.mock("../../test-accounts/isolation.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actingAsTestAccount: () => h.testAccount,
}))
vi.mock("../../../api/util/webhook-ip-guard.js", () => ({
  fetchPublicDestination: async (url: string) => {
    h.webhookCalls.push(url)
    const next = h.webhookResponses.shift() ?? 204
    if (next instanceof Error) throw next
    return { response: new Response(next === 204 || next === 302 ? null : "body", { status: next }), release: async () => undefined }
  },
}))
vi.mock("@discordjs/rest", () => {
  class REST {
    setToken() {
      return this
    }
    async post(route: string) {
      h.discordCalls.push(route)
      const err = h.discordErrors.get(route)
      if (err) throw Object.assign(new Error(`DiscordAPIError[${err.code ?? "?"}]`), err)
      return { id: "m" }
    }
  }
  return { REST }
})
vi.mock("../../../clients/database/knex-db.js", () => {
  const knex = (table: string) => {
    const where: Record<string, unknown> = {}
    const q = {
      where: (c: Record<string, unknown>) => (Object.assign(where, c), q),
      whereNot: () => q,
      update: async (v: { state: string }) => {
        if (table === "notification_webhooks") h.stateUpdates.push({ where: { ...where }, state: v.state })
        return 1
      },
    }
    return q
  }
  return { getKnex: () => knex, database: {} }
})
vi.mock("../deliveries.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  claimDeliveries: vi.fn(async (claims: { idempotencyKey: string }[]) => {
    const won = new Set<string>()
    for (const c of claims) {
      if (h.claimed.has(c.idempotencyKey)) continue
      h.claimed.add(c.idempotencyKey)
      won.add(c.idempotencyKey)
    }
    return won
  }),
  finishDelivery: vi.fn(async (key: string, status: string, error?: string) => {
    h.finished.push({ key, status, ...(error ? { error } : {}) })
  }),
}))
vi.mock("../../../logger/logger.js", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn((...a: unknown[]) => h.warn.push(a)),
    error: vi.fn((...a: unknown[]) => h.error.push(a)),
  },
}))
vi.mock("../../../clients/cdn/cdn.js", () => ({ cdn: { getFileLinkResource: vi.fn() }, external_resource_regex: /^$/ }))

const { webhookAdapter } = await import("../adapters/webhook.js")
const { discordChannelAdapter, isPermanentChannelFailure } = await import("../adapters/discord-channel.js")
const { notifyDestinations } = await import("../destinations.js")
type Destination = Parameters<typeof webhookAdapter.send>[1]

const hook = (id: string, url = `https://discord.com/api/webhooks/${id}/tok`): Destination => ({
  channel: "webhook",
  ref: `webhook:${id}`,
  webhook: { webhook_id: id, webhook_url: url, name: id },
})
const channel = (id: string): Destination => ({ channel: "discord_channel", ref: `discord_channel:${id}`, channelId: id })
const staff: Destination = { channel: "webhook", ref: "webhook:staff", staff: true }
const ctx = { eventKey: "order.created", idempotencyKey: "k" }

beforeEach(() => {
  h.testAccount = false
  h.webhookResponses = []
  h.webhookCalls = []
  h.discordErrors.clear()
  h.discordCalls = []
  h.stateUpdates = []
  h.claimed.clear()
  h.finished = []
  h.warn = []
  h.error = []
  delete process.env.STAFF_DISCORD_WEBHOOK_URL
  vi.unstubAllGlobals()
})

describe("webhook adapter (notification_webhooks)", () => {
  it.each([
    [204, "sent"],
    [200, "sent"],
    [400, "permanent"],
    [401, "permanent"],
    [403, "permanent"],
    [404, "permanent"],
    [302, "permanent"],
    [408, "retryable"],
    [429, "retryable"],
    [500, "retryable"],
    [502, "retryable"],
  ] as const)("HTTP %i is %s", async (status, expected) => {
    h.webhookResponses = [status]
    const r = await webhookAdapter.send({ content: "x" }, hook("w1"), ctx)
    expect(r.status).toBe(expected)
    if (expected === "permanent") {
      expect(h.stateUpdates).toEqual([{ where: { webhook_id: "w1" }, state: "failing" }])
    } else if (expected === "sent") {
      expect(h.stateUpdates).toEqual([{ where: { webhook_id: "w1" }, state: "ok" }])
    } else {
      expect(h.stateUpdates).toEqual([])
    }
  })

  it("keeps the legacy error text (status and capped body)", async () => {
    h.webhookResponses = [404]
    expect(await webhookAdapter.send({}, hook("w1"), ctx)).toEqual({
      status: "permanent",
      error: "Webhook request failed with status 404: body",
    })
  })

  it("a network error is retryable", async () => {
    h.webhookResponses = [new Error("ECONNRESET")]
    expect(await webhookAdapter.send({}, hook("w1"), ctx)).toEqual({ status: "retryable", error: "ECONNRESET" })
  })

  it("a URL outside the allowlist is permanent and never fetched", async () => {
    const r = await webhookAdapter.send({}, hook("w1", "https://evil.example/api/webhooks/1/x"), ctx)
    expect(r.status).toBe("permanent")
    expect(h.webhookCalls).toEqual([])
    expect(h.stateUpdates[0]?.state).toBe("failing")
  })

  it("a test account's action sends nothing (skipped)", async () => {
    h.testAccount = true
    expect((await webhookAdapter.send({}, hook("w1"), ctx)).status).toBe("skipped")
    expect(h.webhookCalls).toEqual([])
  })
})

describe("webhook adapter (staff webhook)", () => {
  it("skips when STAFF_DISCORD_WEBHOOK_URL is unset", async () => {
    expect(await webhookAdapter.send({}, staff, ctx)).toEqual({
      status: "skipped",
      reason: "STAFF_DISCORD_WEBHOOK_URL is not set",
    })
  })

  it.each([
    [204, "sent"],
    [404, "permanent"],
    [429, "retryable"],
    [503, "retryable"],
  ] as const)("HTTP %i is %s, posted without following redirects", async (status, expected) => {
    process.env.STAFF_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/staff/secret"
    const fetchMock = vi.fn(async () => new Response(null, { status }))
    vi.stubGlobal("fetch", fetchMock)
    expect((await webhookAdapter.send({ a: 1 }, staff, ctx)).status).toBe(expected)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/staff/secret",
      expect.objectContaining({ method: "POST", redirect: "error", body: '{"a":1}' }),
    )
  })

  it("never reports the URL in an error", async () => {
    process.env.STAFF_DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/staff/secret"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect failed: https://discord.com/api/webhooks/staff/secret")
      }),
    )
    const r = await webhookAdapter.send({}, staff, ctx)
    expect(r).toEqual({ status: "retryable", error: "connect failed: [webhook url]" })
  })
})

describe("Discord channel adapter", () => {
  it("posts to the channel", async () => {
    expect((await discordChannelAdapter.send({ content: "x" }, channel("123"), ctx)).status).toBe("sent")
    expect(h.discordCalls).toEqual(["/channels/123/messages"])
  })

  it.each([
    [{ code: 10003, status: 404 }, "permanent"],
    [{ code: 50001, status: 403 }, "permanent"],
    [{ code: 50013, status: 403 }, "permanent"],
    [{ code: 50035, status: 400 }, "permanent"],
    [{ status: 429 }, "retryable"],
    [{ status: 500 }, "retryable"],
    [{}, "retryable"],
  ] as const)("Discord error %o is %s", async (err, expected) => {
    h.discordErrors.set("/channels/123/messages", err)
    expect((await discordChannelAdapter.send({}, channel("123"), ctx)).status).toBe(expected)
  })

  it("DM refusal codes are not channel failures by themselves", () => {
    expect(isPermanentChannelFailure(50007)).toBe(false)
    expect(isPermanentChannelFailure(50278)).toBe(false)
  })

  it("a test account's action posts nothing (skipped)", async () => {
    h.testAccount = true
    expect((await discordChannelAdapter.send({}, channel("123"), ctx)).status).toBe("skipped")
    expect(h.discordCalls).toEqual([])
  })
})

describe("notifyDestinations()", () => {
  const plan = (destinations: Destination[], render: () => unknown = () => ({ content: "hi" })) => ({
    channel: "webhook" as const,
    event: "order.created" as const,
    entityId: "order-1",
    dedupeKey: "order-1",
    destinations,
    render,
  })

  it("posts each destination once, in order, and records each outcome", async () => {
    h.webhookResponses = [204, 404, 204]
    const r = await notifyDestinations(plan([hook("a"), hook("b"), hook("a"), hook("c")]))
    expect(r.planned).toEqual(["webhook:a", "webhook:b", "webhook:c"])
    expect(r.delivered).toEqual(["webhook:a", "webhook:c"])
    expect(r.failed).toEqual([
      { ref: "webhook:b", permanent: true, error: "Webhook request failed with status 404: body" },
    ])
    expect(h.webhookCalls.map((u) => u.split("/")[5])).toEqual(["a", "b", "c"])
    expect(h.finished.map((f) => f.status)).toEqual(["sent", "failed", "sent"])
    expect(h.finished[1].error).toBe("permanent: Webhook request failed with status 404: body")
    expect(h.warn).toHaveLength(1)
  })

  it("the same occurrence is posted once (idempotency)", async () => {
    await notifyDestinations(plan([hook("a")]))
    const again = await notifyDestinations(plan([hook("a")]))
    expect(again.duplicate).toEqual(["webhook:a"])
    expect(h.webhookCalls).toHaveLength(1)
  })

  it("renders once, and only when there is somewhere to post", async () => {
    const render = vi.fn(() => ({}))
    await notifyDestinations(plan([], render))
    expect(render).not.toHaveBeenCalled()
    await notifyDestinations(plan([hook("a"), hook("b")], render))
    expect(render).toHaveBeenCalledTimes(1)
  })

  it("a render failure fails every destination without posting, and never throws", async () => {
    const r = await notifyDestinations(
      plan([hook("a"), hook("b")], () => {
        throw new Error("profile gone")
      }),
    )
    expect(r.failed.map((f) => f.ref)).toEqual(["webhook:a", "webhook:b"])
    expect(h.webhookCalls).toEqual([])
    expect(h.finished.map((f) => f.status)).toEqual(["failed", "failed"])
  })

  it("an unknown route is a logged error, not a throw", async () => {
    const r = await notifyDestinations({ ...plan([hook("a")]), event: "bogus" as never })
    expect(r.planned).toEqual([])
    expect(h.error).toHaveLength(1)
  })
})
