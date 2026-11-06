/**
 * Characterization: webhook and Discord alert-channel posts through notify()
 * (Phase 5, services/notify/destination-delivery.ts).
 *
 * Parity: each scenario runs through its real call site on the default path
 * (legacy posts, notify() in shadow mode), then again with every route live
 * (NOTIFY_DESTINATIONS_LIVE=all), with deliveries cleared in between. The
 * live run must post exactly what legacy posted (same webhooks and channels,
 * same JSON, same order), record one 'sent' delivery per post, and log no
 * shadow line; the legacy run's shadow lines must all match.
 */
import { afterEach, describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { recorder, resetRecorder } from "../../../test-utils/notif-char/fakes.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import { notificationService } from "../notification.service.js"
import { notifyNewOrder } from "../new-order.js"
import { postOfferAlert } from "../../discord/order-alerts.js"
import { notifyPublicContractCreated } from "../../contracts/public-contract-alerts.js"
import * as contractDb from "../../../api/routes/v1/contracts/database.js"

afterEach(() => {
  delete process.env.NOTIFY_DESTINATIONS_LIVE
})

async function clearDeliveries() {
  const db = getKnex()
  await db("notification").delete()
  await db("notification_change").delete()
  await db("notification_object").delete()
  await db("notification_deliveries").delete()
  resetRecorder()
}

type ShadowLine = { route: string; match: boolean; legacy: number }

function shadowLines(): { level: string; line: ShadowLine }[] {
  return recorder()
    .logs.filter((l) => l.message === "notify.destinations.shadow")
    .map((l) => ({ level: l.level, line: l.meta[0] as ShadowLine }))
}

/** Webhook posts and Discord channel posts (not DMs or threads), as the fakes saw them. */
function posts(o: w.Observed) {
  return {
    webhooks: o.webhooks,
    channels: (o.discord as { method: string; route: string }[]).filter(
      (d) => d.method === "post" && /^\/channels\/\d+\/messages$/.test(d.route),
    ),
  }
}

async function bothPaths(trigger: () => Promise<unknown>) {
  await trigger()
  const legacyShadow = shadowLines()
  const legacy = await w.observe({ drainEmail: false })

  await clearDeliveries()
  process.env.NOTIFY_DESTINATIONS_LIVE = "all"
  await trigger()
  const liveShadow = shadowLines()
  const live = await w.observe({ drainEmail: false })
  const rows: { channel: string; status: string; event_key: string; destination_ref: string }[] = await getKnex()(
    "notification_deliveries",
  )
    .whereIn("channel", ["webhook", "discord_channel"])
    .select("channel", "status", "event_key", "destination_ref")
  delete process.env.NOTIFY_DESTINATIONS_LIVE
  return { legacy, live, legacyShadow, liveShadow, rows }
}

function expectParity(r: Awaited<ReturnType<typeof bothPaths>>) {
  const legacy = posts(r.legacy)
  const live = posts(r.live)
  const count = legacy.webhooks.length + legacy.channels.length
  expect(count).toBeGreaterThan(0)

  // Legacy run: every shadow comparison matched, covering every post.
  expect(r.legacyShadow.every((s) => s.level === "info" && s.line.match)).toBe(true)
  expect(r.legacyShadow.reduce((n, s) => n + s.line.legacy, 0)).toBe(count)

  // Live run: the same posts, once each, through notify() alone.
  expect(live).toEqual(legacy)
  expect(r.liveShadow).toEqual([])
  expect(r.live.errors).toEqual(r.legacy.errors)
  expect(r.rows.length).toBe(count)
  expect(r.rows.every((d) => d.status === "sent")).toBe(true)
}

async function orgShop() {
  const customer = await w.user("customer")
  const boss = await w.user("boss")
  const clerk = await w.user("clerk")
  const acme = await w.org("acme", [
    { user: boss, perms: "owner" },
    { user: clerk, perms: ["manage_orders"] },
  ])
  const shop = await w.shop("acme-shop", { org: acme })
  return { customer, boss, clerk, acme, shop }
}

describe("parity: destination posts through notify(), as legacy posted them", () => {
  it("new unassigned org order: shop 'Order Placed' webhook and the alert posts (shop and org channels)", async () => {
    const { customer, acme, shop } = await orgShop()
    await w.webhook("shop-hook", shop, ["order_create"])
    await w.discordSetup({ owner: shop, channel: "900000000000000501", alerts: true })
    await w.discordSetup({ owner: { org: acme }, channel: "900000000000000502", alerts: true })
    const order = await w.order("o1", { customer, org: acme, shop })

    const r = await bothPaths(() => notifyNewOrder(order))
    expect(w.summary(r.live).filter((l) => /^(webhook|discord)/.test(l))).toMatchInlineSnapshot(`
      [
        "discord POST /channels/900000000000000501/messages",
        "discord POST /channels/900000000000000502/messages",
        "webhook shop-hook SC Market - Order Placed",
      ]
    `)
    expectParity(r)
    expect(r.rows.map((d) => `${d.channel} ${d.event_key}`).sort()).toEqual([
      "discord_channel order.created",
      "discord_channel order.created",
      "webhook order.created",
    ])
  })

  it("new personal order with an assignee: 'Order Assigned' (shop and seller) and 'Order Placed' webhooks", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    await w.webhook("seller-hook", { user: seller }, ["order_assigned"])
    await w.webhook("seller-shop-hook", shop, ["order_create", "order_assigned"])
    await w.discordSetup({ owner: shop, channel: "900000000000000503", alerts: true })
    const order = await w.order("o2", { customer, assigned: seller, shop })

    const r = await bothPaths(() => notifyNewOrder(order))
    expect(w.summary(r.live).filter((l) => /^(webhook|discord)/.test(l))).toMatchInlineSnapshot(`
      [
        "webhook seller-shop-hook SC Market - Order Assigned",
        "webhook seller-hook SC Market - Order Assigned",
        "webhook seller-shop-hook SC Market - Order Placed",
      ]
    `)
    expectParity(r)
  })

  it("status change: the shop's and the customer's 'Order Status Updated' webhooks", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    await w.webhook("shop-hook", shop, ["order_status_in_progress"])
    await w.webhook("customer-hook", { user: customer }, ["order_status_in_progress"])
    const order = await w.order("o3", { customer, assigned: seller, shop })

    const r = await bothPaths(() => notificationService.createOrderStatusNotification(order, "in-progress", seller.user_id))
    expect(w.summary(r.live).filter((l) => /^webhook/.test(l))).toMatchInlineSnapshot(`
      [
        "webhook shop-hook SC Market - Order Status Updated",
        "webhook customer-hook SC Market - Order Status Updated",
      ]
    `)
    expectParity(r)
  })

  it("new offer: the shop's 'Offer Received' webhook and the alert post with the Claim button", async () => {
    const { customer, acme, shop } = await orgShop()
    await w.webhook("shop-hook", shop, ["order_create"])
    await w.discordSetup({ owner: shop, channel: "900000000000000504", alerts: true })
    const session = await w.offerSession("s1", { customer, org: acme, shop })

    const r = await bothPaths(async () => {
      await notificationService.createOfferNotification(session, "create")
      await postOfferAlert(session)
    })
    expect(w.summary(r.live).filter((l) => /^(webhook|discord)/.test(l))).toMatchInlineSnapshot(`
      [
        "discord POST /channels/900000000000000504/messages",
        "webhook shop-hook SC Market - Offer Received",
      ]
    `)
    expectParity(r)
  })

  it("review: the shop's 'Order Review' webhook", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    await w.webhook("shop-hook", shop, ["order_review"])
    const order = await w.order("rev", { customer, assigned: seller, shop, status: "fulfilled" })
    const [review] = await getKnex()("order_reviews")
      .insert({ order_id: order.order_id, user_author: customer.user_id, rating: 4, content: "Great", role: "customer" })
      .returning("*")
    w.nameId(review.review_id, "review:rev")

    const r = await bothPaths(() => notificationService.createOrderReviewNotification(review))
    expectParity(r)
  })

  it("public contract: the site-wide webhook feed and the Discord contract feed", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    const shop = await w.shop("acme-shop", { org: acme })
    await w.webhook("contract-feed", shop, ["public_contract_create"])
    // A setup needs a kind (check constraint): alerts on too, as the contracts char test does.
    await w.discordSetup({ owner: { org: acme }, channel: "900000000000000505", alerts: true })
    await getKnex()("discord_channel_setups").where({ channel_id: "900000000000000505" }).update({ contracts: true })
    const [contract] = await contractDb.insertPublicContract({
      title: "Escort a Hull C to Pyro",
      description: "Two fighters needed",
      kind: "Escort",
      cost: "150000",
      payment_type: "one-time",
      collateral: "0",
      customer_id: customer.user_id,
    } as never)
    w.nameId(contract.id, "contract:c1")

    const r = await bothPaths(() => notifyPublicContractCreated(contract))
    expect(w.summary(r.live).filter((l) => /^(webhook|discord)/.test(l))).toMatchInlineSnapshot(`
      [
        "discord POST /channels/900000000000000505/messages",
        "webhook contract-feed SC Market - New Public Contract",
      ]
    `)
    expectParity(r)
  })

  it("live: a failing webhook is recorded (permanent, state 'failing') and the others still get the post", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    const gone = await w.webhook("gone-hook", shop, ["order_status_fulfilled"])
    await w.webhook("customer-hook", { user: customer }, ["order_status_fulfilled"])
    const order = await w.order("o4", { customer, assigned: seller, shop })
    recorder().fetchStatus.set(gone.webhook_url, 404)

    process.env.NOTIFY_DESTINATIONS_LIVE = "webhook:order.status_changed"
    await notificationService.createOrderStatusNotification(order, "fulfilled", seller.user_id)

    expect(w.summary(await w.observe({ drainEmail: false })).filter((l) => /^webhook/.test(l))).toEqual([
      "webhook gone-hook SC Market - Order Status Updated",
      "webhook customer-hook SC Market - Order Status Updated",
    ])
    const rows = await getKnex()("notification_deliveries").where({ channel: "webhook" }).orderBy("status").select("status", "last_error")
    expect(rows.map((d: { status: string }) => d.status)).toEqual(["failed", "sent"])
    expect(rows[0].last_error).toMatch(/^permanent: Webhook request failed with status 404/)
    const states = await getKnex()("notification_webhooks")
      .whereIn("name", ["customer-hook", "gone-hook"])
      .orderBy("name")
      .select("name", "state")
    expect(states).toEqual([
      { name: "customer-hook", state: "ok" },
      { name: "gone-hook", state: "failing" },
    ])
  })
})
