/**
 * Characterization: the notify() cutover for orders, offers and chat messages
 * (services/notify/cutover.ts).
 *
 * Parity: each scenario runs on the legacy path (NOTIFY_LIVE_EVENTS=none,
 * notify() in shadow mode), then again on the live path (the default list)
 * with the deliveries cleared in between. The live run must send exactly
 * what legacy sent (same recipients, channels and payloads, each once),
 * without calling the legacy sender and without a shadow line.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { resetRecorder } from "../../../test-utils/notif-char/fakes.js"
import { notificationService } from "../notification.service.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import { CUTOVER_EVENTS, LIVE_EVENTS_DEFAULT, isLive, liveEvents } from "../../notify/cutover.js"

type Legacy =
  | "createOrderContractorNotification"
  | "legacyOrderAssignedNotification"
  | "legacyOrderStatusNotification"
  | "legacyOrderMessageNotification"
  | "legacyOfferNotification"
  | "legacyOfferMessageNotification"
  | "legacyNewOrderNotificationV2"

const LEGACY: Legacy[] = [
  "createOrderContractorNotification",
  "legacyOrderAssignedNotification",
  "legacyOrderStatusNotification",
  "legacyOrderMessageNotification",
  "legacyOfferNotification",
  "legacyOfferMessageNotification",
  "legacyNewOrderNotificationV2",
]

function spyLegacy() {
  return Object.fromEntries(
    LEGACY.map((m) => [m, vi.spyOn(notificationService as unknown as Record<Legacy, () => Promise<void>>, m)]),
  ) as Record<Legacy, ReturnType<typeof vi.spyOn>>
}

afterEach(() => {
  delete process.env.NOTIFY_LIVE_EVENTS
  vi.restoreAllMocks()
})

/** Forget every notification and delivery, and what the fakes saw (keeps users, orgs, orders, prefs). */
async function clearDeliveries() {
  const db = getKnex()
  await db("notification").delete()
  await db("notification_change").delete()
  await db("notification_object").delete()
  await db("notification_deliveries").delete()
  resetRecorder()
}

const DELIVERY = /^(in_app|push|email) /

/** Run the trigger on the legacy path, then on the live path. */
async function bothPaths(trigger: () => Promise<unknown>) {
  process.env.NOTIFY_LIVE_EVENTS = "none"
  let spies = spyLegacy()
  await trigger()
  const legacy = await w.observe()
  const legacyCalls = LEGACY.filter((m) => spies[m].mock.calls.length > 0)
  vi.restoreAllMocks()

  await clearDeliveries()
  delete process.env.NOTIFY_LIVE_EVENTS
  spies = spyLegacy()
  await trigger()
  const live = await w.observe()
  const liveCalls = LEGACY.filter((m) => spies[m].mock.calls.length > 0)
  const rows: { user_id: string; channel: string; status: string; event_key: string }[] = await getKnex()(
    "notification_deliveries",
  ).select("user_id", "channel", "status", "event_key")
  return { legacy, live, legacyCalls, liveCalls, rows }
}

function deliveries(o: w.Observed) {
  return w.summary(o).filter((l) => DELIVERY.test(l)).sort()
}

/** Everything except the shadow lines (deliveries, webhooks, Discord threads, websocket). */
function sideEffects(o: w.Observed) {
  return w.summary(o).filter((l) => !l.startsWith("shadow")).sort()
}

/** The live run sent exactly legacy's deliveries, once each, through notify() alone. */
function expectParity(r: Awaited<ReturnType<typeof bothPaths>>, event: string) {
  // The scenario is a parity case: legacy's shadow line matched exactly.
  expect(w.summary(r.legacy).filter((l) => l.startsWith("shadow"))).toEqual(
    expect.arrayContaining([`shadow  ${event} ok`]),
  )
  expect(w.summary(r.legacy).filter((l) => l.startsWith("shadow") && l !== `shadow  ${event} ok`)).toEqual([])
  expect(r.legacyCalls.length).toBeGreaterThan(0)

  expect(r.liveCalls).toEqual([])
  expect(r.live.shadow).toEqual([])
  expect(r.live.errors).toEqual([])
  expect(sideEffects(r.live)).toEqual(sideEffects(r.legacy))
  expect(r.live.in_app).toEqual(r.legacy.in_app)
  expect(r.live.push).toEqual(r.legacy.push)
  expect(r.live.email).toEqual(r.legacy.email)
  // Exactly once: one delivery row, sent, per line the fakes saw (and the
  // fakes saw what legacy sent, with the same multiplicity).
  expect(r.rows.every((d) => d.status === "sent" && d.event_key === event)).toBe(true)
  expect(r.rows.length).toBe(deliveries(r.live).length)
}

