/**
 * Characterization: offer notifications as they behave today (see orders.char.test.ts).
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { notificationService } from "../notification.service.js"
import { createOffer } from "../../../api/routes/v1/orders/helpers.js"
import { discordService } from "../../discord/discord.service.js"
import { sendMessage } from "../../../api/routes/v1/chats/controller.js"
import * as profileDb from "../../../api/routes/v1/profiles/database.js"
import * as offerDb from "../../../api/routes/v1/offers/database.js"

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(b: unknown) {
      res.body = b
      return res
    },
  }
  return res
}

const OFFER = { kind: "Delivery", cost: "40000", title: "Haul 40 SCU", description: "Please haul" }

describe("offer_create (19)", () => {
  it("offer to an org shop: managers get in-app + email but no push; alert post with Claim; thread queued", async () => {
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
    await w.emailOptIn(boss, ["offer_create"], acme)
    await w.emailOptIn(clerk, ["offer_create"])
    await w.webhook("shop-hook", shop, ["order_create"])
    await w.discordSetup({ owner: shop, channel: "900000000000000101", alerts: true, threads: true })

    const { session } = await createOffer(
      { customer_id: customer.user_id, contractor_id: acme.contractor_id, shop_id: shop.shop_id },
      { ...OFFER, actor_id: customer.user_id },
    )
    w.nameId(session.id, "session:o1")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss offer_create (session:o1)",
        "in_app  user:clerk offer_create (session:o1)",
        "email   boss@example.test New Offer Created",
        "discord POST /channels/900000000000000101/messages",
        "discord POST /channels/900000000000000101/invites",
        "dqueue  create_thread",
        "webhook shop-hook SC Market - Offer Received",
        "shadow  offer.received ok",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("offer to a personal shop: the assignee gets in-app, push and email; alert post without Claim", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    await w.emailOptIn(seller, ["offer_create"])
    await w.webhook("shop-hook", shop, ["order_create"])
    await w.discordSetup({ owner: { user: seller }, channel: "900000000000000102", alerts: true })

    const { session } = await createOffer(
      { customer_id: customer.user_id, assigned_id: seller.user_id, shop_id: shop.shop_id },
      { ...OFFER, actor_id: customer.user_id },
    )
    w.nameId(session.id, "session:o2")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller offer_create (session:o2)",
        "push    push:seller [offer] New Offer",
        "email   seller@example.test New Offer Created",
        "discord POST /channels/900000000000000102/messages",
        "webhook shop-hook SC Market - Offer Received",
        "shadow  offer.received ok",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("assignee turned push and email off", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.pushPref(seller, "offer_create", false)
    await w.emailPref(seller, "offer_create", false)
    const { session } = await createOffer(
      { customer_id: customer.user_id, assigned_id: seller.user_id },
      { ...OFFER, actor_id: customer.user_id },
    )
    w.nameId(session.id, "session:o3")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller offer_create (session:o3)",
        "shadow  offer.received ok",
      ]
    `)
  })
})

describe("counter_offer_create (20)", () => {
  it("counter-offer: same recipients as offer_create, plus a thread status message", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(seller, ["counter_offer_create"])
    const shop = await w.shop("seller-shop", { user: seller })
    await w.webhook("shop-hook", shop, ["order_create"])
    const session = await w.offerSession("c1", {
      customer,
      assigned: seller,
      shop,
      thread_id: "800000000000000101",
    })

    // What the offers controller does on a counter-offer.
    await notificationService.createOfferNotification(session, "counteroffer")
    await discordService.sendOfferStatusUpdate(
      session,
      "Counter-Offered",
      await profileDb.getUser({ user_id: customer.user_id }),
    )

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller counter_offer_create (session:c1)",
        "push    push:seller [offer] Counter-Offer",
        "email   seller@example.test Counter Offer Received",
        "discord POST /channels/thread:c1/messages",
        "webhook shop-hook SC Market - Counter Offer Received",
        "shadow  offer.received ok",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })
})

describe("offer accepted / rejected (thread only)", () => {
  it("accepted: thread message only", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const session = await w.offerSession("a1", { customer, assigned: seller, thread_id: "800000000000000102" })
    await discordService.sendOfferStatusUpdate(session, "Accepted", await profileDb.getUser({ user_id: seller.user_id }))
    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "discord POST /channels/thread:a1/messages",
      ]
    `)
  })

  it("rejected: thread message and archive", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const session = await w.offerSession("r1", { customer, assigned: seller, thread_id: "800000000000000103" })
    await discordService.sendOfferStatusUpdate(session, "Rejected", await profileDb.getUser({ user_id: seller.user_id }))
    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "discord POST /channels/thread:r1/messages",
        "discord PATCH /channels/thread:r1",
      ]
    `)
    expect(obs.discord).toMatchSnapshot()
  })
})

describe("offer_message (18)", () => {
  it("seller replies: customer gets one coalesced notification; mirrored to the thread", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const acme = await w.org("acme", [{ user: seller, perms: "owner" }])
    await w.emailOptIn(customer, ["offer_message"])
    // Org-scoped: customer's personal push row applies? It is looked up with the
    // session's contractor_id, so a personal "off" does not apply here.
    await w.pushPref(customer, "offer_message", false)
    const session = await w.offerSession("m1", {
      customer,
      assigned: seller,
      org: acme,
      thread_id: "800000000000000104",
    })
    const chat = await w.chat("m1", { session_id: session.id })
    const author = await profileDb.getUser({ user_id: seller.user_id })

    for (const content of ["hello", "are you there?"]) {
      await sendMessage(
        { user: author, body: { content }, chat, offer_session: session } as never,
        fakeRes() as never,
        (() => {}) as never,
      )
    }

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:customer offer_message (session:m1)",
        "push    push:customer [offer] seller: hello",
        "discord POST /channels/thread:m1/messages",
        "discord POST /channels/thread:m1/messages",
        "ws      {"message_id":"uuid#1","content":"hello","author":"seller","",
        "ws      {"message_id":"uuid#2","content":"are you there?","author":"",
        "shadow  offer.message ok",
        "shadow  offer.message ok",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })
})

describe("offer DM to the assignee", () => {
  it("is not sent (sendOfferDM is commented out in createOfferNotification)", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const session = await w.offerSession("dm", { customer, assigned: seller })
    await notificationService.createOfferNotification(session, "create")
    const obs = await w.observe()
    expect(obs.discord).toEqual([])
    expect(await offerDb.getOfferSessions({ id: session.id })).toHaveLength(1)
  })
})
