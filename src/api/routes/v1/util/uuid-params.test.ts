/**
 * Shared guards for client-supplied ids bound to uuid columns
 * (util/uuid-params): a malformed id must be answered up front, never bound
 * into a query where Postgres rejects the cast (22P02) and an async v1
 * handler surfaces it as an unhandled 500.
 */

import { describe, it, expect, vi } from "vitest"
import express from "express"
import request from "supertest"
import {
  isUuid,
  requireUuidParams,
  requireUuidQuery,
} from "./uuid-params.js"

const ID = "0b3f1c2a-1234-4abc-9def-0123456789ab"

describe("isUuid", () => {
  it("accepts canonical UUIDs in either case", () => {
    expect(isUuid(ID)).toBe(true)
    expect(isUuid(ID.toUpperCase())).toBe(true)
  })

  it.each([
    "{contract_id}`",
    "{listing_id}",
    "not-a-uuid",
    "",
    `${ID}x`,
    ` ${ID}`,
    ID.replace(/-/g, ""),
    "0b3f1c2a--some-slug",
  ])("rejects %j", (value) => {
    expect(isUuid(value)).toBe(false)
  })

  it("rejects non-strings (query arrays, numbers, missing)", () => {
    expect(isUuid([ID])).toBe(false)
    expect(isUuid(42)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})

describe("requireUuidParams", () => {
  function app() {
    const handler = vi.fn((req: express.Request, res: express.Response) => {
      res.json({ id: req.params.thing_id })
    })
    const router = express.Router()
    requireUuidParams(router, { thing_id: "Thing" })
    router.get("/:thing_id", handler)
    router.get("/:thing_id/sub/:other", handler)
    router.get("/by-name/:name", (req, res) => {
      res.json({ name: req.params.name })
    })
    const a = express()
    a.use("/things", router)
    return { a, handler }
  }

  it("passes a valid uuid through unchanged", async () => {
    const { a, handler } = app()
    const res = await request(a).get(`/things/${ID}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: ID })
    expect(handler).toHaveBeenCalledOnce()
  })

  it.each(["%7Bthing_id%7D%60", "not-a-uuid", "123"])(
    "answers 404 NOT_FOUND for %s without reaching the handler",
    async (bad) => {
      const { a, handler } = app()
      const res = await request(a).get(`/things/${bad}`)
      expect(res.status).toBe(404)
      expect(res.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Thing not found",
          details: { resource: "Thing" },
        },
      })
      expect(handler).not.toHaveBeenCalled()
    },
  )

  it("guards nested routes declaring the param", async () => {
    const { a, handler } = app()
    const res = await request(a).get("/things/nope/sub/x")
    expect(res.status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })

  it("leaves routes without the param alone", async () => {
    const { a } = app()
    const res = await request(a).get("/things/by-name/anything")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: "anything" })
  })
})

describe("requireUuidQuery", () => {
  function app() {
    const a = express()
    a.get("/search", requireUuidQuery("shop_id"), (req, res) => {
      res.json({ shop_id: req.query.shop_id ?? null })
    })
    return a
  }

  it("passes when absent, empty or a uuid", async () => {
    expect((await request(app()).get("/search")).status).toBe(200)
    expect((await request(app()).get("/search?shop_id=")).status).toBe(200)
    const ok = await request(app()).get(`/search?shop_id=${ID}`)
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ shop_id: ID })
  })

  it.each(["bad", "%7Bshop_id%7D", `${ID}&shop_id=${ID}`])(
    "answers 400 VALIDATION_ERROR for shop_id=%s",
    async (bad) => {
      const res = await request(app()).get(`/search?shop_id=${bad}`)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
      expect(res.body.error.validationErrors).toEqual([
        { field: "shop_id", message: "must be a UUID", code: "invalid_uuid" },
      ])
    },
  )
})
