/**
 * Admin alerts: the channel rules and the API shape of an alert. Used by
 * AdminAlertsV2Controller (v2 /admin/alerts).
 */
import type {
  AdminAlertChannel,
  DBAdminAlert,
} from "../../clients/database/db-models.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import logger from "../../logger/logger.js"

export const ALERT_CHANNELS: AdminAlertChannel[] = [
  "in_app",
  "push",
  "email",
  "discord_dm",
]

export const ALERT_TARGET_TYPES = [
  "all_users",
  "org_members",
  "org_owners",
  "admins_only",
  "specific_org",
] as const

export type AdminAlertTargetType = (typeof ALERT_TARGET_TYPES)[number]

/** Channels for a new alert: in_app always; default in_app + push. */
export function parseAlertChannels(
  raw: unknown,
): { channels: AdminAlertChannel[] } | { error: string } {
  if (raw === undefined || raw === null) return { channels: ["in_app", "push"] }
  if (
    !Array.isArray(raw) ||
    raw.some((c) => !ALERT_CHANNELS.includes(c as AdminAlertChannel))
  ) {
    return { error: `channels must be a list of: ${ALERT_CHANNELS.join(", ")}` }
  }
  const set = new Set<AdminAlertChannel>([
    "in_app",
    ...(raw as AdminAlertChannel[]),
  ])
  return { channels: ALERT_CHANNELS.filter((c) => set.has(c)) }
}

/** An admin alert as the admin pages see it (the org by Spectrum ID). */
export interface AdminAlert {
  alert_id: string
  /** @maxLength 200 */
  title: string
  /** Markdown. */
  content: string
  link: string | null
  target_type: AdminAlertTargetType
  /** The org, when target_type is specific_org. */
  target_spectrum_id: string | null
  created_by: string
  created_at: string
  active: boolean
  /** Delivery channels; in_app is always included. */
  channels: AdminAlertChannel[]
}

/** The DB row in API form: the target org by Spectrum ID, not contractor_id. */
export async function formatAlertForApi(
  alert: DBAdminAlert,
): Promise<AdminAlert> {
  let target_spectrum_id: string | null = null
  if (alert.target_contractor_id) {
    try {
      const contractor = await contractorDb.getContractor({
        contractor_id: alert.target_contractor_id,
      })
      target_spectrum_id = contractor.spectrum_id
    } catch {
      logger.warn("Could not find contractor for alert", {
        alertId: alert.alert_id,
        contractorId: alert.target_contractor_id,
      })
    }
  }
  return {
    alert_id: alert.alert_id,
    title: alert.title,
    content: alert.content,
    link: alert.link,
    target_type: alert.target_type,
    target_spectrum_id,
    created_by: alert.created_by,
    created_at:
      alert.created_at instanceof Date
        ? alert.created_at.toISOString()
        : String(alert.created_at),
    active: alert.active,
    channels: alert.channels,
  }
}
