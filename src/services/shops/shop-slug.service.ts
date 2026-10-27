/**
 * Shop slugs: validation, reservation (anti-squatting), suggestions and
 * race-safe allocation.
 *
 * Reservation
 * - An org's Spectrum ID is reserved for that org's shop.
 * - `<username>-shop` (the personal shop default) and plain `<username>` are
 *   reserved for that user's personal shop. Plain `<username>` gives way when
 *   an org's Spectrum ID or another user's `<username>-shop` normalizes to
 *   the same slug, so each slug has one rightful holder.
 * - Names are compared after the same normalization that turns them into
 *   slugs (lowercase, runs of anything but a-z 0-9 - become one "-", trimmed),
 *   so "Foo_Bar" reserves "foo-bar-shop".
 * - The holder can always use its own reserved slug.
 * - Words in RESERVED_SHOP_SLUGS (route segments) are reserved for nobody.
 *
 * Existing shops: a shop whose slug already matches someone else's reserved
 * name, or a reserved word, keeps it. Its URL keeps working, and saving the
 * shop's settings with the slug unchanged is not re-checked. Only a new shop
 * or a rename to a different slug is checked. Once renamed away, the old slug
 * is free for its rightful holder only. findSlugReservationConflicts() lists
 * these shops (read-only).
 *
 * Race safety: shops.slug is UNIQUE (citext). Two creates can both pass the
 * check; the loser's INSERT fails with 23505. Auto-generated slugs retry
 * with the next free candidate; a user-chosen slug becomes a 409 with
 * suggestions (ShopSlugConflictError). Never a 500.
 */
import type { Knex } from "knex"
import { ReservedShopSlug, reservedShopSlug } from "./reserved-shop-slugs.js"
import type { Shop } from "./shop-permissions.service.js"

export const SHOP_SLUG_MIN_LENGTH = 3
export const SHOP_SLUG_MAX_LENGTH = 50
/** Longest base an auto-generated slug starts from, leaving room for a suffix. */
const AUTO_BASE_MAX_LENGTH = 45
const SHOP_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERSONAL_SUFFIX = "-shop"
const MAX_SUGGESTIONS = 4

/** Why a slug can't be used. */
export type ShopSlugUnavailableReason =
  | "invalid"
  | "reserved_word"
  | "reserved_org"
  | "reserved_user"
  | "taken"

export interface ShopSlugAvailabilityResponse {
  /** The slug that was checked (trimmed) */
  slug: string
  available: boolean
  /** Set when available is false */
  reason?: ShopSlugUnavailableReason
  /** Human-readable reason (English) when available is false */
  message?: string
  /** Spectrum ID (reserved_org) or username (reserved_user) holding the slug */
  reserved_for?: string
  /** The route word the slug collides with (reserved_word) */
  reserved_word?: ReservedShopSlug
  /** Free alternatives for this owner, best first. Empty when available. */
  suggestions: string[]
}

/** Who the shop belongs to (or would belong to). */
export type ShopSlugOwner =
  | { userId: string; contractorId?: undefined }
  | { contractorId: string; userId?: undefined }

/** The slug owner of an existing shop. */
export function shopSlugOwner(
  shop: Pick<Shop, "owner_user_id" | "owner_contractor_id">,
): ShopSlugOwner {
  return shop.owner_contractor_id
    ? { contractorId: shop.owner_contractor_id }
    : { userId: shop.owner_user_id ?? "" }
}

export interface ShopSlugCheckOptions {
  /** Shop being renamed: its own slug doesn't count as taken. */
  excludeShopId?: string
}

/**
 * A user-chosen slug can't be used (or lost a race). The controller answers
 * 409 with `availability` as the error details.
 */
export class ShopSlugConflictError extends Error {
  constructor(public availability: ShopSlugAvailabilityResponse) {
    super(availability.message ?? "This shop URL is not available")
    this.name = "ShopSlugConflictError"
    Object.setPrototypeOf(this, ShopSlugConflictError.prototype)
  }
}

/** Slug form of a name: lowercase, runs of other characters become "-", trimmed. */
export function normalizeShopSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/** SQL for normalizeShopSlug(column). Kept in step with it (tested). */
export function normalizeShopSlugSql(column: string): string {
  return `trim(both '-' from regexp_replace(regexp_replace(lower(${column}), '[^a-z0-9-]', '-', 'g'), '-+', '-', 'g'))`
}

