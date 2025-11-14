import { database } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

export interface AuditLogRecordInput {
  action: string
  actorId?: string | null
  subjectType: string
  subjectId: string
  metadata?: Record<string, unknown>
}

export interface AuditLogService {
  record(entry: AuditLogRecordInput): Promise<void>
}

class DatabaseAuditLogService implements AuditLogService {
  async record({
    action,
    actorId,
    subjectType,
    subjectId,
    metadata,
  }: AuditLogRecordInput): Promise<void> {
    try {
      await database.knex("audit_logs").insert({
        action,
        actor_id: actorId ?? null,
        subject_type: subjectType,
        subject_id: subjectId,
        metadata: metadata ?? {},
      })
    } catch (error) {
      logger.warn("Failed to record audit log entry", {
        error,
        action,
        subjectType,
        subjectId,
      })
    }
  }
}

export const auditLogService: AuditLogService = new DatabaseAuditLogService()
