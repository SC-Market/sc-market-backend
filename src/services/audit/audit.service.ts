import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

export type AuditEntityType = "listing" | "order" | "offer" | "cart" | "stock_lot" | "inventory_lot"

export interface AuditEntry {
  entity_type: AuditEntityType
  entity_id: string
  action: string
  actor_id?: string | null
  actor_username?: string | null
  contractor_id?: string | null
  details?: Record<string, any> | null
}

class AuditService {
  async log(entry: AuditEntry): Promise<void> {
    try {
      const knex = getKnex()
      await knex("audit_trail").insert({
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        action: entry.action,
        actor_id: entry.actor_id || null,
        actor_username: entry.actor_username || null,
        contractor_id: entry.contractor_id || null,
        details: entry.details ? JSON.stringify(entry.details) : null,
      })
    } catch (e) {
      // Audit logging should never break the main flow
      logger.error("Failed to write audit trail", { entry, error: e })
    }
  }

  async logBatch(entries: AuditEntry[]): Promise<void> {
    if (!entries.length) return
    try {
      const knex = getKnex()
      await knex("audit_trail").insert(
        entries.map((e) => ({
          entity_type: e.entity_type,
          entity_id: e.entity_id,
          action: e.action,
          actor_id: e.actor_id || null,
          actor_username: e.actor_username || null,
          contractor_id: e.contractor_id || null,
          details: e.details ? JSON.stringify(e.details) : null,
        })),
      )
    } catch (e) {
      logger.error("Failed to write audit trail batch", { count: entries.length, error: e })
    }
  }
}

export const auditService = new AuditService()
