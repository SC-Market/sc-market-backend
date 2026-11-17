import type { Knex } from "knex"

/**
 * User data that references game data no longer cascades.
 *
 * The game-data import used to delete and re-insert every mission, and
 * ON DELETE CASCADE silently wiped mission_completions and mission_ratings
 * (see 20261117120000_missions_stable_identity). The import no longer deletes
 * missions or blueprints; as a backstop, deleting a mission or blueprint that
 * still has completions, ratings, inventory, crafting history or wishlist
 * entries now fails (RESTRICT) instead of deleting them (or nulling the
 * wishlist item's blueprint).
 *
 * Not one transaction: each FK swap (drop + re-add) is its own short
 * transaction, so no lock is held across tables. Idempotent: each FK is
 * rewritten only when its ON DELETE action differs, so a re-run after a
 * partial failure finishes the rest.
 * Re-adding an FK validates the (small) child table and briefly locks the
 * parent; these are game-data tables, none of them hot (docs/migrations.md).
 */

const USER_DATA_FKS: Array<{
  table: string
  column: string
  refTable: string
  refColumn: string
}> = [
  {
    table: "mission_completions",
    column: "mission_id",
    refTable: "missions",
    refColumn: "mission_id",
  },
  {
    table: "mission_ratings",
    column: "mission_id",
    refTable: "missions",
    refColumn: "mission_id",
  },
  {
    table: "user_blueprint_inventory",
    column: "blueprint_id",
    refTable: "blueprints",
    refColumn: "blueprint_id",
  },
  {
    table: "organization_blueprint_inventory",
    column: "blueprint_id",
    refTable: "blueprints",
    refColumn: "blueprint_id",
  },
  {
    table: "crafting_history",
    column: "blueprint_id",
    refTable: "blueprints",
    refColumn: "blueprint_id",
  },
  {
    table: "wishlist_items",
    column: "blueprint_id",
    refTable: "blueprints",
    refColumn: "blueprint_id",
  },
]

/** pg_constraint.confdeltype: a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL, d = SET DEFAULT */
const ON_DELETE_SQL: Record<"r" | "c" | "n", string> = {
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
}

async function setOnDelete(
  knex: Knex,
  fk: (typeof USER_DATA_FKS)[number],
  action: "r" | "c" | "n",
): Promise<void> {
  const exists = await knex.raw(
    `SELECT to_regclass(?) AS t, to_regclass(?) AS r`,
    [fk.table, fk.refTable],
  )
  if (!exists.rows[0].t || !exists.rows[0].r) return

  const found = await knex.raw(
    `
    SELECT con.conname, con.confdeltype
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.conrelid = to_regclass(?)
      AND con.confrelid = to_regclass(?)
      AND array_length(con.conkey, 1) = 1
      AND att.attname = ?
    `,
    [fk.table, fk.refTable, fk.column],
  )
  const rows: Array<{ conname: string; confdeltype: string }> = found.rows
  if (rows.length > 1) {
    throw new Error(
      `${fk.table}.${fk.column}: ${rows.length} foreign keys to ${fk.refTable}, expected one`,
    )
  }
  if (rows.length === 1 && rows[0].confdeltype === action) return

  const name = rows[0]?.conname ?? `${fk.table}_${fk.column}_foreign`
  await knex.transaction(async (trx) => {
    if (rows.length === 1)
      await trx.raw(`ALTER TABLE ?? DROP CONSTRAINT ??`, [fk.table, name])
    await trx.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (??) ON DELETE ${ON_DELETE_SQL[action]}`,
      [fk.table, name, fk.column, fk.refTable, fk.refColumn],
    )
  })
}

export const config = { transaction: false }

export async function up(knex: Knex): Promise<void> {
  for (const fk of USER_DATA_FKS) await setOnDelete(knex, fk, "r")
}

export async function down(knex: Knex): Promise<void> {
  for (const fk of USER_DATA_FKS)
    await setOnDelete(knex, fk, fk.table === "wishlist_items" ? "n" : "c")
}
