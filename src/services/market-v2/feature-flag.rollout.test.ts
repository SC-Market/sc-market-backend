/**
 * Rollout resolution tests for FeatureFlagService.
 *
 * These cover the path an admin actually exercises when shipping a feature:
 * set a rollout percentage, expect that share of users to get the new
 * treatment. That path had no working coverage — the three pre-existing
 * feature-flag test files are excluded from the suite by vitest.config.ts and
 * have rotted (they call `service.clearAllCache()`, which no longer exists, and
 * query a `feature_flag_config.key` column the schema replaced with
 * `flag_name`).
 *
 * `configCache` lives at module scope with a 30s TTL and is only invalidated by
 * `updateConfig`, so a fresh module instance per test is required — otherwise
 * one test's config leaks into the next. Hence `vi.resetModules()` +
 * `vi.doMock()` + dynamic import in the helper below rather than a top-level
 * `vi.mock`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import crypto from "crypto"
import {
  createFakeKnex,
  type FakeConfigRow,
  type FakeOverrideRow,
  type FakeKnex,
} from "./fake-knex.js"

/** Mirrors the service's private bucketing so tests can pick users by bucket. */
function bucketOf(userId: string): number {
  return crypto.createHash("md5").update(userId).digest().readUInt16BE(0) % 100
}

/** Finds a user id whose rollout bucket satisfies `predicate`. */
function userInBucket(predicate: (bucket: number) => boolean): string {
  for (let i = 0; i < 100_000; i++) {
    const id = `user-${i}`
    if (predicate(bucketOf(id))) return id
  }
  throw new Error("no user id found for predicate")
}

/**
 * Loads a fresh FeatureFlagService bound to a fake knex over `seed`.
 * Returns the service plus the fake so tests can assert on written rows.
 */
async function freshService(seed: {
  configs?: FakeConfigRow[]
  overrides?: FakeOverrideRow[]
  missingTables?: string[]
}) {
  vi.resetModules()
  const db = createFakeKnex(seed)
  vi.doMock("../../clients/database/knex-db.js", () => ({ getKnex: () => db }))
  const { FeatureFlagService } = await import("./feature-flag.service.js")
  return { service: new FeatureFlagService(), db: db as FakeKnex }
}

/** A flag row in the shape the seed migrations create it. */
function flagRow(overrides: Partial<FakeConfigRow> = {}): FakeConfigRow {
  return {
    flag_name: "nav_v2",
    default_version: "V1",
    rollout_percentage: 0,
    enabled: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetModules()
})

describe("isFlagEnabled — rollout percentage", () => {
  it("gives the flag to every user at 100% rollout", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 100 })],
    })

    // Sample across the bucket space rather than one lucky id.
    for (let i = 0; i < 500; i++) {
      expect(await service.isFlagEnabled(`user-${i}`, "nav_v2")).toBe(true)
    }
  })

  it("gives the flag to no user at 0% rollout", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 0 })],
    })

    for (let i = 0; i < 500; i++) {
      expect(await service.isFlagEnabled(`user-${i}`, "nav_v2")).toBe(false)
    }
  })

  it("splits users at the rollout boundary by bucket", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 50 })],
    })

    const below = userInBucket((b) => b === 49)
    const at = userInBucket((b) => b === 50)

    // `bucket < rollout` — 49 is in, 50 is out. Pinning both sides of the
    // comparison catches an off-by-one that a "roughly 50%" check would not.
    expect(await service.isFlagEnabled(below, "nav_v2")).toBe(true)
    expect(await service.isFlagEnabled(at, "nav_v2")).toBe(false)
  })

  it("is stable for the same user across calls", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 37 })],
    })

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.isFlagEnabled("user-7", "nav_v2")),
    )
    expect(new Set(results).size).toBe(1)
  })

  it("only grows the enabled set as rollout increases", async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `user-${i}`)
    let previous = new Set<string>()

    for (const pct of [0, 10, 25, 50, 75, 100]) {
      const { service } = await freshService({
        configs: [flagRow({ enabled: true, rollout_percentage: pct })],
      })
      const enabled = new Set<string>()
      for (const id of ids) {
        if (await service.isFlagEnabled(id, "nav_v2")) enabled.add(id)
      }
      // Monotonic: nobody loses the feature when the rollout widens. A
      // non-stable hash would show up here as a user dropping out.
      for (const id of previous) expect(enabled.has(id)).toBe(true)
      previous = enabled
    }

    expect(previous.size).toBe(ids.length)
  })

  it("treats default_version V2 as on for everyone regardless of rollout", async () => {
    const { service } = await freshService({
      configs: [
        flagRow({
          enabled: true,
          default_version: "V2",
          rollout_percentage: 0,
        }),
      ],
    })

    expect(await service.isFlagEnabled(userInBucket((b) => b === 99), "nav_v2")).toBe(true)
  })
})

