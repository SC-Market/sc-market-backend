/**
 * GET/POST /api/v2/debug/feature-flag.
 *
 * Named without "Controller" on purpose: vitest.config.ts excludes
 * `src/api/routes/v2/**\/*Controller*.test.ts`, and the excluded predecessors of
 * this file rotted. The service is mocked — its resolution logic is covered by
 * src/services/market-v2/feature-flag.rollout.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request as ExpressRequest } from "express"

const service = vi.hoisted(() => ({
  getAllFlags: vi.fn(),
  hasOverride: vi.fn(),
  getUserFlagOverrides: vi.fn(),
  hasConfig: vi.fn(),
  setFlagOverride: vi.fn(),
}))

vi.mock("../../../../services/market-v2/feature-flag.service.js", () => ({
  featureFlagService: service,
}))

const { DebugV2Controller } = await import("./DebugV2Controller.js")

function requestFor(user: Record<string, unknown> | null): ExpressRequest {
  return { user } as unknown as ExpressRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  service.getAllFlags.mockResolvedValue({ other_flag: true, test_flag: false })
  service.hasOverride.mockResolvedValue(false)
  service.getUserFlagOverrides.mockResolvedValue([])
  service.hasConfig.mockResolvedValue(true)
  service.setFlagOverride.mockResolvedValue(undefined)
})

describe("GET /debug/feature-flag", () => {
  it("reports market_version V2 to anonymous callers, with no flags", async () => {
    const req = requestFor(null)
    const result = await new DebugV2Controller(req).getFeatureFlag(req)

    expect(result).toEqual({
      user_id: "",
      market_version: "V2",
      is_developer: false,
      has_override: false,
      flags: {},
      overridden_flags: [],
    })
    expect(service.getAllFlags).not.toHaveBeenCalled()
  })

  it("returns the resolved flags for a signed-in user", async () => {
    service.hasOverride.mockResolvedValue(true)
    service.getUserFlagOverrides.mockResolvedValue([
      { user_id: "u1", flag_name: "other_flag", enabled: true, updated_at: "" },
    ])
    const req = requestFor({ user_id: "u1", role: "user" })
    const result = await new DebugV2Controller(req).getFeatureFlag(req)

    expect(result.market_version).toBe("V2")
    expect(result.flags).toEqual({ other_flag: true, test_flag: false })
    expect(result.has_override).toBe(true)
    expect(result.overridden_flags).toEqual(["other_flag"])
    expect(service.getAllFlags).toHaveBeenCalledWith("u1")
  })
})

describe("POST /debug/feature-flag", () => {
  const admin = { user_id: "admin-1", role: "admin" }

  it("sets an override for a configured flag", async () => {
    const req = requestFor(admin)
    const result = await new DebugV2Controller(req).setFeatureFlag(
      { flag_name: "other_flag", enabled: false },
      req,
    )

    expect(service.setFlagOverride).toHaveBeenCalledWith("admin-1", "other_flag", false)
    expect(result).toEqual({ user_id: "admin-1", message: "Set other_flag=false" })
  })

  it("refuses overrides for flags without a config row (e.g. retired market_v2)", async () => {
    service.hasConfig.mockResolvedValue(false)
    const req = requestFor(admin)

    await expect(
      new DebugV2Controller(req).setFeatureFlag({ flag_name: "market_v2", enabled: true }, req),
    ).rejects.toThrow()
    expect(service.setFlagOverride).not.toHaveBeenCalled()
  })

  it("forbids non-admin users without an existing override outside development", async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      const req = requestFor({ user_id: "u2", role: "user" })
      await expect(
        new DebugV2Controller(req).setFeatureFlag({ flag_name: "other_flag", enabled: true }, req),
      ).rejects.toThrow()
      expect(service.setFlagOverride).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = original
    }
  })
})
