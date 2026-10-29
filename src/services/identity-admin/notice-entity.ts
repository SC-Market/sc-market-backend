/**
 * The entity of an account_identity_changed in-app notification (entity
 * "audit_logs"): which kind of change, and the new username for a released
 * one. Never the admin's reason or name.
 */

import { getKnex } from "../../clients/database/knex-db.js"
import { kindFromAuditAction, type IdentityActionKind } from "./identity-admin.service.js"

/** What the in-app notification shows (entity "audit_logs"). No reason, no admin name. */
export interface IdentityNoticeEntity {
  audit_log_id: string
  kind: IdentityActionKind
  new_username: string | null
  created_at: string
}

export async function identityNoticeEntity(auditLogId: string): Promise<IdentityNoticeEntity> {
  const row = await getKnex()("audit_logs")
    .where({ audit_log_id: auditLogId, subject_type: "user" })
    .first("audit_log_id", "action", "metadata", "created_at")
  const kind = row ? kindFromAuditAction(String(row.action)) : null
  if (!row || !kind) throw new Error(`Identity notice not found: ${auditLogId}`)
  const after = (row.metadata as { after?: { username?: unknown } } | null)?.after
  return {
    audit_log_id: String(row.audit_log_id),
    kind,
    new_username: kind === "username_released" && typeof after?.username === "string" ? after.username : null,
    created_at: new Date(row.created_at).toISOString(),
  }
}
