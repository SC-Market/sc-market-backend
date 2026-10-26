/**
 * Secret sealing and recovery-code hashing for MFA (node:crypto only).
 *
 * Envelope: v1.<kid>.<iv b64url>.<ciphertext b64url>.<tag b64url>, AES-256-GCM
 * with a random 12-byte IV. The AAD binds the ciphertext to its row
 * (factor id | user id | type), so a ciphertext copied to another row or user
 * does not open.
 */

import crypto from "node:crypto"
import type { MfaKeyring } from "./config.js"

export interface SealedSecret {
  ciphertext: string
  kid: string
}

export function aadFor(factorId: string, userId: string, type: string): Buffer {
  return Buffer.from(`${factorId}|${userId}|${type}`, "utf8")
}

export function seal(plaintext: Buffer, aad: Buffer, keyring: MfaKeyring): SealedSecret {
  const kid = keyring.activeKid
  const key = keyring.keys.get(kid)!
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(aad)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const b = (x: Buffer) => x.toString("base64url")
  return { ciphertext: `v1.${kid}.${b(iv)}.${b(ct)}.${b(tag)}`, kid }
}

export function open(envelope: string, aad: Buffer, keyring: MfaKeyring): Buffer {
  const parts = envelope.split(".")
  if (parts.length !== 5 || parts[0] !== "v1") throw new Error("Unsupported MFA secret envelope")
  const [, kid, iv, ct, tag] = parts
  const key = keyring.keys.get(kid)
  if (!key) throw new Error(`Unknown MFA key id "${kid}"`)
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
  decipher.setAAD(aad)
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()])
}

// ── Recovery codes ─────────────────────────────────────────────────────────

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 32 symbols, no 0/O/1/I
const SCRYPT = { N: 2 ** 14, r: 8, p: 1, keylen: 32 }

/** 10 random symbols from a 32-symbol alphabet (50 bits), as XXXXX-XXXXX. */
export function generateRecoveryCode(): string {
  const bytes = crypto.randomBytes(10)
  let s = ""
  for (const byte of bytes) s += RECOVERY_ALPHABET[byte & 31]
  return `${s.slice(0, 5)}-${s.slice(5)}`
}

/** Upper-case, strip separators and whitespace. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "")
}

function scrypt(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(
      normalizeRecoveryCode(code),
      salt,
      SCRYPT.keylen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  )
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(code, salt)
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`
}

export async function verifyRecoveryCode(code: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$")
  if (scheme !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64url")
  const actual = await scrypt(code, Buffer.from(salt, "base64url"))
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}
