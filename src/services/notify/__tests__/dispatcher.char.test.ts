/**
 * notify() against the real schema (notification characterization harness):
 * preference resolution, recipients, idempotency, shadow mode, failures.
 * Channel adapters are the real ones, down to the recording transport fakes.
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { recorder } from "../../../test-utils/notif-char/fakes.js"
import { notify } from "../dispatcher.js"
import { getKnex } from "../../../clients/database/knex-db.js"

const PUSH = { title: "T", body: "B", data: { url: "https://sc-market.space/x", type: "test" } }

async function deliveries() {
  const rows = await getKnex()("notification_deliveries")
    .select("event_key", "channel", "user_id", "contractor_id", "status")
    .orderBy(["channel", "user_id"])
  return w.normalize(rows.map((r) => ({ ...r, user_id: w.label(r.user_id), contractor_id: w.label(r.contractor_id) })))
}

describe("preference resolution (legacy tables, today's semantics)", () => {
  it("defaults: in-app and push on, email off", async () => {
    const actor = await w.user("actor")
    const u = await w.user("u")
    await notify("org.invite", [{ userId: u.user_id }], { entityId: u.user_id, actorId: actor.user_id, messages: { push: PUSH } })
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:u contractor_invite (user:u)",
        "push    push:u [test] T",
      ]
    `)
  })

  it("org-scoped events read only the row for that org; personal events only the personal row", async () => {
    const actor = await w.user("actor")
    const a = await w.user("a")
    const b = await w.user("b")
    const acme = await w.org("acme", [
      { user: a, perms: "owner" },
      { user: b, perms: [] },
    ])
    await w.pushPref(a, "market_item_bid", false, acme) // a: off for acme
    await w.pushPref(b, "market_item_bid", false) // b: off personally only
    await w.emailOptIn(b, ["market_item_bid"], acme)
    const r = await notify(
      "market.bid",
      [
        { userId: a.user_id, contractorId: acme.contractor_id },
        { userId: b.user_id, contractorId: acme.contractor_id },
        { userId: b.user_id }, // same user, personal scope: separate recipient
      ],
      { entityId: actor.user_id, actorId: actor.user_id, messages: { push: PUSH } },
    )
    expect(w.normalize(r.planned.map((d) => `${w.label(d.userId)} ${w.label(d.contractorId)} ${d.channel}`))).toMatchInlineSnapshot(`
      [
        "user:a org:acme in_app",
        "user:b org:acme in_app",
        "user:b org:acme push",
        "user:b null in_app",
      ]
    `)
  })

  it("the actor is never a recipient unless notifyActor", async () => {
    const a = await w.user("a")
    const r = await notify("org.invite", [{ userId: a.user_id }], { entityId: a.user_id, actorId: a.user_id, messages: { push: PUSH } })
    expect(r.planned).toEqual([])
  })
})

describe("idempotency", () => {
  it("the same event for the same entity is delivered once; a new dedupe key delivers again", async () => {
    const actor = await w.user("actor")
    const u = await w.user("u")
    const send = (dedupeKey?: string) =>
      notify("org.invite", [{ userId: u.user_id }], { entityId: "11111111-1111-4111-8111-111111111111", dedupeKey, actorId: actor.user_id, messages: { push: PUSH } })
    const first = await send()
    const again = await send()
    const other = await send("second")
    expect({
      first: first.delivered.length,
      again: { delivered: again.delivered.length, duplicate: again.duplicate.length },
      other: other.delivered.length,
      pushes: recorder().push.length,
      deliveries: await deliveries(),
    }).toMatchInlineSnapshot(`
      {
        "again": {
          "delivered": 0,
          "duplicate": 3,
        },
        "deliveries": [
          {
            "channel": "email",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "skipped",
            "user_id": "user:u",
          },
          {
            "channel": "email",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "skipped",
            "user_id": "user:u",
          },
          {
            "channel": "in_app",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "sent",
            "user_id": "user:u",
          },
          {
            "channel": "in_app",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "sent",
            "user_id": "user:u",
          },
          {
            "channel": "push",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "sent",
            "user_id": "user:u",
          },
          {
            "channel": "push",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "sent",
            "user_id": "user:u",
          },
        ],
        "first": 2,
        "other": 2,
        "pushes": 2,
      }
    `)
  })
})

describe("shadow mode", () => {
  it("records what it would send, sends and writes nothing", async () => {
    const actor = await w.user("actor")
    const u = await w.user("u")
    await w.emailOptIn(u, ["contractor_invite"])
    const r = await notify("org.invite", [{ userId: u.user_id }], { entityId: actor.user_id, actorId: actor.user_id, messages: { push: PUSH }, shadow: true })
    const obs = await w.observe()
    expect({ planned: r.planned.map((d) => d.channel), summary: w.summary(obs), deliveries: await deliveries() }).toMatchInlineSnapshot(`
      {
        "deliveries": [
          {
            "channel": "email",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "shadow",
            "user_id": "user:u",
          },
          {
            "channel": "in_app",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "shadow",
            "user_id": "user:u",
          },
          {
            "channel": "push",
            "contractor_id": null,
            "event_key": "org.invite",
            "status": "shadow",
            "user_id": "user:u",
          },
        ],
        "planned": [
          "in_app",
          "push",
          "email",
        ],
        "summary": [],
      }
    `)
  })
})

describe("failures", () => {
  it("a failing Discord DM is recorded as failed and does not stop other channels", async () => {
    const u = await w.user("u")
    recorder().discordFailures.set("/users/@me/channels", { status: 403, code: 50007 })
    const r = await notify("watchlist.price_alert", [{ userId: u.user_id }], {
      entityId: u.user_id,
      actorId: u.user_id,
      notifyActor: true,
      messages: { push: PUSH, discord_dm: { content: "hi" } },
    })
    expect({
      delivered: r.delivered.map((d) => d.channel),
      failed: r.failed.map((d) => d.channel),
      deliveries: await deliveries(),
    }).toMatchInlineSnapshot(`
      {
        "delivered": [
          "in_app",
          "push",
        ],
        "deliveries": [
          {
            "channel": "discord_dm",
            "contractor_id": null,
            "event_key": "watchlist.price_alert",
            "status": "failed",
            "user_id": "user:u",
          },
          {
            "channel": "in_app",
            "contractor_id": null,
            "event_key": "watchlist.price_alert",
            "status": "sent",
            "user_id": "user:u",
          },
          {
            "channel": "push",
            "contractor_id": null,
            "event_key": "watchlist.price_alert",
            "status": "sent",
            "user_id": "user:u",
          },
        ],
        "failed": [
          "discord_dm",
        ],
      }
    `)
  })

  it("unknown event is a programmer error", async () => {
    await expect(notify("nope" as never, [], { entityId: "x", messages: {} })).rejects.toThrow(/Unknown notification event/)
  })
})
