/**
 * Ranked, forgiving game item search (the listing form's item picker,
 * GET /game-items/search, and the wiki item search).
 *
 * Proper matches always rank above loose ones. Tiers, best first:
 *
 *   0 exact name (case-insensitive)      "arrowhead"         → "Arrowhead"
 *   1 name starts with the query         "arrow"             → "Arrowhead"
 *   2 every word starts a word of the name (english tsquery, prefix)
 *                                        "derivation lmg"    → 'Verdict "Derivation" LMG'
 *   3 name contains the query            "head"              → "Arrowhead"
 *   4 localization key / class name      "@item_Nameksar_lmg_energy_01_tint02"
 *   5 manufacturer (name or code), alone or with words of the item name
 *                                        "kastak", "ksar", "kastak lmg"
 *   6 typo-tolerant (pg_trgm)            "verdikt", "arowhead", "kastek lmg"
 *
 * Within a tier: closer names first (pg_trgm word similarity, then
 * similarity, so shorter names win among equals), then name.
 *
 * planItemSearch() works out what to look for (pure; the manufacturer list
 * comes from loadSearchManufacturers()), itemSearchSql() turns the plan into
 * the WHERE and ORDER BY fragments (pure), applyItemSearch() adds them to a
 * knex query. The typo tier needs the pg_trgm extension and the trigram
 * indexes of migration 20261118120000_game_items_trigram_search.
 */
import type { Knex } from "knex"
import {
  buildPrefixTsquery,
  locKeySearchTerm,
} from "../../util/full-text-search.js"

/** Tier numbers, as returned by the tier expression. */
export const ITEM_SEARCH_TIER = {
  exact: 0,
  prefix: 1,
  wordPrefix: 2,
  substring: 3,
  locKey: 4,
  manufacturer: 5,
  fuzzy: 6,
} as const

/** A manufacturer as stored in wiki_manufacturers. */
export interface SearchManufacturer {
  code: string
  name: string | null
}

/**
 * Items of these manufacturers whose name contains every `remainingWords`
 * entry. `codes` are lowercased values of game_items.manufacturer (the
 * manufacturer codes, plus the display name, which some rows hold instead).
 */
export interface ManufacturerMatch {
  codes: string[]
  remainingWords: string[]
}

export interface ItemSearchPlan {
  /** The trimmed query. */
  text: string
  /** Prefix tsquery of the words ("" when none survive). */
  prefixTsquery: string
  /** Localization key / class name term, when the query looks like one. */
  keyTerm: string | null
  /** Lowercased words of the query (punctuation stripped). */
  words: string[]
  /** Manufacturers the query names (exact code / name-word prefix). */
  manufacturers: ManufacturerMatch[]
  /** Manufacturers the query names with a typo (typo tier only). */
  fuzzyManufacturers: ManufacturerMatch[]
  /** Whether the typo tier applies (query long enough for trigrams). */
  fuzzy: boolean
}

/** Shortest query word that can name a manufacturer or be fuzzy-matched. */
const MIN_WORD = 3
/** Shortest word compared with typo tolerance against manufacturer names. */
const MIN_FUZZY_WORD = 4
/**
 * Trigram similarity (pg_trgm's measure) a query word needs against a word
 * of a manufacturer's name to count as a typo of it. One wrong letter in a
 * six-letter word ("kastek" for "kastak") scores 0.4.
 */
export const MANUFACTURER_TYPO_SIMILARITY = 0.4

/** Lowercased alphanumeric words of a string. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** pg_trgm's trigrams of a string: each word padded "  w ", case-folded. */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of searchWords(text)) {
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  }
  return out
}

/** pg_trgm similarity(): shared trigrams over all trigrams of both. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / (ta.size + tb.size - shared)
}

/** Escape LIKE/ILIKE wildcards so the text matches literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

interface ManufacturerGroup {
  name: string
  nameWords: string[]
  /** Lowercased codes plus the lowercased display name. */
  values: Set<string>
}

/** Manufacturers grouped by display name (several codes can share one). */
function groupManufacturers(
  manufacturers: SearchManufacturer[],
): ManufacturerGroup[] {
  const groups = new Map<string, ManufacturerGroup>()
  for (const m of manufacturers) {
    const code = m.code?.trim().toLowerCase()
    if (!code) continue
    const name = (m.name?.trim() || m.code).toLowerCase()
    let group = groups.get(name)
    if (!group) {
      group = { name, nameWords: searchWords(name), values: new Set([name]) }
      groups.set(name, group)
    }
    group.values.add(code)
  }
  return [...groups.values()]
}

