/**
 * In-memory stand-in for the slice of knex that FeatureFlagService touches.
 *
 * The pre-existing feature-flag tests talked to a real Postgres (they call
 * `db("user_preferences").delete()` in afterEach), which is why they were
 * excluded from the suite and then rotted. Rollout resolution is pure logic
 * over two tables, so it does not need a database to be tested — it needs
 * controllable rows.
 *
 * Only the query shapes the service actually uses are implemented. Anything
 * else throws loudly rather than silently resolving to undefined, so a future
 * service change surfaces here instead of producing a passing vacuous test.
 */

export interface FakeConfigRow {
  flag_name: string
  default_version: "V1" | "V2"
  rollout_percentage: number
  enabled: boolean
  updated_at?: Date
}

export interface FakeOverrideRow {
  user_id: string
  flag_name: string
  enabled: boolean
  updated_at?: Date
}

interface FakeState {
  feature_flag_config: FakeConfigRow[]
  user_feature_overrides: FakeOverrideRow[]
  user_preferences: Array<Record<string, unknown>>
  /** Tables reported as absent by `db.schema.hasTable`. */
  missingTables: Set<string>
}

type Row = Record<string, unknown>

/** Matches a row against the object form of `.where({...})`. */
function matches(row: Row, criteria: Row): boolean {
  return Object.entries(criteria).every(([k, v]) => row[k] === v)
}

class FakeBuilder implements PromiseLike<Row[]> {
  private criteria: Row = {}

  constructor(
    private readonly rows: Row[],
    private readonly table: string,
    private readonly onInsert: (row: Row) => void,
  ) {}

  /** Live references — for update/delete, which must mutate the store. */
  private hits(): Row[] {
    return this.rows.filter((r) => matches(r, this.criteria))
  }

  /**
   * Copies — for reads. Real knex hydrates fresh objects per query, so a caller
   * that caches a result row does not observe later writes to that row. Handing
   * back live references would make a missing cache invalidation invisible.
   */
  private filtered(): Row[] {
    let rows = this.hits().map((r) => ({ ...r }))
    if (this.order) {
      const { column, direction } = this.order
      rows.sort((a, b) => {
        const av = a[column] as string | number | Date
        const bv = b[column] as string | number | Date
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return direction === "desc" ? -cmp : cmp
      })
    }
    if (this.offsetCount) rows = rows.slice(this.offsetCount)
    if (this.limitCount !== undefined) rows = rows.slice(0, this.limitCount)
    return rows
  }

  private order?: { column: string; direction: "asc" | "desc" }
  private limitCount?: number
  private offsetCount?: number

  where(criteria: Row | string, value?: unknown): this {
    if (typeof criteria === "string") {
      this.criteria[criteria] = value
    } else {
      Object.assign(this.criteria, criteria)
    }
    return this
  }

  select(..._columns: unknown[]): this {
    return this
  }

  orderBy(column: string, direction: "asc" | "desc" = "asc"): this {
    this.order = { column, direction }
    return this
  }

  limit(n: number): this {
    this.limitCount = n
    return this
  }

  offset(n: number): this {
    this.offsetCount = n
    return this
  }

  /** Terminal: knex resolves count() to `[{ count: "<n>" }]` with a string. */
  async count(_alias: string): Promise<Array<{ count: string }>> {
    return [{ count: String(this.hits().length) }]
  }

  async first(): Promise<Row | undefined> {
    return this.filtered()[0]
  }

  async update(updates: Row): Promise<number> {
    const hits = this.hits()
    for (const row of hits) Object.assign(row, updates)
    return hits.length
  }

  async del(): Promise<number> {
    const hits = this.hits()
    for (const row of hits) this.rows.splice(this.rows.indexOf(row), 1)
    return hits.length
  }

  /** insert().onConflict().merge() — upsert. */
  insert(row: Row): this {
    this.pendingInsert = row
    return this
  }

  onConflict(_keys: string | string[]): this {
    if (!this.pendingInsert) {
      throw new Error("onConflict() called without a preceding insert()")
    }
    return this
  }

  async merge(updates: Row): Promise<void> {
    const row = this.pendingInsert
    if (!row) throw new Error("merge() called without a preceding insert()")
    // Conflict target for both tables the service upserts into is the natural
    // key present on the inserted row.
    const key: Row =
      this.table === "user_feature_overrides"
        ? { user_id: row.user_id, flag_name: row.flag_name }
        : { user_id: row.user_id }
    const existing = this.rows.find((r) => matches(r, key))
    if (existing) Object.assign(existing, updates)
    else this.onInsert(row)
  }

  private pendingInsert?: Row

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.filtered()).then(onfulfilled, onrejected)
  }
}

export interface FakeKnex {
  (table: string): FakeBuilder
  schema: { hasTable(table: string): Promise<boolean> }
  raw(sql: string): { sql: string }
  state: FakeState
}

/** Builds a fake knex over the given seed rows. */
export function createFakeKnex(seed: {
  configs?: FakeConfigRow[]
  overrides?: FakeOverrideRow[]
  missingTables?: string[]
}): FakeKnex {
  const state: FakeState = {
    feature_flag_config: seed.configs ?? [],
    user_feature_overrides: seed.overrides ?? [],
    user_preferences: [],
    missingTables: new Set(seed.missingTables ?? []),
  }

  const db = ((table: string) => {
    const rows = state[table as keyof FakeState]
    if (!Array.isArray(rows)) {
      throw new Error(`fake knex: unknown table "${table}"`)
    }
    return new FakeBuilder(rows as Row[], table, (row) =>
      (rows as Row[]).push(row),
    )
  }) as FakeKnex

  db.schema = {
    hasTable: async (table: string) => !state.missingTables.has(table),
  }
  db.raw = (sql: string) => ({ sql })
  db.state = state

  return db
}
