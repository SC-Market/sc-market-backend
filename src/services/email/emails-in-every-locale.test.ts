/**
 * Every email the backend sends, in all 8 site languages, through the email
 * service's real send-time check, formatters and templates (SES and the
 * database mocked; nothing is sent). The words come from the email catalogs
 * (i18n/, checked by i18n/email-catalogs.test.ts); this checks what each
 * recipient actually gets:
 *
 * - subject, preheader, body, buttons and footer are in the recipient's
 *   language (accounts.locale; English otherwise), with no placeholder or
 *   catalog tag left over and <html lang> set;
 * - the language never changes who may unsubscribe: the unsubscribe link and
 *   List-Unsubscribe headers are there (or not) exactly as in English;
 * - account_identity_changed stays mandatory, dm_reminder and
 *   buy_order_filled opt-in.
 *
 * EMAIL_PREVIEW_DIR=/some/dir writes each rendered email there
 * (<type>.<locale>.html / .txt) for a visual check (long German strings,
 * CJK).
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  sendEmailViaSES: vi.fn(),
  getEmailPreference: vi.fn(),
  isEmailEnabled: vi.fn(),
  locale: "en" as string,
  notice: false,
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
  getUserEmailByAddress: async (email: string) => ({ email_id: "em1", user_id: "alice", email }),
}))
vi.mock("../../api/routes/v1/email/verification-database.js", () => ({
  createVerificationToken: async () => ({ token_id: "tok1", token: "a".repeat(64) }),
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
// A long display name and long titles: the layout must hold them in German.
const AUTHOR = "Kommandantin Wilhelmina von Habsburg-Lothringen"
const ORDER_TITLE = "Lieferung von 2.400 SCU Quantanium nach Area18 (Expressversand)"
const LISTING_TITLE = "Aegis Hammerhead Best in Show Edition 2955"
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUser: async ({ user_id }: { user_id: string }) =>
    user_id === "author"
      ? { user_id, username: "wilhelmina", display_name: AUTHOR, locale: "de" }
      : { user_id, username: "alice", display_name: "Alice", locale: h.locale },
}))
vi.mock("../../api/routes/v1/orders/database.js", () => ({
  getOrder: async ({ order_id }: { order_id: string }) => ({ order_id, title: ORDER_TITLE }),
}))
vi.mock("../../api/routes/v1/market/database.js", () => ({
  getMarketListingComplete: async (listing_id: string) => ({
    listing: { listing_id },
    details: { title: LISTING_TITLE },
  }),
}))
vi.mock("../../api/routes/v1/contractors/database.js", () => ({
  getContractor: async () => ({
    contractor_id: "org1",
    name: "Interstellare Transportgenossenschaft Stanton",
    spectrum_id: "ITGS",
    description: "We haul **anything** across Stanton and Pyro.",
  }),
}))
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: {} }))
vi.mock("./defaults-notice.js", () => ({
  pendingDefaultsNotice: async () =>
    h.notice
      ? {
          unsubscribeUrl: "https://api.sc-market.space/email/unsubscribe/defaults",
          preferencesUrl: "https://sc-market.space/settings?tab=email",
        }
      : null,
  markDefaultsNoticeShown: async () => {},
}))

const { env } = await import("../../config/env.js")
const { emailService } = await import("./email.service.js")
const { emailDefaultFor } = await import("../notify/catalog.js")
const { unsubscribeScopeFor } = await import("./unsubscribe-token.js")
const { EMAIL_LOCALES, emailLocale, languageTag } = await import("./i18n/index.js")
const { IDENTITY_ACTION_KINDS } = await import("../identity-admin/identity-admin.service.js")
const { sendStaffEnquiryAlerts } = await import("../storefront/staff-alerts.js")

const ORDER = {
  order_id: "order-1",
  title: ORDER_TITLE,
  description: "**Pickup** at Port Tressler, drop at Area18 TDD.\n\n- Bring a Hull C\n- Escort welcome",
  cost: "1250000",
  status: "in-progress",
  contractor_id: null,
}
const OFFER = { id: "6f1c2a90-3b1e-4c55-9a7e-1d2f3a4b5c6d", status: "active", contractor_id: null }
const MESSAGE = { author: "author", content: "Hi! Can we meet at **Lorville** tomorrow?", timestamp: new Date() }
const REVIEW = {
  review_id: "r1",
  order_id: "order-1",
  user_author: "author",
  rating: "4.5",
  content: "Fast and friendly.",
  revision_message: "Please mention the late delivery.",
  timestamp: new Date(),
}
const reminderOffers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    session_id: `s${i}`,
    title: `${i + 1}× Carrack Expedition-Paket mit Versicherung`,
    counterparty: AUTHOR,
    waited_hours: 26 + i * 24,
    url: `https://sc-market.space/offer/s${i}`,
  }))

/** One case per notification type the email service renders (its switch). */
const CASES: Record<string, Record<string, unknown>> = {
  order_create: { order: ORDER },
  order_assigned: { order: ORDER },
  order_status_fulfilled: { order: { ...ORDER, status: "fulfilled" } },
  order_status_in_progress: { order: ORDER },
  order_status_not_started: { order: { ...ORDER, status: "not-started" } },
  order_status_cancelled: { order: { ...ORDER, status: "cancelled" } },
  order_message: { order: ORDER, message: MESSAGE },
  order_review: { review: REVIEW },
  order_review_revision_requested: { review: REVIEW },
  offer_create: { offer: OFFER },
  counter_offer_create: { offer: OFFER },
  contract_offer_received: { offer: OFFER },
  offer_accepted: { offer: { ...OFFER, status: "closed" } },
  offer_rejected: { offer: { ...OFFER, status: "closed" } },
  offer_message: { offer: OFFER, message: MESSAGE },
  market_item_bid: {
    listing: { listing: { listing_id: "l1" }, details: { title: LISTING_TITLE } },
    bid: { bid_id: "b1", bid: 2500000 },
  },
  market_item_offer: { listing: { listing_id: "l1" }, offer: { offer_id: "mo1", offer: 2300000 } },
  contractor_invite: {
    invite: { invite_id: "i1", contractor_id: "org1", message: "We'd love to have you.\nSee you in the 'verse!" },
  },
  admin_alert: {
    alert: {
      alert_id: "a1",
      title: "Scheduled maintenance",
      content: "SC Market is down at **10:00 UTC** for about 30 minutes.",
      link: "https://sc-market.space/news",
      target_type: "all_users",
      created_at: new Date(),
    },
  },
  price_alert: {
    listing: { listing_id: "l2", title: "Laranite Ore 50 SCU", price: 4200, quantity: 5, seller_name: "Shop seller-shop" },
    watch: { query: "laranite ore", max_price: 5000 },
  },
  offer_pending_reminder: {
    offerReminder: {
      stage: "first",
      count: 1,
      offers: reminderOffers(1),
      more: 0,
      url: "https://sc-market.space/offer/s0",
      withdraw_url: null,
    },
  },
  offer_pending_final_reminder: {
    offerReminder: {
      stage: "final",
      count: 7,
      offers: reminderOffers(5),
      more: 2,
      url: "https://sc-market.space/offer/s0",
      withdraw_url: null,
    },
  },
  offer_waiting_buyer: {
    offerReminder: {
      stage: "buyer",
      count: 1,
      offers: reminderOffers(1),
      more: 0,
      url: "https://sc-market.space/offer/s0",
      withdraw_url: "https://sc-market.space/offer/s0?action=withdraw",
    },
  },
  storefront_enquiry_accepted: {
    enquiry: {
      enquiry_id: "e1",
      target_type: "org",
      target: "ITGS",
      target_name: "Interstellare Transportgenossenschaft Stanton",
      requested_subdomain: "transportgenossenschaft",
      status: "accepted",
    },
  },
  storefront_enquiry_declined: {
    enquiry: {
      enquiry_id: "e1",
      target_type: "shop",
      target: "lara",
      target_name: "Lara's Laranite",
      requested_subdomain: "lara",
      status: "declined",
    },
  },
  account_identity_changed: { identity: { kind: "username_released", notice: { new_username: "user_1a2b3c4d" } } },
  buy_order_filled: {
    buyOrderFill: { order_id: "order-1", seller: "Seller Shop", item: "Quantanium", quantity: 4, total: 12000, remaining: 2 },
  },
  dm_reminder: { reminder: { conversations: 3, url: "https://sc-market.space/messaging" } },
}

