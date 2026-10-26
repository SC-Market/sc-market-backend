import { describe, expect, it } from "vitest"
import type { NextFunction, Request, Response } from "express"
import {
  currentLogContext,
  requestContext,
  resolveRequestId,
} from "./log-context.js"

function fakeRes() {
  const headers: Record<string, string> = {}
  return {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value
    },
  } as unknown as Response & { headers: Record<string, string> }
}

describe("resolveRequestId", () => {
  it("accepts a well-formed X-Request-Id", () => {
    expect(resolveRequestId("abc-123_X:y.z")).toBe("abc-123_X:y.z")
  })
  it.each([
    undefined,
    "",
    "has space",
    'quote"',
    "x".repeat(129),
    "line\nbreak",
  ])("generates an id for %j", (value) => {
    const id = resolveRequestId(value)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe("requestContext", () => {
  it("sets the response header and exposes the context to the chain", async () => {
    const req = {
      headers: { "x-request-id": "given-id" },
    } as unknown as Request
    const res = fakeRes()
    const seen = await new Promise((resolve) => {
      requestContext(req, res, (() => {
        setTimeout(() => resolve(currentLogContext()), 0)
      }) as NextFunction)
    })
    expect(res.headers["X-Request-Id"]).toBe("given-id")
    expect(seen).toEqual({ requestId: "given-id", req })
    expect(currentLogContext()).toBeUndefined()
  })

  it("re-entering keeps the same id", () => {
    const req = { headers: {} } as unknown as Request
    const res = fakeRes()
    let first: string | undefined
    let second: string | undefined
    requestContext(req, res, (() => {
      first = currentLogContext()?.requestId
    }) as NextFunction)
    requestContext(req, res, (() => {
      second = currentLogContext()?.requestId
    }) as NextFunction)
    expect(first).toBeDefined()
    expect(second).toBe(first)
    expect(req.requestId).toBe(first)
  })
})
