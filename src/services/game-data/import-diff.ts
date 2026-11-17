/**
 * Column-typed comparison of a stored row against the row an import would
 * write, so an import only writes what actually changed.
 *
 * pg hands values back in its own shapes (bigint and decimal as strings, real
 * rounded to float4, jsonb parsed), so each column declares its kind and both
 * sides are normalized by that kind before comparing:
 * - "num": integer, bigint and decimal columns (compared as JS numbers; the
 *   import rounds to the column's scale before writing, see roundTo)
 * - "real": float4 columns (compared at float4 precision)
 * - "str", "bool"
 * - "json": jsonb (compared as canonical JSON, object keys sorted)
 */

export type ColumnKind = "num" | "real" | "str" | "bool" | "json"
export type ColumnKinds = Readonly<Record<string, ColumnKind>>

/** JSON with object keys sorted, so jsonb's key order does not matter. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  return value
}

/** One value normalized by its column kind; null for SQL NULL. */
export function normalizeColumnValue(
  kind: ColumnKind,
  value: unknown,
  column = "?",
): unknown {
  if (value === null || value === undefined) return null
  switch (kind) {
    case "num": {
      const n = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(n))
        throw new Error(`Column ${column}: ${String(value)} is not a number`)
      return n
    }
    case "real": {
      const n = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(n))
        throw new Error(`Column ${column}: ${String(value)} is not a number`)
      return Math.fround(n)
    }
    case "str":
      return String(value)
    case "bool":
      if (typeof value !== "boolean")
        throw new Error(`Column ${column}: ${String(value)} is not a boolean`)
      return value
    case "json":
      return canonicalJson(value)
  }
}

/**
 * The columns of `next` whose value differs from `stored`, with next's values.
 * Every key of `next` must be declared in `kinds` (an undeclared column would
 * otherwise be compared loosely or not at all).
 */
export function changedColumns<T extends Record<string, unknown>>(
  stored: Record<string, unknown>,
  next: T,
  kinds: ColumnKinds,
): Partial<T> {
  const changes: Partial<T> = {}
  for (const column of Object.keys(next) as Array<keyof T & string>) {
    const kind = kinds[column]
    if (!kind) throw new Error(`Column ${column} has no declared kind`)
    const a = normalizeColumnValue(kind, stored[column], column)
    const b = normalizeColumnValue(kind, next[column], column)
    if (a !== b) changes[column] = next[column]
  }
  return changes
}

/** A row reduced to the declared columns, normalized, as one comparable string. */
export function rowSignature(
  row: Record<string, unknown>,
  kinds: ColumnKinds,
): string {
  const columns = Object.keys(kinds).sort()
  return JSON.stringify(
    columns.map((c) => normalizeColumnValue(kinds[c], row[c], c)),
  )
}

/**
 * Whether two row lists hold the same rows (as a multiset, order ignored),
 * looking only at the declared columns. Child rows have no identity of their
 * own (nothing references them), so equal content means nothing to write.
 */
export function sameRows(
  stored: ReadonlyArray<Record<string, unknown>>,
  next: ReadonlyArray<Record<string, unknown>>,
  kinds: ColumnKinds,
): boolean {
  if (stored.length !== next.length) return false
  const a = stored.map((r) => rowSignature(r, kinds)).sort()
  const b = next.map((r) => rowSignature(r, kinds)).sort()
  return a.every((sig, i) => sig === b[i])
}

/** Round to `digits` decimals, so a decimal(p, digits) column stores exactly this value. */
export function roundTo(value: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** null/undefined stay null; anything else is rounded to an integer. */
export function intOrNull(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value)
}

/** JSON-serialize the json-kind columns of a row for a knex insert/update. */
export function serializeJsonColumns<T extends Record<string, unknown>>(
  row: T,
  kinds: ColumnKinds,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const [column, value] of Object.entries(row)) {
    if (kinds[column] === "json" && value !== null && value !== undefined)
      out[column] = JSON.stringify(value)
  }
  return out
}
