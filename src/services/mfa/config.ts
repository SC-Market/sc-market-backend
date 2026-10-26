/**
 * MFA configuration from the environment.
 *
 * ADMIN_MFA_ENFORCE ("true" | "false") is the rollback switch. It is an env
 * var, not a feature flag, on purpose: feature flags are admin-controlled, so
 * a stolen admin session could switch enforcement off. Unset means on in
 * production and off elsewhere. Any other value is treated as "true".
 *
 * MFA_ENC_KEYS is a JSON map {kid: base64(32 bytes)}; MFA_ENC_ACTIVE_KID
 * names the key new secrets are sealed with (optional when there is exactly
 * one key). Without a valid key nothing can be enrolled, so enforcement is
 * reported as "unconfigured" and admins keep their pre-MFA access rather than
 * being locked out of admin features they cannot unlock. That state is logged
 * as an error at startup.
 */

import logger from "../../logger/logger.js"

export type MfaEnforcement = "enforce" | "off" | "unconfigured"

export interface MfaKeyring {
  keys: Map<string, Buffer>
  activeKid: string
}

type KeyringResult =
  | { ok: true; keyring: MfaKeyring }
  | { ok: false; reason: string }

export function parseKeyring(
  rawKeys: string | undefined,
  rawActive: string | undefined,
): KeyringResult {
  if (!rawKeys) return { ok: false, reason: "MFA_ENC_KEYS is not set" }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawKeys)
  } catch {
    return { ok: false, reason: "MFA_ENC_KEYS is not valid JSON" }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "MFA_ENC_KEYS must be a JSON object" }
  }
  const keys = new Map<string, Buffer>()
  for (const [kid, value] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(kid)) {
      return { ok: false, reason: `MFA_ENC_KEYS: invalid key id "${kid}"` }
    }
    const key = typeof value === "string" ? Buffer.from(value, "base64") : null
    if (!key || key.length !== 32) {
      return { ok: false, reason: `MFA_ENC_KEYS: key "${kid}" is not 32 bytes of base64` }
    }
    keys.set(kid, key)
  }
  if (keys.size === 0) return { ok: false, reason: "MFA_ENC_KEYS is empty" }
  const activeKid = rawActive || (keys.size === 1 ? [...keys.keys()][0] : "")
  if (!activeKid) {
    return { ok: false, reason: "MFA_ENC_ACTIVE_KID is required with more than one key" }
  }
  if (!keys.has(activeKid)) {
    return { ok: false, reason: `MFA_ENC_ACTIVE_KID "${activeKid}" is not in MFA_ENC_KEYS` }
  }
  return { ok: true, keyring: { keys, activeKid } }
}

export function enforcementRequested(env: {
  ADMIN_MFA_ENFORCE?: string
  NODE_ENV?: string
}): boolean {
  const value = env.ADMIN_MFA_ENFORCE
  if (value === undefined || value === "") return env.NODE_ENV === "production"
  return value !== "false"
}

let cache: { signature: string; keyring: KeyringResult } | null = null
let loggedProblem = ""

function keyringFromEnv(): KeyringResult {
  const signature = `${process.env.MFA_ENC_KEYS ?? ""}|${process.env.MFA_ENC_ACTIVE_KID ?? ""}`
  if (!cache || cache.signature !== signature) {
    cache = {
      signature,
      keyring: parseKeyring(process.env.MFA_ENC_KEYS, process.env.MFA_ENC_ACTIVE_KID),
    }
  }
  return cache.keyring
}

/** The keyring, or null when MFA_ENC_KEYS is missing or invalid. */
export function getKeyring(): MfaKeyring | null {
  const result = keyringFromEnv()
  return result.ok ? result.keyring : null
}

export function getMfaEnforcement(): MfaEnforcement {
  if (
    !enforcementRequested({
      ADMIN_MFA_ENFORCE: process.env.ADMIN_MFA_ENFORCE,
      NODE_ENV: process.env.NODE_ENV,
    })
  ) {
    return "off"
  }
  const result = keyringFromEnv()
  if (!result.ok) {
    if (loggedProblem !== result.reason) {
      loggedProblem = result.reason
      logger.error(
        `[mfa] ADMIN_MFA_ENFORCE is on but ${result.reason}; admin MFA is NOT enforced until it is configured`,
      )
    }
    return "unconfigured"
  }
  return "enforce"
}

/** Windows (owner decision, admin-2fa-design.md section 11.7). */
export const ADMIN_MFA_MAX_AGE_SECONDS = 24 * 60 * 60
export const STEP_UP_MAX_AGE_SECONDS = 10 * 60
