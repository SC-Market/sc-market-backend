/**
 * Branded storefront enquiries (drafts/whitelabel-overhaul-plan.md §A11): an
 * org or a shop asks SC Market staff for a branded storefront on its own
 * <name>.sc-market.space subdomain, from org settings › Storefront or the
 * shop's settings. Site admins get an in-app notification and handle the
 * enquiry in Admin › Premium, where they also grant the subdomain.
 *
 * No contact details are stored: "Discord" means the Discord account linked
 * to the submitter's profile (read when staff look), "site message" means a
 * message on SC Market. The free text is staff-only, so it is only length
 * checked (1000 characters).
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { SiteRole } from "../../api/util/site-role.js"

export const ENQUIRY_MESSAGE_MAX = 1000
export const ENQUIRY_NOTIFICATION_ACTION = "storefront_enquiry_created"

export type EnquiryTargetType = "org" | "shop"
export type EnquiryContactMethod = "discord" | "site_message"
export type EnquiryStatus = "open" | "in_progress" | "completed" | "declined"
export const ENQUIRY_STATUSES: readonly EnquiryStatus[] = ["open", "in_progress", "completed", "declined"]
/** Statuses that count as the target's one open enquiry. */
export const OPEN_ENQUIRY_STATUSES: readonly EnquiryStatus[] = ["open", "in_progress"]

/**
 * Subdomains of sc-market.space that are the site's own (or could pass for
 * it), never an org's or a shop's storefront.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "www", "api", "cdn", "app", "admin", "staff", "support", "help", "docs", "status",
  "mail", "email", "smtp", "auth", "login", "account", "accounts", "id", "sso",
  "static", "assets", "media", "img", "images", "files", "uploads",
  "dev", "staging", "beta", "test", "preview", "demo", "sandbox",
  "ws", "socket", "embed", "blog", "news", "wiki", "market", "shop", "shops",
  "store", "storefront", "storefronts", "org", "orgs", "yourorg", "scmarket",
  "sc-market", "discord", "bot", "billing", "pay", "payments", "security",
])

export type SubdomainCheck = { ok: true; subdomain: string } | { ok: false; reason: string }

/**
 * A storefront subdomain: `<name>.sc-market.space`, one DNS label. Lower-case
 * letters, digits and hyphens, 2 to 63 characters, no leading or trailing
 * hyphen, not one of the site's own names. The ".sc-market.space" suffix may
 * be typed; it is dropped.
 */
export function checkSubdomain(input: string): SubdomainCheck {
  const raw = input.trim().toLowerCase().replace(/\.sc-market\.space\.?$/, "")
  if (raw.length < 2 || raw.length > 63) {
    return { ok: false, reason: "The subdomain must be 2 to 63 characters" }
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(raw)) {
    return {
      ok: false,
      reason: "Use lower-case letters, digits and hyphens only, not starting or ending with a hyphen",
    }
  }
  if (raw.includes("--")) {
    return { ok: false, reason: "The subdomain can't contain two hyphens in a row" }
  }
  if (RESERVED_SUBDOMAINS.has(raw)) {
    return { ok: false, reason: "That subdomain is reserved" }
  }
  return { ok: true, subdomain: raw }
}

/** Whether a staff-provisioned storefront already uses `<subdomain>.sc-market.space`. */
export async function subdomainTaken(subdomain: string, db: Knex = getKnex()): Promise<boolean> {
  const row = await db("org_premium_tiers")
    .whereRaw("lower(custom_domain) = ?", [`${subdomain}.sc-market.space`])
    .whereNull("revoked_at")
    .first("contractor_id")
  return !!row
}

export interface EnquiryTarget {
  type: EnquiryTargetType
  /** contractor_id (org) or shop_id (shop). */
  id: string
  /** The org's spectrum ID or the shop's slug. */
  handle: string
  name: string
  is_test: boolean
}

/** What the org's officers / the shop's managers see. No staff note. */
export interface StorefrontEnquiry {
  enquiry_id: string
  target_type: EnquiryTargetType
  /** The org's spectrum ID or the shop's slug. */
  target: string
  requested_subdomain: string
  message: string
  contact_method: EnquiryContactMethod
  status: EnquiryStatus
  /** Who sent it; null once their account is deleted. */
  submitted_by_username: string | null
  created_at: string
  updated_at: string
}

/** What site admins see. */
export interface AdminStorefrontEnquiry extends StorefrontEnquiry {
  target_name: string
  /** A test org or shop (test accounts' enquiries notify nobody). */
  is_test: boolean
  submitted_by_user_id: string | null
  /** The submitter's linked Discord username, when they chose Discord and have one. */
  discord_username: string | null
  /** The submitter's linked Discord user ID, when they chose Discord. */
  discord_id: string | null
  staff_note: string | null
  handled_by_username: string | null
}

