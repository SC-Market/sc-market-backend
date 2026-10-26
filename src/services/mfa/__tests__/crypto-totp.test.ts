import { describe, it, expect, vi } from "vitest"
import crypto from "node:crypto"
import { parseKeyring, enforcementRequested } from "../config.js"
import {
  aadFor,
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  open,
  seal,
  verifyRecoveryCode,
} from "../crypto.js"
import {
  codeForStep,
  groupKey,
  matchStep,
  otpauthUri,
  qrDataUrl,
  base32Encode,
  totpProvider,
} from "../providers/totp.js"
import { getProvider, registeredTypes } from "../registry.js"
import "../service.js" // registers the totp provider

const key = (b = 1) => Buffer.alloc(32, b).toString("base64")

describe("RFC 6238 TOTP (SHA1)", () => {
  // RFC 6238 appendix B, SHA1 seed "12345678901234567890". The 6-digit code is
  // the last 6 digits of the published 8-digit value.
  const seed = Buffer.from("12345678901234567890", "ascii")
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("T=%i", (t, eight) => {
    expect(codeForStep(seed, Math.floor(t / 30))).toBe(eight.slice(2))
    expect(matchStep(seed, eight.slice(2), t)).toBe(Math.floor(t / 30))
  })

  it("accepts ±1 step and rejects t-2 / t+2", () => {
    const t = 1_700_000_000
    const step = Math.floor(t / 30)
    for (const d of [-1, 0, 1]) expect(matchStep(seed, codeForStep(seed, step + d), t)).toBe(step + d)
    for (const d of [-2, 2]) expect(matchStep(seed, codeForStep(seed, step + d), t)).toBeNull()
  })

  it("rejects malformed input", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 345"]) {
      expect(matchStep(seed, bad, 59)).toBeNull()
    }
  })

  it("runs every comparison (no early exit) with timingSafeEqual", () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual")
    const t = 1_700_000_000
    matchStep(seed, codeForStep(seed, Math.floor(t / 30) - 1), t)
    expect(spy).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })

  it("builds the otpauth URI the authenticator apps expect", () => {
    const uri = otpauthUri("bob", base32Encode(seed))
    expect(uri).toBe(
      "otpauth://totp/SC%20Market%3Abob?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=SC%20Market&algorithm=SHA1&digits=6&period=30",
    )
    expect(qrDataUrl(uri)).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(groupKey("GEZDGNBVGY3TQOJQ")).toBe("GEZD GNBV GY3T QOJQ")
  })

  it("enrolls with a fresh 20-byte secret", async () => {
    const m = await totpProvider.beginEnrollment({ user_id: "u", username: "bob" }, "x")
    expect(m.secret).toHaveLength(20)
    expect(m.display.otpauth_uri).toContain(base32Encode(m.secret!))
  })
})

describe("provider registry", () => {
  it("has totp and rejects unknown types", () => {
    expect(registeredTypes()).toContain("totp")
    expect(getProvider("totp").amr).toBe("otp")
    expect(() => getProvider("sms")).toThrow(/No MFA provider/)
  })
})

describe("secret envelope (AES-256-GCM)", () => {
  const ring = parseKeyring(JSON.stringify({ k1: key(1), k2: key(2) }), "k1")
  if (!ring.ok) throw new Error(ring.reason)
  const keyring = ring.keyring
  const secret = crypto.randomBytes(20)
  const aad = aadFor("f1", "u1", "totp")

  it("round-trips and records the key id", () => {
    const sealed = seal(secret, aad, keyring)
    expect(sealed.kid).toBe("k1")
    expect(sealed.ciphertext).toMatch(/^v1\.k1\./)
    expect(open(sealed.ciphertext, aad, keyring).equals(secret)).toBe(true)
  })

  it("opens with a non-active key after rotation", () => {
    const sealed = seal(secret, aad, keyring)
    const rotated = { ...keyring, activeKid: "k2" }
    expect(open(sealed.ciphertext, aad, rotated).equals(secret)).toBe(true)
  })

  it("fails on unknown kid, tampered tag or ciphertext, and AAD mismatch", () => {
    const { ciphertext } = seal(secret, aad, keyring)
    const parts = ciphertext.split(".")
    expect(() => open(ciphertext.replace("v1.k1.", "v1.k9."), aad, keyring)).toThrow(/Unknown MFA key/)
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1)
    expect(() => open([...parts.slice(0, 4), flip(parts[4])].join("."), aad, keyring)).toThrow()
    expect(() => open([...parts.slice(0, 3), flip(parts[3]), parts[4]].join("."), aad, keyring)).toThrow()
    expect(() => open(ciphertext, aadFor("f2", "u1", "totp"), keyring)).toThrow()
    expect(() => open(ciphertext, aadFor("f1", "u2", "totp"), keyring)).toThrow()
    expect(() => open("v2.k1.a.b.c", aad, keyring)).toThrow(/Unsupported/)
  })
})

describe("keyring and enforcement config", () => {
  it("parses a valid keyring, defaulting the active kid with one key", () => {
    const r = parseKeyring(JSON.stringify({ a: key() }), undefined)
    expect(r.ok && r.keyring.activeKid).toBe("a")
  })

  it.each([
    [undefined, undefined, /not set/],
    ["nope", undefined, /not valid JSON/],
    ["[]", undefined, /JSON object/],
    [JSON.stringify({ a: "c2hvcnQ=" }), undefined, /32 bytes/],
    [JSON.stringify({ "bad kid": key() }), undefined, /invalid key id/],
    [JSON.stringify({ a: key(), b: key(2) }), undefined, /required/],
    [JSON.stringify({ a: key() }), "b", /not in MFA_ENC_KEYS/],
  ])("rejects %s / %s", (keys, active, reason) => {
    const r = parseKeyring(keys, active)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(reason)
  })

  it("defaults enforcement on in production only; anything but 'false' is on", () => {
    expect(enforcementRequested({ NODE_ENV: "production" })).toBe(true)
    expect(enforcementRequested({ NODE_ENV: "development" })).toBe(false)
    expect(enforcementRequested({ NODE_ENV: "production", ADMIN_MFA_ENFORCE: "false" })).toBe(false)
    expect(enforcementRequested({ NODE_ENV: "development", ADMIN_MFA_ENFORCE: "true" })).toBe(true)
    expect(enforcementRequested({ NODE_ENV: "production", ADMIN_MFA_ENFORCE: "yes" })).toBe(true)
  })
})

describe("recovery codes", () => {
  it("are XXXXX-XXXXX from an unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRecoveryCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
    }
  })

  it("verify against their scrypt hash, ignoring case, dashes and spaces", async () => {
    const code = generateRecoveryCode()
    const hash = await hashRecoveryCode(code)
    expect(hash).toMatch(/^scrypt\$/)
    expect(await verifyRecoveryCode(code, hash)).toBe(true)
    expect(await verifyRecoveryCode(` ${code.toLowerCase().replace("-", " ")} `, hash)).toBe(true)
    expect(await verifyRecoveryCode(generateRecoveryCode(), hash)).toBe(false)
    expect(await verifyRecoveryCode(code, "md5$x$y")).toBe(false)
    expect(normalizeRecoveryCode("ab-c d")).toBe("ABCD")
  })
})
