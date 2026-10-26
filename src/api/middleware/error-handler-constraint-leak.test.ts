/**
 * A unique / foreign-key violation was answered 409 with the raw driver text
 * in `details.originalError` (SQL, table, constraint and the conflicting
 * value). The response is now generic; the details are logged.
 */

import { describe, it, expect, vi } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("@bugsnag/js", () => ({
  default: { isStarted: () => true, notify: vi.fn() },
}))

const { errorHandler } = await import("./error-handler.js")

describe("errorHandler — constraint violations", () => {
  it("answers 409 without leaking the database error", async () => {
    const app = express()
    app.get("/x", (_req, _res, next) =>
      next(
        new Error(
          'insert into "accounts" ("username") values ($1) - duplicate key value violates unique constraint "accounts_username_key" Key (username)=(alice) already exists',
        ),
      ),
    )
    app.use(errorHandler)

    const res = await request(app).get("/x")
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe("CONFLICT")
    const raw = JSON.stringify(res.body)
    expect(raw).not.toMatch(
      /insert into|accounts_username_key|alice|duplicate key/,
    )
  })
})
