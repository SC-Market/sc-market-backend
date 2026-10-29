/**
 * Public API tokens (public_api_tokens): minting, listing, revoking, and the
 * lookup the public router authenticates with.
 *
 * - The secret is `scmp_live_<64 hex>` (`scmp_test_` for test accounts), shown
 *   once at creation. Only its SHA-256 is stored, plus the last 4 characters.
 * - Tokens are minted from a preset (scope-catalog.ts) with a required expiry
 *   and an explicit org grant: orgs the minter belongs to, by spectrum id.
 * - Positive lookups are cached for 30 s per instance (doc §5); revoking
 *   evicts the entry on this instance. Expiry and revocation are re-checked
 *   on every request against the cached row.
 */

import crypto from "node:crypto"
import { LRUCache } from "lru-cache"
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import type { DBPublicApiToken } from "../../clients/database/db-models.js"
import {
  PUBLIC_TOKEN_MAX_ACTIVE,
  PUBLIC_TOKEN_MAX_LIFETIME_DAYS,
  PUBLIC_TOKEN_PRESETS,
  isPublicTokenPreset,
  type PublicTokenPreset,
} from "../../api/routes/public/v1/scope-catalog.js"

/** Prefix of every public API token. Legacy api_tokens use `scm_`. */
export const PUBLIC_TOKEN_PREFIX = "scmp_"
const LIVE_PREFIX = "scmp_live_"
const TEST_PREFIX = "scmp_test_"

const TOKEN_FORMAT = /^scmp_(live|test)_[0-9a-f]{64}$/

export function isPublicTokenString(value: string): boolean {
  return value.startsWith(PUBLIC_TOKEN_PREFIX)
}

export function hashPublicToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function generatePublicToken(isTest: boolean): string {
  return `${isTest ? TEST_PREFIX : LIVE_PREFIX}${crypto.randomBytes(32).toString("hex")}`
}

/** A minting or revocation problem the caller reports as 4xx. */
export class PublicTokenRequestError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
    public readonly field?: string,
  ) {
    super(message)
    this.name = "PublicTokenRequestError"
  }
}

export interface MintPublicTokenInput {
  name: string
  description?: string | null
  preset: string
  /** Orgs to grant, by spectrum id. Empty: personal shops only. */
  org_spectrum_ids: string[]
  expires_in_days: number
}

export interface MintedPublicToken {
  /** The secret. Returned once, never stored. */
  token: string
  record: DBPublicApiToken
}

/** Orgs the user may grant to a token: the orgs they are a member of. */
export async function grantableOrgs(
  userId: string,
  db: Knex = getKnex(),
): Promise<{ contractor_id: string; spectrum_id: string; name: string }[]> {
  return db("contractor_members as cm")
    .join("contractors as c", "cm.contractor_id", "c.contractor_id")
    .where("cm.user_id", userId)
    .whereNot("c.archived", true)
    .select("c.contractor_id", "c.spectrum_id", "c.name")
    .orderBy("c.name", "asc")
}

