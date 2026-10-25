/**
 * errorHandler safety net: a Postgres 22P02 (invalid_text_representation —
 * typically a non-UUID bound to a uuid column) is bad client input and must be
 * answered 400 VALIDATION_ERROR, never 500, without echoing the SQL or the bad
 * value back. Errors from TSOA controllers reach it via tsoaErrorHandler.
 */

import { describe, it, expect, vi, beforeAll } from "vitest"
import express from "express"
import request from "supertest"

const notify = vi.hoisted(() => vi.fn())
vi.mock("@bugsnag/js", () => ({
  default: { isStarted: () => true, notify },
}))

import { errorHandler } from "./error-handler.js"
import { tsoaErrorHandler } from "./tsoa-error-handler.js"

/** What knex rethrows for a pg 22P02: SQL-prefixed message + SQLSTATE code. */
function pgInvalidUuidError(): Error {
  return Object.assign(
    new Error(
      'select * from "listings" where "listing_id" = $1 limit $2 - invalid input syntax for type uuid: "stock"',
    ),
    { code: "22P02", severity: "ERROR", routine: "string_to_uuid" },
  )
}

let app: express.Express

beforeAll(() => {
  app = express()
  const router = express.Router()
  router.get("/pg-22p02", (_req, _res, next) => next(pgInvalidUuidError()))
  router.get("/pg-22p02-nested", (_req, _res, next) =>
    next(Object.assign(new Error("wrapped"), { cause: pgInvalidUuidError() })),
  )
  router.get("/pg-other", (_req, _res, next) =>
    next(Object.assign(new Error("deadlock detected"), { code: "40P01" })),
  )
  router.use(tsoaErrorHandler)
  app.use("/api/v2", router)
  app.use(errorHandler)
})

describe("errorHandler — Postgres 22P02", () => {
  it.each(["/api/v2/pg-22p02", "/api/v2/pg-22p02-nested"])(
    "%s -> 400 VALIDATION_ERROR",
    async (path) => {
      notify.mockClear()
      const res = await request(app).get(path)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
      expect(res.body.error.message).toBe(
        "Invalid identifier or value format in request",
      )
      // No SQL, driver text, or the offending value leaks into the response.
      const raw = JSON.stringify(res.body)
      expect(raw).not.toMatch(/select|listings|invalid input syntax|stock|22P02/i)

      await new Promise((r) => setTimeout(r, 10))
      expect(notify).not.toHaveBeenCalled()
    },
  )

  it("other database errors still answer 500 (no blanket mapping)", async () => {
    const res = await request(app).get("/api/v2/pg-other")

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR")
  })
})
