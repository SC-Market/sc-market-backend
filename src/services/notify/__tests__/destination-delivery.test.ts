/**
 * deliverDestinations() and the destination live switch (Phase 5): the
 * legacy sender posts by default with notify()'s plan compared in shadow
 * mode; a live route posts through notify() only. Mocked DB and adapters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  claimed: new Set<string>(),
  log: [] as { level: string; message: string; meta: Record<string, unknown> }[],
}))
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
  finishDelivery: vi.fn(async () => undefined),
}))
vi.mock("../../../clients/database/knex-db.js", () => ({ getKnex: vi.fn(), database: {} }))
vi.mock("../../../logger/logger.js", () => {
  const at = (level: string) => (message: string, meta: Record<string, unknown> = {}) => h.log.push({ level, message, meta })
  return { default: { info: at("info"), warn: at("warn"), error: at("error"), debug: at("debug") } }
})
vi.mock("../../../clients/cdn/cdn.js", () => ({ cdn: { getFileLinkResource: vi.fn() }, external_resource_regex: /^$/ }))

const { deliverDestinations, comparableBody } = await import("../destination-delivery.js")
const { isDestinationLive, liveDestinationRoutes } = await import("../destination-cutover.js")
const { DESTINATION_ROUTES, setDestinationAdaptersForTesting } = await import("../destinations.js")
const { recordLegacyDestination } = await import("../destination-trace.js")

const posted: { channel: string; ref: string; body: unknown }[] = []
const fake = (channel: "webhook" | "discord_channel") => ({
  id: channel,
  send: vi.fn(async (body: unknown, d: { ref: string }) => {
    posted.push({ channel, ref: d.ref, body })
    return { status: "sent" as const }
  }),
})

const hook = (id: string) =>
  ({ channel: "webhook", ref: `webhook:${id}`, webhook: { webhook_id: id, webhook_url: "u", name: id } }) as const
const BODY = { username: "SC Market - Order Placed", embeds: [{ title: "T", timestamp: "2026-11-06T00:00:00.000Z" }] }

function plan(refs: string[], body: unknown = BODY) {
  return {
    channel: "webhook" as const,
    event: "order.created" as const,
    entityId: "order-1",
    dedupeKey: "order-1",
    destinations: refs.map(hook),
    render: () => body,
  }
}
function legacyPosting(refs: string[], body: unknown = BODY) {
  return vi.fn(async () => {
    for (const r of refs) recordLegacyDestination(`webhook:${r}`, body)
    return "legacy-result"
  })
}
const shadowLines = () => h.log.filter((l) => l.message === "notify.destinations.shadow")

beforeEach(() => {
  h.claimed.clear()
  h.log = []
  posted.length = 0
  setDestinationAdaptersForTesting({ webhook: fake("webhook"), discord_channel: fake("discord_channel") })
})
afterEach(() => {
  delete process.env.NOTIFY_DESTINATIONS_LIVE
  delete process.env.NOTIFY_DESTINATIONS_SHADOW
  setDestinationAdaptersForTesting(null)
})

describe("live switch (NOTIFY_DESTINATIONS_LIVE)", () => {
  it("defaults to nothing live", () => {
    expect(liveDestinationRoutes().size).toBe(0)
    process.env.NOTIFY_DESTINATIONS_LIVE = ""
    expect(liveDestinationRoutes().size).toBe(0)
    process.env.NOTIFY_DESTINATIONS_LIVE = "none"
    expect(liveDestinationRoutes().size).toBe(0)
  })

  it("'all' or '*' is every route", () => {
    process.env.NOTIFY_DESTINATIONS_LIVE = "all"
    expect([...liveDestinationRoutes()].sort()).toEqual([...DESTINATION_ROUTES].sort())
    process.env.NOTIFY_DESTINATIONS_LIVE = "*"
    expect(liveDestinationRoutes().size).toBe(DESTINATION_ROUTES.length)
  })

  it("takes routes and channel wildcards; unknown keys are logged and ignored", () => {
    process.env.NOTIFY_DESTINATIONS_LIVE = " discord_channel:* , webhook:order.created,order.created,webhook:bogus"
    expect([...liveDestinationRoutes()].sort()).toEqual([
      "discord_channel:contract.public_created",
      "discord_channel:offer.received",
      "discord_channel:order.created",
      "webhook:order.created",
    ])
    expect(isDestinationLive("webhook:market.bid")).toBe(false)
    expect(h.log.find((l) => l.level === "error")?.meta.ignored).toEqual(["order.created", "webhook:bogus"])
  })

  it("lists the eleven routes", () => {
    expect([...DESTINATION_ROUTES].sort()).toMatchInlineSnapshot(`
      [
        "discord_channel:contract.public_created",
        "discord_channel:offer.received",
        "discord_channel:order.created",
        "webhook:admin.storefront_enquiry",
        "webhook:contract.public_created",
        "webhook:market.bid",
        "webhook:offer.received",
        "webhook:order.assigned",
        "webhook:order.created",
        "webhook:order.review",
        "webhook:order.status_changed",
      ]
    `)
  })
})

describe("shadow mode (default)", () => {
  it("legacy posts; notify() posts nothing; a matching plan logs one info line", async () => {
    const legacy = legacyPosting(["a", "b"])
    const out = await deliverDestinations("webhook:order.created", () => plan(["a", "b"]), legacy)
    expect(out).toEqual({ path: "legacy", result: "legacy-result" })
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(posted).toEqual([])
    expect(h.claimed.size).toBe(0)
    expect(shadowLines()).toEqual([
      {
        level: "info",
        message: "notify.destinations.shadow",
        meta: {
          route: "webhook:order.created",
          entity_id: "order-1",
          match: true,
          legacy: 2,
          planned: 2,
          missing: [],
          extra: [],
          duplicated: [],
          payload_mismatch: [],
        },
      },
    ])
  })

  it("reports destinations only one side has, as a warning", async () => {
    await deliverDestinations("webhook:order.created", () => plan(["a", "c"]), legacyPosting(["a", "b"]))
    const [line] = shadowLines()
    expect(line.level).toBe("warn")
    expect(line.meta).toMatchObject({ match: false, missing: ["webhook:b"], extra: ["webhook:c"] })
  })

  it("reports a different body, ignoring embed timestamps (the send time)", async () => {
    const later = { ...BODY, embeds: [{ ...BODY.embeds[0], timestamp: "2026-11-06T00:00:01.000Z" }] }
    await deliverDestinations("webhook:order.created", () => plan(["a"], later), legacyPosting(["a"]))
    expect(shadowLines()[0].meta.match).toBe(true)

    h.log = []
    const other = { ...BODY, username: "SC Market - Something else" }
    await deliverDestinations("webhook:order.created", () => plan(["a"], other), legacyPosting(["a"]))
    expect(shadowLines()[0].meta).toMatchObject({ match: false, payload_mismatch: ["webhook:a"] })
  })

  it("a legacy double post is a difference (notify() posts each destination once)", async () => {
    await deliverDestinations("webhook:order.created", () => plan(["a"]), legacyPosting(["a", "a"]))
    expect(shadowLines()[0].meta).toMatchObject({ match: false, duplicated: ["webhook:a"] })
  })

  it("compares only the plan's channel", async () => {
    const legacy = vi.fn(async () => {
      recordLegacyDestination("webhook:a", BODY)
      recordLegacyDestination("discord_channel:1", { content: "other route" })
    })
    await deliverDestinations("webhook:order.created", () => plan(["a"]), legacy)
    expect(shadowLines()[0].meta.match).toBe(true)
  })

  it("no line when neither side posts anything", async () => {
    await deliverDestinations("webhook:order.created", () => plan([]), legacyPosting([]))
    expect(shadowLines()).toEqual([])
  })

  it("a planning error never stops the legacy post; a warning only if legacy still posted", async () => {
    const failing = () => {
      throw new Error("db down")
    }
    const legacy = legacyPosting(["a"])
    const out = await deliverDestinations("webhook:order.created", failing, legacy)
    expect(out.path).toBe("legacy")
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(h.log.filter((l) => l.message === "notify.destinations.shadow planning failed")).toEqual([
      {
        level: "warn",
        message: "notify.destinations.shadow planning failed",
        meta: { route: "webhook:order.created", error: "db down", legacy_posted: true },
      },
    ])

    // Legacy failed the same way (shared resolver): not a difference.
    h.log = []
    await deliverDestinations("webhook:order.created", failing, async () => {
      throw new Error("db down")
    }).catch(() => undefined)
    h.log = []
    await deliverDestinations("webhook:order.created", failing, legacyPosting([]))
    expect(h.log.find((l) => l.message === "notify.destinations.shadow planning failed")?.level).toBe("info")
  })

  it("NOTIFY_DESTINATIONS_SHADOW=off: legacy only, no plan", async () => {
    process.env.NOTIFY_DESTINATIONS_SHADOW = "off"
    const build = vi.fn(() => plan(["a"]))
    await deliverDestinations("webhook:order.created", build, legacyPosting(["a"]))
    expect(build).not.toHaveBeenCalled()
    expect(shadowLines()).toEqual([])
  })
})

describe("live route", () => {
  it("notify() posts, legacy is not called, no shadow line", async () => {
    process.env.NOTIFY_DESTINATIONS_LIVE = "webhook:order.created"
    const legacy = legacyPosting(["a"])
    const out = await deliverDestinations("webhook:order.created", () => plan(["a", "b"]), legacy)
    expect(legacy).not.toHaveBeenCalled()
    expect(posted.map((p) => p.ref)).toEqual(["webhook:a", "webhook:b"])
    expect(out).toMatchObject({ path: "live", result: { delivered: ["webhook:a", "webhook:b"] } })
    expect(shadowLines()).toEqual([])
  })

  it("only the listed routes are live", async () => {
    process.env.NOTIFY_DESTINATIONS_LIVE = "webhook:order.created"
    const legacy = legacyPosting(["a"])
    await deliverDestinations("webhook:order.assigned", () => ({ ...plan(["a"]), event: "order.assigned" }), legacy)
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(posted).toEqual([])
  })

  it("a plan error is logged and nothing is posted (never throws)", async () => {
    process.env.NOTIFY_DESTINATIONS_LIVE = "all"
    const out = await deliverDestinations(
      "webhook:order.created",
      () => {
        throw new Error("db down")
      },
      legacyPosting(["a"]),
    )
    expect(out).toEqual({ path: "live", result: null })
    expect(h.log.some((l) => l.level === "error" && l.message === "notify: destination plan failed")).toBe(true)
  })
})

describe("comparableBody", () => {
  it("drops embed timestamps only", () => {
    expect(comparableBody({ timestamp: 1, embeds: [{ a: 1, timestamp: "x" }, null] })).toBe(
      '{"timestamp":1,"embeds":[{"a":1},null]}',
    )
  })
})
