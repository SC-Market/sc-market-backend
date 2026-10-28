/**
 * processExpiredDeletions / convertToTombstone against a small fake knex that
 * enforces accounts_discord_id_unique. The real-SQL version (selection and
 * savepoints) is account-deletion.pg.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

class PgError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
  }
}

interface FakeDb {
  accounts: Row[]
  failures: Row[]
  /** Throw this from the accounts update instead of applying it (once). */
  failNextAccountUpdate?: Error
}

let db: FakeDb

/** Chainable builder: filters are recorded loosely; only accounts updates and failure inserts act. */
function builder(table: string) {
  const criteria: Row = {}
  const b: any = {
    where(col: unknown, val?: unknown, val2?: unknown) {
      if (
        typeof col === "string" &&
        val2 === undefined &&
        typeof val !== "function"
      )
        criteria[col] = val
      return b
    },
    whereIn: () => b,
    whereNotNull: () => b,
    whereNull: () => b,
    whereNotExists: () => b,
    whereNotIn: () => b,
    whereRaw: () => b,
    orWhere: () => b,
    select: async () =>
      table.split(" ")[0] === "accounts"
        ? db.accounts.filter((a) => !a.is_tombstone && a.deleted_at)
        : [],
    delete: async () => 0,
    del: async () => 0,
    async update(patch: Row) {
      if (table !== "accounts") return 0
      if (db.failNextAccountUpdate) {
        const err = db.failNextAccountUpdate
        db.failNextAccountUpdate = undefined
        throw err
      }
      const target = db.accounts.find((a) => a.user_id === criteria.user_id)
      if (!target) return 0
      if (patch.discord_id !== undefined && patch.discord_id !== null) {
        const clash = db.accounts.find(
          (a) =>
            a !== target &&
            a.discord_id !== null &&
            String(a.discord_id) === String(patch.discord_id),
        )
        if (clash) {
          throw new PgError(
            'update "accounts" set ... - duplicate key value violates unique constraint "accounts_discord_id_unique"',
            "23505",
          )
        }
      }
      Object.assign(target, patch)
      return 1
    },
    insert(row: Row) {
      if (table === "account_tombstone_failures") db.failures.push(row)
      return { onConflict: () => ({ merge: async () => undefined }) }
    },
  }
  return b
}

function fakeKnex(): any {
  const k: any = (table: string) => builder(table)
  k.fn = { now: () => "now()" }
  k.transaction = async (cb: (trx: any) => Promise<unknown>) => cb(fakeKnex())
  return k
}

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => fakeKnex(),
}))
vi.mock("../discord/channel-setups.js", () => ({
  deleteOwner: vi.fn(async () => undefined),
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { processExpiredDeletions } =
  await import("./account-deletion.service.js")

const pending = (user_id: string, discord_id: string | null): Row => ({
  user_id,
  discord_id,
  is_tombstone: false,
  deleted_at: new Date("2026-09-01"),
})

describe("processExpiredDeletions", () => {
  beforeEach(() => {
    db = { accounts: [], failures: [] }
  })

  it("tombstones several accounts in one run without colliding on discord_id", async () => {
    db.accounts = [
      {
        user_id: "00000000-0000-0000-0000-00000000000a",
        discord_id: null,
        is_tombstone: true,
      },
      pending("11111111-1111-1111-1111-111111111111", "123456789012345678"),
      pending("22222222-2222-2222-2222-222222222222", "223456789012345678"),
    ]

    await expect(processExpiredDeletions()).resolves.toBe(2)

    for (const a of db.accounts.slice(1)) {
      expect(a.is_tombstone).toBe(true)
      expect(a.discord_id).toBeNull()
    }
    expect(db.failures).toEqual([])
  })

  it("records a permanent failure so the account is not retried every run", async () => {
    db.accounts = [
      pending("33333333-3333-3333-3333-333333333333", "323456789012345678"),
    ]
    db.failNextAccountUpdate = new PgError(
      'null value in column "x" violates not-null constraint',
      "23502",
    )

    await expect(processExpiredDeletions()).resolves.toBe(0)

    expect(db.failures).toEqual([
      expect.objectContaining({
        user_id: "33333333-3333-3333-3333-333333333333",
        error: expect.stringContaining("not-null constraint"),
      }),
    ])
  })

  it("leaves transient failures to the next run", async () => {
    db.accounts = [
      pending("44444444-4444-4444-4444-444444444444", "423456789012345678"),
    ]
    db.failNextAccountUpdate = new PgError(
      "could not serialize access",
      "40001",
    )

    await expect(processExpiredDeletions()).resolves.toBe(0)

    expect(db.failures).toEqual([])
  })
})
