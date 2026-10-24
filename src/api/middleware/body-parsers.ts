/**
 * Request body parsers for the main API app (src/server.ts).
 *
 * Kept in one place so tests exercise the exact parser configuration the
 * server runs — body parsing happens before routing and before auth, so any
 * parser bug is reachable by anonymous requests (e.g. GHSA-27r3-jxmh-p828, where
 * a compressed body with trailing bytes crashed the process).
 */

import express, { RequestHandler } from "express"

export function bodyParsers(): RequestHandler[] {
  return [
    express.json({ limit: "2.5mb" }),
    express.text({ type: "text/plain", limit: "128kb" }),
    express.urlencoded({
      extended: true,
      limit: "2.5mb",
    }),
  ]
}
