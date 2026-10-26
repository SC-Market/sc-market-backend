/**
 * Test-account isolation: the one place that says what "test data" is and
 * how real users are kept away from it (docs/testing-with-test-accounts.md).
 *
 * A party is in the test realm when it is an account with accounts.is_test,
 * an org with contractors.is_test or a shop with shops.is_test (a shop is
 * test exactly when its owner is; a DB trigger derives it).
 *
 * Two kinds of rule:
 *
 * 1. Public surfaces (search, directories, aggregates, stats, sitemap, bridge
 *    data) never show test parties, to anyone. Use the SQL predicates below
 *    (`notTestUser`, `notTestContractor`, `notTestShop`, or the knex helpers
 *    `excludeTest*`). They are not viewer-dependent on purpose: responses on
 *    these surfaces are cached, so a viewer-dependent filter could leak a
 *    test viewer's results to everyone else.
 * 2. Interactions (orders, offers, chats/messages, reviews, org membership,
 *    invites) never mix realms: test with test and real with real only.
 *    Call `assertSameRealm` before writing; the DB triggers from migration
 *    20261026100000_test_accounts are the backstop (SQLSTATE SCT01, answered
 *    as the same 403 by the error handler).
 *
 * Test accounts also cannot: hold any site role but "user" (isSiteAdmin and a
 * DB CHECK), mint admin/moderation API tokens, use webhooks to external URLs,
 * use custom domains, or cause notifications/Discord posts to real users.
 */

import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import { createErrorResponse } from "../../api/routes/v1/util/response.js"
import { currentRequestUser } from "../../api/util/request-context.js"
import { isSiteAdmin } from "../../api/util/site-role.js"

/** SQLSTATE raised by the isolation triggers. */
export const TEST_ISOLATION_SQLSTATE = "SCT01"
export const TEST_ISOLATION_REASON = "test_account_isolation"
export const TEST_ISOLATION_MESSAGE =
  "Test accounts can only interact with other test accounts, and real accounts only with real ones"

export function testIsolationError(message = TEST_ISOLATION_MESSAGE): BusinessLogicError {
  return new BusinessLogicError(ErrorCode.FORBIDDEN, message, {
    reason: TEST_ISOLATION_REASON,
  })
}

/**
 * For v1 express handlers: answer the isolation 403 and return true when
 * the parties mix test and real.
 */
export async function rejectMixedRealm(
  res: { status(code: number): { json(body: unknown): unknown } },
  parties: Parties,
): Promise<boolean> {
  if ((await realmsOf(parties)).size <= 1) return false
  const e = testIsolationError()
  res.status(403).json(createErrorResponse(e.code, e.message, e.details))
  return true
}

/** Whether a pg/knex error came from an isolation trigger. */
export function isTestIsolationDbError(err: unknown): boolean {
  for (let e = err as { code?: unknown; cause?: unknown; nativeError?: unknown } | null, i = 0; e && i < 3; i++) {
    if (typeof e !== "object") return false
    if (e.code === TEST_ISOLATION_SQLSTATE) return true
    e = (e.nativeError ?? e.cause ?? null) as typeof e
  }
  return false
}

// ── Public-surface filters ──────────────────────────────────────────────────

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/

function ident(column: string): string {
  if (typeof column !== "string" || !IDENT.test(column)) {
    throw new Error(`Invalid column reference: ${String(column)}`)
  }
  return column
}

/**
 * SQL predicates for raw queries. `column` is a code-side column reference
 * (e.g. "l.seller_id"), never user input. NULL columns pass.
 */
export function notTestUser(column: string): string {
  return `NOT EXISTS (SELECT 1 FROM accounts _ta WHERE _ta.user_id = ${ident(column)} AND _ta.is_test)`
}
export function notTestContractor(column: string): string {
  return `NOT EXISTS (SELECT 1 FROM contractors _tc WHERE _tc.contractor_id = ${ident(column)} AND _tc.is_test)`
}
export function notTestShop(column: string): string {
  return `NOT EXISTS (SELECT 1 FROM shops _ts WHERE _ts.shop_id = ${ident(column)} AND _ts.is_test)`
}