async function message(name: string, author: w.SeededUser, content: string) {
  const id = `00000000-0000-4000-8999-${String(Math.abs(hash(name))).padStart(12, "0").slice(0, 12)}`
  return { message_id: id, author: author.user_id, content, timestamp: new Date("2026-10-31T00:00:00Z") } as never
}
function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return h
}

async function orgShop() {
  const customer = await w.user("customer")
  const boss = await w.user("boss")
  const clerk = await w.user("clerk")
  const member = await w.user("member")
  const acme = await w.org("acme", [
    { user: boss, perms: "owner" },
    { user: clerk, perms: ["manage_orders"] },
    { user: member, perms: [] },
  ])
  const shop = await w.shop("acme-shop", { org: acme })
  return { customer, boss, clerk, member, acme, shop }
}

describe("cutover list", () => {
  it("defaults to every shadowed event; NOTIFY_LIVE_EVENTS replaces it; 'none' reverts all; unknown keys are ignored", () => {
    expect([...liveEvents()].sort()).toEqual([...CUTOVER_EVENTS].sort())
    expect([...LIVE_EVENTS_DEFAULT].sort()).toEqual([...CUTOVER_EVENTS].sort())

    process.env.NOTIFY_LIVE_EVENTS = "none"
    expect(liveEvents().size).toBe(0)
    process.env.NOTIFY_LIVE_EVENTS = ""
    expect(liveEvents().size).toBe(0)

    process.env.NOTIFY_LIVE_EVENTS = " order.created , offer.message,order.status.fulfilled,bogus"
    expect([...liveEvents()].sort()).toEqual(["offer.message", "order.created"])
    expect(isLive("order.message")).toBe(false)

    delete process.env.NOTIFY_LIVE_EVENTS
    expect(isLive("order.message")).toBe(true)
  })
})

