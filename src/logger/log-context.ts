/**
 * Request-scoped logging context (AsyncLocalStorage).
 *
 * Every log line written while handling a request carries the request's id,
 * route and user. The id comes from a well-formed `X-Request-Id` request
 * header, or is generated, and is echoed in the `X-Request-Id` response
 * header so a user-reported failure can be matched to its log lines.
 *
 * This is deliberately separate from `api/util/request-context.ts`: that
 * store decides site-admin power and must only exist after the site-role
 * policy has run, while this one should cover the whole request.
 *
 * `requestContext` is mounted twice (first middleware, and again after
 * passport.session()). The second mount re-enters the same context from
 * `req`, so a callback-based library (session store, pg) that loses or
 * swaps the async context can't leak another request's id into later logs.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

export interface LogContext {
  requestId: string
  req?: Request
}

export const REQUEST_ID_HEADER = "x-request-id"

// Accept caller-supplied ids only in a safe shape (no spaces, quotes or
// control characters), so they can't forge or break log lines.
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

const storage = new AsyncLocalStorage<LogContext>()

export function resolveRequestId(header: unknown): string {
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value === "string" && VALID_REQUEST_ID.test(value)) return value
  return randomUUID()
}

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.requestId) {
    req.requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER])
    res.setHeader("X-Request-Id", req.requestId)
  }
  storage.run({ requestId: req.requestId, req }, next)
}

export function currentLogContext(): LogContext | undefined {
  return storage.getStore()
}

/** For tests and non-HTTP work: run `fn` with the given log context. */
export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn)
}
