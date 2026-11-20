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

/**
 * Where a game_items name comes from, best first (game_item_name_sources):
 *
 * - `cig`: the item's English name in CIG's localization files.
 * - `override`: a curated name from game_item_name_overrides.
 * - `derived`: built from a named sibling class by deriveVariantName.
 * - `key_derived`: built from the localization key or record file name
 *   ("Ksar Lmg Energy 01 Tint02").
 * - `placeholder`: one of CIG's placeholder names ("PH - hdh_boots_01_01_13").
 */
export const ITEM_NAME_SOURCES = [
  "cig",
  "override",
  "derived",
  "key_derived",
  "placeholder",
] as const

export type ItemNameSource = (typeof ITEM_NAME_SOURCES)[number]

const SOURCE_RANK: Record<ItemNameSource, number> = {
  cig: 4,
  override: 3,
  derived: 2,
  key_derived: 1,
  placeholder: 0,
}

/** True when a name from `next` may replace a name from `current`. */
export function outranksOrEquals(
  next: ItemNameSource,
  current: ItemNameSource,
): boolean {
  return SOURCE_RANK[next] >= SOURCE_RANK[current]
}

/**
 * The source of a name as exported or stored, read from the name itself:
 * a placeholder, the key-derived name (from the key or the record file name,
 * or a raw "@item_Name..." key), or else CIG's. Overrides and derived names
 * can't be told apart from CIG's this way; the import records them.
 */
export function inferNameSource(
  name: string,
  nameKey: string | null | undefined,
  file: string | null | undefined,
): "cig" | "key_derived" | "placeholder" {
  if (isPlaceholderName(name)) return "placeholder"
  if (name.trim().startsWith("@")) return "key_derived"
  if (isKeyDerivedName(name, nameKey)) return "key_derived"
  const fromKey = keyDerivedName(nameKey, file)
  if (fromKey && compact(fromKey) === compact(name)) return "key_derived"
  if (file && compact(file) === compact(name)) return "key_derived"
  return "cig"
}

/**
 * The trailing variant token of a class name: "_" + letters + digits
 * ("_tint02", "_lr01", "_var2", "_store01").
 */
const VARIANT_TOKEN = /^(.+)_([a-z]+)(\d+)$/

/** Variant words already spelled out in class names; other codes are upper-cased. */
const VARIANT_WORDS = new Set(["tint", "store", "collector", "var"])

function variantLabel(letters: string, digits: string): string {
  const word = VARIANT_WORDS.has(letters)
    ? letters[0].toUpperCase() + letters.slice(1)
    : letters.toUpperCase()
  return `${word} ${digits}`
}