/** Format problem with a slug, or undefined. */
export function shopSlugFormatProblem(slug: string): string | undefined {
  if (slug.length < SHOP_SLUG_MIN_LENGTH)
    return `Slug must be at least ${SHOP_SLUG_MIN_LENGTH} characters`
  if (slug.length > SHOP_SLUG_MAX_LENGTH)
    return `Slug must be ${SHOP_SLUG_MAX_LENGTH} characters or less`
  if (!SHOP_SLUG_PATTERN.test(slug)) {
    return "Slug must start and end with a letter or number, and contain only lowercase letters, numbers, and hyphens"
  }
  // /shops/{shopId} routes take a UUID; a UUID-shaped slug would read as one.
  if (UUID_SHAPE.test(slug)) return "Slug can't look like an id"
  return undefined
}

type Verdict = Omit<ShopSlugAvailabilityResponse, "slug" | "suggestions">

export interface OrgHolder {
  contractor_id: string
  spectrum_id: string
  norm: string
}
export interface UserHolder {
  user_id: string
  username: string
  norm: string
}

/**
 * Verdict for each slug (format, reserved word, taken, reserved for another
 * owner). Two queries for reservations and one for taken, however many slugs.
 */
export async function classifyShopSlugs(
  db: Knex,
  slugs: string[],
  owner: ShopSlugOwner,
  options: ShopSlugCheckOptions = {},
): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>()
  const pending: string[] = []
  for (const slug of new Set(slugs)) {
    const problem = shopSlugFormatProblem(slug)
    if (problem) {
      verdicts.set(slug, {
        available: false,
        reason: "invalid",
        message: problem,
      })
      continue
    }
    const word = reservedShopSlug(slug)
    if (word) {
      verdicts.set(slug, {
        available: false,
        reason: "reserved_word",
        reserved_word: word,
        message: `"${slug}" is reserved by the site and can't be a shop URL`,
      })
      continue
    }
    pending.push(slug)
  }
  if (!pending.length) return verdicts

  // shops.slug is citext: IN compares case-insensitively and uses its unique index.
  const takenQuery = db("shops").whereIn("slug", pending).select("slug")
  if (options.excludeShopId)
    takenQuery.whereNot("shop_id", options.excludeShopId)
  const personalBases = pending
    .filter((s) => s.endsWith(PERSONAL_SUFFIX))
    .map((s) => s.slice(0, -PERSONAL_SUFFIX.length))
  const [takenRows, orgRows, userRows]: [
    Array<{ slug: string }>,
    OrgHolder[],
    UserHolder[],
  ] = await Promise.all([
    takenQuery,
    db("contractors")
      .whereRaw(`${normalizeShopSlugSql("spectrum_id")} = ANY(?)`, [pending])
      .select(
        "contractor_id",
        "spectrum_id",
        db.raw(`${normalizeShopSlugSql("spectrum_id")} AS norm`),
      ),
    db("accounts")
      .whereRaw(`${normalizeShopSlugSql("username")} = ANY(?)`, [
        [...pending, ...personalBases],
      ])
      .select(
        "user_id",
        "username",
        db.raw(`${normalizeShopSlugSql("username")} AS norm`),
      ),
  ])
  const taken = new Set(takenRows.map((r) => r.slug.toLowerCase()))

  for (const slug of pending) {
    if (taken.has(slug)) {
      verdicts.set(slug, {
        available: false,
        reason: "taken",
        message: "Another shop already uses this URL",
      })
      continue
    }
    const verdict = reservationVerdict(slug, owner, orgRows, userRows)
    verdicts.set(slug, verdict ?? { available: true })
  }
  return verdicts
}

/**
 * Who holds `slug`, if it is reserved for someone other than `owner`, given
 * the orgs and users whose normalized names match it. Exported for tests.
 */
export function reservationVerdict(
  slug: string,
  owner: ShopSlugOwner,
  orgs: OrgHolder[],
  users: UserHolder[],
): Verdict | undefined {
  // 1. An org whose Spectrum ID is this slug.
  const orgHolders = orgs.filter((o) => o.norm === slug)
  if (orgHolders.length) {
    if (
      owner.contractorId &&
      orgHolders.some((o) => o.contractor_id === owner.contractorId)
    )
      return undefined
    return {
      available: false,
      reason: "reserved_org",
      reserved_for: orgHolders[0].spectrum_id,
      message: `This URL is reserved for the organization ${orgHolders[0].spectrum_id}`,
    }
  }
  // 2. A user whose personal shop default (<username>-shop) is this slug.
  if (slug.endsWith(PERSONAL_SUFFIX)) {
    const base = slug.slice(0, -PERSONAL_SUFFIX.length)
    const holders = users.filter((u) => u.norm === base)
    if (holders.length) return userVerdict(holders, owner)
  }
  // 3. A user whose username is this slug.
  const holders = users.filter((u) => u.norm === slug)
  if (holders.length) return userVerdict(holders, owner)
  return undefined
}

