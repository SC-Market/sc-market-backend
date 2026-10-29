/**
 * Against the FULL schema in a real, throwaway Postgres:
 * - createUserWithProvider is one transaction: a failure after the account
 *   insert leaves no half-made account;
 * - unlinkProvider("discord") clears accounts.discord_id, so the same
 *   Discord id can be used again (accounts_discord_id_unique);
 * - discordHolder sees provider links and the legacy column;
 * - renameToPlaceholder works inside a caller's transaction;
 * - the stale discord_id cleanup migration clears only unmatched values and
 *   is idempotent.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../test-utils/full-schema.js"

const DB = "pgtest_identity_links"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: async () => null, createExternalResource: async () => null },
}))
// setupTests mocks the profile database globally; this suite needs the real one.
vi.mock("../../../api/routes/v1/profiles/database.js", async (orig) => await orig())
vi.mock("../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const profileDb = await import("../../../api/routes/v1/profiles/database.js")
const { discordHolder, renameToPlaceholder } = await import("../identity-links.js")
const cleanup = await import("../../../../migrations/20261029010000_clear_stale_discord_id.js")

const id = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`

describe.skipIf(!PG_TEST_URL)("identity links (Postgres)", () => {
  let db: Knex

  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 4 } })
    db = state.db
  }, 300_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("createUserWithProvider leaves nothing behind when a later write fails", async () => {
    await db.raw("ALTER TABLE account_settings RENAME TO account_settings_off")
    try {
      await expect(
        profileDb.createUserWithProvider({
          provider_type: "discord",
          provider_id: "900000000000000501",
          metadata: { username: "pgl_half" },
        }),
      ).rejects.toThrow()
    } finally {
      await db.raw("ALTER TABLE account_settings_off RENAME TO account_settings")
    }
    expect(await db("accounts").where({ username: "pgl_half" })).toEqual([])
    expect(await db("account_providers").where({ provider_id: "900000000000000501" })).toEqual([])

    const user = await profileDb.createUserWithProvider({
      provider_type: "discord",
      provider_id: "900000000000000501",
      metadata: { username: "pgl_half" },
    })
    expect(user.username).toBe("pgl_half")
  })

  it("removing Discord frees the id for another account", async () => {
    await db("accounts").insert([
      { user_id: id(1), username: "pgl_a", display_name: "A", discord_id: "900000000000000601" },
      { user_id: id(2), username: "pgl_b", display_name: "B" },
    ])
    await db("account_providers").insert([
      { user_id: id(1), provider_type: "discord", provider_id: "900000000000000601", is_primary: false },
      { user_id: id(1), provider_type: "citizenid", provider_id: "cid-a", is_primary: true },
    ])
    expect(await discordHolder(db, "900000000000000601", id(2))).toBe(id(1))
    await profileDb.unlinkProvider(id(1), "discord")
    expect((await db("accounts").where({ user_id: id(1) }).first()).discord_id).toBeNull()
    expect(await discordHolder(db, "900000000000000601", id(2))).toBeNull()
    await db("accounts").where({ user_id: id(2) }).update({ discord_id: "900000000000000601" })
  })

  it("discordHolder sees a legacy column with no provider", async () => {
    await db("accounts").insert({ user_id: id(3), username: "pgl_c", display_name: "C", discord_id: "900000000000000701" })
    expect(await discordHolder(db, "900000000000000701", id(4))).toBe(id(3))
    expect(await discordHolder(db, "900000000000000701", id(3))).toBeNull()
    expect(await discordHolder(db, "not-a-number", id(4))).toBeNull()
  })

  it("renameToPlaceholder works inside a transaction (savepoint per attempt)", async () => {
    const name = await db.transaction((trx) => renameToPlaceholder(trx, id(3), (n) => ({ display_name: n })))
    expect(await db("accounts").where({ user_id: id(3) }).first("username", "display_name")).toEqual({
      username: name,
      display_name: name,
    })
  })

  it("cleanup migration clears unmatched discord_id only, and is idempotent", async () => {
    await db("accounts").insert([
      { user_id: id(5), username: "pgl_match", display_name: "M", discord_id: "900000000000000801" },
      { user_id: id(6), username: "pgl_other", display_name: "O", discord_id: "900000000000000802" },
    ])
    await db("account_providers").insert([
      { user_id: id(5), provider_type: "discord", provider_id: "900000000000000801", is_primary: true },
      // A provider for a DIFFERENT id: the column is stale.
      { user_id: id(6), provider_type: "discord", provider_id: "900000000000000899", is_primary: true },
    ])
    await db.transaction((trx) => cleanup.up(trx))
    await db.transaction((trx) => cleanup.up(trx))
    const value = async (n: number) =>
      (await db("accounts").where({ user_id: id(n) }).first(db.raw("discord_id::text AS discord_id"))).discord_id
    expect(await value(2)).toBeNull() // pgl_b: no provider
    expect(await value(3)).toBeNull() // legacy column only
    expect(await value(5)).toBe("900000000000000801") // matches its provider: kept
    expect(await value(6)).toBeNull() // provider is a different id
  })
})
