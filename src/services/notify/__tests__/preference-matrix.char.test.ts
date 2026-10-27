/**
 * The Settings -> Notifications matrix over the legacy preference tables:
 * what it shows for existing settings and what it writes.
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { getMatrix, setPreferences } from "../preference-matrix.js"
import { notify } from "../dispatcher.js"
import { getKnex } from "../../../clients/database/knex-db.js"

function view(matrix: Awaited<ReturnType<typeof getMatrix>>) {
  return matrix.map((c) => `${c.category}: ${c.cells.map((x) => `${x.channel}=${x.state}${x.locked ? "(locked)" : ""}`).join(" ")}`)
}

describe("matrix", () => {
  it("a new user sees today's defaults", async () => {
    const u = await w.user("u")
    expect(view(await getMatrix(u.user_id, null))).toMatchInlineSnapshot(`
      [
        "orders: in_app=on(locked) push=on email=off discord_dm=off(locked)",
        "order_messages: in_app=on(locked) push=on email=off discord_dm=off(locked)",
        "offers: in_app=on(locked) push=on email=off discord_dm=off",
        "offer_messages: in_app=on(locked) push=on email=off discord_dm=off(locked)",
        "market: in_app=on(locked) push=on discord_dm=off",
        "reviews: in_app=on(locked) push=on email=off discord_dm=off",
        "watchlist: in_app=on push=on email=off discord_dm=on",
        "org: in_app=on(locked) push=on discord_dm=off",
        "org_members: in_app=on(locked) push=off discord_dm=off",
        "announcements: in_app=on(locked) push=on(locked)",
        "reminders: email=off",
        "contracts: in_app=on(locked) push=on discord_dm=off email=off",
      ]
    `)
  })

  it("existing per-action settings show as mixed categories and exact events", async () => {
    const u = await w.user("u")
    await w.pushPref(u, "order_assigned", false)
    await w.emailOptIn(u, ["order_create"])
    const orders = (await getMatrix(u.user_id, null)).find((c) => c.category === "orders")!
    expect({
      cells: orders.cells,
      assigned: orders.events.find((e) => e.event === "order.assigned")!.cells,
    }).toMatchInlineSnapshot(`
      {
        "assigned": [
          {
            "channel": "in_app",
            "default": true,
            "enabled": true,
            "locked": true,
            "reason": "always_on",
          },
          {
            "channel": "push",
            "default": true,
            "enabled": false,
            "locked": false,
          },
          {
            "channel": "email",
            "default": false,
            "enabled": false,
            "locked": false,
          },
          {
            "channel": "discord_dm",
            "default": false,
            "enabled": false,
            "locked": true,
            "reason": "coming_soon",
          },
        ],
        "cells": [
          {
            "channel": "in_app",
            "locked": true,
            "state": "on",
          },
          {
            "channel": "push",
            "locked": false,
            "state": "mixed",
          },
          {
            "channel": "email",
            "locked": false,
            "state": "mixed",
          },
          {
            "channel": "discord_dm",
            "locked": true,
            "state": "off",
          },
        ],
      }
    `)
  })

  it("org scope lists only org-scoped categories and keeps org rows separate", async () => {
    const u = await w.user("u")
    const acme = await w.org("acme", [{ user: u, perms: "owner" }])
    await setPreferences(u.user_id, acme.contractor_id, [{ category: "orders", channel: "push", enabled: false }])
    const org = await getMatrix(u.user_id, acme.contractor_id)
    const personal = await getMatrix(u.user_id, null)
    expect({ org: view(org), personalOrders: view(personal).find((l) => l.startsWith("orders")) }).toMatchInlineSnapshot(`
      {
        "org": [
          "orders: in_app=on(locked) push=off email=off discord_dm=off(locked)",
          "order_messages: in_app=on(locked) push=on email=off discord_dm=off(locked)",
          "offers: in_app=on(locked) push=on email=off discord_dm=off",
          "offer_messages: in_app=on(locked) push=on email=off discord_dm=off(locked)",
          "market: in_app=on(locked) push=on discord_dm=off",
          "reviews: in_app=on(locked) push=on email=off discord_dm=off",
          "org_members: in_app=on(locked) push=off discord_dm=off",
          "contracts: in_app=on(locked) push=on discord_dm=off email=off",
        ],
        "personalOrders": "orders: in_app=on(locked) push=on email=off discord_dm=off(locked)",
      }
    `)
  })
})

describe("writes go to the legacy tables and notify() honours them", () => {
  it("category write, then a per-event override; no duplicate personal rows", async () => {
    const actor = await w.user("actor")
    const u = await w.user("u")
    await setPreferences(u.user_id, null, [{ category: "reviews", channel: "push", enabled: false }])
    await setPreferences(u.user_id, null, [{ category: "reviews", channel: "push", enabled: false }])
    await setPreferences(u.user_id, null, [{ event: "order.review", channel: "email", enabled: true }])
    const rows = await getKnex()("push_notification_preferences").where({ user_id: u.user_id }).count("* as n")
    const r = await notify("order.review", [{ userId: u.user_id }], {
      entityId: actor.user_id,
      actorId: actor.user_id,
      messages: {},
      shadow: true,
    })
    expect({ pushRows: Number(rows[0].n), planned: r.planned.map((d) => d.channel) }).toMatchInlineSnapshot(`
      {
        "planned": [
          "in_app",
          "email",
        ],
        "pushRows": 2,
      }
    `)
  })

  it("price alert in-app and Discord toggles", async () => {
    const u = await w.user("u")
    await setPreferences(u.user_id, null, [
      { event: "watchlist.price_alert", channel: "in_app", enabled: false },
      { event: "watchlist.price_alert", channel: "discord_dm", enabled: false },
    ])
    const wl = (await getMatrix(u.user_id, null)).find((c) => c.category === "watchlist")!
    expect(wl.cells).toMatchInlineSnapshot(`
      [
        {
          "channel": "in_app",
          "locked": false,
          "state": "off",
        },
        {
          "channel": "push",
          "locked": false,
          "state": "on",
        },
        {
          "channel": "email",
          "locked": false,
          "state": "off",
        },
        {
          "channel": "discord_dm",
          "locked": false,
          "state": "off",
        },
      ]
    `)
  })

  it("rejects locked or unknown cells", async () => {
    const u = await w.user("u")
    await expect(setPreferences(u.user_id, null, [{ event: "order.created", channel: "in_app", enabled: false }])).rejects.toThrow()
    await expect(setPreferences(u.user_id, null, [{ event: "nope" as never, channel: "push", enabled: false }])).rejects.toThrow()
  })
})
