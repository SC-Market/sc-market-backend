/**
 * SNS signature verification for the SES feedback webhook: a message is
 * accepted only when it is signed by the SNS certificate, from the configured
 * topic, fresh, and its cert URL is an AWS SNS .pem. Fixture payloads are
 * signed with a test-only key (sns-test-helpers.ts).
 */
import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import {
  expectedTopicArn,
  isValidSigningCertUrl,
  stringToSign,
  verifySnsMessage,
  type SnsMessage,
} from "./sns-signature.js"
import {
  CERT_URL,
  FIXTURE_TIME,
  TOPIC_ARN,
  fetchTestCert,
  messageTimePlus,
  sesFixture,
  sign,
  signedNotification,
  signedSubscriptionConfirmation,
} from "./sns-test-helpers.js"

const opts = { topicArn: TOPIC_ARN, fetchCert: fetchTestCert, now: FIXTURE_TIME }
const verify = (m: SnsMessage | string, o: Partial<typeof opts> = {}) =>
  verifySnsMessage(typeof m === "string" ? m : JSON.stringify(m), { ...opts, ...o })

describe("verifySnsMessage: accepts", () => {
  it("a signed Notification (SignatureVersion 2, SHA256) carrying an SES bounce", async () => {
    const message = signedNotification(sesFixture("ses-bounce-permanent.json"))
    const result = await verify(message)
    expect(result).toEqual({ ok: true, message })
  })

  it("SignatureVersion 1 (SHA1), the SNS default", async () => {
    const result = await verify(
      signedNotification(sesFixture("ses-complaint.json"), { SignatureVersion: "1" }),
    )
    expect(result.ok).toBe(true)
  })

  it("a Notification with a Subject (signed between MessageId and Timestamp)", async () => {
    const message = signedNotification(sesFixture("ses-delivery.json"), { Subject: "Amazon SES Email Event Notification" })
    expect(stringToSign(message)).toContain("MessageId\n" + message.MessageId + "\nSubject\nAmazon SES Email Event Notification\nTimestamp\n")
    expect((await verify(message)).ok).toBe(true)
  })

  it("a signed SubscriptionConfirmation (SubscribeURL and Token are signed)", async () => {
    const message = signedSubscriptionConfirmation()
    expect(stringToSign(message)).toMatch(/^Message\n.*\nMessageId\n.*\nSubscribeURL\n.*\nTimestamp\n.*\nToken\n.*\nTopicArn\n.*\nType\nSubscriptionConfirmation\n$/s)
    expect((await verify(message)).ok).toBe(true)
  })
})