beforeEach(() => {
  vi.clearAllMocks()
  h.locale = "en"
  h.notice = false
  delete env.EMAIL_QUEUE_URL
  env.EMAIL_FROM_ADDRESS = "noreply@sc-market.space"
  env.SESSION_SECRET = "s".repeat(40)
  env.BACKEND_URL = "https://api.sc-market.space"
  env.FRONTEND_URL = "https://sc-market.space"
  h.sendEmailViaSES.mockResolvedValue("msg-1")
  h.isEmailEnabled.mockResolvedValue(true)
  h.getEmailPreference.mockResolvedValue({ enabled: true })
})

interface Sent {
  to: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
}

function sent(): Sent {
  expect(h.sendEmailViaSES).toHaveBeenCalledTimes(1)
  const [to, subject, html, text, , , headers] = h.sendEmailViaSES.mock.calls[0]
  return { to, subject, html, text, headers: headers ?? {} }
}

async function send(type: string, data: Record<string, unknown> = CASES[type]): Promise<Sent> {
  h.sendEmailViaSES.mockClear()
  expect(await emailService.sendNotificationEmail("alice", type, data, true, null, { contractorId: null }), type).toBe(
    true,
  )
  return sent()
}

const previewDir = process.env.EMAIL_PREVIEW_DIR
function preview(name: string, locale: string, m: Sent) {
  if (!previewDir) return
  mkdirSync(previewDir, { recursive: true })
  writeFileSync(path.join(previewDir, `${name}.${locale}.html`), m.html)
  writeFileSync(path.join(previewDir, `${name}.${locale}.txt`), `Subject: ${m.subject}\n\n${m.text}`)
}