describe("isFlagEnabled — the enabled kill switch", () => {
  it("returns false at 100% rollout when the flag is not enabled", async () => {
    // This is the state the admin UI produces when the rollout slider is moved
    // to 100 without also flipping the Enabled switch: the flag reads "100%" in
    // the dashboard while every user still gets the base treatment.
    const { service } = await freshService({
      configs: [flagRow({ enabled: false, rollout_percentage: 100 })],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(false)
  })

  it("returns false when disabled even with default_version V2", async () => {
    const { service } = await freshService({
      configs: [
        flagRow({ enabled: false, default_version: "V2", rollout_percentage: 100 }),
      ],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(false)
  })
})

describe("isFlagEnabled — unknown flags", () => {
  it("returns false for a flag with no config row", async () => {
    const { service } = await freshService({ configs: [] })

    expect(await service.isFlagEnabled("user-1", "does_not_exist")).toBe(false)
  })

  it("omits flags with no config row from getAllFlags", async () => {
    // The frontend merges the server response over its own DEFAULT_FLAGS, so a
    // flag missing from the database is invisible here rather than false.
    const { service } = await freshService({
      configs: [flagRow({ flag_name: "nav_v2", enabled: true, rollout_percentage: 100 })],
    })

    const flags = await service.getAllFlags("user-1")
    expect(flags).toEqual({ nav_v2: true })
    expect("customizable_dashboard" in flags).toBe(false)
  })
})

describe("isFlagEnabled — per-user overrides", () => {
  it("prefers an enabling override over a 0% rollout", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 0 })],
      overrides: [{ user_id: "user-1", flag_name: "nav_v2", enabled: true }],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(true)
  })

  it("prefers a disabling override over a 100% rollout", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 100 })],
      overrides: [{ user_id: "user-1", flag_name: "nav_v2", enabled: false }],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(false)
  })

  it("lets an override win over the disabled kill switch", async () => {
    // Documents the current precedence: the override check returns before the
    // `enabled` gate is consulted, so an override re-enables a killed flag.
    const { service } = await freshService({
      configs: [flagRow({ enabled: false, rollout_percentage: 0 })],
      overrides: [{ user_id: "user-1", flag_name: "nav_v2", enabled: true }],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(true)
  })

  it("scopes an override to its own flag and user", async () => {
    const { service } = await freshService({
      configs: [
        flagRow({ flag_name: "nav_v2", enabled: true, rollout_percentage: 0 }),
        flagRow({ flag_name: "wiki", enabled: true, rollout_percentage: 0 }),
      ],
      overrides: [{ user_id: "user-1", flag_name: "nav_v2", enabled: true }],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(true)
    expect(await service.isFlagEnabled("user-1", "wiki")).toBe(false)
    expect(await service.isFlagEnabled("user-2", "nav_v2")).toBe(false)
  })

  it("falls back to the rollout when the overrides table is absent", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 100 })],
      missingTables: ["user_feature_overrides"],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(true)
  })
})

describe("updateConfig", () => {
  it("invalidates the config cache so the next read sees the new rollout", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 0 })],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(false)

    await service.updateConfig("nav_v2", { rollout_percentage: 100 })

    // Without cache invalidation this would still read 0% for up to 30s.
    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(true)
  })

  it("leaves fields it was not given untouched", async () => {
    // The admin UI sends only the fields it locally edited, so a rollout-only
    // save must not implicitly reset `enabled`.
    const { service, db } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 10 })],
    })

    await service.updateConfig("nav_v2", { rollout_percentage: 80 })

    const row = db.state.feature_flag_config[0]
    expect(row.rollout_percentage).toBe(80)
    expect(row.enabled).toBe(true)
    expect(row.default_version).toBe("V1")
  })
})

