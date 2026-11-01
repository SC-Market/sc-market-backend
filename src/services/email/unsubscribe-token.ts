/**
 * Signed one-click unsubscribe links for notification emails.
 *
 * Every notification email carries a link (and RFC 8058 List-Unsubscribe /
 * List-Unsubscribe-Post headers) that turns off one email category for the
 * recipient, with no login: the link is a capability signed with an HMAC key
 * derived from SESSION_SECRET. Nothing is stored per email.
 *
 * Token: `u1.<base64url payload>.<base64url HMAC-SHA256>`, payload
 * `{ u: userId, s: scope, c: contractorId | null }`:
 * - scope `cat:<category>`: a catalog category (catalog.ts CATEGORIES), e.g.
 *   every order email for an order-status email;
 * - scope `act:<action>`: one notification action that is not in the catalog;
 * - scope `key_defaults`: the key events turned on by default
 *   (email-defaults.ts), for the one-time "we turned these on" notice;
 * - contractorId: the preference scope the email was sent under (an org's
 *   notifications to its members), null for Personal.
 *
 * Tokens don't expire: an old email's link must keep working. Rotating
 * SESSION_SECRET invalidates every link already sent.
 *
 * Mandatory categories (announcements, account) can't be turned off (owner
 * decision), so their emails get no unsubscribe link, only "Manage
 * preferences" (see unsubscribeScopeFor).
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "../../config/env.js"
import { CATALOG, CATEGORIES, type CategoryId, type EventDefinition } from "../notify/catalog.js"

export type UnsubscribeScope =
  | { kind: "category"; category: CategoryId }
  | { kind: "action"; action: string }
  | { kind: "key_defaults" }

export interface UnsubscribeClaim {
  userId: string
  scope: UnsubscribeScope
  /** Preference scope of the email: an org (its members' rows) or Personal (null). */
  contractorId: string | null
}

const PREFIX = "u1"

function key(secret: string): Buffer {
  // Domain-separated from every other use of SESSION_SECRET.
  return createHmac("sha256", secret).update("sc-market/email-unsubscribe/v1").digest()
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", key(secret)).update(payload).digest("base64url")
}

function encodeScope(scope: UnsubscribeScope): string {
  if (scope.kind === "category") return `cat:${scope.category}`
  if (scope.kind === "action") return `act:${scope.action}`
  return "key_defaults"
}

function decodeScope(raw: unknown): UnsubscribeScope | null {
  if (typeof raw !== "string") return null
  if (raw === "key_defaults") return { kind: "key_defaults" }
  if (raw.startsWith("cat:")) {
    const category = raw.slice(4)
    if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category)) return null
    return { kind: "category", category: category as CategoryId }
  }
  if (raw.startsWith("act:") && /^[a-z0-9_]{1,64}$/.test(raw.slice(4))) {
    return { kind: "action", action: raw.slice(4) }
  }
  return null
}

function requireSecret(secret: string | undefined): string {
  if (!secret) throw new Error("SESSION_SECRET is not set: cannot sign unsubscribe links")
  return secret
}

export function createUnsubscribeToken(
  claim: UnsubscribeClaim,
  secret: string | undefined = env.SESSION_SECRET,
): string {
  const payload = Buffer.from(
    JSON.stringify({ u: claim.userId, s: encodeScope(claim.scope), c: claim.contractorId }),
  ).toString("base64url")
  return `${PREFIX}.${payload}.${sign(payload, requireSecret(secret))}`
}

/** The claim of a valid signed token; null for anything else. */
export function verifyUnsubscribeToken(
  token: string,
  secret: string | undefined = env.SESSION_SECRET,
): UnsubscribeClaim | null {
  if (typeof token !== "string" || !secret) return null
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== PREFIX) return null
  const [, payload, signature] = parts
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let data: { u?: unknown; s?: unknown; c?: unknown }
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  const scope = decodeScope(data.s)
  if (typeof data.u !== "string" || !data.u || !scope) return null
  if (data.c !== null && typeof data.c !== "string") return null
  return { userId: data.u, scope, contractorId: data.c }
}

/** True for the 64-hex single-row tokens the emails carried before signed links. */
export function isLegacyUnsubscribeToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token)
}

function catalogDefFor(action: string): EventDefinition | undefined {
  return (Object.values(CATALOG) as EventDefinition[]).find(
    (def) => def.legacyAction === action || def.mergedActions?.includes(action),
  )
}

/**
 * What the unsubscribe link of an email for `action` turns off: the action's
 * catalog category, or the action alone when it is not in the catalog. Null
 * for mandatory categories (they can't be turned off).
 */
export function unsubscribeScopeFor(action: string): UnsubscribeScope | null {
  const def = catalogDefFor(action)
  if (!def) return { kind: "action", action }
  if (CATEGORIES[def.category].mandatory) return null
  return { kind: "category", category: def.category }
}

const frontendUrl = () => env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space"

/**
 * Settings → Notifications (needs login; that's where all choices are made).
 * `tab=email` is the name every email has always used; the frontend maps it
 * to the Notifications tab (settingsTabs.ts TAB_ALIASES).
 */
export function preferencesUrl(): string {
  return `${frontendUrl()}/settings?tab=email`
}

/** The confirmation page: opening it unsubscribes at once, no login. */
export function unsubscribePageUrl(token: string): string {
  return `${frontendUrl()}/email/unsubscribe/${token}`
}

/**
 * RFC 8058 one-click endpoint (POST, no login) for List-Unsubscribe. Null
 * when BACKEND_URL is not an https URL (local development): the header must
 * be https.
 */
export function oneClickUnsubscribeUrl(token: string): string | null {
  const base = env.BACKEND_URL
  if (!base || !base.startsWith("https://")) return null
  return `${base.replace(/\/+$/, "")}/api/v1/email/unsubscribe/${token}`
}

/** List-Unsubscribe headers for an email (empty when there is no https backend URL). */
export function listUnsubscribeHeaders(token: string): Record<string, string> {
  const url = oneClickUnsubscribeUrl(token)
  if (!url) return {}
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

export interface UnsubscribeLinks {
  /** Footer link; undefined for mandatory categories. */
  unsubscribeUrl?: string
  preferencesUrl: string
  headers: Record<string, string>
}

/** Footer links and headers of a notification email. */
export function unsubscribeLinksFor(
  userId: string,
  action: string,
  contractorId: string | null,
): UnsubscribeLinks {
  const scope = unsubscribeScopeFor(action)
  if (!scope) return { preferencesUrl: preferencesUrl(), headers: {} }
  const token = createUnsubscribeToken({ userId, scope, contractorId })
  return {
    unsubscribeUrl: unsubscribePageUrl(token),
    preferencesUrl: preferencesUrl(),
    headers: listUnsubscribeHeaders(token),
  }
}

/** The one-time notice's "turn these off" link (the key defaults, Personal). */
export function keyDefaultsUnsubscribeUrl(userId: string): string {
  return unsubscribePageUrl(
    createUnsubscribeToken({ userId, scope: { kind: "key_defaults" }, contractorId: null }),
  )
}
