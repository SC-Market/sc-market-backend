/**
 * Characterization: invites, admin alerts, DM reminders, email verification
 * and price (watchlist) alerts as they behave today (see orders.char.test.ts).
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { notificationService } from "../notification.service.js"
import { processDmReminders } from "../../dm-reminders/dm-reminder.service.js"
import { emailService } from "../../email/email.service.js"
import { checkWatchlistMatches } from "../../watchlist/watchlist.service.js"
import { getKnex } from "../../../clients/database/knex-db.js"

describe("contractor_invite (9)", () => {
  it("invitee gets in-app + push; email is never sent even when opted in", async () => {
    const boss = await w.user("boss")
    const invitee = await w.user("invitee")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    await w.emailOptIn(invitee, ["contractor_invite"])
    const [invite] = await getKnex()("contractor_invites")
      .insert({ contractor_id: acme.contractor_id, user_id: invitee.user_id, message: "Join us" })
      .returning("*")
    w.nameId(invite.invite_id, "invite:1")

    await notificationService.createContractorInviteNotification(invite)

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:invitee contractor_invite (invite:1)",
        "push    push:invitee [contractor_invite] Contractor Invitation",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("push preference off", async () => {
    const boss = await w.user("boss")
    const invitee = await w.user("invitee")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    await w.pushPref(invitee, "contractor_invite", false)
    const [invite] = await getKnex()("contractor_invites")
      .insert({ contractor_id: acme.contractor_id, user_id: invitee.user_id })
      .returning("*")
    w.nameId(invite.invite_id, "invite:2")
    await notificationService.createContractorInviteNotification(invite)
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:invitee contractor_invite (invite:2)",
      ]
    `)
  })
})

describe("admin_alert (21)", () => {
  async function alert(target_type: string, created_by: string, target_contractor_id?: string) {
    const [row] = await getKnex()("admin_alerts")
      .insert({ title: "Maintenance", content: "Down at 10:00", link: "https://sc-market.space/news", target_type, created_by, target_contractor_id: target_contractor_id ?? null })
      .returning("*")
    w.nameId(row.alert_id, `alert:${target_type}`)
    return row
  }

  it("all_users: everyone not banned, including the admin; push only (bulk path); no email", async () => {
    const admin = await w.user("admin", { role: "admin" })
    const a = await w.user("alice")
    const b = await w.user("bob")
    await w.emailOptIn(a, ["admin_alert"])
    await w.pushPref(b, "admin_alert", false)
    await getKnex()("accounts").insert({ username: "banned", display_name: "Banned", banned: true, avatar: "5226c767-0599-419b-ae71-a7303c441db0" })

    await notificationService.createAdminAlertNotification(await alert("all_users", admin.user_id))

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:admin admin_alert (alert:all_users)",
        "in_app  user:alice admin_alert (alert:all_users)",
        "in_app  user:bob admin_alert (alert:all_users)",
        "push    push:admin [admin_alert] Maintenance",
        "push    push:alice [admin_alert] Maintenance",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("specific org: members of that org", async () => {
    const admin = await w.user("admin", { role: "admin" })
    const boss = await w.user("boss")
    const member = await w.user("member")
    const outsider = await w.user("outsider")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: member, perms: [] },
    ])
    await w.org("other", [{ user: outsider, perms: "owner" }])
    await notificationService.createAdminAlertNotification(
      await alert("specific_org", admin.user_id, acme.contractor_id),
    )
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "in_app  user:boss admin_alert (alert:specific_org)",
        "in_app  user:member admin_alert (alert:specific_org)",
        "push    push:boss [admin_alert] Maintenance",
        "push    push:member [admin_alert] Maintenance",
      ]
    `)
  })
})

describe("dm_reminder (82)", () => {
  async function unreadMessage(name: string, recipient: w.SeededUser, author: w.SeededUser, hoursAgo: number) {
    const order = await w.order(name, { customer: author, assigned: recipient })
    const db = getKnex()
    const [obj] = await db("notification_object")
      .insert({ action_type_id: 81, entity_id: order.order_id, timestamp: db.raw(`NOW() - INTERVAL '${hoursAgo} hours'`) })
      .returning("notification_object_id")
    await db("notification_change").insert({ notification_object_id: obj.notification_object_id, actor_id: author.user_id })
    await db("notification").insert({ notification_object_id: obj.notification_object_id, notifier_id: recipient.user_id, read: false })
  }

  it("opted-in user with a >24 h unread message: one email per run (rendering today)", async () => {
    const author = await w.user("author")
    const optedIn = await w.user("optedin")
    const notOptedIn = await w.user("quiet")
    const unverified = await w.user("unverified", { email: "unverified" })
    await w.emailOptIn(optedIn, ["dm_reminder"])
    await w.emailOptIn(unverified, ["dm_reminder"])
    await unreadMessage("old", optedIn, author, 30)
    await unreadMessage("recent", optedIn, author, 2)
    await unreadMessage("quiet", notOptedIn, author, 30)
    await unreadMessage("unv", unverified, author, 30)

    await processDmReminders()
    const first = await w.observe()
    expect(w.summary(first)).toMatchInlineSnapshot(`
      [
        "in_app  user:optedin order_message (order:old)",
        "in_app  user:optedin order_message (order:recent)",
        "in_app  user:quiet order_message (order:quiet)",
        "in_app  user:unverified order_message (order:unv)",
        "ERROR   Failed to render email template: dm-reminder",
        "ERROR   DM reminder: failed to send email",
      ]
    `)
    expect(first).toMatchSnapshot()
  })

  it("runs every 6 h: a second run re-sends to the same user", async () => {
    const author = await w.user("author")
    const optedIn = await w.user("optedin")
    await w.emailOptIn(optedIn, ["dm_reminder"])
    await unreadMessage("old", optedIn, author, 30)

    await processDmReminders()
    await processDmReminders()
    const obs = await w.observe()
    expect({ errors: obs.errors.length, emails: obs.email.length }).toMatchInlineSnapshot(`
      {
        "emails": 0,
        "errors": 4,
      }
    `)
  })
})

describe("email verification (transactional)", () => {
  it("queued, then sent by the consumer with a token link; unsubscribe link points at /settings?tab=email", async () => {
    const u = await w.user("newbie", { email: "unverified" })
    await emailService.sendVerificationEmail(u.user_id, u.email!)
    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "email   newbie@example.test Verify Your Email Address - SC Market",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })
})

describe("price_alert (83, watchlist)", () => {
  async function scene() {
    const watcher = await w.user("watcher")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    const item = await w.gameItem("Laranite")
    return { watcher, seller, shop, item }
  }

  it("matching public listing: site, push, Discord DM by default; email only when opted in", async () => {
    const { watcher, seller, shop, item } = await scene()
    const other = await w.user("other")
    await w.emailOptIn(other, ["price_alert"])
    await w.watch("by-item", watcher, { query: "laranite", maxPrice: 5000, gameItem: item })
    await w.watch("by-text", other, { query: "laranite ore", maxPrice: 5000 })
    await w.watch("too-cheap", other, { query: "laranite", maxPrice: 100 })
    const { listing_id } = await w.listing("lara", {
      shop,
      seller: { user: seller },
      title: "Laranite Ore 50 SCU",
      price: 4200,
      gameItem: item,
    })

    await checkWatchlistMatches(listing_id)

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:watcher price_alert (listing:lara)",
        "in_app  user:other price_alert (listing:lara)",
        "push    push:other [price_alert] Price Alert: Laranite Ore 50 SCU",
        "push    push:watcher [price_alert] Price Alert: Laranite Ore 50 SCU",
        "email   other@example.test Price Alert: Laranite Ore 50 SCU is 4,200 aUEC",
        "discord POST /users/@me/channels",
        "discord POST /channels/dm-discord:watcher/messages",
        "discord POST /users/@me/channels",
        "discord POST /channels/dm-discord:other/messages",
      ]
    `)
    expect(obs).toMatchSnapshot()
    const stamped = await getKnex()("watchlist_items").whereNotNull("last_notified_at").count("* as n")
    expect(Number(stamped[0].n)).toBe(2)
  })

  it("per-channel toggles: site and Discord off, push off, email on", async () => {
    const { watcher, seller, shop, item } = await scene()
    await w.channelPref(watcher, "price_alert", "site", false)
    await w.channelPref(watcher, "price_alert", "discord", false)
    await w.pushPref(watcher, "price_alert", false)
    await w.emailOptIn(watcher, ["price_alert"])
    await w.watch("t", watcher, { query: "laranite", maxPrice: 5000, gameItem: item })
    const { listing_id } = await w.listing("lara", { shop, seller: { user: seller }, title: "Laranite", price: 4000, gameItem: item })
    await checkWatchlistMatches(listing_id)
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`
      [
        "email   watcher@example.test Price Alert: Laranite is 4,000 aUEC",
      ]
    `)
  })

  it("cooldown, private listing and placeholder price: nothing sent", async () => {
    const { watcher, seller, shop, item } = await scene()
    await w.watch("cool", watcher, { query: "laranite", maxPrice: 5000, gameItem: item, lastNotifiedAt: new Date(Date.now() - 10 * 60_000) })
    const a = await w.listing("a", { shop, seller: { user: seller }, title: "Laranite", price: 4000, gameItem: item })
    await checkWatchlistMatches(a.listing_id)
    await getKnex()("watchlist_items").update({ last_notified_at: null })
    const b = await w.listing("b", { shop, seller: { user: seller }, title: "Laranite", price: 4000, gameItem: item, visibility: "private" })
    const c = await w.listing("c", { shop, seller: { user: seller }, title: "Laranite", price: 1, gameItem: item })
    await checkWatchlistMatches(b.listing_id)
    await checkWatchlistMatches(c.listing_id)
    expect(w.summary(await w.observe())).toMatchInlineSnapshot(`[]`)
  })

  it("Discord DM failure is swallowed; the cooldown is still stamped", async () => {
    const { watcher, seller, shop, item } = await scene()
    const { recorder } = await import("../../../test-utils/notif-char/fakes.js")
    recorder().discordFailures.set("/users/@me/channels", { status: 403, code: 50007 })
    await w.pushPref(watcher, "price_alert", false)
    await w.channelPref(watcher, "price_alert", "site", false)
    await w.watch("t", watcher, { query: "laranite", maxPrice: 5000, gameItem: item })
    const { listing_id } = await w.listing("lara", { shop, seller: { user: seller }, title: "Laranite", price: 4000, gameItem: item })
    await checkWatchlistMatches(listing_id)
    const obs = await w.observe()
    const row = await getKnex()("watchlist_items").first("last_notified_at")
    expect({ summary: w.summary(obs), stamped: row.last_notified_at !== null }).toMatchInlineSnapshot(`
      {
        "stamped": true,
        "summary": [
          "discord POST /users/@me/channels",
          "ERROR   Failed to send DM to user discord:watcher: Error: Discord API 403 (50007)",
        ],
      }
    `)
  })
})

describe("transport failures", () => {
  it("push endpoint gone (410): the subscription is deleted; other devices still get it", async () => {
    const { recorder } = await import("../../../test-utils/notif-char/fakes.js")
    const boss = await w.user("boss")
    const invitee = await w.user("invitee", { push: 2 })
    recorder().pushFailures.set(invitee.endpoints[0], 410)
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    const [invite] = await getKnex()("contractor_invites")
      .insert({ contractor_id: acme.contractor_id, user_id: invitee.user_id })
      .returning("*")
    w.nameId(invite.invite_id, "invite:3")
    await notificationService.createContractorInviteNotification(invite)
    const subs = await getKnex()("push_subscriptions").where({ user_id: invitee.user_id }).pluck("endpoint")
    expect({ summary: w.summary(await w.observe()), remaining: subs.map((s: string) => s.split("/").pop()) }).toMatchInlineSnapshot(`
      {
        "remaining": [
          "invitee-1",
        ],
        "summary": [
          "in_app  user:invitee contractor_invite (invite:3)",
          "push    push:invitee#1 [contractor_invite] Contractor Invitation",
        ],
      }
    `)
  })

  it("webhook answering 404: logged, no retry, nothing recorded on the webhook", async () => {
    const { recorder } = await import("../../../test-utils/notif-char/fakes.js")
    const customer = await w.user("customer")
    const seller = await w.user("seller")
    const shop = await w.shop("seller-shop", { user: seller })
    const hook = await w.webhook("dead-hook", shop, ["order_create"])
    recorder().fetchStatus.set(hook.webhook_url, 404)
    const order = await w.order("wh", { customer, assigned: seller, shop })
    await notificationService.createOrderNotification(order)
    const row = await getKnex()("notification_webhooks").where({ webhook_id: hook.webhook_id }).first("state")
    const obs = await w.observe()
    expect({ webhooks: obs.webhooks.length, errors: obs.errors, state: row.state }).toMatchInlineSnapshot(`
      {
        "errors": [
          "Failed to send order webhook Error: Webhook request failed with status 404: fake",
        ],
        "state": "ok",
        "webhooks": 1,
      }
    `)
  })

  it("email queue unavailable: falls back to sending directly", async () => {
    const seller = await w.user("seller")
    const customer = await w.user("customer")
    await w.emailOptIn(seller, ["order_assigned"])
    const order = await w.order("fb", { customer, assigned: seller })
    const saved = process.env.EMAIL_QUEUE_URL
    process.env.EMAIL_QUEUE_URL = "https://sqs.us-east-2.amazonaws.com/000000000000/missing"
    const { recorder } = await import("../../../test-utils/notif-char/fakes.js")
    const sqs = await import("@aws-sdk/client-sqs")
    const send = sqs.SQSClient.prototype.send
    sqs.SQSClient.prototype.send = async function (cmd: never) {
      if (cmd instanceof sqs.SendMessageCommand) throw new Error("SQS down")
      return send.call(this, cmd)
    }
    try {
      await notificationService.createOrderAssignedNotification(order)
    } finally {
      sqs.SQSClient.prototype.send = send
      process.env.EMAIL_QUEUE_URL = saved
    }
    expect({ sent: recorder().email.map((e) => e.subject), errors: (await w.observe()).errors }).toMatchInlineSnapshot(`
      {
        "errors": [
          "Failed to queue email notification",
          "Failed to queue notification email, falling back to direct send",
        ],
        "sent": [
          "Order Assigned",
        ],
      }
    `)
  })
})
