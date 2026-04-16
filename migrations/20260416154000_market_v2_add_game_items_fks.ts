import type { Knex } from "knex"

function constraintName(table: string): string {
  return `fk_${table}_game_item_id_game_items`
}

async function resolveGameItemsPkColumn(knex: Knex): Promise<"id" | "game_item_id"> {
  // Older/legacy schemas use `id` as the primary key; some newer schemas may use `game_item_id`.
  if (await knex.schema.hasColumn("game_items", "game_item_id")) {
    return "game_item_id"
  }
  return "id"
}

async function addFkIfPossible(
  knex: Knex,
  table: string,
  referencedColumn: "id" | "game_item_id",
): Promise<void> {
  const hasTable = await knex.schema.hasTable(table)
  if (!hasTable) return

  const hasColumn = await knex.schema.hasColumn(table, "game_item_id")
  if (!hasColumn) return

  const name = constraintName(table)

  // Add using raw so we can guard if it already exists without exploding.
  // We avoid bind parameters inside DO $$ blocks (pg doesn't support them there).
  const exists = await knex
    .select("conname")
    .from("pg_constraint")
    .where({ conname: name })
    .first()

  if (exists) return

  // Note: `referencedColumn` is derived from schema introspection and not user input.
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (game_item_id) REFERENCES game_items(${referencedColumn}) ON DELETE CASCADE;`,
    [table, name],
  )
}

export async function up(knex: Knex): Promise<void> {
  const pk = await resolveGameItemsPkColumn(knex)

  await addFkIfPossible(knex, "buy_orders_v2", pk)
  await addFkIfPossible(knex, "price_history_v2", pk)
}

export async function down(knex: Knex): Promise<void> {
  for (const table of ["buy_orders_v2", "price_history_v2"] as const) {
    const hasTable = await knex.schema.hasTable(table)
    if (!hasTable) continue

    const name = constraintName(table)
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, name])
  }
}

