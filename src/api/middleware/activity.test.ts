import { describe, it, expect, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"

vi.mock("../routes/v1/market/database.js", () => ({
  upsertDailyActivity: vi.fn(async () => {
    throw new Error("connection terminated")
  }),
}))
vi.mock("../../clients/database/knex-db.js", () => {
  const knex: any = () => ({ where: () => ({ update: async () => 1 }) })
  knex.fn = { now: () => "now()" }
  return { getKnex: () => knex }
})
vi.mock("../../logger/logger.js", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { trackActivity } from "./activity.js"
import logger from "../../logger/logger.js"

describe("trackActivity", () => {
  it("logs and continues when the activity write fails instead of rejecting", async () => {
    const req = { isAuthenticated: () => true, user: { user_id: "u1" } } as unknown as Request
    const next = vi.fn() as unknown as NextFunction

    await expect(trackActivity(req, {} as Response, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalled()
  })
})
