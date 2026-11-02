/**
 * Staff alerts for a new storefront enquiry (staff-alerts.ts): an email to
 * STAFF_ALERT_EMAIL through the email service, a Discord webhook post to
 * STAFF_DISCORD_WEBHOOK_URL. Unset variables skip their channel; failures are
 * logged and reported, never thrown, and never log the webhook URL. The
 * email service, fetch and Bugsnag are mocked.
 */
import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("../email/email.service.js", () => ({ emailService: { sendEmail: h.sendEmail } }))
vi.mock("../../logger/logger.js", () => ({
  default: { warn: h.warn, error: h.error, info: vi.fn(), debug: vi.fn() },
}))

const { env } = await import("../../config/env.js")
const alerts = await import("./staff-alerts.js")
const Bugsnag = createRequire(import.meta.url)("@bugsnag/js") as { notify: (...args: unknown[]) => void }

const WEBHOOK = "https://discord.com/api/webhooks/123456/super-secret-token"
const STAFF = "staff@sc-market.space"

const ENQUIRY = {
  enquiry_id: "e1",
  target_type: "org" as const,
  target: "TESTORG",
  requested_subdomain: "testorg",
  message: "We'd like a **branded** storefront for our hauling org.\nThanks!",
  contact_method: "discord" as const,
  status: "open" as const,
  submitted_by_username: "alice",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
}
const TARGET = { type: "org" as const, id: "c1", handle: "TESTORG", name: "Test Org", is_test: false }

const saved = { ...env }
let fetchMock: Mock
let notify: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  env.STAFF_ALERT_EMAIL = STAFF
  env.STAFF_DISCORD_WEBHOOK_URL = WEBHOOK
  env.FRONTEND_URL = "https://sc-market.space"
  env.NODE_ENV = "test"
  h.sendEmail.mockResolvedValue({ status: "sent", messageId: "m1" })
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal("fetch", fetchMock)
  notify = vi.spyOn(Bugsnag, "notify").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  notify.mockRestore()
  for (const k of ["STAFF_ALERT_EMAIL", "STAFF_DISCORD_WEBHOOK_URL", "FRONTEND_URL", "NODE_ENV"]) {
    env[k] = saved[k]
  }
})

/** Every argument of every log call, as one string. */
function logged(): string {
  return JSON.stringify([...h.warn.mock.calls, ...h.error.mock.calls])
}

