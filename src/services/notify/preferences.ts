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
 * - notification_channel_preferences has no org scope: a user's in-app and
 *   Discord DM choice applies to personal and org notifications alike.
 *
 * Lookups are batched: one query per table for all recipients of an event.
 *
 * Merged events (catalog mergedActions: the four order statuses; new and
 * counter offers) read every merged action's row, per channel and scope:
 * - any row saying off -> off (the most protective choice: an opt-out the
 *   user made for one of the old events is kept for the merged one);
 * - otherwise any row saying on -> on (an explicit opt-in, e.g. email, is kept);
 * - no row for any of them -> the catalog default.
 * So nobody receives something they had turned off; the cost is that a user
 * who turned off only one status stops getting the others on that channel.
 * Shadow lines count those cases as "merged_preference".
 */
import { getKnex } from "../../clients/database/knex-db.js"
import type { UserChannel, UserRecipient } from "./channels.js"
import { isMandatory, type EventDefinition } from "./catalog.js"

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
): Promise<PreferenceMatrix> {
  if (def.mergedActions?.length && !isMandatory(def)) {
    const parts = await Promise.all(
      def.mergedActions.map((action) =>
        resolveExplicit({ ...def, legacyAction: action, mergedActions: undefined }, recipients, channels),
      ),
    )
    const out: PreferenceMatrix = new Map()
    for (const r of recipients) {
      const key = recipientKey(r)
      const prefs: Partial<Record<UserChannel, boolean>> = {}
      for (const c of channels) {
        const values = parts.map((m) => m.get(key)?.[c])
        prefs[c] = values.includes(false) ? false : values.includes(true) ? true : (def.defaults[c] ?? false)
      }
      out.set(key, prefs)
    }
    return out
  }
  const explicit = await resolveExplicit(def, recipients, channels)
  for (const [key, prefs] of explicit) {
    for (const c of channels) prefs[c] = prefs[c] ?? def.defaults[c] ?? false
    explicit.set(key, prefs)
  }
  return explicit
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
  const [push, email, generic] = await Promise.all([
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
  ])

  for (const r of recipients) {
    const scope = r.contractorId ?? null
    const prefs: Partial<Record<UserChannel, boolean>> = {}
    for (const c of channels) {
      let value: boolean | undefined
      if (c === "push" || c === "email") {
        value = pickScoped(c === "push" ? push : email, r.userId, scope)
      } else {
        // In-app and Discord DM rows have no org scope: one setting per user
        // that applies to personal and org notifications alike.
        const channel = c === "in_app" ? "site" : "discord"
        value = (generic as GenericRow[]).find(
          (row) => row.user_id === r.userId && row.channel === channel,
        )?.enabled
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
