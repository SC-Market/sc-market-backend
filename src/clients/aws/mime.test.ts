import { describe, expect, it } from "vitest"
import { buildRawEmail } from "./mime.js"

function part(raw: string, type: string): string {
  const m = new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)\\r\\n--`).exec(raw)
  return Buffer.from((m?.[1] ?? "").replace(/\r\n/g, ""), "base64").toString("utf8")
}

describe("buildRawEmail", () => {
  const raw = buildRawEmail(
    {
      from: "SC Market <noreply@sc-market.space>",
      to: "user@example.test",
      replyTo: "support@sc-market.space",
      subject: "Order fulfilled – 5 SCU Laranite",
      html: "<p>Héllo</p>".repeat(20),
      text: "Héllo",
      headers: {
        "List-Unsubscribe": "<https://api.sc-market.space/api/v1/email/unsubscribe/u1.a.b>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
    "BOUNDARY",
  )
  const head = raw.split("\r\n\r\n")[0]

  it("carries the RFC 8058 headers in the message header", () => {
    expect(head).toContain("List-Unsubscribe: <https://api.sc-market.space/api/v1/email/unsubscribe/u1.a.b>")
    expect(head).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click")
    expect(head).toContain('From: "SC Market" <noreply@sc-market.space>')
    expect(head).toContain("To: user@example.test")
    expect(head).toContain("Reply-To: support@sc-market.space")
    expect(head).toContain('Content-Type: multipart/alternative; boundary="BOUNDARY"')
  })

  it("encodes a non-ASCII subject (RFC 2047) and keeps both bodies intact", () => {
    const subject = /^Subject: =\?UTF-8\?B\?([^?]+)\?=$/m.exec(head)?.[1]
    expect(Buffer.from(subject ?? "", "base64").toString("utf8")).toBe("Order fulfilled – 5 SCU Laranite")
    expect(part(raw, "text/plain")).toBe("Héllo")
    expect(part(raw, "text/html")).toBe("<p>Héllo</p>".repeat(20))
    expect(raw.split("\r\n").every((l) => l.length <= 998)).toBe(true)
  })

  it("refuses header injection", () => {
    const base = { from: "a@b.c", to: "d@e.f", subject: "s", html: "", text: "" }
    expect(() => buildRawEmail({ ...base, headers: { "List-Unsubscribe": "<x>\r\nBcc: x@y.z" } })).toThrow()
    expect(() => buildRawEmail({ ...base, headers: { To: "x" } })).toThrow()
    expect(() => buildRawEmail({ ...base, to: "d@e.f\r\nBcc: x@y.z" })).toThrow()
    expect(buildRawEmail({ ...base, subject: "a\r\nBcc: x@y.z" })).toContain("Subject: a Bcc: x@y.z")
  })
})
