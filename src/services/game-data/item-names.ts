/**
 * Name updates for game_items rows an earlier import already created.
 *
 * The import matches an export item to its row by p4k_id (the item's record
 * id, stable across patches). Items the game has no English name for are
 * exported under a name made from their localization key
 * ("@item_Nameksar_lmg_energy_01_tint02" → "Ksar Lmg Energy 01 Tint02"); when
 * a later patch adds the real name, the row takes it. The row keeps its id,
 * so listings, wishlists and attributes stay attached.
 *
 * CIG also ships unfinished English names as placeholders: "PH -
 * hdh_boots_01_01_13", a bare "PH", "DYL - jacket - name". Those rank below
 * the key-derived name: the import stores the key-derived name instead, a row
 * is never renamed to a placeholder, and a row stored under one is renamed.
 */

/** game_items.name is varchar(100); the import truncates to it. */
export const ITEM_NAME_MAX = 100

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * True when `name` is the key-derived fallback for `nameKey`, i.e. the same
 * letters and digits as the key without its "@" / "@item_Name" prefix.
 */
export function isKeyDerivedName(
  name: string,
  nameKey: string | null | undefined,
): boolean {
  if (!nameKey) return false
  const key = nameKey.replace(/^@/, "").replace(/^item_name/i, "")
  const keyCompact = compact(key)
  return keyCompact.length > 0 && compact(name) === keyCompact
}

/**
 * CIG's placeholder item names, as found in the localization files:
 * "PH - hdh_boots_01_01_13", "PH" alone, "PH Foo", "[PH] Noodles v2",
 * "Placeholder - CBD Boots" / "PLACEHOLDER - cbd_hat_03_01_CFP_var2",
 * "Name - 987 Shoes 03" and "DYL - jacket - name".
 */
const PLACEHOLDER_NAME = [
  /^PH\b/,
  /^\[PH\]/i,
  /^placeholder\b/i,
  /^name\s+-\s/i,
  /\s-\s*name$/i,
]

/** True when `name` is one of CIG's placeholder item names. */
export function isPlaceholderName(name: string): boolean {
  const trimmed = name.trim()
  return PLACEHOLDER_NAME.some((pattern) => pattern.test(trimmed))
}

function wordsToName(text: string): string | null {
  const name = text
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ")
  return name || null
}

/**
 * The name the export makes from an item's localization key when it has no
 * English name ("@item_Name_hdh_boots_01_01_13" → "Hdh Boots 01 01 13"), or
 * from its record file name when the key is not an item name key
 * ("@LOC_PLACEHOLDER"). Null when neither yields a name.
 */
export function keyDerivedName(
  nameKey: string | null | undefined,
  file: string | null | undefined,
): string | null {
  const key = nameKey?.trim().match(/^@item_name(.*)$/i)
  return (
    (key && wordsToName(key[1])) || (file ? wordsToName(file.trim()) : null)
  )
}

/**
 * The name to store for an exported item: its exported name, or the
 * key-derived name when the exported one is a placeholder.
 */
export function importItemName(item: {
  name: string
  nameKey: string | null
  file: string | null
}): string {
  if (!item.name || !isPlaceholderName(item.name)) return item.name
  return keyDerivedName(item.nameKey, item.file) ?? item.name
}

export interface ImportedItemName {
  /** game_items.id */
  dbId: string
  /** game_items.name now */
  stored: string
  /** Name in this export */
  exported: string
  /** Localization key in this export */
  nameKey: string | null
}

export interface ItemRename {
  dbId: string
  oldName: string
  newName: string
}

export interface ItemRenamePlan {
  renames: ItemRename[]
  /** Renames not done: another row already has the name */
  conflicts: ItemRename[]
}

/**
 * Which already-imported rows take their exported name.
 *
 * - A row whose exported name differs from its stored one takes it, except
 *   that a real name is never replaced by a key-derived one, and no name is
 *   replaced by a placeholder. A placeholder takes any other name.
 * - game_items.name is unique, so a name another row already has (compared
 *   case-insensitively, as the import matches names) is not taken; the rename
 *   is reported as a conflict and retried by the next import.
 *
 * @param taken Every stored game_items name with its row id
 */
export function planItemRenames(
  items: readonly ImportedItemName[],
  taken: ReadonlyMap<string, string>,
): ItemRenamePlan {
  const holderByName = new Map<string, string>()
  for (const [name, id] of taken) holderByName.set(name.toLowerCase().trim(), id)

  const renames: ItemRename[] = []
  const conflicts: ItemRename[] = []
  for (const item of items) {
    const newName = item.exported.slice(0, ITEM_NAME_MAX)
    if (!newName.trim() || newName === item.stored) continue
    if (isPlaceholderName(newName)) continue
    if (
      isKeyDerivedName(newName, item.nameKey) &&
      !isKeyDerivedName(item.stored, item.nameKey) &&
      !isPlaceholderName(item.stored)
    ) {
      continue
    }
    const rename = { dbId: item.dbId, oldName: item.stored, newName }
    const holder = holderByName.get(newName.toLowerCase().trim())
    if (holder !== undefined && holder !== item.dbId) {
      conflicts.push(rename)
      continue
    }
    holderByName.set(newName.toLowerCase().trim(), item.dbId)
    renames.push(rename)
  }
  return { renames, conflicts }
}