describe("verifySnsMessage: refuses", () => {
  it("everything when no topic is configured (fail closed), without fetching a cert", async () => {
    const fetchCert = vi.fn(fetchTestCert)
    const message = signedNotification(sesFixture("ses-bounce-permanent.json"))
    expect(await verify(message, { topicArn: null as never, fetchCert })).toEqual({
      ok: false,
      reason: "not_configured",
    })
    expect(fetchCert).not.toHaveBeenCalled()
  })

  it("an unsigned post", async () => {
    const unsigned = { ...signedNotification(sesFixture("ses-bounce-permanent.json")), Signature: "" }
    expect(await verify(unsigned)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("a post with no signature fields at all (plain SES JSON)", async () => {
    expect(await verify(sesFixture("ses-bounce-permanent.json"))).toEqual({
      ok: false,
      reason: "malformed",
    })
  })

  it.each([
    ["Message", { Message: sesFixture("ses-bounce-permanent.json").replace("Gone.Seller", "someone.else") }],
    ["MessageId", { MessageId: "0f6c2f3e-0000-4000-8000-999999999999" }],
    ["Timestamp", { Timestamp: messageTimePlus(1000) }],
    ["Type", { Type: "UnsubscribeConfirmation" as const, Token: "t", SubscribeURL: "https://sns.us-east-2.amazonaws.com/" }],
  ])("a signed message whose %s was changed afterwards", async (_field, change) => {
    const message = { ...signedNotification(sesFixture("ses-bounce-permanent.json")), ...change }
    expect(await verify(message)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("a message signed by another key, even with the SNS cert URL", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const forged = sign(
      { ...signedNotification(sesFixture("ses-bounce-permanent.json")) },
      privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    )
    expect(await verify(forged)).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("a correctly signed message from another topic", async () => {
    const other = signedNotification(sesFixture("ses-bounce-permanent.json"), {
      TopicArn: "arn:aws:sns:us-east-2:999999999999:someone-elses-topic",
    })
    expect(await verify(other)).toEqual({ ok: false, reason: "wrong_topic" })
  })

  it.each([
    "http://sns.us-east-2.amazonaws.com/SimpleNotificationService-x.pem",
    "https://sns.us-east-2.amazonaws.com.evil.example/SimpleNotificationService-x.pem",
    "https://evil.example/sns.us-east-2.amazonaws.com/x.pem",
    "https://s3.amazonaws.com/attacker-bucket/cert.pem",
    "https://sns.us-east-2.amazonaws.com:8443/SimpleNotificationService-x.pem",
    "https://user:pw@sns.us-east-2.amazonaws.com/SimpleNotificationService-x.pem",
    "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-x.txt",
    "not a url",
  ])("a SigningCertURL that is not an AWS SNS certificate (%s), without fetching it", async (url) => {
    const fetchCert = vi.fn(fetchTestCert)
    const message = signedNotification(sesFixture("ses-bounce-permanent.json"), { SigningCertURL: url })
    expect(await verify(message, { fetchCert })).toEqual({ ok: false, reason: "bad_cert_url" })
    expect(fetchCert).not.toHaveBeenCalled()
    expect(isValidSigningCertUrl(url)).toBe(false)
  })

  it("a message older than a day, or from the future", async () => {
    const message = signedNotification(sesFixture("ses-bounce-permanent.json"))
    const day = 24 * 60 * 60 * 1000
    expect(await verify(message, { now: new Date(Date.parse(message.Timestamp) + day + 1000) })).toEqual({
      ok: false,
      reason: "stale",
    })
    expect(await verify(message, { now: new Date(Date.parse(message.Timestamp) - 10 * 60 * 1000) })).toEqual({
      ok: false,
      reason: "stale",
    })
  })

  it("when the certificate can't be fetched", async () => {
    const message = signedNotification(sesFixture("ses-bounce-permanent.json"))
    const fetchCert = async () => {
      throw new Error("network down")
    }
    expect(await verify(message, { fetchCert })).toEqual({ ok: false, reason: "cert_unavailable" })
  })

  it("when the certificate is expired", async () => {
    // The test cert is valid for 36500 days; check past that, with a message from then.
    const later = new Date(FIXTURE_TIME.getTime() + 36600 * 24 * 60 * 60 * 1000)
    const message = signedNotification(sesFixture("ses-bounce-permanent.json"), {
      Timestamp: later.toISOString(),
    })
    expect(await verify(message, { now: later })).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("an unknown SignatureVersion or Type", async () => {
    const base = signedNotification(sesFixture("ses-bounce-permanent.json"))
    expect(await verify({ ...base, SignatureVersion: "3" as never })).toEqual({ ok: false, reason: "malformed" })
    expect(await verify({ ...base, Type: "Other" as never })).toEqual({ ok: false, reason: "malformed" })
  })

  it("bodies that are not a JSON object", async () => {
    for (const raw of ["", "null", "[]", "{", '"x"']) {
      expect(await verify(raw)).toEqual({ ok: false, reason: "malformed" })
    }
  })

  it("a SubscriptionConfirmation without its Token", async () => {
    const { Token: _t, ...rest } = signedSubscriptionConfirmation()
    void _t
    expect(await verify(rest as SnsMessage)).toEqual({ ok: false, reason: "malformed" })
  })
})

describe("expectedTopicArn", () => {
  it("is null when unset, blank or not an SNS topic ARN", () => {
    expect(expectedTopicArn(undefined)).toBeNull()
    expect(expectedTopicArn("  ")).toBeNull()
    expect(expectedTopicArn("sc-market-ses-feedback")).toBeNull()
    expect(expectedTopicArn("arn:aws:sqs:us-east-2:123456789012:q")).toBeNull()
    expect(expectedTopicArn(` ${TOPIC_ARN} `)).toBe(TOPIC_ARN)
  })

  it("the cert URL in the fixtures is a valid SNS cert URL", () => {
    expect(isValidSigningCertUrl(CERT_URL)).toBe(true)
  })
})
