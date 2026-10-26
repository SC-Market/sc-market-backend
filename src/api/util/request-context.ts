/**
 * Request-scoped auth context (AsyncLocalStorage).
 *
 * Some permission helpers are called deep inside handlers without access to
 * `req` (has_permission has ~70 call sites). They read the current request's
 * effective user from here, so they see the same role as `req.user`, after
 * the site-admin policy (custom-origin and MFA masking) has been applied.
 *
 * Code that runs outside a request (background tasks, the Discord bot's
 * discord_app, socket events) has no context. Callers must treat "no context"
 * as "no site-admin power".
 */

import { AsyncLocalStorage } from "node:async_hooks"
import type { NextFunction, Request, Response } from "express"
import type { User } from "../routes/v1/api-models.js"

interface RequestContext {
  req: Request
}

const storage = new AsyncLocalStorage<RequestContext>()

/** Run the rest of the middleware chain inside this request's context. */
export function runInRequestContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  storage.run({ req }, next)
}

/**
 * The effective user of the request currently being handled, or undefined
 * outside a request / for anonymous requests.
 */
export function currentRequestUser(): User | undefined {
  return storage.getStore()?.req.user as User | undefined
}

export function hasRequestContext(): boolean {
  return storage.getStore() !== undefined
}

/** For tests: run `fn` as if handling `req`. */
export function withRequestContext<T>(req: Request, fn: () => T): T {
  return storage.run({ req }, fn)
}
