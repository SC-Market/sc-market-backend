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
  record(entry: AuditLogRecordInput, trx?: any): Promise<void>
}

class DatabaseAuditLogService implements AuditLogService {
  async record(
    { action, actorId, subjectType, subjectId, metadata }: AuditLogRecordInput,
    trx?: any,
  ): Promise<void> {
    try {
      const query = trx ? trx("audit_logs") : database.knex("audit_logs")
      await query.insert({
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