export async function mintPublicToken(
  user: { user_id: string; is_test?: boolean | null },
  input: MintPublicTokenInput,
  db: Knex = getKnex(),
): Promise<MintedPublicToken> {
  const name = (input.name ?? "").trim()
  if (!name || name.length > 100) {
    throw new PublicTokenRequestError(
      400,
      "Name is required and must be at most 100 characters",
      "name",
    )
  }
  const description = input.description?.trim() || null
  if (description && description.length > 500) {
    throw new PublicTokenRequestError(
      400,
      "Description must be at most 500 characters",
      "description",
    )
  }
  if (!isPublicTokenPreset(input.preset)) {
    throw new PublicTokenRequestError(400, "Unknown preset", "preset")
  }
  const preset: PublicTokenPreset = input.preset
  const days = input.expires_in_days
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > PUBLIC_TOKEN_MAX_LIFETIME_DAYS
  ) {
    throw new PublicTokenRequestError(
      400,
      `expires_in_days must be a whole number from 1 to ${PUBLIC_TOKEN_MAX_LIFETIME_DAYS}`,
      "expires_in_days",
    )
  }

  const spectrumIds = [...new Set(input.org_spectrum_ids ?? [])]
  if (spectrumIds.length > 50) {
    throw new PublicTokenRequestError(
      400,
      "At most 50 orgs per token",
      "org_spectrum_ids",
    )
  }
  const allowed = await grantableOrgs(user.user_id, db)
  const bySpectrum = new Map(
    allowed.map((o) => [o.spectrum_id.toLowerCase(), o.contractor_id]),
  )
  const contractorIds: string[] = []
  for (const sid of spectrumIds) {
    const id = bySpectrum.get(String(sid).toLowerCase())
    if (!id) {
      throw new PublicTokenRequestError(
        400,
        `You are not a member of the org ${sid}`,
        "org_spectrum_ids",
      )
    }
    contractorIds.push(id)
  }

  const [{ count }] = await db("public_api_tokens")
    .where("user_id", user.user_id)
    .whereNull("revoked_at")
    .where("expires_at", ">", db.fn.now())
    .count<{ count: string }[]>("id as count")
  if (Number(count) >= PUBLIC_TOKEN_MAX_ACTIVE) {
    throw new PublicTokenRequestError(
      400,
      `At most ${PUBLIC_TOKEN_MAX_ACTIVE} active API tokens per account`,
    )
  }

  const token = generatePublicToken(user.is_test === true)
  const [record] = await db<DBPublicApiToken>("public_api_tokens")
    .insert({
      user_id: user.user_id,
      name,
      description,
      token_hash: hashPublicToken(token),
      token_hint: token.slice(-4),
      preset,
      scopes: [...PUBLIC_TOKEN_PRESETS[preset]],
      contractor_ids: contractorIds,
      expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    })
    .returning("*")
  return { token, record }
}

export async function listPublicTokens(
  userId: string,
  db: Knex = getKnex(),
): Promise<DBPublicApiToken[]> {
  return db<DBPublicApiToken>("public_api_tokens")
    .where("user_id", userId)
    .orderBy("created_at", "desc")
}

export async function revokePublicToken(
  userId: string,
  tokenId: string,
  db: Knex = getKnex(),
): Promise<DBPublicApiToken> {
  if (!/^[0-9a-f-]{36}$/i.test(tokenId))
    throw new PublicTokenRequestError(404, "Token not found")
  const [row] = await db<DBPublicApiToken>("public_api_tokens")
    .where({ id: tokenId, user_id: userId })
    .update({
      revoked_at: db.raw("COALESCE(revoked_at, now())"),
      updated_at: db.fn.now(),
    })
    .returning("*")
  if (!row) throw new PublicTokenRequestError(404, "Token not found")
  evictPublicToken(row.token_hash)
  return row
}

// ─── Lookup (public router) ─────────────────────────────────────────────────

const lookupCache = new LRUCache<string, DBPublicApiToken>({
  max: 5000,
  ttl: 30_000,
})

export function evictPublicToken(tokenHash: string): void {
  lookupCache.delete(tokenHash)
}

/** For tests. */
export function clearPublicTokenCache(): void {
  lookupCache.clear()
}

function usable(row: DBPublicApiToken, now: Date): boolean {
  return !row.revoked_at && new Date(row.expires_at).getTime() > now.getTime()
}

/**
 * The active token a bearer string names, or null (malformed, unknown,
 * revoked or expired).
 */
export async function findActivePublicToken(
  token: string,
  db: Knex = getKnex(),
  now: Date = new Date(),
): Promise<DBPublicApiToken | null> {
  if (!TOKEN_FORMAT.test(token)) return null
  const hash = hashPublicToken(token)
  const cached = lookupCache.get(hash)
  if (cached) {
    if (usable(cached, now)) return cached
    lookupCache.delete(hash)
    return null
  }
  const row = await db<DBPublicApiToken>("public_api_tokens")
    .where("token_hash", hash)
    .first()
  if (!row || !usable(row, now)) return null
  lookupCache.set(hash, row)
  return row
}
