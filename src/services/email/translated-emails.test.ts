/**
 * The translated emails (email-i18n.ts), through the email service's real
 * send-time check, formatter and templates (SES and the database mocked):
 *
 * - account_identity_changed: the security notice an admin's identity change
 *   sends. Mandatory (account category, emailMandatory; owner decision
 *   2026-11-02): sent whatever the email preferences, no unsubscribe link.
 * - dm_reminder: the unread-message reminder, now on the email queue. Opt-in
 *   as before, with the one-click unsubscribe link and headers.
 * - buy_order_filled: a seller filled your buy order. Opt-in, unsubscribable.
 *
 * Both in the user's language (accounts.locale), the 8 site languages.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  sendEmailViaSES: vi.fn(),
  getEmailPreference: vi.fn(),
  isEmailEnabled: vi.fn(),
  locale: "en" as string,
}))

vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
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
    email_bounced_at: null,
  }),
}))
vi.mock("../../api/routes/v1/email/database.js", () => ({
  getEmailPreference: h.getEmailPreference,
  isEmailEnabled: h.isEmailEnabled,
}))
vi.mock("../../api/routes/v1/notifications/database.js", () => ({
  getNotificationActionByName: async (action: string) => ({
    action_type_id: action === "dm_reminder" ? "82" : action === "buy_order_filled" ? "95" : "90",
  }),
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUser: async ({ user_id }: { user_id: string }) => ({
    user_id,
    username: "alice",
    display_name: "Alice",
    locale: h.locale,
  }),
}))
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: {} }))
vi.mock("./defaults-notice.js", () => ({
  pendingDefaultsNotice: async () => null,
  markDefaultsNoticeShown: async () => {},
}))

const { env } = await import("../../config/env.js")
const { emailService } = await import("./email.service.js")
const { emailDefaultFor } = await import("../notify/catalog.js")
const { unsubscribeScopeFor } = await import("./unsubscribe-token.js")
const { EMAIL_LOCALES, emailLocale, identityEmailText, reminderEmailText } = await import("./email-i18n.js")
const { IDENTITY_ACTION_KINDS } = await import("../identity-admin/identity-admin.service.js")

beforeEach(() => {
  vi.clearAllMocks()
  h.locale = "en"
  delete env.EMAIL_QUEUE_URL
  env.EMAIL_FROM_ADDRESS = "noreply@sc-market.space"
  env.SESSION_SECRET = "s".repeat(40)
  env.BACKEND_URL = "https://api.sc-market.space"
  h.sendEmailViaSES.mockResolvedValue("msg-1")
})

function sent() {
  expect(h.sendEmailViaSES).toHaveBeenCalledTimes(1)
  const [to, subject, html, text, , , headers] = h.sendEmailViaSES.mock.calls[0]
  return { to, subject, html, text, headers: headers ?? {} }
}

const identity = (kind: string, notice: Record<string, string> = {}) =>
  emailService.sendNotificationEmail("alice", "account_identity_changed", { identity: { kind, notice } }, true, null, {
    contractorId: null,
  })

describe("account identity security email", () => {
  it("is mandatory: no unsubscribe scope, sent even with email turned off", async () => {
    expect(emailDefaultFor("account_identity_changed")).toEqual({ mandatory: true, defaultOn: false })
    expect(unsubscribeScopeFor("account_identity_changed")).toBeNull()
    h.isEmailEnabled.mockResolvedValue(false)
    h.getEmailPreference.mockResolvedValue({ enabled: false })

    expect(await identity("discord_unlinked")).toBe(true)
    const m = sent()
    expect(m.to).toBe("alice@example.test")
    expect(m.subject).toBe("Discord was unlinked from your SC Market account")
    expect(m.text).toContain("An admin unlinked Discord from your account.")
    expect(m.text).toContain("This is a security notice")
    expect(m.html).not.toContain("/email/unsubscribe/")
    expect(m.text).not.toMatch(/Unsubscribe/)
    expect(m.headers).not.toHaveProperty("List-Unsubscribe")
    expect(h.isEmailEnabled).not.toHaveBeenCalled()
  })

  it("is in the user's language, with their new username", async () => {
    h.locale = "de"
    expect(await identity("username_released", { old_username: "Old", new_username: "user_1a2b3c4d" })).toBe(true)
    const m = sent()
    expect(m.subject).toBe("Dein SC-Market-Benutzername wurde geändert")
    expect(m.text).toContain("Hallo Alice,")
    expect(m.text).toContain("Dein Benutzername ist jetzt user_1a2b3c4d.")
    expect(m.text).toContain("Einstellungen öffnen:\nhttps://")
    expect(m.text).toContain("Einstellungen verwalten:")
    expect(m.html).toContain('<html lang="de">')
  })

  it("a deactivated account gets no Settings button (it can't log in)", async () => {
    expect(await identity("account_deactivated")).toBe(true)
    const m = sent()
    expect(m.subject).toBe("Your SC Market account was deactivated")
    expect(m.html).not.toContain('class="button"')
    expect(m.text).not.toContain("Open Settings")
  })

  it("every kind has its own text in all 8 languages", () => {
    expect(EMAIL_LOCALES).toHaveLength(8)
    for (const locale of EMAIL_LOCALES) {
      const titles = new Set<string>()
      for (const kind of IDENTITY_ACTION_KINDS) {
        const t = identityEmailText(locale, kind, { new_username: "user_x" })
        expect(t.title, `${locale} ${kind}`).toBeTruthy()
        expect(t.body, `${locale} ${kind}`).toBeTruthy()
        titles.add(t.title)
        if (locale !== "en") {
          expect(t.title, `${locale} ${kind}`).not.toBe(identityEmailText("en", kind, {}).title)
        }
      }
      expect(titles.size).toBe(IDENTITY_ACTION_KINDS.length)
    }
    expect(identityEmailText("ja", "username_released", { new_username: "user_x" }).body).toContain("user_x")
  })
})

const reminder = (conversations: number) =>
  emailService.sendNotificationEmail(
    "alice",
    "dm_reminder",
    { reminder: { conversations, url: "https://sc-market.space/messaging" } },
    true,
    null,
    { contractorId: null },
  )

describe("unread-message reminder email", () => {
  it("stays opt-in: not sent without the user's dm_reminder email row", async () => {
    h.isEmailEnabled.mockResolvedValue(false)
    expect(await reminder(2)).toBe(false)
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
    expect(h.isEmailEnabled).toHaveBeenCalledWith("alice", 82, null)
  })

  it("keeps the one-click unsubscribe link and List-Unsubscribe headers", async () => {
    h.isEmailEnabled.mockResolvedValue(true)
    expect(await reminder(3)).toBe(true)
    const m = sent()
    expect(m.subject).toBe("You have unread messages in 3 conversations on SC Market")
    expect(m.text).toContain("3 conversations on SC Market have messages waiting for your reply.")
    expect(m.text).toMatch(/Unsubscribe:\n\S*\/email\/unsubscribe\//)
    expect(m.html).toContain("/email/unsubscribe/")
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })

  it("is in the user's language, footer included", async () => {
    h.isEmailEnabled.mockResolvedValue(true)
    h.locale = "fr"
    expect(await reminder(1)).toBe(true)
    const m = sent()
    expect(m.subject).toBe("Tu as un message non lu sur SC Market")
    expect(m.text).toContain("Voir les messages:\nhttps://sc-market.space/messaging")
    expect(m.text).toMatch(/Se désabonner:\n\S*\/email\/unsubscribe\//)
    expect(m.html).toContain("Gérer les préférences")
  })

  it("has a subject in all 8 languages, singular and plural", () => {
    for (const locale of EMAIL_LOCALES) {
      const one = reminderEmailText(locale, 1)
      const many = reminderEmailText(locale, 4)
      expect(one.subject).not.toBe(many.subject)
      expect(many.subject).toContain("4")
    }
    expect(reminderEmailText("uk", 21).subject).toContain("21 розмові")
    expect(reminderEmailText("uk", 5).subject).toContain("5 розмовах")
  })

  it("maps account locales onto the 8 languages", () => {
    expect(emailLocale("zh-Hant")).toBe("zh-TW")
    expect(emailLocale("zh-CN")).toBe("zh-CN")
    expect(emailLocale("pt-BR")).toBe("en")
    expect(emailLocale(null)).toBe("en")
  })
})

const filled = () =>
  emailService.sendNotificationEmail(
    "alice",
    "buy_order_filled",
    {
      buyOrderFill: {
        order_id: "order-1",
        seller: "Seller Shop",
        item: "Quantanium",
        quantity: 4,
        total: "12,000",
        remaining: 0,
      },
    },
    true,
    null,
    { contractorId: null },
  )

describe("buy order filled email", () => {
  it("is opt-in: not sent without the user's buy_order_filled email row", async () => {
    expect(emailDefaultFor("buy_order_filled")).toEqual({ mandatory: false, defaultOn: false })
    h.isEmailEnabled.mockResolvedValue(false)
    expect(await filled()).toBe(false)
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
    expect(h.isEmailEnabled).toHaveBeenCalledWith("alice", 95, null)
  })

  it("says who filled it and links the order, with an unsubscribe link", async () => {
    h.isEmailEnabled.mockResolvedValue(true)
    expect(await filled()).toBe(true)
    const m = sent()
    expect(m.subject).toBe("Your buy order was filled")
    expect(m.text).toContain("Seller Shop filled your buy order: 4 × Quantanium for 12,000 aUEC.")
    expect(m.text).toContain("Your buy order is now complete.")
    expect(m.text).toMatch(/View order:\n\S*\/contract\/order-1/)
    expect(m.html).toContain("/email/unsubscribe/")
  })

  it("is in the user's language", async () => {
    h.isEmailEnabled.mockResolvedValue(true)
    h.locale = "ja"
    expect(await filled()).toBe(true)
    const m = sent()
    expect(m.subject).toBe("買い注文が成立しました")
    expect(m.text).toContain("注文を見る:")
    expect(m.html).toContain('<html lang="ja">')
  })
})
