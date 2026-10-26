import { describe, it, expect } from "vitest"
import knexFactory from "knex"
import { filterAuditLogsByActor } from "./audit-log-filters.js"

/**
 * The org audit log's actor filter needed a raw user ID. It now also takes a
 * username (the UI's member autocomplete), resolved in the same query.
 */
const k = knexFactory({ client: "pg" })

function sql(actor: { actorId?: string; actorUsername?: string }) {
  return filterAuditLogsByActor(k("audit_logs"), k, actor).toSQL().toNative()
}

describe("filterAuditLogsByActor", () => {
  it("filters by username through accounts", () => {
    const q = sql({ actorUsername: " alice " })
    expect(q.sql).toBe(
      'select * from "audit_logs" where "actor_id" in (select "user_id" from "accounts" where "username" = $1)',
    )
    expect(q.bindings).toEqual(["alice"])
  })

  it("still filters by user id", () => {
    const q = sql({ actorId: "u-1" })
    expect(q.sql).toBe('select * from "audit_logs" where "actor_id" = $1')
    expect(q.bindings).toEqual(["u-1"])
  })

  it("adds nothing without a filter", () => {
    expect(sql({ actorUsername: "  " }).sql).toBe('select * from "audit_logs"')
  })
})