function userVerdict(
  holders: UserHolder[],
  owner: ShopSlugOwner,
): Verdict | undefined {
  if (owner.userId && holders.some((u) => u.user_id === owner.userId))
    return undefined
  return {
    available: false,
    reason: "reserved_user",
    reserved_for: holders[0].username,
    message: `This URL is reserved for ${holders[0].username}'s personal shop`,
  }
}

/** Cut `base` so `base + suffix` fits a slug, without a trailing "-". */
function withSuffix(base: string, suffix: string): string {
  return (
    base.slice(0, SHOP_SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, "") +
    suffix
  )
}

/** The owner's own handle (normalized Spectrum ID or username), for suggestions. */
async function ownerHandle(
  db: Knex,
  owner: ShopSlugOwner,
): Promise<string | undefined> {
  if (owner.contractorId) {
    const row = await db("contractors")
      .where("contractor_id", owner.contractorId)
      .first("spectrum_id")
    return row?.spectrum_id ? normalizeShopSlug(row.spectrum_id) : undefined
  }
  const row = await db("accounts")
    .where("user_id", owner.userId)
    .first("username")
  return row?.username ? normalizeShopSlug(row.username) : undefined
}

/**
 * Free alternatives to `slug` for `owner`: slug-2, slug-shop, slug-<handle>,
 * <handle>-slug, slug-3…, checked in one batch.
 */
export async function suggestShopSlugs(
  db: Knex,
  slug: string,
  owner: ShopSlugOwner,
  options: ShopSlugCheckOptions = {},
): Promise<string[]> {
  const base = normalizeShopSlug(slug).slice(0, SHOP_SLUG_MAX_LENGTH)
  if (base.length < 1) return []
  const handle = await ownerHandle(db, owner)
  const candidates = [base, withSuffix(base, "-2")]
  if (!base.endsWith(PERSONAL_SUFFIX))
    candidates.push(withSuffix(base, PERSONAL_SUFFIX))
  if (handle && handle !== base && !base.includes(handle)) {
    candidates.push(
      withSuffix(base, `-${handle}`),
      withSuffix(`${handle}-${base}`, ""),
    )
  }
  for (let i = 3; i <= 9; i++) candidates.push(withSuffix(base, `-${i}`))
  const unique = [...new Set(candidates)].filter((c) => c !== slug)
  const verdicts = await classifyShopSlugs(db, unique, owner, options)
  return unique
    .filter((c) => verdicts.get(c)?.available)
    .slice(0, MAX_SUGGESTIONS)
}

/** Full availability answer for one slug, with suggestions when it's unavailable. */
export async function checkShopSlugAvailability(
  db: Knex,
  rawSlug: string,
  owner: ShopSlugOwner,
  options: ShopSlugCheckOptions = {},
): Promise<ShopSlugAvailabilityResponse> {
  const slug = rawSlug.trim()
  const verdict = (await classifyShopSlugs(db, [slug], owner, options)).get(
    slug,
  )!
  if (verdict.available) return { slug, available: true, suggestions: [] }
  return {
    slug,
    ...verdict,
    suggestions: await suggestShopSlugs(db, slug, owner, options),
  }
}

/** True if `error` is Postgres rejecting a duplicate shops.slug. */
export function isShopSlugUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, constraint, table } = error as {
    code?: unknown
    constraint?: unknown
    table?: unknown
  }
  if (code !== "23505") return false
  if (typeof constraint === "string")
    return constraint === "shops_slug_unique" || /slug/.test(constraint)
  return table === "shops"
}

/**
 * Pick the first free slug for an auto-generated base: base, base-2…base-50,
 * then base-<random>. The base is normalized; an empty one becomes "shop".
 */
export async function allocateAutoShopSlug(
  db: Knex,
  rawBase: string,
  owner: ShopSlugOwner,
): Promise<string> {
  let base = normalizeShopSlug(rawBase)
    .slice(0, AUTO_BASE_MAX_LENGTH)
    .replace(/-+$/, "")
  if (base.length < SHOP_SLUG_MIN_LENGTH || shopSlugFormatProblem(base))
    base = withSuffix(base || "shop", "-shop")
  const candidates = [base]
  for (let i = 2; i <= 50; i++) candidates.push(withSuffix(base, `-${i}`))
  const verdicts = await classifyShopSlugs(db, candidates, owner)
  const free = candidates.find((c) => verdicts.get(c)?.available)
  if (free) return free
  return withSuffix(base, `-${crypto.randomUUID().slice(0, 8)}`)
}

