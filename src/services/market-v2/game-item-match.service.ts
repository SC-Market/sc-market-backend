/**
 * Links free-text listing titles (UEX imports, the Discord bot's
 * `/listing create`) to game items by name.
 *
 * A title is linked only when it names exactly one game item:
 * 1. exact name, ignoring case and surrounding whitespace; if that finds more
 *    than one item the title is ambiguous and stays unlinked;
 * 2. otherwise the normalised name (lowercase, every run of non-alphanumerics
 *    collapsed to one space), again only when exactly one item has it.
 * Anything else is left unlinked (null). There is no fuzzy matching.
 */

import type { Knex } from "knex"

/**
 * Normalised name. Both sides of the comparison go through this same
 * expression, so the database decides what "alphanumeric" means for both.
 */
const NORM_SQL = (col: string) =>
  `btrim(regexp_replace(lower(${col}), '[^[:alnum:]]+', ' ', 'g'))`

export interface NameMatchRow {
  title: string
  id: string
  /** True when the item's name equals the title ignoring case and outer spaces. */
  exact: boolean
}

/**
 * Picks the game item id for each title from the candidate rows: a unique
 * exact match, else a unique normalised match, else null.
 */
export function pickUniqueMatches(
  titles: string[],
  rows: NameMatchRow[],
): Map<string, string | null> {
  const result = new Map<string, string | null>()
  for (const title of titles) {
    const candidates = rows.filter((r) => r.title === title)
    const exact = new Set(candidates.filter((r) => r.exact).map((r) => r.id))
    const normalized = new Set(candidates.map((r) => r.id))
    if (exact.size === 1) result.set(title, [...exact][0])
    else if (exact.size === 0 && normalized.size === 1)
      result.set(title, [...normalized][0])
    else result.set(title, null)
  }
  return result
}

/**
 * Looks up game items for many titles in one query.
 * @returns title -> game item id, or null when there is no unique match
 */
export async function matchGameItemsByName(
  db: Knex | Knex.Transaction,
  titles: string[],
): Promise<Map<string, string | null>> {
  const unique = [
    ...new Set(titles.filter((t) => typeof t === "string" && t.trim().length > 0)),
  ]
  if (unique.length === 0) return pickUniqueMatches(titles, [])

  const { rows } = (await db.raw(
    `SELECT t.title,
            gi.id::text AS id,
            lower(btrim(gi.name)) = lower(btrim(t.title)) AS exact
       FROM json_array_elements_text(?::json) AS t(title)
       JOIN game_items gi
         ON ${NORM_SQL("gi.name")} = ${NORM_SQL("t.title")}
      WHERE ${NORM_SQL("t.title")} <> ''`,
    // As JSON text: knex expands an array binding into a list of values
    [JSON.stringify(unique)],
  )) as { rows: NameMatchRow[] }

  return pickUniqueMatches(titles, rows)
}

/** Single-title form of {@link matchGameItemsByName}. */
export async function matchGameItemByName(
  db: Knex | Knex.Transaction,
  title: string,
): Promise<string | null> {
  return (await matchGameItemsByName(db, [title])).get(title) ?? null
}
