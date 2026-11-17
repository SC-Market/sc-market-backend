/**
 * Builds the rows the game-data import writes for each ship/vehicle
 * (one `game_items` row so ships are linkable, one `wiki_ships` row for
 * the ship wiki), and validates them against the column limits before
 * anything touches the database.
 *
 * Pure: no database access, so it is unit-tested against real export
 * records (see ship-records.test.ts).
 */
import type { Knex } from "knex"
import { canonicalManufacturerCode } from "./manufacturers.js"
import type { P4KShip } from "./import.service.js"

/** Column widths, from the game_items / wiki_ships migrations. */
export const SHIP_COLUMN_LIMITS = {
  /** game_items.name is varchar(100) (wiki_ships.name is 200) */
  name: 100,
  /** wiki_ships.ship_code varchar(200) */
  shipCode: 200,
  /** wiki_ships.focus varchar(100) */
  focus: 100,
  /** wiki_ships.manufacturer_code varchar(50) */
  manufacturer: 50,
  /** wiki_ships.career / role varchar(100) */
  career: 100,
  role: 100,
} as const

export const SHIP_GAME_ITEM_TYPE = "Ship for Sale/Rental"

export interface ShipGameItemRow {
  name: string
  type: string
  p4k_id: string
  manufacturer: string | null
}

export interface WikiShipRow {
  version_id: string
  ship_code: string
  name: string
  focus: string | null
  manufacturer_code: string | null
  size: number | null
  description: string | null
  crew_size: number | null
  career: string | null
  role: string | null
  length_m: number | null
  width_m: number | null
  height_m: number | null
}

/** Columns refreshed when a ship already has a row for this version. */
export const WIKI_SHIP_MERGE_COLUMNS = [
  "name",
  "focus",
  "manufacturer_code",
  "size",
  "description",
  "crew_size",
  "career",
  "role",
  "length_m",
  "width_m",
  "height_m",
] as const satisfies ReadonlyArray<keyof WikiShipRow>

export interface ShipRecord {
  /** "Name (ship_code)", for error messages */
  label: string
  gameItem: ShipGameItemRow
  wikiShip: WikiShipRow
}

export interface ShipRecordBuildResult {
  records: ShipRecord[]
  /** Ships with no localized name (raw "@key" / "<= PLACEHOLDER =>"); not real vehicles */
  unnamed: number
  /** Records rejected before writing, and fields dropped from records that were kept */
  errors: string[]
}

/** True when the export never resolved a localized string (name, focus). */
export function isUnlocalizedText(name: string | null | undefined): boolean {
  return !name || name.startsWith("@") || name.startsWith("<=")
}

/**
 * Localization strings keep their escapes as literal text ("\\n"); one
 * ship name ends in one ("Argo CSV-SM\\n"). Trailing ones are never part of
 * a name.
 */
export function cleanShipName(name: string): string {
  return name.replace(/(\\n|\s)+$/, "")
}

function tooLong(value: string | null | undefined, max: number): boolean {
  return value != null && value.length > max
}

function isIntOrNull(value: unknown): boolean {
  return value == null || Number.isInteger(value)
}

