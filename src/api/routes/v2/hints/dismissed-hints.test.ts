/**
 * /api/v2/hints/dismissed is per user: listing returns only the caller's
 * keys, dismissing is idempotent, and bad keys and the cap map to API errors.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request as ExpressRequest } from "express"
import {
  createFakeKnex,
  type FakeKnex,
} from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown as FakeKnex }))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: {},
}))

const { HintsV2Controller } = await import("./HintsV2Controller.js")
const { MAX_DISMISSED_HINTS, isValidHintKey } = await import(
  "../../../../services/hints/dismissed-hints.service.js"
)
const { ValidationError } = await import("../../v1/util/errors.js")

function as(user_id?: string): ExpressRequest {
  return {
    user: user_id ? { user_id, role: "user" } : undefined,
  } as unknown as ExpressRequest
}

const FIRST = new Date("2026-10-30T12:00:00Z")

beforeEach(() => {
  h.db = createFakeKnex({
    user_dismissed_hints: [
      { user_id: "bob", hint_key: "stock.lots-vs-quantity", dismissed_at: FIRST },
    ],
  })
})

const controller = () => new HintsV2Controller()

describe("dismissed hints", () => {
  it("requires a signed-in user", async () => {
    await expect(controller().getDismissedHints(as())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    await expect(
      controller().dismissHint("stock.lots-vs-quantity", as()),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(h.db.tables.user_dismissed_hints).toHaveLength(1)
  })

  it("lists only the caller's own dismissals", async () => {
    await expect(controller().getDismissedHints(as("alice"))).resolves.toEqual({
      hint_keys: [],
    })
    await expect(controller().getDismissedHints(as("bob"))).resolves.toEqual({
      hint_keys: ["stock.lots-vs-quantity"],
    })
  })

  it("records a dismissal for the caller", async () => {
    const res = await controller().dismissHint("uex.import", as("alice"))
    expect(res.hint_key).toBe("uex.import")
    expect(Number.isNaN(Date.parse(res.dismissed_at))).toBe(false)
    await expect(controller().getDismissedHints(as("alice"))).resolves.toEqual({
      hint_keys: ["uex.import"],
    })
    // Bob's list is unchanged.
    await expect(controller().getDismissedHints(as("bob"))).resolves.toEqual({
      hint_keys: ["stock.lots-vs-quantity"],
    })
  })

  it("is idempotent and keeps the first dismissal time", async () => {
    const res = await controller().dismissHint("stock.lots-vs-quantity", as("bob"))
    expect(res).toEqual({
      hint_key: "stock.lots-vs-quantity",
      dismissed_at: FIRST.toISOString(),
    })
    expect(h.db.tables.user_dismissed_hints).toHaveLength(1)
  })

  it.each(["", "Stock", "has space", "-leading", "a".repeat(65), "x/y", "ünï"])(
    "rejects the key %j",
    async (key) => {
      expect(isValidHintKey(key)).toBe(false)
      await expect(controller().dismissHint(key, as("alice"))).rejects.toBeInstanceOf(
        ValidationError,
      )
      expect(h.db.tables.user_dismissed_hints).toHaveLength(1)
    },
  )

  it("caps how many hints one user can dismiss", async () => {
    h.db.tables.user_dismissed_hints.push(
      ...Array.from({ length: MAX_DISMISSED_HINTS }, (_, i) => ({
        user_id: "carol",
        hint_key: `k${i}`,
        dismissed_at: FIRST,
      })),
    )
    await expect(controller().dismissHint("one-more", as("carol"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    })
    // Re-dismissing one already stored still works at the cap.
    await expect(controller().dismissHint("k0", as("carol"))).resolves.toMatchObject({
      hint_key: "k0",
    })
  })

  it("clears only the caller's dismissals", async () => {
    h.db.tables.user_dismissed_hints.push(
      { user_id: "alice", hint_key: "uex.import", dismissed_at: FIRST },
      { user_id: "alice", hint_key: "stock.lots-vs-quantity", dismissed_at: FIRST },
    )
    await expect(controller().clearDismissedHints(as("alice"))).resolves.toEqual({
      cleared: 2,
    })
    await expect(controller().getDismissedHints(as("alice"))).resolves.toEqual({
      hint_keys: [],
    })
    // Bob's dismissal is untouched.
    await expect(controller().getDismissedHints(as("bob"))).resolves.toEqual({
      hint_keys: ["stock.lots-vs-quantity"],
    })
    // Clearing again is a no-op.
    await expect(controller().clearDismissedHints(as("alice"))).resolves.toEqual({
      cleared: 0,
    })
  })

  it("requires a signed-in user to clear", async () => {
    await expect(controller().clearDismissedHints(as())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    expect(h.db.tables.user_dismissed_hints).toHaveLength(1)
  })
})