describe("setFlagOverride / removeFlagOverride", () => {
  it("writes a new override and makes it take effect", async () => {
    const { service, db } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 0 })],
    })

    await service.setFlagOverride("user-1", "nav_v2", true)

    expect(db.state.user_feature_overrides).toHaveLength(1)
    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(true)
  })

  it("upserts rather than duplicating an existing override", async () => {
    const { service, db } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 0 })],
      overrides: [{ user_id: "user-1", flag_name: "nav_v2", enabled: true }],
    })

    await service.setFlagOverride("user-1", "nav_v2", false)

    expect(db.state.user_feature_overrides).toHaveLength(1)
    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(false)
  })

  it("returns the user to the rollout when the override is removed", async () => {
    const { service, db } = await freshService({
      configs: [flagRow({ enabled: true, rollout_percentage: 100 })],
      overrides: [{ user_id: "user-1", flag_name: "nav_v2", enabled: false }],
    })

    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(false)

    await service.removeFlagOverride("user-1", "nav_v2")

    expect(db.state.user_feature_overrides).toHaveLength(0)
    expect(await service.isFlagEnabled("user-1", "nav_v2")).toBe(true)
  })

  it("removes only the targeted flag's override", async () => {
    const { service, db } = await freshService({
      configs: [flagRow({ enabled: true })],
      overrides: [
        { user_id: "user-1", flag_name: "nav_v2", enabled: true },
        { user_id: "user-1", flag_name: "wiki", enabled: true },
      ],
    })

    await service.removeFlagOverride("user-1", "nav_v2")

    expect(db.state.user_feature_overrides).toEqual([
      { user_id: "user-1", flag_name: "wiki", enabled: true },
    ])
  })

  it("reports whether a user has any override at all", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true })],
      overrides: [{ user_id: "user-1", flag_name: "nav_v2", enabled: true }],
    })

    expect(await service.hasOverride("user-1")).toBe(true)
    expect(await service.hasOverride("user-2")).toBe(false)
  })
})

describe("getUserOverrides — pagination", () => {
  it("pages through market_v2 overrides without repeating a user", async () => {
    const overrides: FakeOverrideRow[] = Array.from({ length: 10 }, (_, i) => ({
      user_id: `user-${i}`,
      flag_name: "market_v2",
      enabled: i % 2 === 0,
      updated_at: new Date(2026, 0, i + 1),
    }))
    const { service } = await freshService({
      configs: [flagRow({ flag_name: "market_v2", enabled: true })],
      overrides,
    })

    const page1 = await service.getUserOverrides(1, 5)
    const page2 = await service.getUserOverrides(2, 5)

    expect(page1.total).toBe(10)
    expect(page1.overrides).toHaveLength(5)
    expect(page2.overrides).toHaveLength(5)

    const ids = [...page1.overrides, ...page2.overrides].map((o) => o.user_id)
    expect(new Set(ids).size).toBe(10)
  })

  it("excludes overrides for other flags", async () => {
    const { service } = await freshService({
      configs: [flagRow({ flag_name: "market_v2", enabled: true })],
      overrides: [
        { user_id: "user-1", flag_name: "market_v2", enabled: true, updated_at: new Date(2026, 0, 1) },
        { user_id: "user-2", flag_name: "nav_v2", enabled: true, updated_at: new Date(2026, 0, 2) },
      ],
    })

    const { overrides, total } = await service.getUserOverrides(1, 50)

    expect(total).toBe(1)
    expect(overrides.map((o) => o.user_id)).toEqual(["user-1"])
  })
})

describe("getUserFlagOverrides", () => {
  it("returns every flag the user has an override for", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true })],
      overrides: [
        { user_id: "user-1", flag_name: "nav_v2", enabled: true },
        { user_id: "user-1", flag_name: "wiki", enabled: false },
        { user_id: "user-2", flag_name: "nav_v2", enabled: true },
      ],
    })

    const rows = await service.getUserFlagOverrides("user-1")

    expect(rows.map((r) => r.flag_name).sort()).toEqual(["nav_v2", "wiki"])
  })

  it("returns nothing when the overrides table is absent", async () => {
    const { service } = await freshService({
      configs: [flagRow({ enabled: true })],
      missingTables: ["user_feature_overrides"],
    })

    expect(await service.getUserFlagOverrides("user-1")).toEqual([])
  })
})

describe("getMarketVersion", () => {
  it("maps the market_v2 flag onto the V1/V2 string", async () => {
    const { service } = await freshService({
      configs: [
        flagRow({ flag_name: "market_v2", enabled: true, rollout_percentage: 100 }),
      ],
    })

    expect(await service.getMarketVersion("user-1")).toBe("V2")
  })

  it("reports V1 when market_v2 has no config row", async () => {
    const { service } = await freshService({ configs: [] })

    expect(await service.getMarketVersion("user-1")).toBe("V1")
  })
})