describe("sendStaffEnquiryAlerts", () => {
  it("emails staff through the email service, with the org, requester, excerpt and admin link", async () => {
    expect(await alerts.sendStaffEnquiryAlerts(ENQUIRY, TARGET)).toEqual({ email: "sent", discord: "sent" })
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
    const mail = h.sendEmail.mock.calls[0][0]
    expect(mail.to).toBe(STAFF)
    expect(mail.subject).toBe("New storefront enquiry: Test Org")
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("Test Org")
      expect(part).toContain("alice")
      expect(part).toContain("testorg.sc-market.space")
      expect(part).toContain("https://sc-market.space/admin/premium#storefront-enquiries")
    }
    // The user's message is shown as plain text, flattened to one line.
    expect(mail.text).toContain("We'd like a **branded** storefront for our hauling org. Thanks!")
    expect(mail.html).not.toContain("<strong>branded</strong>")
  })

  it("posts a short Discord embed to the webhook, with mentions and markdown inert", async () => {
    await alerts.sendStaffEnquiryAlerts(ENQUIRY, TARGET)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(WEBHOOK)
    expect(init.method).toBe("POST")
    expect(init.redirect).toBe("error")
    const payload = JSON.parse(init.body)
    expect(payload.allowed_mentions).toEqual({ parse: [] })
    const [embed] = payload.embeds
    expect(embed.title).toBe("New storefront enquiry")
    expect(embed.url).toBe("https://sc-market.space/admin/premium#storefront-enquiries")
    expect(embed.description).toBe("We'd like a \\*\\*branded\\*\\* storefront for our hauling org. Thanks!")
    expect(embed.fields).toEqual([
      { name: "Org", value: "Test Org (TESTORG)", inline: true },
      { name: "Requested by", value: "alice", inline: true },
      { name: "Subdomain", value: "testorg.sc-market.space", inline: true },
      { name: "Contact", value: "Discord", inline: true },
    ])
  })

  it("cuts a long message to a short excerpt", async () => {
    await alerts.sendStaffEnquiryAlerts({ ...ENQUIRY, message: "word ".repeat(300) }, TARGET)
    const embed = JSON.parse(fetchMock.mock.calls[0][1].body).embeds[0]
    expect(embed.description.length).toBeLessThanOrEqual(alerts.EXCERPT_MAX)
    expect(embed.description.endsWith("…")).toBe(true)
  })

  it("skips each channel whose variable is unset, with no fallback", async () => {
    env.STAFF_ALERT_EMAIL = ""
    expect(await alerts.sendStaffEnquiryAlerts(ENQUIRY, TARGET)).toEqual({ email: "skipped", discord: "sent" })
    expect(h.sendEmail).not.toHaveBeenCalled()

    env.STAFF_ALERT_EMAIL = STAFF
    delete env.STAFF_DISCORD_WEBHOOK_URL
    fetchMock.mockClear()
    expect(await alerts.sendStaffEnquiryAlerts(ENQUIRY, TARGET)).toEqual({ email: "sent", discord: "skipped" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a test org or shop alerts nobody", async () => {
    expect(await alerts.sendStaffEnquiryAlerts(ENQUIRY, { ...TARGET, is_test: true })).toEqual({
      email: "skipped",
      discord: "skipped",
    })
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a webhook failure is logged and reported without the URL, and doesn't stop the email", async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed for ${WEBHOOK}`))
    expect(await alerts.sendStaffEnquiryAlerts(ENQUIRY, TARGET)).toEqual({ email: "sent", discord: "failed" })
    expect(h.error).toHaveBeenCalledWith(
      "storefront enquiry: staff alert failed",
      expect.objectContaining({ channel: "discord", enquiry_id: "e1" }),
    )
    expect(notify).toHaveBeenCalledTimes(1)
    const reported = notify.mock.calls[0][0] as Error
    expect(reported.message).not.toContain("super-secret-token")
    expect(logged()).not.toContain("super-secret-token")
    expect(logged()).not.toContain("discord.com/api/webhooks")
  })

  it("an HTTP error from Discord and a failed email are both failures, never thrown", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }))
    h.sendEmail.mockResolvedValue({ status: "failed", error: "SES down" })
    expect(await alerts.sendStaffEnquiryAlerts(ENQUIRY, TARGET)).toEqual({ email: "failed", discord: "failed" })
    expect(h.error).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledTimes(2)
    expect(logged()).not.toContain("super-secret-token")
  })

  it("doesn't report to Bugsnag in development", async () => {
    env.NODE_ENV = "development"
    h.sendEmail.mockRejectedValue(new Error("boom"))
    await alerts.sendStaffEnquiryAlerts(ENQUIRY, TARGET)
    expect(h.error).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe("queueStaffEnquiryAlerts", () => {
  it("returns at once and sends in the background; a failure never escapes", async () => {
    h.sendEmail.mockRejectedValue(new Error("SES down"))
    fetchMock.mockRejectedValue(new Error("network"))
    expect(() => alerts.queueStaffEnquiryAlerts(ENQUIRY, TARGET)).not.toThrow()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(h.error).toHaveBeenCalledTimes(2))
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("logStaffAlertConfig", () => {
  it("warns once per unset variable, never printing the webhook URL", () => {
    alerts.logStaffAlertConfig()
    expect(h.warn).not.toHaveBeenCalled()

    delete env.STAFF_ALERT_EMAIL
    env.STAFF_DISCORD_WEBHOOK_URL = "  "
    alerts.logStaffAlertConfig()
    expect(h.warn).toHaveBeenCalledTimes(2)
    expect(h.warn.mock.calls.map((c) => c[0])).toEqual([
      expect.stringContaining("STAFF_ALERT_EMAIL is not set"),
      expect.stringContaining("STAFF_DISCORD_WEBHOOK_URL is not set"),
    ])
  })
})
