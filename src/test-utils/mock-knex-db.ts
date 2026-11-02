/**
 * The one mock of clients/database/knex-db.js for unit tests.
 *
 *   const h = vi.hoisted(() => ({ db: null as unknown }))
 *   vi.mock("../../clients/database/knex-db.js", async () =>
 *     (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
 *   )
 *
 * getKnex(), database.knex and createDedicatedKnex() all return the db the
 * getter gives (a real knex on a throwaway Postgres, knex-mock-client, or
 * fake-knex-tables.ts). withPoolOverride just runs its callback.
 *
 * Without a db (or with `mockKnexDb()`), the module hands out a knex that
 * throws "knex-db is mocked without a database" on first use. Tests that
 * mocked the module their own way (`getKnex: vi.fn()`) broke silently when
 * code they cover started querying through getKnex(): the call returned
 * undefined and failed as "getKnex(...) is not a function", often inside a
 * caught and logged path, so the test still passed. This says what happened;
 * give the test a db, or mock the caller (e.g. notify/dispatcher.js).
 */
type Db = unknown

function unmockedDb(): Db {
  const fail = () => {
    throw new Error(
      "knex-db is mocked without a database (test-utils/mock-knex-db.ts): " +
        "this code path queries the database; give the test a db or mock the caller",
    )
  }
  return new Proxy(fail, { apply: fail, get: fail })
}

export function mockKnexDb(getDb: () => Db = () => null) {
  const db = () => getDb() ?? unmockedDb()
  return {
    getKnex: () => db(),
    database: {
      get knex() {
        return db()
      },
    },
    createDedicatedKnex: () => db(),
    withPoolOverride: <T>(_knex: unknown, fn: () => T): T => fn(),
  }
}