interface EnquiryRow {
  enquiry_id: string
  target_type: EnquiryTargetType
  contractor_id: string | null
  shop_id: string | null
  submitted_by: string | null
  contact_method: EnquiryContactMethod
  requested_subdomain: string
  message: string
  status: EnquiryStatus
  staff_note: string | null
  handled_by: string | null
  created_at: Date | string
  updated_at: Date | string
  target: string | null
  target_name: string | null
  is_test: boolean | null
  submitted_by_username: string | null
  handled_by_username: string | null
  discord_username: string | null
  discord_id: string | null
}

const iso = (d: Date | string) => new Date(d).toISOString()

/** The submitter's linked Discord account (the primary one if several). */
const DISCORD_SQL =
  "SELECT $col FROM account_providers p WHERE p.user_id = e.submitted_by AND p.provider_type = 'discord' ORDER BY p.is_primary DESC NULLS LAST LIMIT 1"

function baseQuery(db: Knex) {
  return db("storefront_enquiries as e")
    .leftJoin("contractors as c", "c.contractor_id", "e.contractor_id")
    .leftJoin("shops as s", "s.shop_id", "e.shop_id")
    .leftJoin("accounts as sub", "sub.user_id", "e.submitted_by")
    .leftJoin("accounts as hb", "hb.user_id", "e.handled_by")
    .select(
      "e.*",
      db.raw("COALESCE(c.spectrum_id, s.slug) as target"),
      db.raw("COALESCE(c.name, s.name) as target_name"),
      db.raw("COALESCE(c.is_test, s.is_test, false) as is_test"),
      db.raw("CASE WHEN sub.is_tombstone IS TRUE THEN NULL ELSE sub.username END as submitted_by_username"),
      "hb.username as handled_by_username",
      db.raw(`(${DISCORD_SQL.replace("$col", "p.metadata->>'username'")}) as discord_username`),
      db.raw(`(${DISCORD_SQL.replace("$col", "p.provider_id")}) as discord_id`),
    )
}

function toPublic(r: EnquiryRow): StorefrontEnquiry {
  return {
    enquiry_id: r.enquiry_id,
    target_type: r.target_type,
    target: r.target ?? "",
    requested_subdomain: r.requested_subdomain,
    message: r.message,
    contact_method: r.contact_method,
    status: r.status,
    submitted_by_username: r.submitted_by_username,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  }
}

function toAdmin(r: EnquiryRow): AdminStorefrontEnquiry {
  const discord = r.contact_method === "discord"
  return {
    ...toPublic(r),
    target_name: r.target_name ?? "",
    is_test: !!r.is_test,
    submitted_by_user_id: r.submitted_by,
    discord_username: discord ? r.discord_username : null,
    discord_id: discord ? r.discord_id : null,
    staff_note: r.staff_note,
    handled_by_username: r.handled_by_username,
  }
}

function targetColumn(type: EnquiryTargetType) {
  return type === "org" ? "e.contractor_id" : "e.shop_id"
}

/** The target's latest enquiry (any status), or null. */
export async function latestEnquiry(
  target: Pick<EnquiryTarget, "type" | "id">,
  db: Knex = getKnex(),
): Promise<StorefrontEnquiry | null> {
  const row = (await baseQuery(db)
    .where("e.target_type", target.type)
    .where(targetColumn(target.type), target.id)
    .orderBy("e.created_at", "desc")
    .first()) as EnquiryRow | undefined
  return row ? toPublic(row) : null
}

/** The target's open enquiry (open or in progress), or null. */
export async function openEnquiry(
  target: Pick<EnquiryTarget, "type" | "id">,
  db: Knex = getKnex(),
): Promise<StorefrontEnquiry | null> {
  const row = (await baseQuery(db)
    .where("e.target_type", target.type)
    .where(targetColumn(target.type), target.id)
    .whereIn("e.status", OPEN_ENQUIRY_STATUSES as EnquiryStatus[])
    .orderBy("e.created_at", "desc")
    .first()) as EnquiryRow | undefined
  return row ? toPublic(row) : null
}

export interface NewEnquiry {
  requested_subdomain: string
  message: string
  contact_method: EnquiryContactMethod
}

export class OpenEnquiryExistsError extends Error {
  constructor(readonly existing: StorefrontEnquiry | null) {
    super("This storefront already has an open enquiry")
  }
}

/** Postgres unique violation on the one-open-enquiry-per-target index. */
function isOpenEnquiryConflict(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string } | null
  return e?.code === "23505" && (e.constraint ?? "").includes("storefront_enquiries_one_open_per_target")
}

