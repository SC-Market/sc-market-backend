/**
 * TOTP (RFC 6238): SHA1, 6 digits, 30 s period, ±1 step, 20-byte secret.
 * otplib computes the codes; the comparison is ours, so every candidate step
 * is compared with timingSafeEqual and the matched step is returned for
 * replay protection.
 */

import crypto from "node:crypto"
import { generateSync, ScureBase32Plugin } from "otplib"
import qrcode from "qrcode-generator"
import type { FactorProvider } from "../registry.js"

export const TOTP_PERIOD = 30
export const TOTP_DIGITS = 6
export const TOTP_WINDOW = 1
export const ISSUER = "SC Market"

const base32 = new ScureBase32Plugin()

export function base32Encode(secret: Buffer): string {
  return base32.encode(new Uint8Array(secret))
}

export function codeForStep(secret: Buffer, step: number): string {
  return generateSync({
    secret: new Uint8Array(secret),
    strategy: "hotp",
    counter: step,
    digits: TOTP_DIGITS,
    algorithm: "sha1",
  })
}

export function stepAt(epochSeconds: number): number {
  return Math.floor(epochSeconds / TOTP_PERIOD)
}

/**
 * Compare `input` with the codes for steps t-1, t and t+1. Always runs all
 * comparisons. Returns the matching step, or null.
 */
export function matchStep(
  secret: Buffer,
  input: string,
  epochSeconds: number,
): number | null {
  const candidate = Buffer.from(
    /^\d{6}$/.test(input) ? input : "------",
    "utf8",
  )
  const now = stepAt(epochSeconds)
  let matched: number | null = null
  for (let step = now - TOTP_WINDOW; step <= now + TOTP_WINDOW; step++) {
    const expected = Buffer.from(codeForStep(secret, step), "utf8")
    if (crypto.timingSafeEqual(expected, candidate) && /^\d{6}$/.test(input)) {
      matched = step
    }
  }
  return matched
}

export function otpauthUri(username: string, secretB32: string): string {
  const label = encodeURIComponent(`${ISSUER}:${username}`)
  const params = new URLSearchParams({
    secret: secretB32,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  })
  // URLSearchParams encodes spaces as "+"; authenticator apps expect %20.
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, "%20")}`
}

export function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M")
  qr.addData(text)
  qr.make()
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

/** Manual-entry key in groups of 4. */
export function groupKey(secretB32: string): string {
  return secretB32.replace(/=+$/, "").match(/.{1,4}/g)!.join(" ")
}

export const totpProvider: FactorProvider = {
  type: "totp",
  amr: "otp",
  async beginEnrollment(user) {
    const secret = crypto.randomBytes(20)
    const b32 = base32Encode(secret)
    const uri = otpauthUri(user.username, b32)
    return {
      secret,
      publicData: {},
      display: {
        otpauth_uri: uri,
        qr_data_url: qrDataUrl(uri),
        manual_key: groupKey(b32),
      },
    }
  },
  async verify(_factor, secret, input, epochSeconds) {
    if (!secret) return { ok: false }
    const step = matchStep(secret, input.trim(), epochSeconds)
    return step === null ? { ok: false } : { ok: true, counter: step }
  },
}
