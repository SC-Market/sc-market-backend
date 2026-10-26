/**
 * Characterization: order notifications as they behave today.
 *
 * Triggers are the real call sites where they are plain functions
 * (initiateOrder, handleStatusUpdate, handleAssignedUpdate, the chat
 * sendMessage handler); the rest call the notification service method that
 * the route calls. Every transport is a recording fake (see
 * src/test-utils/notif-char/). The inline snapshot is the compact
 * "who got what where"; the file snapshot holds the full payloads.
 *
 * An intended behaviour change must show up here as a reviewed diff.
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { notificationService } from "../notification.service.js"
import { initiateOrder, handleStatusUpdate, handleAssignedUpdate } from "../../../api/routes/v1/orders/helpers.js"
import { postOrderAlert } from "../../discord/order-alerts.js"
import { discordService } from "../../discord/discord.service.js"
import { sendMessage } from "../../../api/routes/v1/chats/controller.js"
import * as profileDb from "../../../api/routes/v1/profiles/database.js"
import { getKnex } from "../../../clients/database/knex-db.js"

function fakeRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(b: unknown) {
      res.body = b
      res.headersSent = true
      return res
    },
  }
  return res
}

/** An org shop with three members: two order managers and one plain member. */
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

describe("order_create (1)", () => {
  it("org order from an offer: org managers, org-scoped push/email prefs, shop webhook, alert post", async () => {
    const { customer, boss, clerk, acme, shop } = await orgShop()
    // Push is opt-out, checked against the org-scoped row: boss turned it off
    // for this org; clerk only turned off the personal row, which is ignored.
    await w.pushPref(boss, "order_create", false, acme)
    await w.pushPref(clerk, "order_create", false)
    // Email is opt-in, also org-scoped: boss opted in for the org, clerk only
    // personally (ignored for an org order).
    await w.emailOptIn(boss, ["order_create"], acme)
    await w.emailOptIn(clerk, ["order_create"])
    await w.webhook("shop-hook", shop, ["order_create"])
    await w.webhook("public-hook", { org: acme }, ["public_order_create"])
    await w.discordSetup({ owner: shop, channel: "900000000000000001", alerts: true })

    const session = await w.offerSession("s1", { customer, org: acme, shop })
    w.nameId((await initiateOrder(session)).order_id, "order:o1")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_create (order:o1)",
        "in_app  user:clerk order_create (order:o1)",
        "push    push:clerk [order] New Order Created",
        "email   boss@example.test New Order Created",
        "discord POST /channels/900000000000000001/messages",
        "webhook shop-hook SC Market - Order Placed",
        "ERROR   Query error",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("personal order with an assignee: assignee gets order_assigned, not order_create", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(seller, ["order_assigned", "order_create"])
    const shop = await w.shop("seller-shop", { user: seller })
    await w.webhook("seller-hook", { user: seller }, ["order_assigned"])
    await w.webhook("seller-shop-hook", shop, ["order_create", "order_assigned"])
    await w.discordSetup({ owner: shop, channel: "900000000000000002", alerts: true })

    const session = await w.offerSession("s2", { customer, assigned: seller, shop })
    w.nameId((await initiateOrder(session)).order_id, "order:o2")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller order_assigned (order:o2)",
        "push    push:seller [order] Order Assigned",
        "email   seller@example.test Order Assigned",
        "webhook seller-shop-hook SC Market - Order Assigned",
        "webhook seller-hook SC Market - Order Assigned",
        "webhook seller-shop-hook SC Market - Order Placed",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("unassigned order without a shop: public_order_create webhooks fire", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    await w.webhook("public-hook", { org: acme }, ["public_order_create"])
    const order = await w.order("o3", { customer, org: acme })

    await notificationService.createOrderNotification(order)
    await postOrderAlert(order)

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_create (order:o3)",
        "push    push:boss [order] New Order Created",
        "webhook public-hook SC Market - Order Placed",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("member holding two manage_orders roles", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    // A second role that also grants manage_orders.
    const db = getKnex()
    const [role] = await db("contractor_roles")
      .insert({ contractor_id: acme.contractor_id, position: 5, name: "Dispatch", manage_orders: true })
      .returning("role_id")
    await db("contractor_member_roles").insert({ user_id: boss.user_id, role_id: role.role_id })
    w.nameId(role.role_id, "role:acme:dispatch")
    const order = await w.order("o4", { customer, org: acme })

    await notificationService.createOrderNotification(order)

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_create (order:o4)",
        "in_app  user:boss order_create (order:o4)",
        "push    push:boss [order] New Order Created",
        "push    push:boss [order] New Order Created",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })
})

describe("order_assigned (2)", () => {
  it("org manager assigns an order: assignee in-app/push/email, thread message + member add, webhooks", async () => {
    const { customer, boss, clerk, acme, shop } = await orgShop()
    await w.emailOptIn(clerk, ["order_assigned"], acme)
    await w.webhook("shop-hook", shop, ["order_assigned"])
    await w.webhook("clerk-hook", { user: clerk }, ["order_assigned"])
    const order = await w.order("o5", { customer, org: acme, shop, thread_id: "800000000000000005" })

    const res = fakeRes()
    await handleAssignedUpdate(
      { order, user: await profileDb.getUser({ user_id: boss.user_id }), body: { assigned_to: clerk.username } },
      res,
    )
    expect(res.statusCode).toBe(200)

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:clerk order_assigned (order:o5)",
        "push    push:clerk [order] Order Assigned",
        "email   clerk@example.test Order Assigned",
        "discord POST /channels/thread:o5/messages",
        "discord PUT /channels/thread:o5/thread-members/discord:clerk",
        "webhook shop-hook SC Market - Order Assigned",
        "webhook clerk-hook SC Market - Order Assigned",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("push and email preferences off (org-scoped)", async () => {
    const { customer, boss, clerk, acme } = await orgShop()
    await w.pushPref(clerk, "order_assigned", false, acme)
    await w.emailPref(clerk, "order_assigned", false, acme)
    const order = await w.order("o6", { customer, org: acme })

    await handleAssignedUpdate(
      { order, user: await profileDb.getUser({ user_id: boss.user_id }), body: { assigned_to: clerk.username } },
      fakeRes(),
    )

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:clerk order_assigned (order:o6)",
      ]
    `)
  })
})

describe("order_status_* (4-7)", () => {
  /** The assignee of a personal shop order moves it to `status`. */
  async function assigneeSets(status: "in-progress" | "fulfilled" | "cancelled" | "not-started") {
    const action = `order_status_${status.replace("-", "_")}`
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    await w.emailOptIn(customer, [action])
    await w.webhook("shop-hook", shop, [action])
    const order = await w.order(`st-${status}`, {
      customer,
      assigned: seller,
      shop,
      status: status === "not-started" ? "in-progress" : "not-started",
      thread_id: "800000000000000010",
    })
    await w.chat(`st-${status}`, { order_id: order.order_id })

    const res = fakeRes()
    await handleStatusUpdate(
      { order, user: await profileDb.getUser({ user_id: seller.user_id }) },
      res,
      status,
    )
    expect(res.statusCode).toBe(200)
    return w.observe()
  }

  it("assignee sets in-progress: customer notified, thread status message, webhooks", async () => {
    const obs = await assigneeSets("in-progress")
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:customer order_status_in_progress (order:st-in-progress)",
        "push    push:customer [order] Order In Progress",
        "email   customer@example.test Order In Progress",
        "discord PUT /channels/thread:st-in-progress/thread-members/discord:seller",
        "discord POST /channels/thread:st-in-progress/messages",
        "webhook shop-hook SC Market - Order Status Updated",
        "ws      {"message_id":"uuid#1","content":"Order status has been upda",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("assignee sets fulfilled: thread archived", async () => {
    const obs = await assigneeSets("fulfilled")
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:customer order_status_fulfilled (order:st-fulfilled)",
        "push    push:customer [order] Order Fulfilled",
        "email   customer@example.test Order Fulfilled",
        "discord POST /channels/thread:st-fulfilled/messages",
        "discord PATCH /channels/thread:st-fulfilled",
        "webhook shop-hook SC Market - Order Status Updated",
        "ws      {"message_id":"uuid#1","content":"Order status has been upda",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("assignee sets cancelled: thread archived", async () => {
    const obs = await assigneeSets("cancelled")
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:customer order_status_cancelled (order:st-cancelled)",
        "push    push:customer [order] Order Cancelled",
        "email   customer@example.test Order Cancelled",
        "discord POST /channels/thread:st-cancelled/messages",
        "discord PATCH /channels/thread:st-cancelled",
        "webhook shop-hook SC Market - Order Status Updated",
        "ws      {"message_id":"uuid#1","content":"Order status has been upda",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("assignee sets not-started", async () => {
    const obs = await assigneeSets("not-started")
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:customer order_status_not_started (order:st-not-started)",
        "push    push:customer [order] Order Status Updated",
        "email   customer@example.test Order Status Updated",
        "discord POST /channels/thread:st-not-started/messages",
        "webhook shop-hook SC Market - Order Status Updated",
        "ws      {"message_id":"uuid#1","content":"Order status has been upda",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("customer cancels an org order: assignee notified (org-scoped prefs), customer not", async () => {
    const { customer, clerk, acme, shop } = await orgShop()
    await w.emailOptIn(clerk, ["order_status_cancelled"], acme)
    const order = await w.order("cx", { customer, assigned: clerk, org: acme, shop })
    await w.chat("cx", { order_id: order.order_id })

    await handleStatusUpdate(
      { order, user: await profileDb.getUser({ user_id: customer.user_id }) },
      fakeRes(),
      "cancelled",
    )

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:clerk order_status_cancelled (order:cx)",
        "push    push:clerk [order] Order Cancelled",
        "email   clerk@example.test Order Cancelled",
        "ws      {"message_id":"uuid#1","content":"Order status has been upda",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })
})

describe("order_message (81)", () => {
  it("chat messages: coalesced in-app row; the second unread message sends nothing; mirrored to the thread", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(seller, ["order_message"])
    const order = await w.order("chat", { customer, assigned: seller, thread_id: "800000000000000020" })
    const chat = await w.chat("chat", { order_id: order.order_id })
    const author = await profileDb.getUser({ user_id: customer.user_id })

    for (const content of ["first message", "second message"]) {
      const res = fakeRes()
      await sendMessage(
        { user: author, body: { content }, chat, order } as never,
        res as never,
        (() => {}) as never,
      )
      expect(res.statusCode).toBe(200)
    }

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller order_message (order:chat)",
        "push    push:seller [order] customer: first message",
        "email   seller@example.test New Message on Order",
        "discord POST /channels/thread:chat/messages",
        "discord POST /channels/thread:chat/messages",
        "ws      {"message_id":"uuid#1","content":"first message","author":"c",
        "ws      {"message_id":"uuid#2","content":"second message","author":"",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("after the recipient reads it, the next message notifies again", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const order = await w.order("chat2", { customer, assigned: seller })
    const chat = await w.chat("chat2", { order_id: order.order_id })
    const author = await profileDb.getUser({ user_id: customer.user_id })
    const send = (content: string) =>
      sendMessage({ user: author, body: { content }, chat, order } as never, fakeRes() as never, (() => {}) as never)

    await send("one")
    await getKnex()("notification").update({ read: true })
    await send("two")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller order_message (order:chat2)",
        "in_app  user:seller order_message (order:chat2)",
        "push    push:seller [order] customer: one",
        "push    push:seller [order] customer: two",
        "ws      {"message_id":"uuid#1","content":"one","author":"customer","",
        "ws      {"message_id":"uuid#2","content":"two","author":"customer","",
      ]
    `)
  })
})

describe("order_review (3)", () => {
  it("customer reviews: assignee notified, shop order_review webhook", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    await w.emailOptIn(seller, ["order_review"])
    await w.webhook("shop-hook", shop, ["order_review"])
    const order = await w.order("rev", { customer, assigned: seller, shop, status: "fulfilled" })
    const [review] = await getKnex()("order_reviews")
      .insert({ order_id: order.order_id, user_author: customer.user_id, rating: 4, content: "Great", role: "customer" })
      .returning("*")
    w.nameId(review.review_id, "review:rev")

    await notificationService.createOrderReviewNotification(review)

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller order_review (review:rev)",
        "push    push:seller [order_review] New Review",
        "email   seller@example.test New Review on Order",
        "webhook shop-hook SC Market - Order Review",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })
})

describe("order_review_revision_requested (22)", () => {
  it("personal review author", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.emailOptIn(customer, ["order_review_revision_requested"])
    const order = await w.order("rr", { customer, assigned: seller, status: "fulfilled" })
    const [review] = await getKnex()("order_reviews")
      .insert({ order_id: order.order_id, user_author: customer.user_id, rating: 1, content: "Bad", role: "customer", revision_requested: true, revision_requested_at: new Date() })
      .returning("*")
    w.nameId(review.review_id, "review:rr")

    await notificationService.createOrderReviewRevisionNotification(
      review,
      await profileDb.getUser({ user_id: seller.user_id }),
    )

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:customer order_review_revision_requested (review:rr)",
        "push    push:customer [order_review] Review Revision Requested",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("org-authored review: managers notified; push ignores the org-scoped preference (bulk path)", async () => {
    const { customer, boss, clerk, acme } = await orgShop()
    await w.pushPref(boss, "order_review_revision_requested", false, acme)
    await w.pushPref(clerk, "order_review_revision_requested", false)
    const order = await w.order("rr2", { customer, assigned: boss, org: acme, status: "fulfilled" })
    const [review] = await getKnex()("order_reviews")
      .insert({
        order_id: order.order_id,
        user_author: boss.user_id,
        contractor_author: acme.contractor_id,
        rating: 2,
        content: "Customer was late",
        role: "contractor",
      })
      .returning("*")
    w.nameId(review.review_id, "review:rr2")
    // The review author field is the org, so recipients come from the org.
    await notificationService.createOrderReviewRevisionNotification(
      { ...review, user_author: null },
      await profileDb.getUser({ user_id: customer.user_id }),
    )

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_review_revision_requested (review:rr2)",
        "in_app  user:clerk order_review_revision_requested (review:rr2)",
        "push    push:boss [order_review] Review Revision Requested",
      ]
    `)
  })
})

describe("order_comment (8)", () => {
  it("has no caller: createOrderCommentNotification is never invoked by any route", async () => {
    // Recorded so the deletion in Phase 1 shows up as a reviewed change.
    expect(typeof notificationService.createOrderCommentNotification).toBe("function")
  })
})

describe("Discord order threads (specialised, not notifications)", () => {
  it("thread creation is queued to the bot with both members", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    await w.discordSetup({ owner: { user: seller }, channel: "900000000000000030", threads: true })
    const order = await w.order("thr", { customer, assigned: seller })

    const result = await discordService.queueThreadCreation(order)
    expect(result.status).toBe("queued")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "dqueue  create_thread",
      ]
    `)
    expect(obs.discord_queue).toMatchSnapshot()
  })
})
