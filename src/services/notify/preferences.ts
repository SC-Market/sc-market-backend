/**
 * Preference resolution for notify(), reading the existing per-action tables
 * (the "legacy store" of the design doc, Phase 1):
 *
 * - push:      push_notification_preferences    (user, action, contractor_id)
 * - email:     email_notification_preferences   (user, action, contractor_id)
 * - in_app:    notification_channel_preferences (user, action, channel 'site')
 * - discord_dm: notification_channel_preferences (user, action, channel 'discord')
 *
 * Semantics are today's, exactly:
 * - a row for (user, action, recipient's contractor_id) decides; for org
 *   events there is NO fallback to the user's personal row, and vice versa;
 * - no row: the event's catalog default (push on, email off, in-app on,
 *   Discord DM on);
 * - in-app and Discord DM: an org row (notification_channel_org_preferences)
 *   decides for that org's notifications; without one the personal row
 *   (notification_channel_preferences) applies, as it did before per-org rows
 *   existed, so no earlier choice is lost.
 *
 * Org mute (notification_org_mutes, owner decision): for a recipient on an
 * org's side (contractorId set) of an org-scoped category, a mute (until
 * NULL, or still in the future) turns push, email and Discord DM off; in-app
 * stays as resolved. Mandatory events ignore preferences and mutes.
 *
 * Lookups are batched: one query per table for all recipients of an event.
 *
 * Merged events (catalog mergedActions: the four order statuses; new and
 * counter offers) keep a per-status / per-kind filter (owner decision: never
 * silence more than the user chose). An occurrence reads its own action's
 * rows (the user's exact earlier per-event choice); the merged event in the
 * settings shows those as "Customise statuses".
 */
import { getKnex } from "../../clients/database/knex-db.js"
import type { UserChannel, UserRecipient } from "./channels.js"
import { CATEGORIES, isMandatory, type EventDefinition } from "./catalog.js"

export type PreferenceMatrix = Map<string, Partial<Record<UserChannel, boolean>>>

export function recipientKey(r: UserRecipient): string {
  return `${r.userId}|${r.contractorId ?? ""}`
}

const actionIdCache = new Map<string, number>()

export async function actionTypeId(action: string): Promise<number> {
  const cached = actionIdCache.get(action)
  if (cached !== undefined) return cached
  const row = await getKnex()("notification_actions").where({ action }).first("action_type_id")
  if (!row) throw new Error(`Unknown notification action: ${action}`)
  const id = Number(row.action_type_id)
  actionIdCache.set(action, id)
  return id
}

/** Effective on/off per recipient and channel for one event. */
export async function resolvePreferences(
  def: EventDefinition,
  recipients: UserRecipient[],
  channels: readonly UserChannel[],
  /** Merged events: the occurrence's own action (its per-status filter). */
  occurrenceAction?: string,
  options: { ignoreMute?: boolean } = {},
): Promise<PreferenceMatrix> {
  const own = def.mergedActions?.length
    ? { ...def, legacyAction: occurrenceAction ?? def.legacyAction, mergedActions: undefined }
    : def
  const explicit = await resolveExplicit(own, recipients, channels)
  for (const [key, prefs] of explicit) {
    for (const c of channels) prefs[c] = prefs[c] ?? def.defaults[c] ?? false
    explicit.set(key, prefs)
  }
  if (!options.ignoreMute && !isMandatory(def) && CATEGORIES[def.category].orgScoped) {
    const muted = await mutedRecipients(recipients)
    for (const r of recipients) {
      if (!muted.has(recipientKey(r))) continue
      const prefs = explicit.get(recipientKey(r))!
      for (const c of channels) if (c !== "in_app") prefs[c] = false
    }
  }
  return explicit
}

/** Whether the user muted this org (legacy push/email paths use this). */
export async function isOrgMuted(userId: string, contractorId: string | null | undefined): Promise<boolean> {
  if (!contractorId) return false
  return (await mutedRecipients([{ userId, contractorId }])).size > 0
}