const AUTO_INSERT_ATTEMPTS = 5

/**
 * Insert a shop under an auto-generated slug. A concurrent insert that takes
 * the same slug first (23505) is retried with the next free one.
 */
export async function insertShopWithAutoSlug<
  Row extends Record<string, unknown>,
>(db: Knex, base: string, owner: ShopSlugOwner, row: Row): Promise<Shop> {
  let lastSlug = ""
  for (let attempt = 0; attempt < AUTO_INSERT_ATTEMPTS; attempt++) {
    const slug =
      attempt < AUTO_INSERT_ATTEMPTS - 1
        ? await allocateAutoShopSlug(db, base, owner)
        : withSuffix(
            normalizeShopSlug(base).slice(0, AUTO_BASE_MAX_LENGTH) || "shop",
            `-${crypto.randomUUID().slice(0, 8)}`,
          )
    lastSlug = slug
    try {
      const [shop] = await db("shops")
        .insert({ ...row, slug })
        .returning("*")
      return shop
    } catch (error) {
      if (!isShopSlugUniqueViolation(error)) throw error
    }
  }
  throw new ShopSlugConflictError({
    slug: lastSlug,
    available: false,
    reason: "taken",
    message: "Couldn't find a free shop URL, please try again",
    suggestions: [],
  })
}

/**
 * Insert a shop under a slug the user chose, already checked with
 * checkShopSlugAvailability. Losing a race to a concurrent insert is a
 * ShopSlugConflictError with fresh suggestions.
 */
export async function insertShopWithChosenSlug<
  Row extends Record<string, unknown>,
>(db: Knex, slug: string, owner: ShopSlugOwner, row: Row): Promise<Shop> {
  try {
    const [shop] = await db("shops")
      .insert({ ...row, slug })
      .returning("*")
    return shop
  } catch (error) {
    if (!isShopSlugUniqueViolation(error)) throw error
    throw new ShopSlugConflictError(
      await checkShopSlugAvailability(db, slug, owner),
    )
  }
}

/** Reject a user-chosen slug that is invalid (400 by the caller) or unavailable (409). */
export async function assertChosenShopSlugAvailable(
  db: Knex,
  slug: string,
  owner: ShopSlugOwner,
  options: ShopSlugCheckOptions = {},
): Promise<void> {
  const availability = await checkShopSlugAvailability(db, slug, owner, options)
  if (!availability.available) throw new ShopSlugConflictError(availability)
}

/**
 * Existing shops whose slug is a reserved word or matches a reserved name held
 * by someone else (same rules as classifyShopSlugs). Read-only; these keep
 * their slug (see the header). One row per shop and conflict kind.
 */
export async function findSlugReservationConflicts(
  db: Knex,
): Promise<
  Array<{
    shop_id: string
    slug: string
    kind: "reserved_word" | "reserved_org" | "reserved_user"
    holder: string
  }>
> {
  const words = Object.values(ReservedShopSlug)
  const spectrumNorm = normalizeShopSlugSql("c.spectrum_id")
  const usernameNorm = normalizeShopSlugSql("a.username")
  const result = await db.raw(
    `
    SELECT s.shop_id, s.slug::text AS slug, 'reserved_word' AS kind, lower(s.slug::text) AS holder
      FROM shops s
     WHERE lower(s.slug::text) = ANY(?)
    UNION ALL
    SELECT s.shop_id, s.slug::text, 'reserved_org', c.spectrum_id
      FROM shops s
      JOIN contractors c ON ${spectrumNorm} = lower(s.slug::text)
     WHERE s.owner_contractor_id IS DISTINCT FROM c.contractor_id
    UNION ALL
    SELECT s.shop_id, s.slug::text, 'reserved_user', a.username
      FROM shops s
      JOIN accounts a
        ON ${usernameNorm} || '-shop' = lower(s.slug::text)
        OR (${usernameNorm} = lower(s.slug::text)
            AND NOT EXISTS (SELECT 1 FROM contractors c WHERE ${spectrumNorm} = lower(s.slug::text))
            AND NOT EXISTS (SELECT 1 FROM accounts a2
                             WHERE ${normalizeShopSlugSql("a2.username")} || '-shop' = lower(s.slug::text)))
     WHERE s.owner_user_id IS DISTINCT FROM a.user_id
       AND NOT EXISTS (SELECT 1 FROM contractors c WHERE ${spectrumNorm} = lower(s.slug::text))
    ORDER BY 2, 3
    `,
    [words],
  )
  return result.rows
}