/** Nothing of the catalog's syntax reaches the reader. */
function expectClean(m: Sent, label: string) {
  for (const part of [m.subject, m.text, m.html]) {
    expect(part, label).not.toMatch(/\{[a-z_]+\}/)
    expect(part, label).not.toMatch(/<\/?link>|<\/?b>/)
    expect(part, label).not.toContain("undefined")
  }
  expect(m.subject.trim(), label).not.toBe("")
}

describe("every email in every language", () => {
  const english = new Map<string, Sent>()

  it("covers every notification type the email service sends", () => {
    const source = readFileSync(new URL("./email.service.ts", import.meta.url), "utf-8")
    const types = [...source.matchAll(/^\s+case "([a-z_]+)":$/gm)].map((m) => m[1]).sort()
    expect(Object.keys(CASES).sort()).toEqual(types)
  })

  for (const locale of EMAIL_LOCALES) {
    it.each(Object.keys(CASES))(`%s in ${locale}`, async (type) => {
      h.locale = locale
      h.notice = type === "order_create"
      const m = await send(type)
      preview(type, locale, m)
      const label = `${type} ${locale}`
      expectClean(m, label)
      expect(m.html, label).toContain(`<html lang="${languageTag(locale)}">`)
      // Hidden preview text right after <body>.
      expect(m.html, label).toMatch(/<body>\s*<div style="display: none;[^"]*">[^<]+<\/div>/)

      if (locale === "en") {
        english.set(type, m)
        return
      }
      const en = english.get(type)!
      expect(m.subject, label).not.toBe(en.subject)
      // Same links and the same unsubscribe behaviour as in English.
      expect(m.headers, label).toEqual(en.headers)
      expect(m.html.includes("/email/unsubscribe/"), label).toBe(en.html.includes("/email/unsubscribe/"))
      expect(m.text.match(/https?:\/\/[^\s)]+/g), label).toEqual(en.text.match(/https?:\/\/[^\s)]+/g))
    })
  }

  it.each(EMAIL_LOCALES)("verification email in %s", async (locale) => {
    h.locale = locale
    await emailService.sendVerificationEmail("alice", "alice@example.test", true)
    const m = sent()
    preview("verification", locale, m)
    expectClean(m, locale)
    expect(m.html).toContain(`<html lang="${languageTag(locale)}">`)
    expect(m.text).toContain(`/email/verify/${"a".repeat(64)}`)
    expect(m.html).not.toContain("/email/unsubscribe/")
    if (locale !== "en") expect(m.subject).not.toBe("Verify Your Email Address - SC Market")
  })

  it("staff storefront enquiry email (to the staff address, in English)", async () => {
    env.STAFF_ALERT_EMAIL = "staff@example.test"
    delete env.STAFF_DISCORD_WEBHOOK_URL
    try {
      const out = await sendStaffEnquiryAlerts(
        {
          enquiry_id: "e1",
          submitted_by_username: "alice",
          requested_subdomain: "transportgenossenschaft",
          contact_method: "discord",
          message: "We'd like our own storefront.",
        } as never,
        { type: "org", name: "Interstellare Transportgenossenschaft Stanton", handle: "ITGS", is_test: false } as never,
      )
      expect(out.email).toBe("sent")
      const m = sent()
      preview("staff_storefront_enquiry", "en", m)
      expectClean(m, "staff")
      expect(m.subject).toBe("New storefront enquiry: Interstellare Transportgenossenschaft Stanton")
      expect(m.text).toContain("Org: ITGS")
      expect(m.text).toContain("Contact: Discord")
    } finally {
      delete env.STAFF_ALERT_EMAIL
    }
  })
})

