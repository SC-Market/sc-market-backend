/**
 * Characterization: notification scoping by org and by permission
 * (owner-approved, drafts/notifications-design.md §8).
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { notificationService } from "../notification.service.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import * as plans from "../../notify/plans.js"
import { eventDefinition } from "../../notify/catalog.js"
import { resolvePreferences } from "../../notify/preferences.js"
import { orgMembersWithPermission } from "../../notify/recipients.js"
import { getUsersForAlertTarget } from "../../../api/routes/v1/admin/database.js"

async function mute(u: w.SeededUser, org: w.SeededOrg, until: Date | null = null) {
  await getKnex()("notification_org_mutes").insert({ user_id: u.user_id, contractor_id: org.contractor_id, muted_until: until })
}

describe("orgMembersWithPermission", () => {
  it("one row per member, permission holders only, banned accounts and ex-members excluded", async () => {
    const boss = await w.user("boss")
    const clerk = await w.user("clerk")
    const member = await w.user("member")
    const banned = await w.user("banned")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: clerk, perms: ["manage_orders"] },
      { user: member, perms: [] },
      { user: banned, perms: ["manage_orders"] },
    ])
    const db = getKnex()
    // A second role granting manage_orders to the boss.
    const [role] = await db("contractor_roles")
      .insert({ contractor_id: acme.contractor_id, position: 5, name: "Dispatch", manage_orders: true })
      .returning("role_id")
    await db("contractor_member_roles").insert({ user_id: boss.user_id, role_id: role.role_id })
    await db("accounts").where({ user_id: banned.user_id }).update({ banned: true })
    // The clerk left but a stale role row remains.
    await db("contractor_members").where({ user_id: clerk.user_id, contractor_id: acme.contractor_id }).delete()

    const got = (await orgMembersWithPermission(acme.contractor_id, "manage_orders")).map((r) => w.label(r.userId))
    expect(got).toEqual(["user:boss"])
  })
})

describe("shadow: permission_scope and customer_scope", () => {
  it("a banned manager is notified by legacy, not by the plan", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const banned = await w.user("banned")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: banned, perms: ["manage_orders"] },
    ])
    await getKnex()("accounts").where({ user_id: banned.user_id }).update({ banned: true })
    const order = await w.order("ps", { customer, org: acme })

    await notificationService.createOrderNotification(order)

    expect(w.summary(await w.observe()).filter((l) => l.startsWith("shadow"))).toMatchInlineSnapshot(`
      [
        "shadow  order.created ok expected permission_scope=2",
      ]
    `)
  })

  it("the customer's status push follows their Personal choice, not the seller org's", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const acme = await w.org("acme", [{ user: seller, perms: "owner" }])
    // Personal: off. Under the seller org's scope (what legacy reads): no row = on.
    await w.pushPref(customer, "order_status_fulfilled", false)
    const order = await w.order("cs", { customer, assigned: seller, org: acme, status: "fulfilled" })

    await notificationService.createOrderStatusNotification(order, "fulfilled", seller.user_id)

    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:customer order_status_fulfilled (order:cs)",
        "push    push:customer [order] Order Fulfilled",
        "shadow  order.status_changed ok expected customer_scope=1",
      ]
    `)
  })
})

describe("shadow: unassigned_to_managers", () => {
  it("a customer's message on an unassigned org offer: legacy tells no org member; the plan tells manage_orders members", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const member = await w.user("member")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: member, perms: [] },
    ])
    const session = await w.offerSession("um", { customer, org: acme })
    const message = {
      message_id: "00000000-0000-4000-8999-0000000000a1",
      author: customer.user_id,
      content: "hello?",
      timestamp: new Date("2026-10-27T00:00:00Z"),
    } as never

    await notificationService.createOfferMessageNotification(session, message)

    expect(w.summary(await w.observe()).filter((l) => l.startsWith("shadow"))).toMatchInlineSnapshot(`
      [
        "shadow  offer.message ok expected unassigned_to_managers=2",
      ]
    `)
  })
})

describe("actor: the member who assigns or claims", () => {
  it("a member claiming an order for themselves is notified by legacy, not by the plan", async () => {
    const customer = await w.user("customer")
    const clerk = await w.user("clerk")
    const acme = await w.org("acme", [{ user: clerk, perms: ["manage_orders", "claim_orders"] }])
    const order = await w.order("cl", { customer, assigned: clerk, org: acme })

    await notificationService.createOrderAssignedNotification(order, clerk.user_id)

    expect(w.summary(await w.observe()).filter((l) => l.startsWith("shadow"))).toMatchInlineSnapshot(`
      [
        "shadow  order.assigned ok expected actor_excluded=2",
      ]
    `)
  })
})

describe("org mute", () => {
  it("muted: in-app still written, no push or email (legacy and plan agree)", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const clerk = await w.user("clerk")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: clerk, perms: ["manage_orders"] },
    ])
    await w.emailOptIn(boss, ["order_create"], acme)
    await mute(boss, acme)
    const order = await w.order("mu", { customer, org: acme })

    await notificationService.createOrderNotification(order)

    expect(w.summary(await w.observe({ drainEmail: true }))).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_create (order:mu)",
        "in_app  user:clerk order_create (order:mu)",
        "push    push:clerk [order] New Order Created",
        "shadow  order.created ok",
      ]
    `)
  })

  it("a mute that ended is ignored; a mute of another org doesn't apply", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    const other = await w.org("other", [{ user: boss, perms: "owner" }])
    await mute(boss, acme, new Date(Date.now() - 60_000))
    await mute(boss, other)
    const order = await w.order("mu2", { customer, org: acme })

    await notificationService.createOrderNotification(order)

    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_create (order:mu2)",
        "push    push:boss [order] New Order Created",
        "shadow  order.created ok",
      ]
    `)
  })

  it("events on notify(): a bid on a muted org's listing is in-app only", async () => {
    const bidder = await w.user("bidder")
    const trader = await w.user("trader")
    const acme = await w.org("acme", [{ user: trader, perms: ["manage_market"] }])
    await mute(trader, acme)
    const bid = {
      bid_id: "00000000-0000-4000-8999-000000000b9d",
      user_bidder_id: bidder.user_id,
      contractor_bidder_id: null,
      listing_id: "00000000-0000-4000-8999-0000000001a9",
      bid: 1500,
      timestamp: new Date("2026-10-20T00:00:00Z"),
    } as never
    w.nameId("00000000-0000-4000-8999-000000000b9d", "bid:b9")
    const listing = {
      type: "unique",
      listing: {
        listing_id: "00000000-0000-4000-8999-0000000001a9",
        sale_type: "auction",
        price: 1000,
        user_seller_id: null,
        contractor_seller_id: acme.contractor_id,
      },
      details: { title: "Auctioned Gladius" },
      images: [],
    } as never

    await notificationService.createMarketBidNotification(listing, bid)

    expect(w.summary(await w.observe()).filter((l) => !l.startsWith("webhook"))).toMatchInlineSnapshot(`
      [
        "in_app  user:trader market_item_bid (bid:b9)",
      ]
    `)
  })
})

describe("per-org in-app / Discord DM preferences", () => {
  it("an org row overrides the personal row for that org only", async () => {
    const trader = await w.user("trader")
    const acme = await w.org("acme", [{ user: trader, perms: ["manage_market"] }])
    await w.channelPref(trader, "market_item_bid", "discord", false)
    await getKnex()("notification_channel_org_preferences").insert({
      user_id: trader.user_id,
      action_type_id: (await getKnex()("notification_actions").where({ action: "market_item_bid" }).first()).action_type_id,
      channel: "discord",
      contractor_id: acme.contractor_id,
      enabled: true,
    })
    const def = eventDefinition("market.bid")
    const personal = { userId: trader.user_id, contractorId: null }
    const org = { userId: trader.user_id, contractorId: acme.contractor_id }
    const m = await resolvePreferences(def, [personal, org], ["discord_dm"])
    expect([...m.values()].map((p) => p.discord_dm)).toEqual([false, true])
  })
})

describe("reviews on an unassigned org order", () => {
  it("a customer's review goes to the org's manage_orders members", async () => {
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const member = await w.user("member")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: member, perms: [] },
    ])
    const order = await w.order("ur", { customer, org: acme, status: "fulfilled" })
    const [review] = await getKnex()("order_reviews")
      .insert({ order_id: order.order_id, user_author: customer.user_id, rating: 5, content: "Great", role: "customer" })
      .returning("*")
    w.nameId(review.review_id, "review:ur")

    await notificationService.createOrderReviewNotification(review)

    expect(w.summary(await w.observe()).filter((l) => !l.startsWith("webhook"))).toMatchInlineSnapshot(`
      [
        "in_app  user:boss order_review (review:ur)",
        "push    push:boss [order_review] New Review",
      ]
    `)
  })
})

describe("org.member_joined", () => {
  it("members with manage_invites, in-app only by default; the new member is not notified", async () => {
    const boss = await w.user("boss")
    const recruiter = await w.user("recruiter")
    const member = await w.user("member")
    const newbie = await w.user("newbie")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: recruiter, perms: ["manage_invites"] },
      { user: member, perms: [] },
      { user: newbie, perms: ["manage_invites"] },
    ])

    await notificationService.createOrgMemberJoinedNotification(
      { contractor_id: acme.contractor_id, spectrum_id: acme.spectrum_id, name: "Org acme" },
      newbie.user_id,
    )

    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:boss org_member_joined (org:acme)",
        "in_app  user:recruiter org_member_joined (org:acme)",
      ]
    `)
  })
})

describe("contract alerts: org subscriptions need manage_orders", () => {
  it("a member without manage_orders gets no alert through the org subscription", async () => {
    const { contractAlertRecipients } = await import("../../contracts/public-contract-alerts.js")
    const customer = await w.user("customer")
    const boss = await w.user("boss")
    const member = await w.user("member")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: member, perms: [] },
    ])
    for (const u of [boss, member]) {
      await getKnex()("contract_alert_subscriptions").insert({ user_id: u.user_id, contractor_id: acme.contractor_id, kinds: null })
    }
    const got = await contractAlertRecipients({ customer_id: customer.user_id, kind: "Escort" } as never)
    expect(got.map((r) => w.label(r.userId))).toEqual(["user:boss"])
  })
})

describe("admin alert org_owners", () => {
  it("matches each org's owner role, whatever it is called", async () => {
    const boss = await w.user("boss")
    const clerk = await w.user("clerk")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: clerk, perms: ["manage_orders"] },
    ])
    await getKnex()("contractors")
      .where({ contractor_id: acme.contractor_id })
      .update({ owner_role: acme.roles.get("owner") })
    const got = (await getUsersForAlertTarget("org_owners")).map((id) => w.label(id))
    expect(got).toContain("user:boss")
    expect(got).not.toContain("user:clerk")
  })
})

describe("dedupe keys (cutover)", () => {
  it("each status change and each counter offer is its own occurrence", async () => {
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const order = await w.order("dk", { customer, assigned: seller })
    const a = plans.orderStatusPlans(order, "in-progress", seller.user_id)[0].opts.dedupeKey
    const b = plans.orderStatusPlans(order, "in-progress", seller.user_id)[0].opts.dedupeKey
    expect(a).not.toEqual(b)

    const session = await w.offerSession("dk", { customer, assigned: seller })
    const first = (await plans.offerPlans(session, "counteroffer"))[0]
    await getKnex()("order_offers").insert({
      session_id: session.id,
      kind: "Delivery",
      cost: 30000,
      title: "Counter",
      description: "Counter",
      actor_id: seller.user_id,
      // Later than the first offer (the harness clock is fixed).
      timestamp: new Date("2100-01-01T00:00:00Z"),
    })
    const second = (await plans.offerPlans(session, "counteroffer"))[0]
    expect(first.opts.dedupeKey).not.toEqual(second.opts.dedupeKey)
    // The counter's author is the actor (here the seller, who is not notified).
    expect(w.label(second.opts.actorId)).toBe("user:seller")
  })
})