/** `X "Y" Z` → `X Z`; null unless the name has exactly that form. */
function withoutQuotedPart(name: string): string | null {
  const match = name.match(/^([^"]*)"([^"]+)"([^"]*)$/)
  if (!match) return null
  const before = match[1].trim()
  const after = match[3].trim()
  if (!before || !after) return null
  return `${before} ${after}`.replace(/\s+/g, " ")
}

export interface NamedSiblings {
  /** Class name (record file, lower case) → CIG name, for CIG-named items */
  nameByClass: ReadonlyMap<string, string>
  /** Base class → CIG names of its `<base>_<letters><digits>` variants */
  variantNamesByBase: ReadonlyMap<string, readonly string[]>
}

function classOf(file: string | null | undefined): string | null {
  const cls = file?.trim().toLowerCase()
  return cls || null
}

/**
 * Index the CIG-named items of one export by class, for deriveVariantName.
 * `name` is the name the import stores (importItemName).
 */
export function indexNamedSiblings(
  items: Iterable<{ name: string; nameKey: string | null; file: string | null }>,
): NamedSiblings {
  const nameByClass = new Map<string, string>()
  const variantNamesByBase = new Map<string, string[]>()
  for (const item of items) {
    const cls = classOf(item.file)
    if (!cls || !item.name) continue
    if (inferNameSource(item.name, item.nameKey, item.file) !== "cig") continue
    nameByClass.set(cls, item.name)
    const variant = cls.match(VARIANT_TOKEN)
    if (variant) {
      const names = variantNamesByBase.get(variant[1]) ?? []
      names.push(item.name)
      variantNamesByBase.set(variant[1], names)
    }
  }
  return { nameByClass, variantNamesByBase }
}

/**
 * A readable name for an item CIG has no name for, built only from names CIG
 * gave its sibling classes. Null when the rules give none.
 *
 * Strip one trailing variant token (`_<letters><digits>`) from the item's
 * class to get the base class (an item without one is its own base), then:
 *
 * - R1: the base class has a CIG name → that is the base name
 *   (behr_rifle_ballistic_01 = "P4-AR Rifle").
 * - R2: otherwise, the base class's CIG-named variants are all `X "Y" Z` and
 *   dropping the quoted part gives one and the same `X Z` → the base name
 *   (ksar_lmg_energy_01_store01 = `Verdict "Derivation" LMG` → "Verdict LMG").
 *
 * The base class itself is named the base name; a variant is
 * `<base name> (<Label> <NN>)`, the label being the token's own letters
 * (tint/store/collector/var as words, other codes upper-cased: "LR 01") and
 * digits. No words are invented.
 *
 * @param siblings indexNamedSiblings over the same export
 */
export function deriveVariantName(
  item: { file: string | null },
  siblings: NamedSiblings,
): string | null {
  const cls = classOf(item.file)
  if (!cls) return null
  const variant = cls.match(VARIANT_TOKEN)
  const baseClass = variant ? variant[1] : cls
  const label = variant ? variantLabel(variant[2], variant[3]) : null

  let baseName: string | null = siblings.nameByClass.get(baseClass) ?? null
  if (!baseName) {
    const named = siblings.variantNamesByBase.get(baseClass) ?? []
    const stripped = new Set(named.map(withoutQuotedPart))
    const only = stripped.size === 1 ? [...stripped][0] : null
    baseName = only ?? null
  }
  if (!baseName) return null

  const name = label ? `${baseName} (${label})` : baseName
  return name.length <= ITEM_NAME_MAX ? name : null
}

export interface DerivedNameConflict {
  /** Export item id (p4k_id) */
  itemId: string
  name: string
  /** Export item id of the other item with the name */
  heldBy: string
}

export interface DerivedNamePlan {
  /** Export item id → derived name */
  names: Map<string, string>
  /** Derived names not used: another item of the export has the name */
  conflicts: DerivedNameConflict[]
}

/**
 * Derived names for the items of one export that CIG has no name for (their
 * stored name is key-derived or a placeholder). A derived name another export
 * item already has, or that two items derive, is not used by either; both
 * keep their key-derived name and the clash is reported.
 *
 * @param items The export's items, `name` being what importItemName stores
 */
export function planDerivedNames(
  items: readonly { id: string; name: string; nameKey: string | null; file: string | null }[],
): DerivedNamePlan {
  const siblings = indexNamedSiblings(items)
  const holderByName = new Map<string, string>()
  for (const item of items) {
    if (item.name) holderByName.set(item.name.toLowerCase().trim(), item.id)
  }

  const derivedBy = new Map<string, { name: string; ids: string[] }>()
  for (const item of items) {
    if (inferNameSource(item.name, item.nameKey, item.file) === "cig") continue
    const name = deriveVariantName(item, siblings)
    if (!name) continue
    const key = name.toLowerCase()
    const entry = derivedBy.get(key) ?? { name, ids: [] }
    entry.ids.push(item.id)
    derivedBy.set(key, entry)
  }

  const names = new Map<string, string>()
  const conflicts: DerivedNameConflict[] = []
  for (const [key, { name, ids }] of derivedBy) {
    const holder = holderByName.get(key)
    if (holder !== undefined && !ids.includes(holder)) {
      for (const id of ids) conflicts.push({ itemId: id, name, heldBy: holder })
    } else if (ids.length > 1) {
      for (const id of ids) {
        conflicts.push({ itemId: id, name, heldBy: ids.find((other) => other !== id)! })
      }
    } else {
      names.set(ids[0], name)
    }
  }
  return { names, conflicts }
}

export interface ImportedItemName {
  /** game_items.id */
  dbId: string
  /** game_items.name now */
  stored: string
  /** Recorded source of the stored name (game_item_name_sources); null when none is */
  storedSource: ItemNameSource | null
  /** Name this import gives the item */
  exported: string
  /** Where `exported` comes from */
  exportedSource: ItemNameSource
  /** Localization key in this export */
  nameKey: string | null
  /** Record file name (class) in this export */
  file: string | null
}

export interface ItemRename {
  dbId: string
  oldName: string
  newName: string
  oldSource: ItemNameSource
  newSource: ItemNameSource
}

export interface ItemNameSourceChange {
  dbId: string
  source: ItemNameSource
}

export interface ItemRenamePlan {
  renames: ItemRename[]
  /** Renames not done: another row already has the name */
  conflicts: ItemRename[]
  /** Rows keeping their name whose recorded source changes (or was never recorded) */
  sourceChanges: ItemNameSourceChange[]
}

/**
 * Which already-imported rows take the name this import gives them.
 *
 * - A row takes a different name when the new name's source ranks at least as
 *   high as its stored one (cig > override > derived > key_derived >
 *   placeholder): a CIG name replaces a derived, key-derived or placeholder
 *   one; a derived name replaces a key-derived one but never a CIG or curated
 *   one. No row is renamed to a placeholder. A row without a recorded source
 *   is judged by its name (inferNameSource).
 * - game_items.name is unique, so a name another row keeps (compared
 *   case-insensitively, as the import matches names) is not taken; the rename
 *   is reported as a conflict and retried by the next import. Names are never
 *   numbered to make them unique.
 * - A name another row gives up in the same import is free: chains (a takes
 *   b's old name, b takes a new one) and cycles (two items swapping names)
 *   are all renamed. renameSteps orders the updates so the unique index holds
 *   between them; they run in one transaction.
 * - When two rows would take one name, the row already holding it (a case
 *   fix) wins, else the first; the others are conflicts.
 * - A row whose name stays gets its source recorded when it differs.
 *
 * @param taken Every stored game_items name with its row id
 */
export function planItemRenames(
  items: readonly ImportedItemName[],
  taken: ReadonlyMap<string, string>,
): ItemRenamePlan {
  const lower = (name: string) => name.toLowerCase().trim()
  const holderByName = new Map<string, string>()
  for (const [name, id] of taken) holderByName.set(lower(name), id)

  /** Renames the ranking allows, in item order, before uniqueness. */
  const wanted: { rename: ItemRename; recordSource: ItemNameSource | null }[] = []
  const sourceChanges: ItemNameSourceChange[] = []
  for (const item of items) {
    const oldSource =
      item.storedSource ?? inferNameSource(item.stored, item.nameKey, item.file)
    const newName = item.exported.slice(0, ITEM_NAME_MAX)
    if (!newName.trim()) continue
    if (newName === item.stored) {
      if (item.storedSource !== item.exportedSource) {
        sourceChanges.push({ dbId: item.dbId, source: item.exportedSource })
      }
      continue
    }
    if (item.exportedSource === "placeholder" || isPlaceholderName(newName)) continue
    if (!outranksOrEquals(item.exportedSource, oldSource)) {
      if (item.storedSource === null) {
        sourceChanges.push({ dbId: item.dbId, source: oldSource })
      }
      continue
    }
    wanted.push({
      rename: {
        dbId: item.dbId,
        oldName: item.stored,
        newName,
        oldSource,
        newSource: item.exportedSource,
      },
      recordSource: item.storedSource === null ? oldSource : null,
    })
  }

  // One row per name: the row already holding it, else the first.
  const claimant = new Map<string, string>()
  for (const { rename } of wanted) {
    const name = lower(rename.newName)
    const current = claimant.get(name)
    if (current === undefined || holderByName.get(name) === rename.dbId) {
      claimant.set(name, rename.dbId)
    }
  }
  const accepted = new Set(
    wanted
      .filter(({ rename }) => claimant.get(lower(rename.newName)) === rename.dbId)
      .map(({ rename }) => rename.dbId),
  )
  // A name is free when nobody holds it, its holder is the row itself, or
  // its holder is renamed away. Dropping a rename keeps its row's old name
  // held, which can block others: repeat until nothing changes.
  for (let changed = true; changed; ) {
    changed = false
    for (const { rename } of wanted) {
      if (!accepted.has(rename.dbId)) continue
      const holder = holderByName.get(lower(rename.newName))
      if (holder !== undefined && holder !== rename.dbId && !accepted.has(holder)) {
        accepted.delete(rename.dbId)
        changed = true
      }
    }
  }

  const renames: ItemRename[] = []
  const conflicts: ItemRename[] = []
  for (const { rename, recordSource } of wanted) {
    if (accepted.has(rename.dbId)) {
      renames.push(rename)
    } else {
      conflicts.push(rename)
      if (recordSource) sourceChanges.push({ dbId: rename.dbId, source: recordSource })
    }
  }
  return { renames, conflicts, sourceChanges }
}

/** Prefix of the name a row holds for a moment while renames swap names. */
export const RENAME_TEMP_PREFIX = "~renaming~"

/**
 * The game_items name updates for a plan's renames, in order, so that no
 * update hits the unique index: a row whose old name another rename takes
 * first moves to a temporary name ("~renaming~<id>"); then every row gets
 * its new name. Run them in one transaction.
 */
export function renameSteps(
  renames: readonly ItemRename[],
): { dbId: string; name: string }[] {
  const targets = new Set(renames.map((r) => r.newName.toLowerCase().trim()))
  const parked = renames.filter(
    (r) =>
      targets.has(r.oldName.toLowerCase().trim()) &&
      r.oldName.toLowerCase().trim() !== r.newName.toLowerCase().trim(),
  )
  return [
    ...parked.map((r) => ({ dbId: r.dbId, name: `${RENAME_TEMP_PREFIX}${r.dbId}` })),
    ...renames.map((r) => ({ dbId: r.dbId, name: r.newName })),
  ]
}

/** "key_derived->derived" → count, for the import summary. */
export function countRenamesBySource(
  renames: readonly ItemRename[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { oldSource, newSource } of renames) {
    const transition = `${oldSource}->${newSource}`
    counts[transition] = (counts[transition] ?? 0) + 1
  }
  return counts
}