describe("account identity security email", () => {
  const identity = (kind: string, notice: Record<string, string> = {}) =>
    send("account_identity_changed", { identity: { kind, notice } })

  it("is mandatory: no unsubscribe scope, sent even with email turned off", async () => {
    expect(emailDefaultFor("account_identity_changed")).toEqual({ mandatory: true, defaultOn: false })
    expect(unsubscribeScopeFor("account_identity_changed")).toBeNull()
    h.isEmailEnabled.mockResolvedValue(false)
    h.getEmailPreference.mockResolvedValue({ enabled: false })

    const m = await identity("discord_unlinked")
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
    const m = await identity("username_released", { old_username: "Old", new_username: "user_1a2b3c4d" })
    expect(m.subject).toBe("Ihr SC-Market-Benutzername wurde geändert")
    expect(m.text).toContain("Hallo Alice,")
    expect(m.text).toContain("Ihr Benutzername ist jetzt user_1a2b3c4d.")
    expect(m.text).toContain("Einstellungen öffnen:\nhttps://")
    expect(m.text).toContain("Einstellungen verwalten:")
    expect(m.html).toContain('<html lang="de">')
  })

  it("a deactivated account gets no Settings button (it can't log in)", async () => {
    const m = await identity("account_deactivated")
    expect(m.subject).toBe("Your SC Market account was deactivated")
    expect(m.html).not.toContain('class="button"')
    expect(m.text).not.toContain("Open Settings")
  })

  it("every kind has its own subject in all 8 languages", async () => {
    for (const locale of EMAIL_LOCALES) {
      h.locale = locale
      const subjects = new Set<string>()
      for (const kind of IDENTITY_ACTION_KINDS) subjects.add((await identity(kind, { new_username: "user_x" })).subject)
      expect(subjects.size, locale).toBe(IDENTITY_ACTION_KINDS.length)
    }
  })
})

