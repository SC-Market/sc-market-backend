/**
 * Staff alerts for a new branded storefront enquiry (enquiries.ts), on top of
 * the site admins' in-app notification (enquiry-notify.ts). Owner decision
 * (2026-11-01):
 *
 * - an email to STAFF_ALERT_EMAIL, through the email service and its
 *   templates (staff_storefront_enquiry);
 * - a Discord webhook post to STAFF_DISCORD_WEBHOOK_URL: a short embed with
 *   the org or shop, the requester, an excerpt and a link to Admin › Premium.
 *
 * Sent after the enquiry is saved, in the background: a failure is logged
 * (and reported to Bugsnag) and never fails the request. An unset variable
 * skips its channel; startup logs a warning once (logStaffAlertConfig). The
 * webhook URL is a secret (whoever has it can post to the channel): it is
 * never logged. A test org or shop's enquiry alerts nobody, like the in-app
 * notification (test accounts never cause notifications to real people).
 */
import { createRequire } from "node:module"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { emailService } from "../email/email.service.js"
import { renderEmailTemplate } from "../email/template-engine.js"
import type { EmailTemplateData } from "../email/email.service.types.js"
import { translate } from "../email/i18n/index.js"
import type { EnquiryTarget, StorefrontEnquiry } from "./enquiries.js"
import { recordLegacyDestination } from "../notify/destination-trace.js"
import { postStaffDiscordWebhook, redactStaffWebhookUrl, staffWebhookUrl } from "./staff-webhook.js"
import type { DestinationPlan } from "../notify/destinations.js"

const require = createRequire(import.meta.url)
const Bugsnag = require("@bugsnag/js") as {
  notify: (
    error: Error,
    onError?: (event: { addMetadata: (section: string, values: Record<string, unknown>) => void }) => void,
  ) => void
}

export const STAFF_ALERT_EMAIL_TEMPLATE = "staff_storefront_enquiry"
/** Characters of the enquiry's message shown in the alerts. */
export const EXCERPT_MAX = 200
/** Discord's embed colour for SC Market (the site's primary green). */
const EMBED_COLOR = 0x10b981

type Channel = "email" | "discord" | "alerts"

function frontendUrl(): string {
  return (env.FRONTEND_URL || "https://sc-market.space").replace(/\/+$/, "")
}

/** Where staff handle enquiries (frontend ADMIN_PATHS.premium). */
export function adminEnquiriesUrl(): string {
  return `${frontendUrl()}/admin/premium#storefront-enquiries`
}

export function excerpt(message: string, max = EXCERPT_MAX): string {
  const flat = message.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1).trimEnd()}…`
}

function staffEmail(): string | undefined {
  return env.STAFF_ALERT_EMAIL?.trim() || undefined
}
const webhookUrl = staffWebhookUrl

/** Startup: one warning per unset variable (its channel is skipped). */
export function logStaffAlertConfig(): void {
  if (!staffEmail()) {
    logger.warn("STAFF_ALERT_EMAIL is not set: staff email alerts for storefront enquiries are off")
  }
  if (!webhookUrl()) {
    logger.warn("STAFF_DISCORD_WEBHOOK_URL is not set: staff Discord alerts for storefront enquiries are off")
  }
}

/** Log and report a failed alert. Never includes the webhook URL. */
function reportFailure(channel: Channel, enquiry: StorefrontEnquiry, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error))
  const message = redactStaffWebhookUrl(err.message)
  logger.error("storefront enquiry: staff alert failed", {
    channel,
    enquiry_id: enquiry.enquiry_id,
    error: message,
  })
  if (env.NODE_ENV === "development") return
  try {
    const reported = new Error(`Staff ${channel} alert failed: ${message}`)
    reported.name = "StaffAlertError"
    Bugsnag.notify(reported, (event) => {
      event.addMetadata("staff_alert", { channel, enquiry_id: enquiry.enquiry_id })
    })
  } catch {
    // Bugsnag not started (tests, scripts): the log line is enough.
  }
}

interface AlertContent {
  targetLabel: string
  targetName: string
  targetHandle: string
  requester: string
  subdomain: string
  contact: string
  excerpt: string
  link: string
}

function contentFor(enquiry: StorefrontEnquiry, target: EnquiryTarget): AlertContent {
  return {
    targetLabel: target.type === "org" ? "Org" : "Shop",
    targetName: target.name,
    targetHandle: target.handle,
    requester: enquiry.submitted_by_username ?? "Unknown user",
    subdomain: `${enquiry.requested_subdomain}.sc-market.space`,
    contact: enquiry.contact_method === "discord" ? "Discord" : "Message on SC Market",
    excerpt: excerpt(enquiry.message),
    link: adminEnquiriesUrl(),
  }
}

/**
 * Staff mail goes to one shared address (STAFF_ALERT_EMAIL), not to a user
 * with a language setting: it is in English, through the same catalog.
 */
const STAFF_LOCALE = "en"

async function sendEmailAlert(to: string, c: AlertContent, enquiry: StorefrontEnquiry, target: EnquiryTarget): Promise<void> {
  const base = frontendUrl()
  const t = (key: string, vars?: Record<string, unknown>) =>
    translate(STAFF_LOCALE, `${STAFF_ALERT_EMAIL_TEMPLATE}.${key}`, vars)
  const subject = t("subject", { name: c.targetName })
  const preheader = t("preheader", { requester: c.requester, subdomain: c.subdomain })
  const data: EmailTemplateData = {
    userName: "staff",
    userDisplayName: "SC Market staff",
    locale: STAFF_LOCALE,
    notificationType: STAFF_ALERT_EMAIL_TEMPLATE,
    notificationTitle: subject,
    notificationBody: preheader,
    preheader,
    actionUrl: c.link,
    siteName: "SC Market",
    siteUrl: base,
    logoUrl: `${base}/scmarket-logo.png`,
    // Staff mail, not a user notification: nothing to unsubscribe from.
    preferencesUrl: c.link,
    enquiry: {
      target_label: t(target.type === "org" ? "target_org" : "target_shop"),
      target_name: c.targetName,
      target_handle: c.targetHandle,
      requester: c.requester,
      subdomain: c.subdomain,
      contact: t(enquiry.contact_method === "discord" ? "contact_discord" : "contact_message"),
      message: c.excerpt,
    },
  }
  const [html, text] = await Promise.all([
    renderEmailTemplate(STAFF_ALERT_EMAIL_TEMPLATE, data, "html"),
    renderEmailTemplate(STAFF_ALERT_EMAIL_TEMPLATE, data, "txt"),
  ])
  const result = await emailService.sendEmail({ to, subject, html, text })
  if (result.status !== "sent") throw new Error(result.error ?? "email not sent")
}

/**
 * User text shown as typed: escape Discord markdown (masked links included).
 * Mentions can't ping: allowed_mentions is empty.
 */
function inert(text: string): string {
  return text.replace(/([\\`*_~|[\]])/g, "\\$1").replace(/^([#>-])/, "\\$1")
}

export function discordPayload(c: AlertContent) {
  return {
    username: "SC Market",
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: "New storefront enquiry",
        url: c.link,
        color: EMBED_COLOR,
        description: c.excerpt ? inert(c.excerpt) : "_No message_",
        fields: [
          { name: c.targetLabel, value: inert(`${c.targetName} (${c.targetHandle})`).slice(0, 1024), inline: true },
          { name: "Requested by", value: inert(c.requester).slice(0, 1024), inline: true },
          { name: "Subdomain", value: inert(c.subdomain).slice(0, 1024), inline: true },
          { name: "Contact", value: c.contact, inline: true },
        ],
        footer: { text: "Admin › Premium" },
      },
    ],
  }
}

