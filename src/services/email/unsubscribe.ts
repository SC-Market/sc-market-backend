/**
 * Applying an unsubscribe: write enabled = false email preference rows.
 *
 * Only the preference scope the email was sent under changes (Personal, or
 * that org's rows for its members). Existing rows for the scope are set off
 * (all of them: the tables' unique constraint treats NULL contractor ids as
 * distinct, so Personal rows can be duplicated, preferences.ts pickScoped);
 * missing ones are inserted off, so an event that emails by default (org
 * invites) stops too. Idempotent: a second click changes nothing and still
 * succeeds.
 */
import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { CATALOG, isMandatoryOn, type CategoryId, type EventDefinition } from "../notify/catalog.js"
import { KEY_EMAIL_ACTIONS } from "../notify/email-defaults.js"
import type { UnsubscribeScope } from "./unsubscribe-token.js"

/** Plain-English names of what a link turned off, for the confirmation page. */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  orders: "order updates",
  order_messages: "order messages",
  offers: "offers",
  offer_messages: "offer messages",
  market: "market activity",
  reviews: "reviews",
  watchlist: "price alerts",
  org: "organization invites",
  org_members: "organization member activity",
  announcements: "announcements",
  reminders: "reminders (unread messages, pending offers)",
  contracts: "public contract offers",
  storefront: "storefront enquiry replies",
  // No email (Discord DM only); listed for completeness.
  threads: "Discord thread invites",
  account: "account notices",
}

const KEY_DEFAULTS_LABEL = "order updates, offers and unread message reminders"
const ALL_LABEL = "all notification emails"

function actionsOf(def: EventDefinition): string[] {
  return [def.legacyAction, ...(def.mergedActions ?? [])]
}

/** notification_actions.action values a scope covers. */
export function actionsForScope(scope: UnsubscribeScope | { kind: "all" }): string[] {
  const defs = Object.values(CATALOG) as EventDefinition[]
  let actions: string[]
  if (scope.kind === "category") {
    actions = defs.filter((d) => d.category === scope.category).flatMap(actionsOf)
  } else if (scope.kind === "action") {
    actions = [scope.action]
  } else if (scope.kind === "key_defaults") {
    actions = [...KEY_EMAIL_ACTIONS]
  } else {
    actions = defs.filter((d) => !isMandatoryOn(d, "email")).flatMap(actionsOf)
  }
  return [...new Set(actions)]
}

export function labelForScope(scope: UnsubscribeScope | { kind: "all" }): string {
  if (scope.kind === "category") return CATEGORY_LABELS[scope.category]
  if (scope.kind === "action") return scope.action.replace(/_/g, " ")
  if (scope.kind === "key_defaults") return KEY_DEFAULTS_LABEL
  return ALL_LABEL
}

export interface UnsubscribeResult {
  /** Rows set from on to off or inserted off. */
  turnedOff: number
  label: string
}

/** Turn email off for the scope's actions under one preference scope. */
export async function applyUnsubscribe(
  userId: string,
  scope: UnsubscribeScope | { kind: "all" },
  contractorId: string | null,
  db: Knex = getKnex(),
): Promise<UnsubscribeResult> {
  const label = labelForScope(scope)
  if (
    scope.kind === "category" &&
    (Object.values(CATALOG) as EventDefinition[]).some(
      (d) => d.category === scope.category && isMandatoryOn(d, "email"),
    )
  ) {
    return { turnedOff: 0, label }
  }
  const wanted = actionsForScope(scope)
  return db.transaction(async (trx) => {
    const rows: { action_type_id: number | string }[] = await trx("notification_actions")
      .whereIn("action", wanted)
      .select("action_type_id")
    const ids = rows.map((r) => Number(r.action_type_id))
    if (!ids.length) return { turnedOff: 0, label }

    const inScope = (q: Knex.QueryBuilder) =>
      contractorId === null ? q.whereNull("contractor_id") : q.where("contractor_id", contractorId)

    const now = new Date()
    const switchedOff = await inScope(
      trx("email_notification_preferences").where("user_id", userId).whereIn("action_type_id", ids),
    )
      .where("enabled", true)
      .update({ enabled: false, updated_at: now })

    const existing: { action_type_id: number | string }[] = await inScope(
      trx("email_notification_preferences").where("user_id", userId).whereIn("action_type_id", ids),
    ).select("action_type_id")
    const have = new Set(existing.map((r) => Number(r.action_type_id)))
    const missing = ids.filter((id) => !have.has(id))
    if (missing.length) {
      await trx("email_notification_preferences").insert(
        missing.map((id) => ({
          user_id: userId,
          action_type_id: id,
          contractor_id: contractorId,
          enabled: false,
          frequency: "immediate",
          digest_time: null,
          created_at: now,
          updated_at: now,
        })),
      )
    }
    return { turnedOff: Number(switchedOff) + missing.length, label }
  })
}

/**
 * Turn off every notification email the user can turn off: all Personal
 * events, and every org-scoped row they have (announcements included; only
 * emailMandatory categories stay).
 */
export async function applyUnsubscribeAll(userId: string, db: Knex = getKnex()): Promise<UnsubscribeResult> {
  const personal = await applyUnsubscribe(userId, { kind: "all" }, null, db)
  const orgRows = await db("email_notification_preferences")
    .where("user_id", userId)
    .whereNotNull("contractor_id")
    .where("enabled", true)
    .update({ enabled: false, updated_at: new Date() })
  return { turnedOff: personal.turnedOff + Number(orgRows), label: personal.label }
}
