/**
 * Characterization: admin alert delivery channels (admin_alerts.channels).
 * The admin picks the channels; the chosen ones ignore user opt-outs and the
 * others never send. Test accounts never receive real alerts.
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { notificationService } from "../notification.service.js"
import { getKnex } from "../../../clients/database/knex-db.js"
import { getAlertAudienceCounts } from "../../../api/routes/v1/admin/database.js"
import { parseAlertChannels } from "../../../api/routes/v1/admin/alerts.js"

async function alert(created_by: string, channels: string[], target_type = "all_users", target_contractor_id?: string) {
  const [row] = await getKnex()("admin_alerts")
    .insert({
      title: "Maintenance",
      content: "Down at 10:00",
      link: "https://sc-market.space/news",
      target_type,
      created_by,
      target_contractor_id: target_contractor_id ?? null,
      channels,
    })
    .returning("*")
  w.nameId(row.alert_id, `alert:${channels.join("+")}`)
  return row
}

/** Everyone opted out of every channel: chosen channels still deliver. */
async function optOutEverything(u: w.SeededUser) {
  await w.pushPref(u, "admin_alert", false)
  await w.emailPref(u, "admin_alert", false)
  await w.channelPref(u, "admin_alert", "discord", false)
  await w.channelPref(u, "admin_alert", "site", false)
}

const COMBOS: string[][] = [
  ["in_app"],
  ["in_app", "push"],
  ["in_app", "email"],
  ["in_app", "discord_dm"],
  ["in_app", "push", "email"],
  ["in_app", "push", "email", "discord_dm"],
]

describe("admin alert channels", () => {
  it.each(COMBOS.map((c) => [c.join("+"), c]))(
    "%s: exactly those channels, opt-outs ignored",
    async (_name, channels) => {
      const admin = await w.user("admin", { role: "admin" })
      const alice = await w.user("alice")
      await optOutEverything(alice)

      await notificationService.createAdminAlertNotification(await alert(admin.user_id, channels as string[]))

      const obs = await w.observe()
      const lines = w.summary(obs).map((l) => l.split(" ")[0])
      const dms = (obs.discord as { route: string }[]).filter((d) => d.route.includes("/messages")).length
      expect({ channels: [...new Set(lines)].filter((l) => l !== "discord").sort(), dms }).toEqual({
        channels: (channels as string[])
          .filter((c) => c !== "discord_dm")
          .sort(),
        dms: (channels as string[]).includes("discord_dm") ? 1 : 0,
      })
    },
  )

  it("all four channels, full record", async () => {
    const admin = await w.user("admin", { role: "admin" })
    const alice = await w.user("alice")
    await optOutEverything(alice)

    await notificationService.createAdminAlertNotification(
      await alert(admin.user_id, ["in_app", "push", "email", "discord_dm"]),
    )

    const obs = await w.observe()
    expect({
      summary: w.summary(obs),
      dm: (obs.discord as { route: string }[]).map((d) => d.route),
    }).toMatchInlineSnapshot(`
      {
        "dm": [
          "/users/@me/channels",
          "/channels/dm-discord:alice/messages",
        ],
        "summary": [
          "in_app  user:alice admin_alert (alert:in_app+push+email+discord_dm)",
          "push    push:alice [admin_alert] Maintenance",
          "email   alice@example.test Admin Alert",
          "discord POST /users/@me/channels",
          "discord POST /channels/dm-discord:alice/messages",
        ],
      }
    `)
  })

  it("isolation: delivered while acting as a test account, it reaches no real user on any channel", async () => {
    // Test accounts can't be admins (accounts_test_account_is_user), so this is
    // the guard itself: delivery in a test account's request context.
    const admin = await w.user("admin", { role: "admin" })
    const tester = await w.user("~tester", { isTest: true })
    await w.user("real")
    const row = await alert(admin.user_id, ["in_app", "push", "email", "discord_dm"])
    const { withRequestContext } = await import("../../../api/util/request-context.js")
    const profileDb = await import("../../../api/routes/v1/profiles/database.js")
    const req = { user: await profileDb.getUser({ user_id: tester.user_id }) } as never

    await withRequestContext(req, () => notificationService.createAdminAlertNotification(row))

    const lines = w.summary(await w.observe())
    expect(lines.filter((l) => l.includes("real"))).toEqual([])
    expect(lines).toMatchInlineSnapshot(`
      [
        "in_app  user:~tester admin_alert (alert:in_app+push+email+discord_dm)",
        "push    push:~tester [admin_alert] Maintenance",
        "email   ~tester@example.test Admin Alert",
      ]
    `)
  })
})

describe("admin alert audience preview", () => {
  it("counts recipients, verified emails and linked Discord, without the admin", async () => {
    const admin = await w.user("admin", { role: "admin" })
    await w.user("alice")
    await w.user("bob", { discord: false })
    await w.user("~tester", { isTest: true })
    const counts = await getAlertAudienceCounts("all_users", undefined, admin.user_id)
    expect(counts).toMatchInlineSnapshot(`
      {
        "discord_linked": 2,
        "recipients": 3,
        "verified_emails": 3,
      }
    `)
  })
})

describe("parseAlertChannels", () => {
  it("defaults to in-app + push, always adds in-app, rejects unknown channels", () => {
    expect(parseAlertChannels(undefined)).toEqual({ channels: ["in_app", "push"] })
    expect(parseAlertChannels(["email"])).toEqual({ channels: ["in_app", "email"] })
    expect(parseAlertChannels(["discord_dm", "push", "in_app"])).toEqual({ channels: ["in_app", "push", "discord_dm"] })
    expect(parseAlertChannels(["sms"])).toHaveProperty("error")
    expect(parseAlertChannels("push")).toHaveProperty("error")
  })
})