/**
 * A polymorphic seller (seller_type "user" | "contractor" | "shop" with one
 * id column). Compares as text, so it works whatever the id column type.
 */
export function notTestSeller(typeColumn: string, idColumn: string): string {
  const t = ident(typeColumn)
  const id = ident(idColumn)
  return `NOT EXISTS (
    SELECT 1 FROM accounts _ta WHERE ${t} = 'user' AND _ta.user_id::text = ${id}::text AND _ta.is_test
    UNION ALL
    SELECT 1 FROM contractors _tc WHERE ${t} = 'contractor' AND _tc.contractor_id::text = ${id}::text AND _tc.is_test
    UNION ALL
    SELECT 1 FROM shops _ts WHERE ${t} = 'shop' AND _ts.shop_id::text = ${id}::text AND _ts.is_test
  )`
}

type QB = Knex.QueryBuilder

/** Knex forms: `excludeTestUsers(query, "orders.customer_id")`. */
export function excludeTestUsers<T extends QB>(query: T, ...columns: string[]): T {
  for (const c of columns) query.whereRaw(notTestUser(c))
  return query
}
export function excludeTestContractors<T extends QB>(query: T, ...columns: string[]): T {
  for (const c of columns) query.whereRaw(notTestContractor(c))
  return query
}
export function excludeTestShops<T extends QB>(query: T, ...columns: string[]): T {
  for (const c of columns) query.whereRaw(notTestShop(c))
  return query
}

/**
 * For surfaces that already depend on the viewer (search results that include
 * the viewer's own org's private listings, directories): `predicateSql` (one
 * of the predicates above, or e.g. "NOT s.is_test") must hold unless the
 * viewer is a test account. Test viewers see test and real rows; anonymous
 * and real viewers only real ones.
 */
export function hiddenFromRealViewers(
  db: Knex,
  predicateSql: string,
  viewerUserId: string | null | undefined,
): Knex.Raw {
  if (!viewerUserId) return db.raw(`(${predicateSql})`)
  return db.raw(
    `((${predicateSql}) OR EXISTS (SELECT 1 FROM accounts _tv WHERE _tv.user_id = ? AND _tv.is_test))`,
    [viewerUserId],
  )
}

// ── Realm checks ────────────────────────────────────────────────────────────

export interface Parties {
  users?: Array<string | null | undefined>
  contractors?: Array<string | null | undefined>
  shops?: Array<string | null | undefined>
}

function ids(list?: Array<string | null | undefined>): string[] {
  return [...new Set((list ?? []).filter((v): v is string => typeof v === "string" && v !== ""))]
}

/** The parties of an order or offer session. */
export function orderParties(object: {
  customer_id?: string | null
  assigned_id?: string | null
  contractor_id?: string | null
  shop_id?: string | null
}): Parties {
  return {
    users: [object.customer_id, object.assigned_id],
    contractors: [object.contractor_id],
    shops: [object.shop_id],
  }
}

/** The distinct realms (true = test) of the given parties. Unknown ids are ignored. */
export async function realmsOf(
  parties: Parties,
  knex: Knex | Knex.Transaction = getKnex(),
): Promise<Set<boolean>> {
  const users = ids(parties.users)
  const contractors = ids(parties.contractors)
  const shops = ids(parties.shops)
  const realms = new Set<boolean>()
  if (users.length) {
    const rows = await knex("accounts").whereIn("user_id", users).distinct("is_test")
    rows.forEach((r: { is_test: boolean }) => realms.add(r.is_test === true))
  }
  if (contractors.length) {
    const rows = await knex("contractors").whereIn("contractor_id", contractors).distinct("is_test")
    rows.forEach((r: { is_test: boolean }) => realms.add(r.is_test === true))
  }
  if (shops.length) {
    const rows = await knex("shops").whereIn("shop_id", shops).distinct("is_test")
    rows.forEach((r: { is_test: boolean }) => realms.add(r.is_test === true))
  }
  return realms
}

