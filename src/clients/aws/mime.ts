/**
 * A minimal MIME message (multipart/alternative: text + HTML) for SES
 * SendRawEmail, used when an email needs extra headers (SES SendEmail can't
 * set any): RFC 8058 List-Unsubscribe / List-Unsubscribe-Post.
 *
 * SES adds Message-ID and Date and signs with DKIM.
 */
import { randomBytes } from "node:crypto"

export interface RawEmail {
  from: string
  to: string
  replyTo?: string
  subject: string
  html: string
  text: string
  /** Extra headers; names and values must be ASCII without CR/LF. */
  headers?: Record<string, string>
}

const HEADER_NAME = /^[A-Za-z0-9-]+$/
const RESERVED = new Set(["from", "to", "reply-to", "subject", "mime-version", "content-type", "content-transfer-encoding"])

function isAscii(s: string): boolean {
  return /^[\x20-\x7e]*$/.test(s)
}

/** RFC 2047 encoded-word for non-ASCII header text (subject, display name). */
export function encodeHeaderText(s: string): string {
  if (isAscii(s)) return s
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`
}

/** `Name <addr>` with the display name encoded when needed. */
function encodeAddress(address: string): string {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(address)
  if (!m) return address
  const name = m[1].replace(/^"|"$/g, "")
  if (!name) return `<${m[2]}>`
  return isAscii(name) ? `"${name.replace(/["\\]/g, "\\$&")}" <${m[2]}>` : `${encodeHeaderText(name)} <${m[2]}>`
}

function base64Lines(s: string): string {
  return (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n")
}

function assertHeader(name: string, value: string): void {
  if (!HEADER_NAME.test(name) || RESERVED.has(name.toLowerCase())) {
    throw new Error(`Invalid extra email header name: ${name}`)
  }
  if (!isAscii(value)) throw new Error(`Invalid value for email header ${name}`)
}

export function buildRawEmail(email: RawEmail, boundary = `=_scm_${randomBytes(12).toString("hex")}`): string {
  for (const v of [email.from, email.to, email.replyTo ?? ""]) {
    if (/[\r\n]/.test(v)) throw new Error("Invalid email address header")
  }
  const lines = [
    `From: ${encodeAddress(email.from)}`,
    `To: ${email.to}`,
    ...(email.replyTo ? [`Reply-To: ${email.replyTo}`] : []),
    `Subject: ${encodeHeaderText(email.subject.replace(/[\r\n]+/g, " "))}`,
    "MIME-Version: 1.0",
  ]
  for (const [name, value] of Object.entries(email.headers ?? {})) {
    assertHeader(name, value)
    lines.push(`${name}: ${value}`)
  }
  lines.push(
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.html),
    `--${boundary}--`,
    "",
  )
  return lines.join("\r\n")
}