/** Store a new enquiry. Throws OpenEnquiryExistsError when one is already open. */
export async function createEnquiry(
  target: EnquiryTarget,
  input: NewEnquiry,
  userId: string,
  db: Knex = getKnex(),
): Promise<StorefrontEnquiry> {
  const existing = await openEnquiry(target, db)
  if (existing) throw new OpenEnquiryExistsError(existing)
  let id: string
  try {
    const [row] = await db("storefront_enquiries")
      .insert({
        target_type: target.type,
        contractor_id: target.type === "org" ? target.id : null,
        shop_id: target.type === "shop" ? target.id : null,
        submitted_by: userId,
        contact_method: input.contact_method,
        requested_subdomain: input.requested_subdomain,
        message: input.message,
      })
      .returning("enquiry_id")
    id = (row as { enquiry_id: string }).enquiry_id
  } catch (err) {
    if (isOpenEnquiryConflict(err)) throw new OpenEnquiryExistsError(await openEnquiry(target, db))
    throw err
  }
  const created = (await baseQuery(db).where("e.enquiry_id", id).first()) as EnquiryRow
  return toPublic(created)
}

export interface AdminEnquiryPage {
  enquiries: AdminStorefrontEnquiry[]
  total: number
  page: number
  page_size: number
}

export async function listEnquiriesForAdmin(
  opts: { status?: EnquiryStatus; page: number; pageSize: number },
  db: Knex = getKnex(),
): Promise<AdminEnquiryPage> {
  const filtered = () => {
    const q = db("storefront_enquiries as e")
    if (opts.status) q.where("e.status", opts.status)
    return q
  }
  const [rows, count] = await Promise.all([
    baseQuery(db)
      .modify((q) => {
        if (opts.status) q.where("e.status", opts.status)
      })
      // Open first, then newest.
      .orderByRaw("CASE e.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END")
      .orderBy("e.created_at", "desc")
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize) as Promise<EnquiryRow[]>,
    filtered().count("* as count").first(),
  ])
  return {
    enquiries: rows.map(toAdmin),
    total: Number(count?.count ?? 0),
    page: opts.page,
    page_size: opts.pageSize,
  }
}

export async function getEnquiryForAdmin(
  enquiryId: string,
  db: Knex = getKnex(),
): Promise<AdminStorefrontEnquiry | null> {
  const row = (await baseQuery(db).where("e.enquiry_id", enquiryId).first()) as EnquiryRow | undefined
  return row ? toAdmin(row) : null
}

export class EnquiryReopenConflictError extends Error {
  constructor() {
    super("The target already has another open enquiry")
  }
}

/** An admin changes the status and/or the staff note. Returns null when missing. */
export async function updateEnquiryAsAdmin(
  enquiryId: string,
  patch: { status?: EnquiryStatus; staff_note?: string | null },
  adminId: string,
  db: Knex = getKnex(),
): Promise<AdminStorefrontEnquiry | null> {
  const update: Record<string, unknown> = { updated_at: db.fn.now(), handled_by: adminId }
  if (patch.status !== undefined) update.status = patch.status
  if (patch.staff_note !== undefined) update.staff_note = patch.staff_note === "" ? null : patch.staff_note
  try {
    const n = await db("storefront_enquiries").where("enquiry_id", enquiryId).update(update)
    if (!n) return null
  } catch (err) {
    if (isOpenEnquiryConflict(err)) throw new EnquiryReopenConflictError()
    throw err
  }
  return getEnquiryForAdmin(enquiryId, db)
}

/** Site admins who get the notification: the admin role, never test accounts. */
export async function siteAdminIds(db: Knex = getKnex()): Promise<string[]> {
  return db("accounts")
    .where("role", SiteRole.Admin)
    .whereRaw("is_test IS NOT TRUE")
    .whereRaw("is_tombstone IS NOT TRUE")
    .whereRaw("banned IS NOT TRUE")
    .pluck("user_id")
}

/**
 * The entity of a storefront enquiry in-app notification: created (to site
 * admins), accepted or declined (to the person who sent it). No staff note,
 * no contact details.
 */
export interface StorefrontEnquiryNotice {
  enquiry_id: string
  target_type: EnquiryTargetType
  target: string
  target_name: string
  requested_subdomain: string
  status: EnquiryStatus
}

export async function enquiryNoticeEntity(
  enquiryId: string,
  db: Knex = getKnex(),
): Promise<StorefrontEnquiryNotice | null> {
  const e = await getEnquiryForAdmin(enquiryId, db)
  if (!e) return null
  return {
    enquiry_id: e.enquiry_id,
    target_type: e.target_type,
    target: e.target,
    target_name: e.target_name,
    requested_subdomain: e.requested_subdomain,
    status: e.status,
  }
}
