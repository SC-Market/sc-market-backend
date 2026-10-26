/**
 * The Settings -> Notifications matrix: categories x channels, with the
 * catalog events under each category as per-event overrides.
 *
 * Storage is still the legacy per-action tables (preferences.ts): a category
 * cell is a view over its events, and writing a category writes every event
 * in it. Nothing is lost: a user whose per-action settings differ inside a
 * category sees the category as "mixed" and the exact per-event values.
 *
 * Scopes: personal (contractorId null) or one org. Org scope lists only the
 * org-scoped categories, whose preferences are kept per org exactly as
 * before (no inheritance from the personal settings).
 */
import { getKnex } from "../../clients/database/knex-db.js"
import { CATALOG, CATEGORIES, type CategoryId, type EventKey } from "./catalog.js"
import type { UserChannel } from "./channels.js"
import { actionTypeId, recipientKey, resolvePreferences } from "./preferences.js"

/** Channels a user can switch for an event (in-app is always on except for price alerts, as today). */
export function editableChannels(event: EventKey): UserChannel[] {
  const def = CATALOG[event]
  return def.channels.filter((c) => c !== "in_app" || event === "watchlist.price_alert")
}

export interface MatrixCell {
  channel: UserChannel
  enabled: boolean
  /** Shown but cannot be changed (in-app is always written). */
  locked: boolean
  default: boolean
}
export interface MatrixEvent {
  event: EventKey
  cells: MatrixCell[]
}
export interface MatrixCategory {
  category: CategoryId
  /** Per channel: on, off, or mixed across the category's events; absent if no event uses it. */
  cells: { channel: UserChannel; state: "on" | "off" | "mixed"; locked: boolean }[]
  events: MatrixEvent[]
}

function eventsOf(category: CategoryId): EventKey[] {
  return (Object.keys(CATALOG) as EventKey[]).filter((k) => CATALOG[k].category === category)
}

export async function getMatrix(userId: string, contractorId: string | null): Promise<MatrixCategory[]> {
  const out: MatrixCategory[] = []
  const recipient = { userId, contractorId }
  for (const category of Object.keys(CATEGORIES) as CategoryId[]) {
    if (CATEGORIES[category].mandatory) continue
    if (contractorId && !CATEGORIES[category].orgScoped) continue
    const events: MatrixEvent[] = []
    for (const event of eventsOf(category)) {
      const def = CATALOG[event]
      const prefs = (await resolvePreferences(def, [recipient], def.channels)).get(recipientKey(recipient)) ?? {}
      const editable = editableChannels(event)
      events.push({
        event,
        cells: def.channels
          // Price alert in-app/Discord toggles have no org scope.
          .filter((c) => !contractorId || c === "push" || c === "email" || c === "in_app")
          .map((c) => ({
            channel: c,
            enabled: c === "in_app" && !editable.includes(c) ? true : !!prefs[c],
            locked: !editable.includes(c) || (!!contractorId && c === "in_app"),
            default: !!def.defaults[c],
          })),
      })
    }
    if (!events.length) continue
    const channels = [...new Set(events.flatMap((e) => e.cells.map((c) => c.channel)))]
    out.push({
      category,
      events,
      cells: channels.map((channel) => {
        const cells = events.flatMap((e) => e.cells.filter((c) => c.channel === channel))
        const on = cells.filter((c) => c.enabled).length
        return {
          channel,
          state: on === cells.length ? "on" : on === 0 ? "off" : "mixed",
          locked: cells.every((c) => c.locked),
        }
      }),
    })
  }
  return out
}

export interface PreferenceUpdate {
  /** A whole category, or one event (per-event override). */
  category?: CategoryId
  event?: EventKey
  channel: UserChannel
  enabled: boolean
}

export class PreferenceUpdateError extends Error {}

/**
 * Apply updates for one scope. Writes the legacy tables: push and email per
 * action and org scope; in-app and Discord DM (price alerts) in
 * notification_channel_preferences, personal only.
 */
export async function setPreferences(
  userId: string,
  contractorId: string | null,
  updates: PreferenceUpdate[],
): Promise<void> {
  const db = getKnex()
  const writes: { event: EventKey; channel: UserChannel; enabled: boolean }[] = []
  for (const u of updates) {
    const events = u.event ? [u.event] : u.category ? eventsOf(u.category) : []
    if (!events.length) throw new PreferenceUpdateError("Each update needs a known category or event")
    if (u.category && !(u.category in CATEGORIES)) throw new PreferenceUpdateError(`Unknown category ${u.category}`)
    if (u.event && !(u.event in CATALOG)) throw new PreferenceUpdateError(`Unknown event ${u.event}`)
    for (const event of events) {
      if (!editableChannels(event).includes(u.channel)) {
        if (u.event) throw new PreferenceUpdateError(`${u.channel} cannot be changed for ${event}`)
        continue // category-wide update: skip events without that channel
      }
      if (contractorId && u.channel !== "push" && u.channel !== "email") {
        throw new PreferenceUpdateError(`${u.channel} has no organization setting`)
      }
      writes.push({ event, channel: u.channel, enabled: u.enabled })
    }
  }

  await db.transaction(async (trx) => {
    for (const w of writes) {
      const action_type_id = await actionTypeId(CATALOG[w.event].legacyAction)
      if (w.channel === "push" || w.channel === "email") {
        const table = w.channel === "push" ? "push_notification_preferences" : "email_notification_preferences"
        // Update first: the unique constraint treats NULL contractor ids as
        // distinct, so an upsert would add duplicate personal rows.
        const scoped = trx(table).where({ user_id: userId, action_type_id })
        const updated = await (contractorId === null
          ? scoped.whereNull("contractor_id")
          : scoped.where({ contractor_id: contractorId })
        ).update({ enabled: w.enabled, updated_at: new Date() })
        if (!updated) {
          await trx(table).insert({ user_id: userId, action_type_id, contractor_id: contractorId, enabled: w.enabled })
        }
      } else {
        await trx("notification_channel_preferences")
          .insert({
            user_id: userId,
            action_type_id,
            channel: w.channel === "in_app" ? "site" : "discord",
            enabled: w.enabled,
            updated_at: new Date(),
          })
          .onConflict(["user_id", "action_type_id", "channel"])
          .merge({ enabled: w.enabled, updated_at: new Date() })
      }
    }
  })
}
