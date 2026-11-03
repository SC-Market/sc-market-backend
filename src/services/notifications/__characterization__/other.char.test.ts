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
  it("invitee gets in-app, push and email (owner decision: invites email by default)", async () => {
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
        "email   invitee@example.test Contractor Invitation",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("email opt-out is respected", async () => {
    const boss = await w.user("boss")
    const invitee = await w.user("invitee")
    const acme = await w.org("acme", [{ user: boss, perms: "owner" }])
    await w.emailPref(invitee, "contractor_invite", false)
    const [invite] = await getKnex()("contractor_invites")
      .insert({ contractor_id: acme.contractor_id, user_id: invitee.user_id })
      .returning("*")
    w.nameId(invite.invite_id, "invite:3")

    await notificationService.createContractorInviteNotification(invite)

    expect(w.summary(await w.observe({ drainEmail: true }))).toMatchInlineSnapshot(`
      [
        "in_app  user:invitee contractor_invite (invite:3)",
        "push    push:invitee [contractor_invite] Contractor Invitation",
      ]
    `)
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
        "email   invitee@example.test Contractor Invitation",
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

  it("all_users: everyone not banned except the admin who posted it; push mandatory, email respects opt-outs", async () => {
    const admin = await w.user("admin", { role: "admin" })
    const a = await w.user("alice")
    const b = await w.user("bob")
    await w.emailOptIn(a, ["admin_alert"])
    await w.pushPref(b, "admin_alert", false)
    await w.emailPref(b, "admin_alert", false)
    await getKnex()("accounts").insert({ username: "banned", display_name: "Banned", banned: true, avatar: "5226c767-0599-419b-ae71-a7303c441db0" })

    await notificationService.createAdminAlertNotification(await alert("all_users", admin.user_id))

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:alice admin_alert (alert:all_users)",
        "in_app  user:bob admin_alert (alert:all_users)",
        "push    push:alice [admin_alert] Maintenance",
        "push    push:bob [admin_alert] Maintenance",
        "email   alice@example.test Admin Alert",
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
        "email   boss@example.test Admin Alert",
        "email   member@example.test Admin Alert",
      ]
    `)
  })
})

describe("dm_reminder (82): unread order/offer message reminder", () => {
  // Tests see every message as post-cutover (the real cutover is the deploy).
  const run = () => processDmReminders({ cutover: new Date(0) })

  async function unreadMessage(name: string, recipient: w.SeededUser, author: w.SeededUser, hoursAgo: number) {
    const order = await w.order(name, { customer: author, assigned: recipient })
    const db = getKnex()
    const [obj] = await db("notification_object")
      .insert({ action_type_id: 81, entity_id: order.order_id, timestamp: db.raw(`NOW() - INTERVAL '${hoursAgo} hours'`) })
      .returning("notification_object_id")
    await db("notification_change").insert({ notification_object_id: obj.notification_object_id, actor_id: author.user_id })
    await db("notification").insert({ notification_object_id: obj.notification_object_id, notifier_id: recipient.user_id, read: false })
    return { order, objectId: obj.notification_object_id as number }
  }
  const dmSends = (o: w.Observed) =>
    (o.discord as { method: string; route: string }[]).filter((d) => /\/channels\/.+\/messages$/.test(d.route)).length
  /**
   * Pretend `hours` have passed: the reminders (user and conversations) and
   * the messages all move back together, so a reminder still comes after the
   * message it was about.
   */
  async function passTime(hours: number) {
    const db = getKnex()
    const back = (col: string) => db.raw(`?? - INTERVAL '${hours} hours'`, [col])
    await db("dm_reminder_log").update({ last_reminded_at: back("last_reminded_at") })
    await db("dm_reminder_conversations").update({ reminded_at: back("reminded_at") })
    await db("notification_object").update({ timestamp: back("timestamp") })
  }

  // The email goes through notify() and the email queue (owner decision
  // 2026-11-02): the subject is the translated one (email/i18n).
  it("unread for 6 h and less than a day old: email (opted in) and Discord DM (default on)", async () => {
    const author = await w.user("author")
    const emailOnly = await w.user("emailonly", { discord: false })
    const dmUser = await w.user("dmuser", { email: "none" })
    const unverified = await w.user("unverified", { email: "unverified", discord: false })
    await w.emailOptIn(emailOnly, ["dm_reminder"])
    await w.emailOptIn(unverified, ["dm_reminder"])
    await unreadMessage("due", emailOnly, author, 7)
    await unreadMessage("dm", dmUser, author, 7)
    await unreadMessage("recent", dmUser, author, 2) // not unread long enough
    await unreadMessage("stale", dmUser, author, 30) // older than a day: never backfilled
    await unreadMessage("unv", unverified, author, 7) // no channel: unverified email, no Discord

    const stats = await run()
    const obs = await w.observe()
    expect({
      stats,
      emails: (obs.email as { to: string[]; subject: string }[]).map((e) => `${e.to.join(",")} ${e.subject}`),
      dms: dmSends(obs),
      errors: obs.errors,
    }).toMatchInlineSnapshot(`
      {
        "dms": 1,
        "emails": [
          "emailonly@example.test You have an unread message on SC Market",
        ],
        "errors": [],
        "stats": {
          "candidates": 2,
          "capped": 0,
          "discord_failed": 0,
          "discord_sent": 1,
          "email_sent": 1,
          "errors": 0,
          "users": 2,
        },
      }
    `)
  })

  it("messages before the cutover never trigger a reminder", async () => {
    const author = await w.user("author")
    const dmUser = await w.user("dmuser")
    await unreadMessage("before", dmUser, author, 7)
    await processDmReminders({ cutover: new Date(Date.now() + 3600_000) })
    expect(dmSends(await w.observe())).toBe(0)
  })

  it("dedupe: one digest per user per 24 h; a conversation is not reminded again until a new message", async () => {
    const author = await w.user("author")
    const dmUser = await w.user("dmuser")
    const a = await unreadMessage("a", dmUser, author, 7)
    await unreadMessage("b", dmUser, author, 8)

    await run()
    await run() // the next run (30 min later) sends nothing
    const afterTwoRuns = dmSends(await w.observe())

    // A day later, no new message: still nothing.
    await passTime(25)
    await run()
    const afterADay = dmSends(await w.observe())

    // A new message in conversation a (7 h ago, after the aged reminder).
    await getKnex()("notification_object")
      .where({ notification_object_id: a.objectId })
      .update({ timestamp: getKnex().raw(`NOW() - INTERVAL '7 hours'`) })
    await run()
    const reminded = await getKnex()("dm_reminder_conversations").count("* as n").first()
    expect({ afterTwoRuns, afterADay, total: dmSends(await w.observe()), conversations: Number(reminded?.n) })
      .toMatchInlineSnapshot(`
      {
        "afterADay": 1,
        "afterTwoRuns": 1,
        "conversations": 2,
        "total": 2,
      }
    `)
  })

  it("a new message inside the 24 h window waits: at most one reminder per user per day", async () => {
    const author = await w.user("author")
    const dmUser = await w.user("dmuser")
    await unreadMessage("first", dmUser, author, 7)
    await run()
    await unreadMessage("second", dmUser, author, 7)
    await run()
    expect(dmSends(await w.observe())).toBe(1)
  })

  it("quiet if the user has read the message", async () => {
    const author = await w.user("author")
    const dmUser = await w.user("dmuser")
    const { objectId } = await unreadMessage("read", dmUser, author, 7)
    await getKnex()("notification").where({ notification_object_id: objectId }).update({ read: true })
    const stats = await run()
    expect({ candidates: stats.candidates, dms: dmSends(await w.observe()) }).toEqual({ candidates: 0, dms: 0 })
  })

  it("the Discord DM preference and the kill switch turn the DM off", async () => {
    const author = await w.user("author")
    const optedOut = await w.user("optedout")
    await w.channelPref(optedOut, "dm_reminder", "discord", false)
    await unreadMessage("x", optedOut, author, 7)
    await run()
    const afterOptOut = dmSends(await w.observe())

    const other = await w.user("other")
    await unreadMessage("y", other, author, 7)
    process.env.DISCORD_DM_DISABLED_EVENTS = "reminder.unread_messages"
    try {
      await run()
    } finally {
      delete process.env.DISCORD_DM_DISABLED_EVENTS
    }
    expect({ afterOptOut, afterKillSwitch: dmSends(await w.observe()) }).toEqual({ afterOptOut: 0, afterKillSwitch: 0 })
  })

  it("a DM the bot can't deliver (50007) is recorded once and never retried", async () => {
    const author = await w.user("author")
    const dmUser = await w.user("dmuser")
    const { recorder } = await import("../../../test-utils/notif-char/fakes.js")
    recorder().discordFailures.set("/users/@me/channels", { status: 403, code: 50007 })
    await unreadMessage("x", dmUser, author, 7)
    const first = await run()
    const second = await run()
    const deliveries = await getKnex()("notification_deliveries")
      .where({ event_key: "reminder.unread_messages", channel: "discord_dm" })
      .select("status")
    const attempts = (await w.observe()).discord.length
    expect({ first: first.discord_failed, second: second.candidates, attempts, deliveries }).toEqual({
      first: 1,
      second: 0,
      attempts: 1,
      deliveries: [{ status: "failed" }],
    })
  })

  it("per-run cap: the rest wait for the next run", async () => {
    const author = await w.user("author")
    const u1 = await w.user("u1")
    const u2 = await w.user("u2")
    await unreadMessage("m1", u1, author, 8)
    await unreadMessage("m2", u2, author, 7)
    const first = await processDmReminders({ cutover: new Date(0), maxUsers: 1 })
    const second = await processDmReminders({ cutover: new Date(0), maxUsers: 1 })
    expect({ first: [first.users, first.capped], second: [second.users, second.capped] }).toEqual({
      first: [1, 1],
      second: [1, 0],
    })
  })
})

describe("email verification (transactional)", () => {
  it("queued, then sent by the consumer with a token link; no unsubscribe link (transactional), only Manage Preferences", async () => {
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

  it("only Discord DM enabled and it fails: recorded as failed, the cooldown is not started", async () => {
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
        "stamped": false,
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
          "email   invitee@example.test Contractor Invitation",
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
