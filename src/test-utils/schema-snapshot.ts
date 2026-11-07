/**
 * A static picture of production's tables and columns, read from the same
 * sources the database was built from: the legacy pg_dump files in
 * config/postgres, then every knex migration. No database is needed, so plain
 * unit tests can check that a compiled knex query names real tables and
 * columns. Postgres rejects an unknown table or column at parse time, before
 * any row is read, so mocked-knex tests never notice one; this does.
 *
 * The parse is deliberately generous: a column added and later dropped still
 * counts, and views are known by name only (their columns are not checked).
 * It can miss a bad name that a migration once created; it should not reject
 * a good one. If it does, teach the parser the new migration style rather
 * than allowlisting the name in a test.
 *
 * Use assertSqlMatchesSchema(sql) on the output of `builder.toSQL().sql`
 * (compiled with the pg client).
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..")

export interface SchemaSnapshot {
  /** table name -> column names */
  tables: Map<string, Set<string>>
  /** views and materialized views: known by name, columns unchecked */
  views: Set<string>
}

/** Index just past the bracket matching the one at `open`. */
function matchBracket(text: string, open: number, openCh: string, closeCh: string): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === openCh) depth++
    else if (text[i] === closeCh) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return text.length
}

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts
}

const NOT_A_COLUMN = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"])

/** knex TableBuilder methods whose first string argument is not a new column. */
const NON_COLUMN_METHODS = new Set([
  "index", "unique", "foreign", "primary", "check", "comment", "references", "inTable",
  "dropColumn", "dropColumns", "dropIndex", "dropForeign", "dropUnique", "dropPrimary",
  "dropChecks", "dropTimestamps", "dropNullable", "setNullable", "renameColumn",
  "engine", "charset", "collate", "inherits", "queryContext",
])

function addColumn(snap: SchemaSnapshot, table: string, column: string) {
  let cols = snap.tables.get(table)
  if (!cols) {
    cols = new Set()
    snap.tables.set(table, cols)
  }
  cols.add(column)
}

function ensureTable(snap: SchemaSnapshot, table: string) {
  if (!snap.tables.has(table)) snap.tables.set(table, new Set())
}

const IDENT = `"?(\\w+)"?`
const QUALIFIED = `(?:\\w+\\.)?${IDENT}`

/** CREATE TABLE / ALTER TABLE / CREATE VIEW statements in raw SQL. */
function parseSql(snap: SchemaSnapshot, text: string) {
  const create = new RegExp(`CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QUALIFIED}\\s*\\(`, "gi")
  for (const m of text.matchAll(create)) {
    const table = m[1].toLowerCase()
    ensureTable(snap, table)
    const open = m.index! + m[0].length - 1
    const body = text.slice(open + 1, matchBracket(text, open, "(", ")") - 1)
    for (const part of splitTopLevel(body)) {
      const col = part.trim().match(/^"?(\w+)"?/)
      if (col && !NOT_A_COLUMN.has(col[1].toLowerCase())) addColumn(snap, table, col[1])
    }
  }

  const alter = new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${QUALIFIED}([^;]*)`,
    "gi",
  )
  for (const m of text.matchAll(alter)) {
    const table = m[1].toLowerCase()
    const rest = m[2]
    for (const a of rest.matchAll(new RegExp(`ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}`, "gi"))) {
      addColumn(snap, table, a[1])
    }
    for (const r of rest.matchAll(new RegExp(`RENAME\\s+COLUMN\\s+${IDENT}\\s+TO\\s+${IDENT}`, "gi"))) {
      addColumn(snap, table, r[2])
    }
    const renamed = rest.match(new RegExp(`^\\s*RENAME\\s+TO\\s+${IDENT}`, "i"))
    if (renamed) {
      for (const c of snap.tables.get(table) ?? []) addColumn(snap, renamed[1].toLowerCase(), c)
      ensureTable(snap, renamed[1].toLowerCase())
    }
  }

  const view = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QUALIFIED}`,
    "gi",
  )
  for (const m of text.matchAll(view)) snap.views.add(m[1].toLowerCase())
}

