/**
 * Build a prefix-aware Postgres tsquery string from free-text user input.
 *
 * Each whitespace-separated word is stripped of non-word characters and given a
 * `:*` prefix marker, joined with `&`. Tokens that reduce to empty (pure
 * punctuation like "*" or "&") are dropped BEFORE the marker is added —
 * otherwise they produce a bare ":*" and to_tsquery() throws
 * "syntax error in tsquery".
 *
 * Returns "" when no usable lexeme survives; callers must treat that as "no
 * tsquery" (fall back to ILIKE) rather than passing it to to_tsquery().
 */
export function buildPrefixTsquery(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^\w]/g, ""))
    .filter(Boolean)
    .map((word) => `${word}:*`)
    .join(" & ")
}

/**
 * The localization key to look for when the input is one, else null.
 *
 * An item with no English name in the game's localization shows its raw key
 * in game (e.g. "@item_Nameksar_lmg_energy_01_tint02"), so that is what a
 * player copies. Keys and class names have no spaces and use underscores;
 * the leading "@" is dropped so a key or a fragment of one (or the class
 * name "ksar_lmg_energy_01") matches game_items.name_key.
 */
export function locKeySearchTerm(input: string): string | null {
  const term = input.trim().replace(/^@/, "")
  return term.length >= 3 && !/\s/.test(term) && term.includes("_")
    ? term
    : null
}
