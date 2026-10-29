import { readFileSync, readdirSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { describe, expect, it } from "vitest"
import { renderEmailTemplate } from "./template-engine.js"
import type { EmailTemplateData } from "./email.service.types.js"

const notificationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "templates",
  "notifications",
)

const base: EmailTemplateData = {
  userName: "owner",
  userDisplayName: "Owner",
  locale: "en",
  notificationType: "contractor_invite",
  notificationTitle: "Contractor Invitation",
  notificationBody: 'You have been invited to join "Test Org"',
  actionUrl: "https://sc-market.space/contractor/TESTORG",
  siteName: "SC Market",
  siteUrl: "https://sc-market.space",
  logoUrl: "https://sc-market.space/scmarket-logo.png",
  unsubscribeUrl: "https://sc-market.space/email/unsubscribe/token123",
  preferencesUrl: "https://sc-market.space/settings?tab=email",
}

const orgDescription = [
  "# Test Org",
  "",
  "We are a **hauling** and *mining* outfit.",
  "",
  "## What we do",
  "",
  "- Cargo runs",
  "- Salvage",
  "",
  "Join our [Discord](https://discord.gg/example) & say hi.",
].join("\n")

const inviteData: EmailTemplateData = {
  ...base,
  contractor: {
    contractor_id: "c1",
    name: "Test Org",
    description: orgDescription,
  },
  invite: {
    invite_id: "i1",
    message: "Hey, we'd love to have you.\nSee you in the 'verse!",
  },
}

describe("contractor_invite email", () => {
  it("renders the org description as Markdown (HTML snapshot)", async () => {
    const html = await renderEmailTemplate(
      "contractor_invite",
      inviteData,
      "html",
    )
    expect(html).toContain("<strong>hauling</strong>")
    expect(html).toMatch(/<h2 style="[^"]*">What we do<\/h2>/)
    expect(html).toMatch(/<li[^>]*>Cargo runs<\/li>/)
    expect(html).toContain('href="https://discord.gg/example"')
    expect(html).not.toContain("**")
    expect(html).not.toContain("## ")
    // The invite message is plain text on the site: escaped once, breaks kept.
    expect(html).toContain("Hey, we'd love to have you.<br />See you")
    expect(html).toMatchSnapshot()
  })

  it("renders a stripped text/plain part without HTML entities", async () => {
    const text = await renderEmailTemplate(
      "contractor_invite",
      inviteData,
      "txt",
    )
    expect(text).toContain("We are a hauling and mining outfit.")
    expect(text).toContain("- Cargo runs\n- Salvage")
    expect(text).toContain(
      "Join our Discord (https://discord.gg/example) & say hi.",
    )
    expect(text).toContain("we'd love to have you.\nSee you in the 'verse!")
    expect(text).not.toMatch(/&#x27;|&amp;|&quot;/)
    expect(text).not.toContain("**")
  })
})

const hostile =
  "**bold** <script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>"

// Every user-authored field any template reads.
const hostileData: EmailTemplateData = {
  ...base,
  unreadCount: 2,
  verificationUrl: "https://sc-market.space/email/verify/t",
  alert: { title: "Alert", content: hostile },
  contractor: { name: "Org", description: hostile },
  invite: { message: hostile },
  listing: {
    title: "Listing",
    description: hostile,
    price: 1,
    quantity: 1,
    seller_name: "s",
  },
  watch: { query: "q", max_price: 2 },
  bid: { bid: 10 },
  offer: { id: "o1", status: "active", offer: 5 },
  order: {
    order_id: "o1",
    title: "Order",
    description: hostile,
    cost: 100,
    status: "in-progress",
  },
  message: { content: hostile, author: "Author" },
  review: {
    content: hostile,
    revision_message: hostile,
    rating: 4,
    author: "A",
  },
}

// Every template that shows user- or org-authored text.
const userTextFields =
  /\b(alert\.content|contractor\.description|invite\.message|listing\.description|message\.content|order\.description|review\.content|review\.revision_message)\b/
const templates = readdirSync(notificationsDir)
  .filter((f) => f.endsWith(".html.hbs") && !f.startsWith("."))
  .filter((f) =>
    userTextFields.test(readFileSync(path.join(notificationsDir, f), "utf-8")),
  )
  .map((f) => f.replace(/\.html\.hbs$/, ""))

it("never interpolates user text without the markdown / plainText helper", () => {
  const bare = new RegExp(`\\{\\{\\{?\\s*${userTextFields.source}\\s*\\}`)
  const offenders = readdirSync(notificationsDir)
    .filter((f) => f.endsWith(".hbs") && !f.startsWith("."))
    .filter((f) =>
      bare.test(readFileSync(path.join(notificationsDir, f), "utf-8")),
    )
  expect(templates.length).toBe(15)
  expect(offenders).toEqual([])
})

describe.each(templates)("%s email with hostile user text", (name) => {
  it("passes user text through the sanitizing renderer", async () => {
    const html = await renderEmailTemplate(name, hostileData, "html")
    // Renderer output: an inline-styled paragraph holding the escaped text.
    expect(html).toContain('<p style="margin:0 0 12px 0;color:#b7b7b7">')
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<img src=x/i)
    expect(html).not.toMatch(/href="javascript:/i)
    expect(html).not.toContain("&amp;lt;")
  })

  it("does not HTML-escape the text/plain part", async () => {
    const text = await renderEmailTemplate(name, hostileData, "txt")
    expect(text).toContain("<script>alert(1)</script>")
    expect(text).not.toMatch(/&lt;|&amp;|&#x27;|&quot;/)
  })
})