export function buildShipRecords(
  rawShips: P4KShip[],
  aliasToCanonical: Map<string, string>,
  versionId: string,
): ShipRecordBuildResult {
  const records: ShipRecord[] = []
  const errors: string[] = []
  let unnamed = 0

  for (const raw of rawShips) {
    if (isUnlocalizedText(raw.name)) {
      unnamed++
      continue
    }
    const name = cleanShipName(raw.name)
    const label = `${name} (${raw.file || raw.id || "no file"})`
    const manufacturer = canonicalManufacturerCode(
      aliasToCanonical,
      raw.manufacturer,
    )

    const problems: string[] = []
    if (!raw.id) problems.push("missing id")
    if (!raw.file) problems.push("missing file (ship_code)")
    if (!name) problems.push("name is empty")
    if (tooLong(name, SHIP_COLUMN_LIMITS.name))
      problems.push(
        `name is ${name.length} chars (max ${SHIP_COLUMN_LIMITS.name})`,
      )
    if (tooLong(raw.file, SHIP_COLUMN_LIMITS.shipCode))
      problems.push(
        `ship_code is ${raw.file.length} chars (max ${SHIP_COLUMN_LIMITS.shipCode})`,
      )
    if (tooLong(manufacturer, SHIP_COLUMN_LIMITS.manufacturer))
      problems.push(
        `manufacturer "${manufacturer}" exceeds ${SHIP_COLUMN_LIMITS.manufacturer} chars`,
      )
    if (tooLong(raw.career, SHIP_COLUMN_LIMITS.career))
      problems.push(`career exceeds ${SHIP_COLUMN_LIMITS.career} chars`)
    if (tooLong(raw.role, SHIP_COLUMN_LIMITS.role))
      problems.push(`role exceeds ${SHIP_COLUMN_LIMITS.role} chars`)
    if (!isIntOrNull(raw.size))
      problems.push(`size ${JSON.stringify(raw.size)} is not an integer`)
    if (!isIntOrNull(raw.crewSize))
      problems.push(
        `crewSize ${JSON.stringify(raw.crewSize)} is not an integer`,
      )
    if (problems.length) {
      errors.push(`Ship ${label} not imported: ${problems.join("; ")}`)
      continue
    }

    // The game data sometimes points a ship's focus (displayType) at its
    // description string (RSI Salvation in 4.x: a 459-char "focus"). That
    // is not a focus; store none and say so rather than failing the ship.
    // An unresolved localization key ("@LOC_PLACEHOLDER") means the ship
    // has no focus label.
    let focus = isUnlocalizedText(raw.focus) ? null : raw.focus
    if (tooLong(focus, SHIP_COLUMN_LIMITS.focus)) {
      errors.push(
        `Ship ${label}: focus dropped, ${focus!.length} chars (max ${SHIP_COLUMN_LIMITS.focus}); the game data's focus is not a focus label`,
      )
      focus = null
    }

    records.push({
      label,
      gameItem: {
        name,
        type: SHIP_GAME_ITEM_TYPE,
        p4k_id: raw.id,
        manufacturer,
      },
      wikiShip: {
        version_id: versionId,
        ship_code: raw.file,
        name,
        focus,
        manufacturer_code: manufacturer,
        size: raw.size ?? null,
        description: raw.description ?? null,
        crew_size: raw.crewSize ?? null,
        career: raw.career ?? null,
        role: raw.role ?? null,
        length_m: raw.maxBoundingBoxSize?.y ?? null,
        width_m: raw.maxBoundingBoxSize?.x ?? null,
        height_m: raw.maxBoundingBoxSize?.z ?? null,
      },
    })
  }

  return { records, unnamed, errors }
}

/**
 * INSERT for a ship's game_items row. idx_game_items_p4k_id is a partial
 * unique index (WHERE p4k_id IS NOT NULL); Postgres only infers a partial
 * index as the conflict target when the ON CONFLICT clause repeats its
 * predicate. A bare `onConflict("p4k_id")` fails every insert with "there
 * is no unique or exclusion constraint matching the ON CONFLICT
 * specification".
 */
export function shipGameItemInsert(
  knex: Knex | Knex.Transaction,
  row: ShipGameItemRow,
) {
  return knex("game_items")
    .insert(row)
    .onConflict(knex.raw("(p4k_id) WHERE p4k_id IS NOT NULL"))
    .ignore()
}

/** Upsert of a ship's wiki_ships row for the version. */
export function wikiShipUpsert(
  knex: Knex | Knex.Transaction,
  row: WikiShipRow,
) {
  return knex("wiki_ships")
    .insert(row)
    .onConflict(["version_id", "ship_code"])
    .merge([...WIKI_SHIP_MERGE_COLUMNS])
}
