import type { Knex } from "knex"

/**
 * Narrow an audit_logs query to one actor, by user id or by username. An
 * unknown username matches nothing (no error), like any other filter.
 */
export function filterAuditLogsByActor(
  query: Knex.QueryBuilder,
  k: Knex,
  actor: { actorId?: string; actorUsername?: string },
): Knex.QueryBuilder {
  if (actor.actorId) {
    query = query.where("actor_id", actor.actorId)
  }
  const username = actor.actorUsername?.trim()
  if (username) {
    query = query.whereIn(
      "actor_id",
      k("accounts").select("user_id").where("username", username),
    )
  }
  return query
}
