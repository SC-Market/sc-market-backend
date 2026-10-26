/**
 * GET /api/v2/orders query validation through the real v2 router (TSOA
 * routes -> error handlers): values outside the enums are a clean 400
 * VALIDATION_ERROR and never reach the controller or the database.
 *
 * The status enum is the set of statuses orders actually store
 * (not-started, in-progress, fulfilled, cancelled). It used to be
 * pending|completed|cancelled, so only "cancelled" could ever match.
 */
import { describe, it, expect, beforeAll, vi } from "vitest"
import express from "express"
import request from "supertest"
import { readFileSync } from "node:fs"
import type { User } from "../../v1/api-models.js"

const h = vi.hoisted(() => ({ queried: [] as string[] }))

vi.mock("../../../middleware/tsoa-ratelimit.js", () => ({
  tsoaWriteRateLimit: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))
vi.mock("../../../../clients/database/knex-db.js", () => {
  const knex = Object.assign(
    (table: string) => {
      h.queried.push(table)
      throw new Error(`unexpected query on ${table}`)
    },
    { raw: () => ({}), fn: { now: () => "now()" }, schema: { hasTable: async () => false } },
  )
  return { getKnex: () => knex, database: { knex } }
})

const USER = {
  user_id: "00000000-0000-0000-0000-000000000001",
  username: "tester",
  role: "user",
  banned: false,
  rsi_confirmed: true,
} as User

let app: express.Express

beforeAll(async () => {
  process.env.B2_KEY_ID ||= "test-key-id"
  process.env.B2_APP_KEY ||= "test-app-key"
  const { apiV2Router } = await import("../api-router.js")
  const { errorHandler } = await import("../../../middleware/error-handler.js")
  app = express()
  app.use((req, _res, next) => {
    req.user = USER
    next()
  })
  app.use("/api/v2", apiV2Router)
  app.use(errorHandler)
})

const spec = JSON.parse(
  readFileSync(new URL("../generated/swagger.json", import.meta.url), "utf8"),
) as {
  paths: Record<string, { get: { parameters: { name: string; schema: { enum?: string[] } }[] } }>
}
const param = (name: string) => spec.paths["/orders"].get.parameters.find((p) => p.name === name)!

describe("GET /api/v2/orders query validation", () => {
  it("status accepts exactly the statuses orders store", () => {
    expect(param("status").schema.enum).toEqual(["not-started", "in-progress", "fulfilled", "cancelled"])
  })

  it.each([
    ["status", "completed"],
    ["status", "pending"],
    ["role", "contractor"],
    ["sort_by", "timestamp"],
  ])("%s=%s -> 400 VALIDATION_ERROR without querying", async (name, value) => {
    h.queried.length = 0
    const res = await request(app).get(`/api/v2/orders?${name}=${value}`)

    expect(res.status).toBe(400)
    expect(res.body?.error?.code).toBe("VALIDATION_ERROR")
    expect(res.body?.error?.validationErrors).toContainEqual(expect.objectContaining({ field: name }))
    expect(h.queried).toEqual([])
  })
})