/**
 * Manufacturers the query words name, and the words left over for the item
 * name. A word names a manufacturer when it is one of its codes ("ksar") or
 * starts a word of its name ("kast" → "Kastak Arms"), at least 3 letters.
 * Only the manufacturers that take the most words are kept ("kastak arms"
 * means Kastak Arms, not every "... Arms"); manufacturers that take the
 * same words are merged into one match.
 *
 * With `typo`, a word (4+ letters) that names no manufacturer exactly counts
 * as a typo of a name word scoring MANUFACTURER_TYPO_SIMILARITY or more.
 */
export function matchManufacturers(
  words: string[],
  manufacturers: SearchManufacturer[],
  { typo = false }: { typo?: boolean } = {},
): ManufacturerMatch[] {
  const groups = groupManufacturers(manufacturers)
  const exactHit = (word: string, g: ManufacturerGroup) =>
    word.length >= MIN_WORD &&
    (g.values.has(word) || g.nameWords.some((nw) => nw.startsWith(word)))

  const namesSomething = new Set(
    words.filter((w) => groups.some((g) => exactHit(w, g))),
  )
  const hit = (word: string, g: ManufacturerGroup) =>
    typo
      ? !namesSomething.has(word) &&
        word.length >= MIN_FUZZY_WORD &&
        g.nameWords.some(
          (nw) =>
            nw.length >= MIN_FUZZY_WORD &&
            trigramSimilarity(word, nw) >= MANUFACTURER_TYPO_SIMILARITY,
        )
      : exactHit(word, g)

  let best = 0
  const byConsumed = new Map<
    string,
    { consumed: Set<number>; values: Set<string> }
  >()
  for (const g of groups) {
    const consumed = new Set<number>()
    words.forEach((w, i) => {
      if (hit(w, g)) consumed.add(i)
    })
    if (consumed.size === 0 || consumed.size < best) continue
    if (consumed.size > best) {
      best = consumed.size
      byConsumed.clear()
    }
    const key = [...consumed].join(",")
    const entry = byConsumed.get(key) ?? { consumed, values: new Set<string>() }
    for (const v of g.values) entry.values.add(v)
    byConsumed.set(key, entry)
  }

  return [...byConsumed.values()].map(({ consumed, values }) => ({
    codes: [...values].sort(),
    remainingWords: words.filter((_, i) => !consumed.has(i)),
  }))
}

/** What to look for, from the raw query and the manufacturer list. */
export function planItemSearch(
  query: string,
  manufacturers: SearchManufacturer[],
): ItemSearchPlan {
  const text = query.trim()
  const words = searchWords(text)
  const fuzzy = text.length >= MIN_WORD
  return {
    text,
    prefixTsquery: buildPrefixTsquery(text),
    keyTerm: locKeySearchTerm(text),
    words,
    manufacturers: matchManufacturers(words, manufacturers),
    fuzzyManufacturers: fuzzy
      ? matchManufacturers(words, manufacturers, { typo: true })
      : [],
    fuzzy,
  }
}

/** Column references the SQL is built against (qualified when joined). */
export interface ItemSearchColumns {
  name: string
  nameKey: string
  manufacturer: string
}

export interface SqlFragment {
  sql: string
  bindings: string[]
}

function join(parts: SqlFragment[], op: string): SqlFragment {
  return {
    sql: parts.map((p) => `(${p.sql})`).join(` ${op} `),
    bindings: parts.flatMap((p) => p.bindings),
  }
}

/**
 * WHERE (any tier matches), the tier expression, and ORDER BY (tier, then
 * closeness, then name) for a plan.
 */