/** Throws the isolation 403 when the parties mix test and real. */
export async function assertSameRealm(
  parties: Parties,
  knex: Knex | Knex.Transaction = getKnex(),
): Promise<void> {
  if ((await realmsOf(parties, knex)).size > 1) throw testIsolationError()
}

/** Whether any of the parties is in the test realm. */
export async function involvesTestParty(
  parties: Parties,
  knex: Knex | Knex.Transaction = getKnex(),
): Promise<boolean> {
  return (await realmsOf(parties, knex)).has(true)
}

export async function isTestUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  return (await realmsOf({ users: [userId] })).has(true)
}

/** For a request's user (populated from the accounts row). */
export function isTestUser(user: { is_test?: boolean | null } | null | undefined): boolean {
  return user?.is_test === true
}

/** 403 for a feature test accounts may not use. */
export function testRestrictedError(message: string): BusinessLogicError {
  return new BusinessLogicError(ErrorCode.FORBIDDEN, message, { reason: "test_account_restricted" })
}

/**
 * Whether `viewer` may open a test account's, org's or shop's own page
 * (profile, org page, shop page): test accounts and site admins. Everyone
 * else gets a 404, as if it did not exist.
 */
export function canViewTestEntity(
  viewer: { is_test?: boolean | null; role?: string | null } | null | undefined,
): boolean {
  return isTestUser(viewer) || isSiteAdmin(viewer)
}

/** Throws a 403 with `message` when the request's user is a test account. */
export function denyTestUser(
  user: { is_test?: boolean | null } | null | undefined,
  message: string,
): void {
  if (isTestUser(user)) throw testRestrictedError(message)
}

/** v1 form of denyTestUser: answers the 403 and returns true. */
export function rejectTestUser(
  res: { status(code: number): { json(body: unknown): unknown } },
  user: { is_test?: boolean | null } | null | undefined,
  message: string,
): boolean {
  if (!isTestUser(user)) return false
  const e = testRestrictedError(message)
  res.status(403).json(createErrorResponse(e.code, e.message, e.details))
  return true
}

/**
 * Of `recipientIds`, the ones that may be notified because of something
 * `actorRealmIsTest` did: everyone when the actor is real (real actors cannot
 * reach test accounts, see the interaction rules), only test accounts when
 * the actor is a test account.
 */
export async function recipientsAllowedFor(
  actorIsTest: boolean,
  recipientIds: string[],
  knex: Knex | Knex.Transaction = getKnex(),
): Promise<string[]> {
  const unique = ids(recipientIds)
  if (!actorIsTest || unique.length === 0) return unique
  const rows: Array<{ user_id: string }> = await knex("accounts")
    .whereIn("user_id", unique)
    .where("is_test", true)
    .select("user_id")
  const allowed = new Set(rows.map((r) => r.user_id))
  return unique.filter((id) => allowed.has(id))
}

// ── Notifications and outbound messages ─────────────────────────────────────

/**
 * Whether the request being handled is made by a test account. Delivery code
 * (in-app notifications, push, email, Discord DMs, webhooks) runs inside the
 * request that caused it, so this is the actor without plumbing it through
 * every notification method. Background jobs have no request: they act on
 * data whose parties are already in one realm.
 */
export function actingAsTestAccount(): boolean {
  return isTestUser(currentRequestUser())
}

/**
 * Of `userIds`, the ones a notification may reach: all of them, unless a test
 * account caused it (the current request, or `actorIds`), in which case only
 * test accounts. Real users are never notified because of a test account.
 */
export async function deliverableRecipients(
  userIds: string[],
  actorIds: Array<string | null | undefined> = [],
  knex: Knex | Knex.Transaction = getKnex(),
): Promise<string[]> {
  const testActor =
    actingAsTestAccount() || (actorIds.some(Boolean) && (await realmsOf({ users: actorIds }, knex)).has(true))
  return recipientsAllowedFor(testActor, userIds, knex)
}