describe("unread-message reminder email", () => {
  const reminder = (conversations: number) =>
    send("dm_reminder", { reminder: { conversations, url: "https://sc-market.space/messaging" } })

  it("stays opt-in: not sent without the user's dm_reminder email row", async () => {
    h.isEmailEnabled.mockResolvedValue(false)
    expect(
      await emailService.sendNotificationEmail("alice", "dm_reminder", CASES.dm_reminder, true, null, {
        contractorId: null,
      }),
    ).toBe(false)
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
    expect(h.isEmailEnabled).toHaveBeenCalledWith("alice", 82, null)
  })

  it("keeps the one-click unsubscribe link and List-Unsubscribe headers", async () => {
    const m = await reminder(3)
    expect(m.subject).toBe("You have unread messages in 3 conversations on SC Market")
    expect(m.text).toContain("3 conversations on SC Market have messages waiting for your reply.")
    expect(m.text).toMatch(/Unsubscribe:\n\S*\/email\/unsubscribe\//)
    expect(m.html).toContain("/email/unsubscribe/")
    expect(m.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })

  it("is in the user's language, footer included", async () => {
    h.locale = "fr"
    const m = await reminder(1)
    expect(m.subject).toBe("Tu as un message non lu sur SC Market")
    expect(m.text).toContain("Voir les messages:\nhttps://sc-market.space/messaging")
    expect(m.text).toMatch(/Se désabonner:\n\S*\/email\/unsubscribe\//)
    expect(m.html).toContain("Gérer les préférences")
  })

  it("one conversation and several have their own wording; Ukrainian plurals", async () => {
    for (const locale of EMAIL_LOCALES) {
      h.locale = locale
      const one = await reminder(1)
      const many = await reminder(4)
      expect(one.subject, locale).not.toBe(many.subject)
      expect(many.subject, locale).toContain("4")
    }
    h.locale = "uk"
    expect((await reminder(21)).subject).toContain("21 розмові")
    expect((await reminder(5)).subject).toContain("5 розмовах")
    expect((await reminder(3)).subject).toContain("3 розмовах")
  })

  it("maps account locales onto the 8 languages", () => {
    expect(emailLocale("zh_Hant")).toBe("zh_Hant")
    expect(emailLocale("zh-Hant")).toBe("zh_Hant")
    expect(emailLocale("zh-TW")).toBe("zh_Hant")
    expect(emailLocale("zh-CN")).toBe("zh_Hans")
    expect(emailLocale("zh_Hans")).toBe("zh_Hans")
    expect(emailLocale("de-DE")).toBe("de")
    expect(emailLocale("pt-BR")).toBe("en")
    expect(emailLocale(null)).toBe("en")
  })
})

describe("buy order filled email", () => {
  it("is opt-in: not sent without the user's buy_order_filled email row", async () => {
    expect(emailDefaultFor("buy_order_filled")).toEqual({ mandatory: false, defaultOn: false })
    h.isEmailEnabled.mockResolvedValue(false)
    expect(
      await emailService.sendNotificationEmail("alice", "buy_order_filled", CASES.buy_order_filled, true, null, {
        contractorId: null,
      }),
    ).toBe(false)
    expect(h.sendEmailViaSES).not.toHaveBeenCalled()
    expect(h.isEmailEnabled).toHaveBeenCalledWith("alice", 95, null)
  })

  it("says who filled it and links the order, with an unsubscribe link", async () => {
    const m = await send("buy_order_filled", {
      buyOrderFill: { order_id: "order-1", seller: "Seller Shop", item: "Quantanium", quantity: 4, total: 12000, remaining: 0 },
    })
    expect(m.subject).toBe("Your buy order was filled")
    expect(m.text).toContain("Seller Shop filled your buy order: 4 × Quantanium for 12,000 aUEC.")
    expect(m.text).toContain("Your buy order is now complete.")
    expect(m.text).toMatch(/View order:\n\S*\/contract\/order-1/)
    expect(m.html).toContain("/email/unsubscribe/")
  })

  it("is in the user's language, amounts written its way", async () => {
    h.locale = "de"
    const m = await send("buy_order_filled")
    expect(m.subject).toBe("Ihr Kaufauftrag wurde erfüllt")
    expect(m.text).toContain("für 12.000 aUEC")
    h.locale = "ja"
    const ja = await send("buy_order_filled")
    expect(ja.subject).toBe("買い注文が成立しました")
    expect(ja.text).toContain("注文を見る:")
    expect(ja.html).toContain('<html lang="ja">')
  })
})

describe("statuses, amounts and user text", () => {
  it("shows the order status as the site names it, and the value in the locale's digits", async () => {
    h.locale = "de"
    const m = await send("order_create")
    expect(m.text).toContain("Status: In Bearbeitung")
    expect(m.text).toContain("Wert: 1.250.000 aUEC")
    expect(m.subject).toBe("Neue Bestellung")
  })

  it("a status email shows the status it announces, not the order row's (read before the update)", async () => {
    const stale = { order: { ...ORDER, status: "not-started" } }
    expect((await send("order_status_cancelled", stale)).text).toContain("Status: Cancelled")
    expect((await send("order_status_in_progress", stale)).text).toContain("Status: In Progress")
    expect((await send("order_status_not_started", { order: { ...ORDER, status: "in-progress" } })).text).toContain(
      "Status: Not Started",
    )
    h.locale = "de"
    expect((await send("order_status_cancelled", stale)).text).toContain("Status: Storniert")
  })

  it("escapes user text inside a translated sentence", async () => {
    h.locale = "fr"
    const m = await send("order_message", {
      order: { ...ORDER, title: "<script>alert(1)</script>" },
      message: MESSAGE,
    })
    expect(m.html).not.toContain("<script>alert(1)</script>")
    expect(m.html).toContain("« &lt;script&gt;alert(1)&lt;/script&gt; »")
    expect(m.html).toContain(`<strong>${AUTHOR}</strong>`)
    expect(m.text).toContain("« <script>alert(1)</script> »")
  })
})
