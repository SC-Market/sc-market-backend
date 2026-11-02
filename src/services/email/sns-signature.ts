/**
 * Amazon SNS message verification for the SES feedback webhook
 * (api/routes/webhooks/ses-feedback.ts).
 *
 * SNS signs every message it posts to an HTTPS subscriber with the private
 * key of an AWS certificate it publishes at SigningCertURL
 * (https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html).
 * A message is accepted only when all of these hold; anything else is refused:
 *
 * - it is a JSON object with the fields SNS signs for its Type
 *   (Notification, SubscriptionConfirmation, UnsubscribeConfirmation);
 * - TopicArn is exactly the configured topic (SES_FEEDBACK_SNS_TOPIC_ARN).
 *   With no (or a malformed) topic configured nothing is accepted;
 * - SigningCertURL is https on sns.<region>.amazonaws.com, a .pem path, so
 *   only AWS's own certificates are ever fetched;
 * - the certificate is currently valid and its key verifies Signature over
 *   the canonical string, with SHA1 (SignatureVersion 1) or SHA256 (2);
 * - Timestamp is no more than MAX_MESSAGE_AGE_MS old (or a few minutes in the
 *   future). Replays inside that window are dropped by MessageId
 *   (email_feedback_events).
 */
import { X509Certificate, createVerify } from "node:crypto"
import { LRUCache } from "lru-cache"

export type SnsMessageType =
  | "Notification"
  | "SubscriptionConfirmation"
  | "UnsubscribeConfirmation"

export interface SnsMessage {
  Type: SnsMessageType
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: "1" | "2"
  Signature: string
  SigningCertURL: string
  Subject?: string
  Token?: string
  SubscribeURL?: string
  UnsubscribeURL?: string
}

export type SnsVerifyFailure =
  | "not_configured"
  | "malformed"
  | "wrong_topic"
  | "bad_cert_url"
  | "cert_unavailable"
  | "bad_signature"
  | "stale"

export type SnsVerifyResult =
  | { ok: true; message: SnsMessage }
  | { ok: false; reason: SnsVerifyFailure }

/** Older notifications are refused (SNS retries finish well within this). */
export const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000
/** Clock skew allowed for a Timestamp in the future. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

const TOPIC_ARN = /^arn:aws(?:-[a-z]+)*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/
const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/
const MESSAGE_ID = /^[A-Za-z0-9-]{1,128}$/

/** The configured topic ARN, or null when it is missing or malformed (then nothing is accepted). */
export function expectedTopicArn(value: string | undefined): string | null {
  const arn = value?.trim()
  return arn && TOPIC_ARN.test(arn) ? arn : null
}

/** An AWS SNS URL: https, sns.<region>.amazonaws.com, default port, no credentials. */
export function isSnsUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === "https:" &&
    SNS_HOST.test(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  )
}

/** SigningCertURL must be an AWS SNS certificate: an SNS URL to a .pem file. */
export function isValidSigningCertUrl(value: string): boolean {
  return isSnsUrl(value) && new URL(value).pathname.endsWith(".pem")
}

const SIGNED_FIELDS: Record<SnsMessageType, readonly (keyof SnsMessage)[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
  UnsubscribeConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
}

/** The canonical string SNS signs: "Name\nvalue\n" for each signed field present, in order. */
export function stringToSign(message: SnsMessage): string {
  let out = ""
  for (const field of SIGNED_FIELDS[message.Type]) {
    const value = message[field]
    // Subject is the only optional signed field (Notification only).
    if (value === undefined) continue
    out += `${field}\n${value}\n`
  }
  return out
}

/** The parsed body as an SNS message, or null when a field SNS always sends is missing. */
export function parseSnsMessage(raw: string): SnsMessage | null {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null
  const m = body as Record<string, unknown>
  const str = (k: string) => typeof m[k] === "string"
  const type = m.Type
  if (
    type !== "Notification" &&
    type !== "SubscriptionConfirmation" &&
    type !== "UnsubscribeConfirmation"
  ) {
    return null
  }
  for (const k of ["MessageId", "TopicArn", "Message", "Timestamp", "Signature", "SigningCertURL"]) {
    if (!str(k)) return null
  }
  if (m.SignatureVersion !== "1" && m.SignatureVersion !== "2") return null
  if (!MESSAGE_ID.test(m.MessageId as string)) return null
  if (m.Subject !== undefined && !str("Subject")) return null
  if (type !== "Notification" && (!str("Token") || !str("SubscribeURL"))) return null
  return m as unknown as SnsMessage
}

export type CertFetcher = (url: string) => Promise<string>

const certCache = new LRUCache<string, string>({ max: 16, ttl: 24 * 60 * 60 * 1000 })

/**
 * Fetch an SNS signing certificate (PEM). Only called with a URL that passed
 * isValidSigningCertUrl; no redirects, a 5 s timeout and a size cap. Cached
 * per URL for a day.
 */
export const fetchSigningCert: CertFetcher = async (url) => {
  const cached = certCache.get(url)
  if (cached) return cached
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`signing cert fetch failed: ${res.status}`)
  const pem = await res.text()
  if (pem.length > 16 * 1024 || !pem.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("signing cert is not a PEM certificate")
  }
  certCache.set(url, pem)
  return pem
}

export interface VerifyOptions {
  /** expectedTopicArn(env.SES_FEEDBACK_SNS_TOPIC_ARN). */
  topicArn: string | null
  fetchCert?: CertFetcher
  now?: Date
}

/** Verify an SNS POST body. See the module comment for what is checked. */
export async function verifySnsMessage(
  raw: string,
  options: VerifyOptions,
): Promise<SnsVerifyResult> {
  if (!options.topicArn) return { ok: false, reason: "not_configured" }
  const message = parseSnsMessage(raw)
  if (!message) return { ok: false, reason: "malformed" }
  if (message.TopicArn !== options.topicArn) return { ok: false, reason: "wrong_topic" }
  if (!isValidSigningCertUrl(message.SigningCertURL)) {
    return { ok: false, reason: "bad_cert_url" }
  }

  const now = (options.now ?? new Date()).getTime()
  const sent = Date.parse(message.Timestamp)
  if (Number.isNaN(sent)) return { ok: false, reason: "malformed" }
  if (now - sent > MAX_MESSAGE_AGE_MS || sent - now > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "stale" }
  }

  let pem: string
  try {
    pem = await (options.fetchCert ?? fetchSigningCert)(message.SigningCertURL)
  } catch {
    return { ok: false, reason: "cert_unavailable" }
  }

  try {
    const cert = new X509Certificate(pem)
    if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) {
      return { ok: false, reason: "bad_signature" }
    }
    const verifier = createVerify(message.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1")
    verifier.update(stringToSign(message), "utf8")
    const valid = verifier.verify(cert.publicKey, message.Signature, "base64")
    return valid ? { ok: true, message } : { ok: false, reason: "bad_signature" }
  } catch {
    return { ok: false, reason: "bad_signature" }
  }
}
