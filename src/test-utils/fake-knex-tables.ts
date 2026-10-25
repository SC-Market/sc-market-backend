/**
 * Tiny in-memory stand-in for knex, for route/service tests that only need
 * equality filters over a handful of tables.
 *
 * Supported: db(table).where({...} | col, val).first(...) / .select(...) /
 * .forUpdate() / .update({...}) / .del() / .insert(row | rows).returning("*"), awaiting
 * a builder yields the matching rows. Anything else is undefined on the
 * builder and fails loudly, so a query shape the fake doesn't model can't
 * pass a test vacuously.
 */

type Row = Record<string, unknown>

export interface FakeKnex {
  (table: string): FakeBuilder
  tables: Record<string, Row[]>
}

let nextId = 1

/** Generated primary-key column per table; other tables get `id`. */
const PRIMARY_KEYS: Record<string, string> = {
  listings: "listing_id",
  listing_items: "item_id",
  listing_item_lots: "lot_id",
  shops: "shop_id",
}

class FakeBuilder implements PromiseLike<Row[]> {
  private criteria: Row = {}
  private pendingInsert: Row[] | null = null

  constructor(
    private readonly rows: Row[],
    private readonly table: string,
  ) {}

  where(criteria: Row | string, value?: unknown): this {
    if (typeof criteria === "string") {
      this.criteria[criteria] = value
    } else {
      Object.assign(this.criteria, criteria)
    }
    return this
  }

  select(..._cols: unknown[]): this {
    return this
  }

  forUpdate(): this {
    return this
  }

  private hits(): Row[] {
    return this.rows.filter((r) =>
      Object.entries(this.criteria).every(([k, v]) => r[k] === v),
    )
  }

  async first(..._cols: unknown[]): Promise<Row | undefined> {
    const hit = this.hits()[0]
    return hit ? { ...hit } : undefined
  }

  async update(values: Row): Promise<number> {
    const hits = this.hits()
    for (const r of hits) Object.assign(r, values)
    return hits.length
  }

  async del(): Promise<number> {
    const hits = new Set(this.hits())
    const kept = this.rows.filter((r) => !hits.has(r))
    this.rows.splice(0, this.rows.length, ...kept)
    return hits.size
  }

  insert(values: Row | Row[]): this {
    const list = Array.isArray(values) ? values : [values]
    const pk = PRIMARY_KEYS[this.table] ?? "id"
    this.pendingInsert = list.map((v) => ({ [pk]: `fake-${nextId++}`, ...v }))
    this.rows.push(...this.pendingInsert)
    return this
  }

  async returning(..._cols: unknown[]): Promise<Row[]> {
    return (this.pendingInsert || []).map((r) => ({ ...r }))
  }

  then<T1 = Row[], T2 = never>(
    onfulfilled?: ((value: Row[]) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    const result = this.pendingInsert
      ? this.pendingInsert.map((r) => ({ ...r }))
      : this.hits().map((r) => ({ ...r }))
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

export function createFakeKnex(tables: Record<string, Row[]> = {}): FakeKnex {
  const db = ((table: string) => {
    tables[table] ||= []
    return new FakeBuilder(tables[table], table)
  }) as FakeKnex
  db.tables = tables
  return db
}