/** knex.schema.createTable / alterTable callbacks in a migration. */
function parseKnexBuilders(snap: SchemaSnapshot, text: string) {
  const builder = /\b(?:createTable|createTableIfNotExists|alterTable|table)\(\s*["'`](\w+)["'`]\s*,\s*(?:async\s*)?(?:function\s*)?\(\s*(\w+)[^)]*\)\s*(?:=>)?\s*\{/g
  for (const m of text.matchAll(builder)) {
    const table = m[1]
    const v = m[2]
    ensureTable(snap, table)
    const open = m.index! + m[0].length - 1
    const body = text.slice(open, matchBracket(text, open, "{", "}"))
    for (const c of body.matchAll(new RegExp(`\\b${v}\\.(\\w+)\\(\\s*["'\`](\\w+)["'\`](?:\\s*,\\s*["'\`](\\w+)["'\`])?`, "g"))) {
      const [, method, first, second] = c
      if (method === "renameColumn" && second) addColumn(snap, table, second)
      else if (!NON_COLUMN_METHODS.has(method)) addColumn(snap, table, first)
    }
    if (new RegExp(`\\b${v}\\.timestamps\\(`).test(body)) {
      addColumn(snap, table, "created_at")
      addColumn(snap, table, "updated_at")
    }
    if (new RegExp(`\\b${v}\\.(?:big)?increments\\(\\s*\\)`).test(body)) addColumn(snap, table, "id")
  }

  for (const m of text.matchAll(/\brenameTable\(\s*["'`](\w+)["'`]\s*,\s*["'`](\w+)["'`]/g)) {
    for (const c of snap.tables.get(m[1]) ?? []) addColumn(snap, m[2], c)
    ensureTable(snap, m[2])
  }
}

let cached: SchemaSnapshot | null = null

export function loadSchemaSnapshot(): SchemaSnapshot {
  if (cached) return cached
  const snap: SchemaSnapshot = { tables: new Map(), views: new Set() }

  const sqlDir = path.join(ROOT, "config/postgres")
  for (const f of readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort()) {
    parseSql(snap, readFileSync(path.join(sqlDir, f), "utf8"))
  }
  const migDir = path.join(ROOT, "migrations")
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".ts")).sort()) {
    const text = readFileSync(path.join(migDir, f), "utf8")
    parseSql(snap, text)
    parseKnexBuilders(snap, text)
  }
  cached = snap
  return snap
}

/**
 * Problems with the tables and `alias.column` references in a pg-compiled
 * query: tables that exist in no migration or legacy SQL file, and columns a
 * known table does not have. Aliases of subqueries/CTEs are not checked.
 */
export function schemaProblems(sql: string, snap: SchemaSnapshot = loadSchemaSnapshot()): string[] {
  const problems: string[] = []
  const aliases = new Map<string, string>()
  const derived = new Set<string>()

  // CTE names and subquery aliases are not tables.
  for (const m of sql.matchAll(/"?(\w+)"?\s+as\s+\(/gi)) derived.add(m[1])
  for (const m of sql.matchAll(/\)\s+as\s+"?(\w+)"?/gi)) derived.add(m[1])

  for (const m of sql.matchAll(/\b(?:from|join)\s+"(\w+)"(?:\s+as\s+"(\w+)")?/gi)) {
    const table = m[1]
    const alias = m[2] ?? table
    if (derived.has(table)) continue
    if (!snap.tables.has(table) && !snap.views.has(table)) {
      problems.push(`relation "${table}" does not exist`)
      continue
    }
    aliases.set(alias, table)
  }

  for (const m of sql.matchAll(/(?<![\w."])"?(\w+)"?\."?(\w+)"?/g)) {
    const [, alias, column] = m
    const table = aliases.get(alias)
    if (!table || derived.has(alias) || snap.views.has(table)) continue
    if (!snap.tables.get(table)!.has(column)) {
      problems.push(`column ${alias}.${column} does not exist (table ${table})`)
    }
  }
  return [...new Set(problems)]
}