describe("parity: each cut-over event sends once through notify(), as legacy did", () => {
  it("order.created: org managers, org-scoped push/email preferences, shop webhook", async () => {
    const { customer, boss, clerk, acme, shop } = await orgShop()
    await w.pushPref(boss, "order_create", false, acme)
    await w.pushPref(clerk, "order_create", false)
    await w.emailOptIn(boss, ["order_create"], acme)
    await w.emailOptIn(clerk, ["order_create"])
    await w.webhook("shop-hook", shop, ["order_create"])
    const order = await w.order("oc", { customer, org: acme, shop })

    const r = await bothPaths(() => notificationService.createOrderNotification(order))
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "email   boss@example.test New Order Created",
        "in_app  user:boss order_create (order:oc)",
        "in_app  user:clerk order_create (order:oc)",
        "push    push:clerk [order] New Order Created",
      ]
    `)
    expectParity(r, "order.created")
  })

  it("order.assigned: an org order assigned to a manager (org-scoped preferences)", async () => {
    const { customer, clerk, acme, shop } = await orgShop()
    await w.emailOptIn(clerk, ["order_assigned"], acme)
    await w.webhook("shop-hook", shop, ["order_assigned"])
    const order = await w.order("oa", { customer, assigned: clerk, org: acme, shop })

    const r = await bothPaths(() => notificationService.createOrderAssignedNotification(order))
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "email   clerk@example.test Order Assigned",
        "in_app  user:clerk order_assigned (order:oa)",
        "push    push:clerk [order] Order Assigned",
      ]
    `)
    expectParity(r, "order.assigned")
  })

  it("order.created on a personal order with an assignee: order.assigned only", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const order = await w.order("pa", { customer, assigned: seller })

    const r = await bothPaths(() => notificationService.createOrderNotification(order))
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller order_assigned (order:pa)",
        "push    push:seller [order] Order Assigned",
      ]
    `)
    expectParity(r, "order.assigned")
  })

  for (const status of ["not-started", "in-progress", "fulfilled", "cancelled"]) {
    it(`order.status_changed (${status}): the seller acts, the customer hears, per-status preferences`, async () => {
      const customer = await w.user("customer")
      const seller = await w.user("seller")
      // Per-status filter: push off for in-progress only; email opted in for fulfilled only.
      await w.pushPref(customer, "order_status_in_progress", false)
      await w.emailOptIn(customer, ["order_status_fulfilled"])
      const order = await w.order(`st-${status}`, { customer, assigned: seller, status })

      const r = await bothPaths(() => notificationService.createOrderStatusNotification(order, status, seller.user_id))
      expect(deliveries(r.live).length).toBeGreaterThan(0)
      expectParity(r, "order.status_changed")
    })
  }

  it("order.status_changed: the customer cancels an org order; the assignee hears under the org's preferences", async () => {
    const { customer, clerk, acme } = await orgShop()
    await w.emailOptIn(clerk, ["order_status_cancelled"], acme)
    const order = await w.order("cc", { customer, assigned: clerk, org: acme, status: "cancelled" })

    const r = await bothPaths(() =>
      notificationService.createOrderStatusNotification(order, "cancelled", customer.user_id),
    )
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "email   clerk@example.test Order Cancelled",
        "in_app  user:clerk order_status_cancelled (order:cc)",
        "push    push:clerk [order] Order Cancelled",
      ]
    `)
    expectParity(r, "order.status_changed")
  })

  it("order.message: collapsed while unread; the reply goes the other way", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(seller, ["order_message"])
    const order = await w.order("om", { customer, assigned: seller })
    await w.chat("om", { order_id: order.order_id })
    const m1 = await message("om1", customer, "first")
    const m2 = await message("om2", customer, "second")
    const m3 = await message("om3", seller, "reply")

    const r = await bothPaths(async () => {
      await notificationService.createOrderMessageNotification(order, m1)
      await notificationService.createOrderMessageNotification(order, m2)
      await notificationService.createOrderMessageNotification(order, m3)
    })
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "email   seller@example.test New Message on Order",
        "in_app  user:customer order_message (order:om)",
        "in_app  user:seller order_message (order:om)",
        "push    push:customer [order] seller: reply",
        "push    push:seller [order] customer: first",
      ]
    `)
    expectParity(r, "order.message")
  })

  it("offer.received: a new offer and a counter offer to a personal seller", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(seller, ["offer_create", "counter_offer_create"])
    const session = await w.offerSession("or", { customer, assigned: seller })

    const r = await bothPaths(async () => {
      await notificationService.createOfferNotification(session, "create")
      // The customer counters (a new offer row, so a new occurrence).
      await getKnex()("order_offers").insert({
        session_id: session.id,
        kind: "Delivery",
        cost: 30000,
        title: "Counter",
        description: "Counter",
        actor_id: customer.user_id,
        timestamp: new Date(Date.now() + 1000),
      })
      await notificationService.createOfferNotification(session, "counteroffer")
      await getKnex()("order_offers").where({ title: "Counter" }).delete()
    })
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "email   seller@example.test Counter Offer Received",
        "email   seller@example.test New Offer Created",
        "in_app  user:seller counter_offer_create (session:or)",
        "in_app  user:seller offer_create (session:or)",
        "push    push:seller [offer] Counter-Offer",
        "push    push:seller [offer] New Offer",
      ]
    `)
    expectParity(r, "offer.received")
  })

  it("offer.message: collapsed while unread; the reply goes the other way", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(customer, ["offer_message"])
    const session = await w.offerSession("ofm", { customer, assigned: seller })
    await w.chat("ofm", { session_id: session.id })
    const m1 = await message("ofm1", seller, "hello")
    const m2 = await message("ofm2", seller, "again")
    const m3 = await message("ofm3", customer, "hi")

    const r = await bothPaths(async () => {
      await notificationService.createOfferMessageNotification(session, m1)
      await notificationService.createOfferMessageNotification(session, m2)
      await notificationService.createOfferMessageNotification(session, m3)
    })
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "email   customer@example.test New Message on Offer",
        "in_app  user:customer offer_message (session:ofm)",
        "in_app  user:seller offer_message (session:ofm)",
        "push    push:customer [offer] seller: hello",
        "push    push:seller [offer] customer: hi",
      ]
    `)
    expectParity(r, "offer.message")
  })
})

describe("live: owner-approved differences that ship with the cutover", () => {
  it("offer.received to an org: managers also get push (org_offer_push); nothing else changes", async () => {
    const { customer, boss, acme } = await orgShop()
    await w.emailOptIn(boss, ["offer_create"], acme)
    const session = await w.offerSession("oo", { customer, org: acme })

    const r = await bothPaths(() => notificationService.createOfferNotification(session, "create"))
    expect(w.summary(r.legacy).filter((l) => l.startsWith("shadow"))).toEqual([
      "shadow  offer.received ok expected org_offer_push=2",
    ])
    const added = deliveries(r.live).filter((l) => !deliveries(r.legacy).includes(l))
    expect(added).toMatchInlineSnapshot(`
      [
        "push    push:boss [offer] New Offer",
        "push    push:clerk [offer] New Offer",
      ]
    `)
    expect(deliveries(r.legacy).every((l) => deliveries(r.live).includes(l))).toBe(true)
    expect(added.every((l) => l.startsWith("push "))).toBe(true)
    expect(r.liveCalls).toEqual([])
  })

  it("the customer of an org order is on Personal preferences, push and email alike (customer_scope)", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const acme = await w.org("acme", [{ user: seller, perms: "owner" }])
    // Personal: push off, email opted in. Under the seller org's scope (what legacy read): no rows.
    await w.pushPref(customer, "order_status_fulfilled", false)
    await w.emailOptIn(customer, ["order_status_fulfilled"])
    const order = await w.order("cs", { customer, assigned: seller, org: acme, status: "fulfilled" })

    const r = await bothPaths(() => notificationService.createOrderStatusNotification(order, "fulfilled", seller.user_id))
    expect(deliveries(r.legacy)).toMatchInlineSnapshot(`
      [
        "in_app  user:customer order_status_fulfilled (order:cs)",
        "push    push:customer [order] Order Fulfilled",
      ]
    `)
    // The send-time email check uses the same (Personal) scope as notify().
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "email   customer@example.test Order Fulfilled",
        "in_app  user:customer order_status_fulfilled (order:cs)",
      ]
    `)
    expect(r.liveCalls).toEqual([])
  })

  it("a message on an unassigned org offer also reaches the org's managers (unassigned_to_managers)", async () => {
    const { customer, acme } = await orgShop()
    const session = await w.offerSession("uo", { customer, org: acme })
    const m = await message("uo1", customer, "anyone?")

    const r = await bothPaths(() => notificationService.createOfferMessageNotification(session, m))
    expect(deliveries(r.legacy)).toEqual([])
    expect(deliveries(r.live)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss offer_message (session:uo)",
        "in_app  user:clerk offer_message (session:uo)",
        "push    push:boss [offer] customer: anyone?",
        "push    push:clerk [offer] customer: anyone?",
      ]
    `)
    expect(r.liveCalls).toEqual([])
  })
})

describe("no double sends", () => {
  it("a repeated call for the same occurrence (order created, message) is delivered once", async () => {
    const { customer, acme } = await orgShop()
    const order = await w.order("rp", { customer, org: acme })
    const m = await message("rp1", customer, "hello")
    const seller = await w.user("seller")
    const assigned = await w.order("rp2", { customer, assigned: seller })

    await notificationService.createOrderNotification(order)
    await notificationService.createOrderNotification(order)
    await notificationService.createOrderMessageNotification(assigned, m)
    await getKnex()("notification").update({ read: true })
    await notificationService.createOrderMessageNotification(assigned, m)

    const obs = await w.observe()
    const lines = deliveries(obs)
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_create (order:rp)",
        "in_app  user:clerk order_create (order:rp)",
        "in_app  user:seller order_message (order:rp2)",
        "push    push:boss [order] New Order Created",
        "push    push:clerk [order] New Order Created",
        "push    push:seller [order] customer: hello",
      ]
    `)
    expect(obs.shadow).toEqual([])
  })
})

