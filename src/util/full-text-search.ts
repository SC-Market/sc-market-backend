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
