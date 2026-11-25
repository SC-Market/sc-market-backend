/**
 * The throwing user getters (getUser, getLogin, getMinimalUser) raise a typed
 * NotFoundError for a missing account, not a bare Error("Invalid user!"), so
 * any lookup that reaches the error handler (v2/TSOA controllers, v1 code
 * that forwards to next) answers 404 NOT_FOUND instead of a 500. findUser
 * stays the non-throwing variant for request handlers.
 */

import { describe, it, expect, vi } from "vitest"
import express from "express"
import request from "supertest"

// The global setup mocks this module; these tests exercise the real one.
vi.unmock("./database.js")
vi.mock("@bugsnag/js", () => ({
  default: { isStarted: () => true, notify: vi.fn() },
}))
// Every query finds no row.
vi.mock("../../../../clients/database/knex-db.js", () => {
  const db = () => ({
    where: () => ({ first: async () => undefined }),
  })
  return { getKnex: () => db, database: { knex: db } }
})
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

const profileDb = await import("./database.js")
const { NotFoundError } = await import("../util/errors.js")
const { errorHandler } = await import("../../../middleware/error-handler.js")

describe("user getters on a missing account", () => {
  it.each([
    ["getUser", () => profileDb.getUser({ username: "ghost" })],
    ["getLogin", () => profileDb.getLogin({ username: "ghost" })],
    ["getMinimalUser", () => profileDb.getMinimalUser({ username: "ghost" })],
  ])("%s throws NotFoundError", async (_name, call) => {
    const err = await call().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NotFoundError)
    expect((err as InstanceType<typeof NotFoundError>).resource).toBe("User")
  })

  it("findUser returns null", async () => {
    await expect(profileDb.findUser({ username: "ghost" })).resolves.toBeNull()
  })

  it("a forwarded getter error becomes a 404 NOT_FOUND response", async () => {
    const app = express()
    app.get("/x", async (_req, _res, next) => {
      try {
        await profileDb.getUser({ username: "ghost" })
      } catch (e) {
        next(e)
      }
    })
    app.use(errorHandler)

    const res = await request(app).get("/x")

    expect(res.status).toBe(404)
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "User not found",
    })
  })
})
