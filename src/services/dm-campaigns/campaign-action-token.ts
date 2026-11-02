/**
 * Signed, single-purpose, expiring links for the buttons of a DM campaign
 * (services/dm-campaigns/still-selling.service.ts), built like the email
 * unsubscribe tokens (services/email/unsubscribe-token.ts): an HMAC-SHA256
 * capability with a key derived from SESSION_SECRET, nothing stored per link,
 * no login needed.
 *
 * Token: `ca1.<base64url payload>.<base64url HMAC>`, payload
 * `{ c: campaign, u: userId, a: action, x: expiry (unix seconds) }`.
 * - One user: the action only touches the listings recorded for that user
 *   in dm_campaign_recipients, each re-checked against what the user may
 *   manage now.
 * - One action: a "keep" token can't pause, and the reverse.
 * - Expires TOKEN_TTL_DAYS after it was issued (when the DM was sent).
 * Rotating SESSION_SECRET invalidates every link already sent.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "../../config/env.js"

export const CAMPAIGN_ACTIONS = ["keep", "pause"] as const
export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number]

/** A link works this long after the DM was sent. */
export const TOKEN_TTL_DAYS = 30

export interface CampaignActionClaim {
  campaign: string
  userId: string
  action: CampaignAction
  expiresAt: Date
}

const PREFIX = "ca1"
const CAMPAIGN_RE = /^[a-z0-9_]{1,64}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function key(secret: string): Buffer {
  // Domain-separated from every other use of SESSION_SECRET.
  return createHmac("sha256", secret)
    .update("sc-market/dm-campaign-action/v1")
    .digest()
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", key(secret)).update(payload).digest("base64url")
}

export function createCampaignActionToken(
  claim: { campaign: string; userId: string; action: CampaignAction },
  opts: { now?: Date; secret?: string } = {},
): string {
  const secret = opts.secret ?? env.SESSION_SECRET
  if (!secret)
    throw new Error("SESSION_SECRET is not set: cannot sign campaign links")
  if (!CAMPAIGN_RE.test(claim.campaign))
    throw new Error(`Invalid campaign: ${claim.campaign}`)
  if (!CAMPAIGN_ACTIONS.includes(claim.action))
    throw new Error(`Invalid action: ${claim.action}`)
  const now = opts.now ?? new Date()
  const x = Math.floor(now.getTime() / 1000) + TOKEN_TTL_DAYS * 24 * 3600
  const payload = Buffer.from(
    JSON.stringify({ c: claim.campaign, u: claim.userId, a: claim.action, x }),
  ).toString("base64url")
  return `${PREFIX}.${payload}.${sign(payload, secret)}`
}

export type VerifyResult =
  | { ok: true; claim: CampaignActionClaim }
  | { ok: false; reason: "invalid" | "expired" }

/** Check a token's signature, shape and expiry. */
export function verifyCampaignActionToken(
  token: string,
  opts: { now?: Date; secret?: string } = {},
): VerifyResult {
  const secret = opts.secret ?? env.SESSION_SECRET
  if (typeof token !== "string" || !secret || token.length > 512)
    return { ok: false, reason: "invalid" }
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== PREFIX)
    return { ok: false, reason: "invalid" }
  const [, payload, signature] = parts
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid" }
  }
  let data: { c?: unknown; u?: unknown; a?: unknown; x?: unknown }
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "invalid" }
  }
  if (
    typeof data.c !== "string" ||
    !CAMPAIGN_RE.test(data.c) ||
    typeof data.u !== "string" ||
    !UUID_RE.test(data.u) ||
    !CAMPAIGN_ACTIONS.includes(data.a as CampaignAction) ||
    typeof data.x !== "number" ||
    !Number.isInteger(data.x)
  ) {
    return { ok: false, reason: "invalid" }
  }
  const expiresAt = new Date(data.x * 1000)
  if ((opts.now ?? new Date()).getTime() >= expiresAt.getTime())
    return { ok: false, reason: "expired" }
  return {
    ok: true,
    claim: {
      campaign: data.c,
      userId: data.u,
      action: data.a as CampaignAction,
      expiresAt,
    },
  }
}