describe("events not cut over keep legacy + shadow", () => {
  it("buy now (createNewOrderNotificationV2) stays on the legacy V2 push, shadowed", async () => {
    const { customer, acme, shop } = await orgShop()
    const order = await w.order("bn", { customer, org: acme, shop })
    const spies = spyLegacy()

    await notificationService.createNewOrderNotificationV2(
      { order_id: order.order_id, buyer_id: customer.user_id, shop_id: shop.shop_id, total_price: 25000, items: [] } as never,
      shop.shop_id,
    )

    expect(spies.legacyNewOrderNotificationV2).toHaveBeenCalledTimes(1)
    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "push    push:boss [order_v2] New Order",
        "push    push:clerk [order_v2] New Order",
        "shadow  order.created ok expected buy_now_normal_path=6",
      ]
    `)
  })

  it("one event reverted with NOTIFY_LIVE_EVENTS: it is legacy + shadow again; the others stay live", async () => {
    process.env.NOTIFY_LIVE_EVENTS = LIVE_EVENTS_DEFAULT.filter((e) => e !== "order.message").join(",")
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const order = await w.order("rv", { customer, assigned: seller })
    const m = await message("rv1", customer, "hello")
    const spies = spyLegacy()

    await notificationService.createOrderMessageNotification(order, m)
    await notificationService.createOrderStatusNotification(order, "in-progress", seller.user_id)

    expect(spies.legacyOrderMessageNotification).toHaveBeenCalledTimes(1)
    expect(spies.legacyOrderStatusNotification).not.toHaveBeenCalled()
    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller order_message (order:rv)",
        "in_app  user:customer order_status_in_progress (order:rv)",
        "push    push:customer [order] Order In Progress",
        "push    push:seller [order] customer: hello",
        "shadow  order.message ok",
      ]
    `)
  })
})