/** The staff channel's post for an enquiry (legacy sender and notify()'s webhook channel). */
export function staffEnquiryDiscordPayload(enquiry: StorefrontEnquiry, target: EnquiryTarget) {
  return discordPayload(contentFor(enquiry, target))
}

/** notify()'s plan for the staff channel's post: one per enquiry; none for a test org or shop or with no URL set. */
export function staffEnquiryPlan(enquiry: StorefrontEnquiry, target: EnquiryTarget): DestinationPlan {
  return {
    channel: "webhook",
    event: "admin.storefront_enquiry",
    entityId: enquiry.enquiry_id,
    dedupeKey: enquiry.enquiry_id,
    destinations: target.is_test || !staffWebhookUrl() ? [] : [{ channel: "webhook", ref: "webhook:staff", staff: true }],
    render: () => staffEnquiryDiscordPayload(enquiry, target),
  }
}

async function sendDiscordAlert(url: string, c: AlertContent): Promise<void> {
  const body = discordPayload(c)
  // Shadow mode compares what the legacy path addressed with notify()'s plan.
  recordLegacyDestination("webhook:staff", body)
  const status = await postStaffDiscordWebhook(url, body)
  if (status < 200 || status >= 300) throw new Error(`Discord webhook answered HTTP ${status}`)
}

/**
 * Send both alerts (each channel whose variable is set). Never throws: a
 * failure is logged and reported per channel.
 */
export async function sendStaffEnquiryAlerts(
  enquiry: StorefrontEnquiry,
  target: EnquiryTarget,
): Promise<{ email: "sent" | "skipped" | "failed"; discord: "sent" | "skipped" | "failed" }> {
  const out = { email: "skipped", discord: "skipped" } as {
    email: "sent" | "skipped" | "failed"
    discord: "sent" | "skipped" | "failed"
  }
  if (target.is_test) return out
  const c = contentFor(enquiry, target)
  const to = staffEmail()
  const hook = webhookUrl()
  await Promise.all([
    to
      ? sendEmailAlert(to, c, enquiry, target).then(
          () => void (out.email = "sent"),
          (err) => {
            out.email = "failed"
            reportFailure("email", enquiry, err)
          },
        )
      : undefined,
    hook
      ? sendDiscordAlert(hook, c).then(
          () => void (out.discord = "sent"),
          (err) => {
            out.discord = "failed"
            reportFailure("discord", enquiry, err)
          },
        )
      : undefined,
  ])
  return out
}

/**
 * Fire and forget, after the enquiry is saved: the request doesn't wait for
 * (or fail on) the alerts.
 */
export function queueStaffEnquiryAlerts(enquiry: StorefrontEnquiry, target: EnquiryTarget): void {
  setImmediate(() => {
    sendStaffEnquiryAlerts(enquiry, target).catch((err) => reportFailure("alerts", enquiry, err))
  })
}
