/**
 * Test helpers for the SES feedback webhook: SNS envelopes around the
 * fixtures in __fixtures__/, signed with a throwaway self-signed key pair
 * (CN=sns-test-only.invalid) standing in for AWS's SNS signing certificate.
 * The pair is generated per test run with the openssl CLI (Node can't issue
 * X.509 certificates) into a temp dir and deleted on exit; no private key is
 * kept in the repository. It grants nothing anyway: production only trusts
 * certificates fetched from https://sns.<region>.amazonaws.com/*.pem.
 *
 * The ses-*.json fixtures are SES notification bodies as SES puts them in an
 * SNS Notification's Message (shapes from the SES developer guide, "Amazon
 * SNS notification contents"); addresses use example.test.
 */
import { execFileSync } from "node:child_process"
import { createSign } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { stringToSign, type SnsMessage } from "./sns-signature.js"

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")

function generateTestSigningPair(): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), "sns-test-"))
  try {
    const key = join(dir, "key.pem")
    const cert = join(dir, "cert.pem")
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
        "-days", "36500", "-subj", "/CN=sns-test-only.invalid"],
      { stdio: "ignore" },
    )
    return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8") }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const pair = generateTestSigningPair()
export const TEST_SIGNING_KEY = pair.key
export const TEST_SIGNING_CERT = pair.cert
export const TOPIC_ARN = "arn:aws:sns:us-east-2:123456789012:sc-market-ses-feedback"
export const CERT_URL =
  "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-9c6465fa7f48f5cacd23014631ec1136.pem"
/** "Now" for verification: just after the test cert was issued (valid from issue time for 36500 days). */
export const FIXTURE_TIME = new Date(Date.now() + 60_000)
/** Timestamp of the envelopes: 25 s before FIXTURE_TIME. */
export const MESSAGE_TIME = new Date(FIXTURE_TIME.getTime() - 25_000)
export const messageTimePlus = (deltaMs: number): string =>
  new Date(MESSAGE_TIME.getTime() + deltaMs).toISOString()

export const sesFixture = (name: string): string => fixture(name)

export function sign(message: SnsMessage, key = TEST_SIGNING_KEY): SnsMessage {
  const signer = createSign(message.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1")
  signer.update(stringToSign(message), "utf8")
  return { ...message, Signature: signer.sign(key, "base64") }
}

let seq = 0

/** A signed SNS Notification carrying `sesBody` (a fixture's text). */
export function signedNotification(
  sesBody: string,
  overrides: Partial<SnsMessage> = {},
): SnsMessage {
  seq += 1
  return sign({
    Type: "Notification",
    MessageId: `0f6c2f3e-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    TopicArn: TOPIC_ARN,
    Message: sesBody,
    Timestamp: MESSAGE_TIME.toISOString(),
    SignatureVersion: "2",
    Signature: "",
    SigningCertURL: CERT_URL,
    UnsubscribeURL: `https://sns.us-east-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=${TOPIC_ARN}:1`,
    ...overrides,
  })
}

export function signedSubscriptionConfirmation(overrides: Partial<SnsMessage> = {}): SnsMessage {
  const base = JSON.parse(fixture("sns-subscription-confirmation.json")) as SnsMessage
  return sign({ ...base, Timestamp: MESSAGE_TIME.toISOString(), ...overrides })
}

export const fetchTestCert = async (url: string): Promise<string> => {
  if (url !== CERT_URL) throw new Error(`unexpected cert url ${url}`)
  return TEST_SIGNING_CERT
}