/** Org-side recipients who muted that org (until NULL or in the future). */
export async function mutedRecipients(recipients: UserRecipient[]): Promise<Set<string>> {
  const scoped = recipients.filter((r) => r.contractorId)
  if (!scoped.length) return new Set()
  const rows: { user_id: string; contractor_id: string }[] = await getKnex()("notification_org_mutes")
    .whereIn("user_id", [...new Set(scoped.map((r) => r.userId))])
    .whereIn("contractor_id", [...new Set(scoped.map((r) => r.contractorId!))])
    .where((q) => q.whereNull("muted_until").orWhere("muted_until", ">", new Date()))
    .select("user_id", "contractor_id")
  return new Set(rows.map((r) => recipientKey({ userId: r.user_id, contractorId: r.contractor_id })))
}

/** The user's stored choice per recipient and channel; undefined where no row exists. */
async function resolveExplicit(
  def: EventDefinition,
  recipients: UserRecipient[],
  channels: readonly UserChannel[],
): Promise<PreferenceMatrix> {
  const db = getKnex()
  const id = await actionTypeId(def.legacyAction)
  const userIds = [...new Set(recipients.map((r) => r.userId))]
  const out: PreferenceMatrix = new Map()
  if (!userIds.length) return out
  if (isMandatory(def)) {
    for (const r of recipients) {
      out.set(recipientKey(r), Object.fromEntries(channels.map((c) => [c, true])))
    }
    return out
  }

  const want = (c: UserChannel) => channels.includes(c)
  const orgIds = [...new Set(recipients.map((r) => r.contractorId).filter((c): c is string => !!c))]
  const [push, email, generic, orgGeneric] = await Promise.all([
    want("push")
      ? db("push_notification_preferences")
          .whereIn("user_id", userIds)
          .where({ action_type_id: id })
          .select("user_id", "contractor_id", "enabled", "updated_at")
      : [],
    want("email")
      ? db("email_notification_preferences")
          .whereIn("user_id", userIds)
          .where({ action_type_id: id })
          .select("user_id", "contractor_id", "enabled", "updated_at")
      : [],
    want("in_app") || want("discord_dm")
      ? db("notification_channel_preferences")
          .whereIn("user_id", userIds)
          .where({ action_type_id: id })
          .select("user_id", "channel", "enabled")
      : [],
    (want("in_app") || want("discord_dm")) && orgIds.length
      ? db("notification_channel_org_preferences")
          .whereIn("user_id", userIds)
          .whereIn("contractor_id", orgIds)
          .where({ action_type_id: id })
          .select("user_id", "channel", "contractor_id", "enabled")
      : [],
  ])

  for (const r of recipients) {
    const scope = r.contractorId ?? null
    const prefs: Partial<Record<UserChannel, boolean>> = {}
    for (const c of channels) {
      let value: boolean | undefined
      if (c === "push" || c === "email") {
        value = pickScoped(c === "push" ? push : email, r.userId, scope)
      } else {
        // In-app and Discord DM: the org's row, else the personal one.
        const channel = c === "in_app" ? "site" : "discord"
        const orgRow = scope
          ? (orgGeneric as (GenericRow & { contractor_id: string })[]).find(
              (row) => row.user_id === r.userId && row.channel === channel && row.contractor_id === scope,
            )
          : undefined
        value =
          orgRow?.enabled ??
          (generic as GenericRow[]).find((row) => row.user_id === r.userId && row.channel === channel)?.enabled
      }
      prefs[c] = value
    }
    out.set(recipientKey(r), prefs)
  }
  return out
}

interface ScopedRow {
  user_id: string
  contractor_id: string | null
  enabled: boolean
  updated_at?: Date
}
interface GenericRow {
  user_id: string
  channel: string
  enabled: boolean
}

/**
 * The row for exactly this scope. The tables' unique constraint treats NULL
 * contractor ids as distinct, so personal rows can be duplicated; the legacy
 * lookups (`.first()` without an order) return an arbitrary one of them. Pick
 * the most recently updated, which is what the user last chose.
 */
function pickScoped(rows: ScopedRow[], userId: string, scope: string | null): boolean | undefined {
  const matches = rows.filter(
    (row) => row.user_id === userId && (row.contractor_id ?? null) === scope,
  )
  if (!matches.length) return undefined
  if (matches.length === 1) return matches[0].enabled
  matches.sort((a, b) => +new Date(b.updated_at ?? 0) - +new Date(a.updated_at ?? 0))
  return matches[0].enabled
}
