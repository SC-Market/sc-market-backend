import { describe, expect, it } from "vitest"
import type { Request } from "express"
import {
  buildLogRecord,
  isSensitiveKey,
  REDACTED,
  requestRoute,
  scrubString,
  toLoggable,
} from "./format.js"
import { redactToken } from "../util/redact.js"

function fakeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    baseUrl: "",
    originalUrl: "/api/market/stats",
    url: "/api/market/stats",
    ...overrides,
  } as Request
}

describe("buildLogRecord", () => {
  it("puts ts, level, msg and the request context first", () => {
    const req = fakeReq({
      baseUrl: "/api/v2/orders",
      route: { path: "/:order_id" },
      user: { user_id: "u-1" } as Request["user"],
    })
    const record = buildLogRecord(
      {
        level: "info",
        message: "hello",
        timestamp: "2026-10-25T00:00:00.000Z",
        extra: 1,
      },
      { requestId: "req-1", req },
    )
    expect(Object.keys(record).slice(0, 7)).toEqual([
      "ts",
      "level",
      "msg",
      "request_id",
      "method",
      "route",
      "user_id",
    ])
    expect(record).toMatchObject({
      msg: "hello",
      request_id: "req-1",
      route: "/api/v2/orders/:order_id",
      user_id: "u-1",
      extra: 1,
    })
  })

  it("has no request fields outside a request", () => {
    const record = buildLogRecord({ level: "info", message: "boot" }, undefined)
    expect(record.request_id).toBeUndefined()
    expect(record.route).toBeUndefined()
  })

  it("serializes an error with its stack into one JSON line", () => {
    const error = new Error("boom")
    ;(error as Error & { code: string }).code = "23505"
    const line = JSON.stringify(
      buildLogRecord({ level: "error", message: "failed", error }, undefined),
    )
    expect(line).not.toContain("\n")
    const parsed = JSON.parse(line)
    expect(parsed.error.name).toBe("Error")
    expect(parsed.error.message).toBe("boom")
    expect(parsed.error.code).toBe("23505")
    expect(parsed.error.stack).toContain("boom\n")
  })

  it("keeps the stack winston copies when an Error is logged directly", () => {
    const record = buildLogRecord(
      {
        level: "error",
        message: "failed boom",
        stack: "Error: boom\n    at x",
      },
      undefined,
    )
    expect(record.error).toEqual({ stack: "Error: boom\n    at x" })
  })

  it("redacts secret metadata, tokens and codes", () => {
    const record = buildLogRecord(
      {
        level: "warn",
        message: "callback ?code=abc123&state=xyz",
        code: "123456",
        recovery_code: "aaaa-bbbb",
        access_token: "secret-token",
        token_id: "tok-1",
        nested: {
          password: "hunter2",
          headers: { authorization: "Bearer x", cookie: "a=b" },
        },
        token: redactToken("0123456789abcdef"),
        statusCode: 500,
      },
      undefined,
    )
    expect(record.msg).toBe(`callback ?code=${REDACTED}&state=${REDACTED}`)
    expect(record.code).toBe(REDACTED)
    expect(record.recovery_code).toBe(REDACTED)
    expect(record.access_token).toBe(REDACTED)
    expect(record.token_id).toBe("tok-1")
    expect(record.nested).toEqual({
      password: REDACTED,
      headers: { authorization: REDACTED, cookie: REDACTED },
    })
    // Already shortened by redactToken: kept for correlation.
    expect(record.token).toBe("0123…[16]")
    expect(record.statusCode).toBe(500)
  })

  it("handles circular metadata", () => {
    const a: Record<string, unknown> = { name: "a" }
    a.self = a
    const record = buildLogRecord({ level: "info", message: "x", a }, undefined)
    expect(record.a).toEqual({ name: "a", self: "[Circular]" })
  })
})

describe("scrubString", () => {
  it("removes bearer tokens, API tokens, JWTs and path tokens", () => {
    expect(scrubString("Authorization: Bearer abc.def")).toBe(
      `Authorization: Bearer ${REDACTED}`,
    )
    expect(scrubString("used scm_abcdefghij1234")).toBe(`used scm_${REDACTED}`)
    expect(scrubString("jwt eyJhbGc.eyJzdWIi.sig-part")).toBe(`jwt ${REDACTED}`)
    expect(scrubString("/api/v2/integrations/scmdb/ingest/s3cr3t/x")).toBe(
      `/api/v2/integrations/scmdb/ingest/${REDACTED}/x`,
    )
    expect(scrubString("/api/email/unsubscribe/tok")).toBe(
      `/api/email/unsubscribe/${REDACTED}`,
    )
  })
})

describe("requestRoute", () => {
  it("falls back to the scrubbed path before routing", () => {
    expect(
      requestRoute(fakeReq({ originalUrl: "/api/email/unsubscribe/tok?x=1" })),
    ).toBe(`/api/email/unsubscribe/${REDACTED}`)
  })
})

describe("isSensitiveKey", () => {
  it.each([
    "secret",
    "client_secret",
    "password",
    "refresh_token",
    "apiKey",
    "mfa_code",
    "otp",
    "cookie",
  ])("%s is sensitive", (key) => expect(isSensitiveKey(key)).toBe(true))
  it.each([
    "statusCode",
    "token_id",
    "tokenCount",
    "user_id",
    "blueprint_code",
    "message",
  ])("%s is not sensitive", (key) => expect(isSensitiveKey(key)).toBe(false))
})

describe("toLoggable", () => {
  it("converts dates, buffers and bigints", () => {
    expect(
      toLoggable({
        d: new Date("2026-01-01T00:00:00Z"),
        b: Buffer.from("ab"),
        n: 10n,
      }),
    ).toEqual({ d: "2026-01-01T00:00:00.000Z", b: "[Buffer 2 bytes]", n: "10" })
  })
})
