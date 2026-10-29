/**
 * Collision-safe usernames (services/accounts/identity-links): placeholders
 * skip taken names, a preferred name falls back to a placeholder, and a
 * rename that loses a race on accounts_username_key retries with a new name.
 * discordHolder's SQL is covered by identity-links.pg.test.ts.
 */
import { describe, it, expect } from "vitest"
import type { Knex } from "knex"
import { createFakeKnex } from "../../../test-utils/fake-knex-tables.js"
import { freeUsername, placeholderUsername, renameToPlaceholder } from "../identity-links.js"

const U = "11111111-2222-4333-8444-555555555555"

function seq(...values: string[]) {
  return () => values.shift()!
}

describe("placeholder usernames", () => {
  it("skip names already taken", async () => {
    const db = createFakeKnex({ accounts: [{ user_id: "x", username: "user_aaaaaaaa" }] })
    expect(await placeholderUsername(db as unknown as Knex, seq("aaaaaaaa", "bbbbbbbb"))).toBe("user_bbbbbbbb")
  })

  it("freeUsername keeps the preferred name when free, else gives a placeholder", async () => {
    const db = createFakeKnex({ accounts: [{ user_id: "x", username: "new_user123" }] })
    expect(await freeUsername(db as unknown as Knex, "new_user999")).toBe("new_user999")
    expect(await freeUsername(db as unknown as Knex, "new_user123")).toMatch(/^user_[0-9a-f]{8}$/)
  })
})

describe("renameToPlaceholder", () => {
  it("renames with the extra columns", async () => {
    const db = createFakeKnex({ accounts: [{ user_id: U, username: "Old", display_name: "Old" }] })
    const name = await renameToPlaceholder(db as unknown as Knex, U, (n) => ({ display_name: n }), seq("cccccccc"))
    expect(name).toBe("user_cccccccc")
    expect(db.tables.accounts[0]).toMatchObject({ username: "user_cccccccc", display_name: "user_cccccccc" })
  })

  it("retries with a new name when another writer took it first", async () => {
    const db = createFakeKnex({ accounts: [{ user_id: U, username: "Old" }] })
    let attempts = 0
    const racing: unknown = Object.assign(
      (table: string) => {
        const b = db(table)
        if (table !== "accounts") return b
        const update = b.update.bind(b)
        return Object.assign(b, {
          update: async (values: Record<string, unknown>) => {
            attempts++
            if (attempts === 1) {
              throw Object.assign(new Error("duplicate key"), { code: "23505", constraint: "accounts_username_key" })
            }
            return update(values)
          },
        })
      },
      { tables: db.tables, transaction: <T>(fn: (t: unknown) => Promise<T>) => fn(racing) },
    )
    const name = await renameToPlaceholder(racing as Knex, U, undefined, seq("dddddddd", "eeeeeeee"))
    expect(name).toBe("user_eeeeeeee")
    expect(attempts).toBe(2)
    expect(db.tables.accounts[0].username).toBe("user_eeeeeeee")
  })

  it("does not swallow other errors", async () => {
    const db = createFakeKnex({ accounts: [] })
    const broken: unknown = Object.assign(
      (table: string) => {
        const b = db(table)
        return table === "accounts" ? Object.assign(b, { update: async () => Promise.reject(new Error("boom")) }) : b
      },
      { tables: db.tables, transaction: <T>(fn: (t: unknown) => Promise<T>) => fn(broken) },
    )
    await expect(renameToPlaceholder(broken as Knex, U)).rejects.toThrow("boom")
  })
})