export function itemSearchSql(
  plan: ItemSearchPlan,
  cols: ItemSearchColumns,
): { where: SqlFragment; tier: SqlFragment; orderBy: SqlFragment } {
  const { name, nameKey, manufacturer } = cols
  const like = escapeLike(plan.text)

  const contains = (word: string): SqlFragment => ({
    sql: `${name} ILIKE ?`,
    bindings: [`%${escapeLike(word)}%`],
  })
  const manufacturerCond = (
    m: ManufacturerMatch,
    wordCond: (w: string) => SqlFragment,
  ) =>
    join(
      [
        {
          sql: `lower(${manufacturer}) IN (${m.codes.map(() => "?").join(", ")})`,
          bindings: m.codes,
        },
        ...m.remainingWords.map(wordCond),
      ],
      "AND",
    )

  // Each tier's condition, best first; absent tiers are skipped.
  const tiers: Array<[number, SqlFragment]> = [
    // ILIKE without wildcards: case-insensitive equality the trigram index serves
    [ITEM_SEARCH_TIER.exact, { sql: `${name} ILIKE ?`, bindings: [like] }],
    [
      ITEM_SEARCH_TIER.prefix,
      { sql: `${name} ILIKE ?`, bindings: [`${like}%`] },
    ],
  ]
  if (plan.prefixTsquery) {
    tiers.push([
      ITEM_SEARCH_TIER.wordPrefix,
      {
        sql: `to_tsvector('english', ${name}) @@ to_tsquery('english', ?)`,
        bindings: [plan.prefixTsquery],
      },
    ])
  }
  tiers.push([ITEM_SEARCH_TIER.substring, contains(plan.text)])
  if (plan.keyTerm) {
    tiers.push([
      ITEM_SEARCH_TIER.locKey,
      {
        sql: `${nameKey} ILIKE ?`,
        bindings: [`%${escapeLike(plan.keyTerm)}%`],
      },
    ])
  }
  if (plan.manufacturers.length) {
    tiers.push([
      ITEM_SEARCH_TIER.manufacturer,
      join(
        plan.manufacturers.map((m) => manufacturerCond(m, contains)),
        "OR",
      ),
    ])
  }

  if (plan.fuzzy) {
    // `name % q` (similarity >= 0.3) and `name %> q` (q's word similarity to
    // name >= 0.6, i.e. `q <% name`) are the trigram-index operators, at
    // pg_trgm's default thresholds.
    const typoWord = (w: string): SqlFragment =>
      w.length >= MIN_WORD
        ? join([contains(w), { sql: `${name} %> ?`, bindings: [w] }], "OR")
        : contains(w)
    const fuzzy: SqlFragment[] = [
      { sql: `${name} % ?`, bindings: [plan.text] },
      { sql: `${name} %> ?`, bindings: [plan.text] },
    ]
    if (plan.words.length > 1) fuzzy.push(join(plan.words.map(typoWord), "AND"))
    for (const m of plan.fuzzyManufacturers)
      fuzzy.push(manufacturerCond(m, typoWord))
    tiers.push([ITEM_SEARCH_TIER.fuzzy, join(fuzzy, "OR")])
  }

  const where = join(
    tiers.map(([, cond]) => cond),
    "OR",
  )
  const lastTier = tiers[tiers.length - 1][0]
  const tier: SqlFragment = {
    sql: `CASE ${tiers
      .slice(0, -1)
      .map(([n, c]) => `WHEN (${c.sql}) THEN ${n}`)
      .join(" ")} ELSE ${lastTier} END`,
    bindings: tiers.slice(0, -1).flatMap(([, c]) => c.bindings),
  }
  const orderBy: SqlFragment = {
    sql: `${tier.sql}, word_similarity(?, ${name}) DESC, similarity(?, ${name}) DESC, ${name} ASC`,
    bindings: [...tier.bindings, plan.text, plan.text],
  }
  return { where, tier, orderBy }
}

/** Restrict and order a game_items query by the search. */
export function applyItemSearch<T extends Knex.QueryBuilder>(
  q: T,
  plan: ItemSearchPlan,
  cols: ItemSearchColumns,
): T {
  const { where, orderBy } = itemSearchSql(plan, cols)
  q.whereRaw(`(${where.sql})`, where.bindings).orderByRaw(
    orderBy.sql,
    orderBy.bindings,
  )
  return q
}

const MANUFACTURER_CACHE_MS = 10 * 60 * 1000
let manufacturerCache: {
  at: number
  rows: Promise<SearchManufacturer[]>
} | null = null

/**
 * All wiki_manufacturers (code, name), cached for 10 minutes: about a
 * thousand short rows, changed only by the game data import.
 */
export function loadSearchManufacturers(
  knex: Knex,
): Promise<SearchManufacturer[]> {
  const now = Date.now()
  if (
    !manufacturerCache ||
    now - manufacturerCache.at > MANUFACTURER_CACHE_MS
  ) {
    const rows = knex("wiki_manufacturers").select<SearchManufacturer[]>(
      "code",
      "name",
    )
    manufacturerCache = { at: now, rows: Promise.resolve(rows) }
    // A failed load is not cached.
    manufacturerCache.rows.catch(() => {
      manufacturerCache = null
    })
  }
  return manufacturerCache.rows
}

/** Test hook: forget the cached manufacturer list. */
export function clearSearchManufacturerCache(): void {
  manufacturerCache = null
}
