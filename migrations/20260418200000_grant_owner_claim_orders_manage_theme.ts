import type { Knex } from "knex"

/** Ensure org owner roles can claim orders and edit white-label theme. */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE contractor_roles AS cr
    SET
      claim_orders = true,
      manage_theme = true
    FROM contractors AS c
    WHERE cr.role_id = c.owner_role
      AND c.owner_role IS NOT NULL
  `)
}

export async function down(_knex: Knex): Promise<void> {
  // Data backfill — no safe revert without prior snapshots
}
