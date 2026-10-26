/**
 * Watchlist price alerts end to end over HTTP: the production v2 router
 * (apiV2Router) on a loopback-only test server, against this suite's throwaway
 * Postgres, with the recording transport fakes.
 *
 * A watch added through POST /watchlist must alert once a listing below the
 * target becomes publicly listed (created inactive then activated, or private
 * then made public, repricing on the way), and not again within the cooldown.
 */

import { afterEach, describe, expect, it } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import express from "express"
import request from "supertest"
import * as w from "../../../test-utils/notif-char/world.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import { apiV2Router } from "../../../api/routes/v2/api-router.js"
import { errorHandler } from "../../../api/middleware/error-handler.js"

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))))
})

/**
 * The app as mounted in production, with req.user set like populateUser does,
 * listening on 127.0.0.1 only (supertest's own listen binds every interface).
 */
async function app(userId: () => string): Promise<string> {
  const a = express()
  a.use(express.json())
  a.use(async (req, _res, next) => {
    req.user = await getKnex()("accounts").where({ user_id: userId() }).first()
    next()
  })
  a.use("/api/v2", apiV2Router)
  a.use(errorHandler)
  const server = createServer(a)
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** checkWatchlistMatches runs after the response (fire and forget). */
async function settle(ms = 1500) {
  await new Promise((r) => setTimeout(r, ms))
}

/** Assert a 200, showing the body when it isn't one. */
function ok(res: { status: number; body: unknown }) {
  expect({ status: res.status, body: res.status === 200 ? null : res.body }).toEqual({
    status: 200,
    body: null,
  })
}

/** Creating listings needs a verified (RSI-confirmed) account. */
async function verify(...users: { user_id: string }[]) {
  await getKnex()("accounts")
    .whereIn("user_id", users.map((u) => u.user_id))
    .update({ rsi_confirmed: true })
}

async function watchRow(id: string) {
  return getKnex()("watchlist_items").where({ id }).first()
}

describe("watchlist over HTTP", () => {
  it("alerts once a listing below the target is listed; cooldown holds after a reprice", async () => {
    const watcher = await w.user("watcher")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    await verify(seller)
    const item = await w.gameItem("Parasite Helmet")
    let as = watcher.user_id
    const http = await app(() => as)

    // Watch through the API, as the site's Watch price dialog does.
    const add = await request(http)
      .post("/api/v2/watchlist")
      .send({ game_item_id: item.id, max_price: 475000 })
    ok(add)
    const watchId = add.body.id as string
    expect(add.body).toMatchObject({ max_price: 475000, last_notified_at: null })

    // Seller creates the listing inactive, below the target: nothing yet.
    as = seller.user_id
    const created = await request(http)
      .post("/api/v2/listings")
      .send({
        title: "Parasite Replica Helmet",
        description: "Test helmet",
        game_item_id: item.id,
        pricing_mode: "unified",
        base_price: 460000,
        lots: [{ quantity: 2, variant_attributes: {} }],
        shop_id: shop.shop_id,
        status: "inactive",
      })
    ok(created)
    const listingId = created.body.listing_id as string
    await settle()
    expect(w.summary(await w.observe())).toEqual([])

    // Reprice while inactive: still nothing.
    ok(await request(http).put(`/api/v2/listings/${listingId}`).send({ base_price: 440000 }))
    await settle()
    expect(w.summary(await w.observe())).toEqual([])
    expect((await watchRow(watchId)).last_notified_at).toBeNull()

    // Activate: one alert on the default channels (site, push, Discord DM; email is opt-in).
    ok(await request(http).put(`/api/v2/listings/${listingId}`).send({ status: "active" }))
    await settle()
    expect(w.summary(await w.observe())).toEqual([
      `in_app  user:watcher price_alert (${w.label(listingId)})`,
      "push    push:watcher [price_alert] Price Alert: Parasite Replica Helmet",
      "discord POST /users/@me/channels",
      "discord POST /channels/dm-discord:watcher/messages",
    ])
    const stamped = (await watchRow(watchId)).last_notified_at
    expect(stamped).not.toBeNull()

    // A further price drop within the hour: suppressed by the cooldown.
    ok(await request(http).put(`/api/v2/listings/${listingId}`).send({ base_price: 430000 }))
    await settle()
    const after = await w.observe()
    expect((after.in_app as unknown[]).length).toBe(1)
    expect((after.push as unknown[]).length).toBe(1)
    expect(new Date((await watchRow(watchId)).last_notified_at).getTime()).toBe(
      new Date(stamped).getTime(),
    )

    // The watcher's list shows the alert time and the new lowest price.
    as = watcher.user_id
    const list = await request(http).get("/api/v2/watchlist")
    expect(list.status).toBe(200)
    expect(list.body.items).toEqual([
      expect.objectContaining({
        id: watchId,
        max_price: 475000,
        current_lowest: 430000,
        last_notified_at: new Date(stamped).toISOString(),
      }),
    ])
  })

  it("a private org listing alerts when it is made public", async () => {
    const watcher = await w.user("watcher")
    const manager = await w.user("manager")
    const org = await w.org("acme", [{ user: manager, perms: ["manage_market", "manage_stock"] }])
    const shop = await w.shop("acme-shop", { org })
    await verify(manager)
    const item = await w.gameItem("Parasite Helmet")
    let as = watcher.user_id
    const http = await app(() => as)

    const add = await request(http)
      .post("/api/v2/watchlist")
      .send({ game_item_id: item.id, max_price: 475000 })
    ok(add)

    as = manager.user_id
    const created = await request(http)
      .post("/api/v2/listings")
      .send({
        title: "Parasite Replica Helmet (org)",
        description: "Test helmet",
        game_item_id: item.id,
        pricing_mode: "unified",
        base_price: 470000,
        lots: [{ quantity: 1, variant_attributes: {} }],
        shop_id: shop.shop_id,
        visibility: "private",
      })
    ok(created)
    const listingId = created.body.listing_id as string
    ok(await request(http).put(`/api/v2/listings/${listingId}`).send({ base_price: 465000 }))
    await settle()
    expect(w.summary(await w.observe())).toEqual([])

    ok(await request(http).put(`/api/v2/listings/${listingId}`).send({ visibility: "public" }))
    await settle()
    expect(w.summary(await w.observe())).toEqual([
      `in_app  user:watcher price_alert (${w.label(listingId)})`,
      "push    push:watcher [price_alert] Price Alert: Parasite Replica Helmet (org)",
      "discord POST /users/@me/channels",
      "discord POST /channels/dm-discord:watcher/messages",
    ])
  })
})
