/**
 * Owner decision (2026-11-01): site-wide announcement emails (admin alerts)
 * respect the user's email opt-outs and unsubscribes. Only legal, security
 * and dispute emails may ignore them (catalog emailMandatory; none today).
 * In-app, push and Discord DM announcements stay mandatory.
 *
 * Covers the policy (catalog, settings matrix, unsubscribe scope), the
 * dispatcher's preference resolution and the email service's send-time
 * check, against a fake knex and mocked email transports.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  sendEmailViaSES: vi.fn(),
  getEmailPreference: vi.fn(),
  isEmailEnabled: vi.fn(),
}))

/** Just enough of knex: where (object or column/value) / whereIn / whereNull / select / first. */
vi.mock("../../clients/database/knex-db.js", () => {
  const builder = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    const rows = () => (h.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
    const b: Record<string, unknown> = {
      where(col: string | Row, value?: unknown) {
        if (typeof col === "object") {
          for (const [k, v] of Object.entries(col)) filters.push((r) => r[k] === v)
        } else if (typeof col === "string") {
          filters.push((r) => r[col] === value)
        }
        return b
      },
      whereIn(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]))
        return b
      },
      whereNull(col: string) {
        filters.push((r) => r[col] === null || r[col] === undefined)
        return b
      },
      async select() {
        return rows()
      },
      async first() {
        return rows()[0]
      },
    }
    return b
  }
  return { getKnex: () => builder, database: { setStrategy: () => {} } }
})
vi.mock("../../clients/aws/ses.js", () => ({ sendEmailViaSES: h.sendEmailViaSES }))
vi.mock("../test-accounts/isolation.js", () => ({
  deliverableRecipients: async (ids: string[]) => ids,
}))
vi.mock("../../api/routes/v1/email/user-email-database.js", () => ({
  isAddressUndeliverable: async () => false,
  getPrimaryEmail: async (userId: string) => ({
    email_id: "em1",
    user_id: userId,
    email: "alice@example.test",
    email_verified: true,
    is_primary: true,
  }),
}))
vi.mock("../../api/routes/v1/email/database.js", () => ({
  getEmailPreference: h.getEmailPreference,
  isEmailEnabled: h.isEmailEnabled,
}))
vi.mock("../../api/routes/v1/notifications/database.js", () => ({
  getNotificationActionByName: async (action: string) => ({ action_type_id: action === "admin_alert" ? "21" : "1" }),
}))
vi.mock("../email/defaults-notice.js", () => ({
  pendingDefaultsNotice: async () => null,
  markDefaultsNoticeShown: async () => {},
}))
vi.mock("../email/email-payload-formatters.js", () => ({
  formatAdminAlertEmailData: async () => ({
    userName: "alice",
    userDisplayName: "Alice",
    locale: "en",
    notificationType: "admin_alert",
    notificationTitle: "Admin Alert",
    notificationBody: "Down at 10:00",
    actionUrl: "https://sc-market.space/news",
    siteName: "SC Market",
    siteUrl: "https://sc-market.space",
    preferencesUrl: "https://sc-market.space/settings?tab=email",
    alert: { alert_id: "a1", title: "Maintenance", content: "Down at 10:00" },
  }),
}))

const { env } = await import("../../config/env.js")
const { CATALOG, CATEGORIES, emailDefaultFor, isMandatoryOn } = await import("./catalog.js")
const { editableChannels } = await import("./preference-matrix.js")
const { resolvePreferences } = await import("./preferences.js")
const { unsubscribeScopeFor } = await import("../email/unsubscribe-token.js")
const { actionsForScope } = await import("../email/unsubscribe.js")
const { emailService } = await import("../email/email.service.js")

const ALERT = CATALOG["admin.alert"]
const CHANNELS = ["in_app", "push", "email", "discord_dm"] as const

beforeEach(() => {
  vi.clearAllMocks()
  h.tables = {
    notification_actions: [{ action: "admin_alert", action_type_id: 21 }],
    email_notification_preferences: [],
    push_notification_preferences: [],
    notification_channel_preferences: [],
    notification_channel_org_preferences: [],
  }
  delete env.EMAIL_QUEUE_URL
  env.EMAIL_FROM_ADDRESS = "noreply@sc-market.space"
  env.SESSION_SECRET = "s".repeat(40)
  h.sendEmailViaSES.mockResolvedValue("msg-1")
})

describe("policy", () => {
  it("announcement email is not mandatory and is on by default; the other channels stay mandatory", () => {
    expect(emailDefaultFor("admin_alert")).toEqual({ mandatory: false, defaultOn: true })
    expect(CHANNELS.filter((c) => isMandatoryOn(ALERT, c))).toEqual(["in_app", "push", "discord_dm"])
  })

  it("only email can be switched in the settings matrix", () => {
    expect(editableChannels("admin.alert")).toEqual(["email"])
  })

  it("announcement emails carry an unsubscribe link, and 'unsubscribe from all' includes them", () => {
    expect(unsubscribeScopeFor("admin_alert")).toEqual({ kind: "category", category: "announcements" })
    expect(actionsForScope({ kind: "all" })).toContain("admin_alert")
  })

  it("no category's email ignores opt-outs today (reserved for legal, security and dispute emails)", () => {
    expect(Object.entries(CATEGORIES).filter(([, c]) => c.emailMandatory)).toEqual([])
  })
})

describe("dispatcher preference resolution", () => {
  const alice = { userId: "alice", contractorId: null }
  const bob = { userId: "bob", contractorId: null }

  it("email follows the user's row (default on); in-app, push and Discord DM ignore opt-outs", async () => {
    h.tables.email_notification_preferences = [{ user_id: "bob", contractor_id: null, enabled: false, action_type_id: 21 }]
    h.tables.push_notification_preferences = [{ user_id: "bob", contractor_id: null, enabled: false, action_type_id: 21 }]
    h.tables.notification_channel_preferences = [
      { user_id: "bob", channel: "site", enabled: false, action_type_id: 21 },
      { user_id: "bob", channel: "discord", enabled: false, action_type_id: 21 },
    ]
    const prefs = await resolvePreferences(ALERT, [alice, bob], CHANNELS)
    expect(prefs.get("alice|")).toEqual({ in_app: true, push: true, email: true, discord_dm: true })
    expect(prefs.get("bob|")).toEqual({ in_app: true, push: true, email: false, discord_dm: true })
  })
})

describe("email service send-time check", () => {
  const send = () => emailService.sendNotificationEmail("alice", "admin_alert", { alert: {} as never }, true, null, {
    contractorId: null,
  })

  it("does not send an announcement to a user who turned announcement emails off", async () => {
    h.getEmailPreference.mockResolvedValue({ enabled: false })
    expect(await send()).toBe(false)
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
    expect(h.getEmailPreference).toHaveBeenCalledWith("alice", 21, null)
  })

  it("sends it by default, with an unsubscribe link and List-Unsubscribe headers", async () => {
    env.BACKEND_URL = "https://api.sc-market.space"
    h.getEmailPreference.mockResolvedValue(null)
    expect(await send()).toBe(true)
    expect(h.sendEmailViaSES).toHaveBeenCalledTimes(1)
    const [to, , html, text, , , headers] = h.sendEmailViaSES.mock.calls[0]
    expect(to).toBe("alice@example.test")
    expect(text).toMatch(/Unsubscribe:\n\S*\/email\/unsubscribe\//)
    expect(html).toContain("/email/unsubscribe/")
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })
})
