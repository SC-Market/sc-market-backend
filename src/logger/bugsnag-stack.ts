/**
 * Stack frame paths for Bugsnag.
 *
 * The server is ESM, so V8 writes its stack frames as `file:///app/dist/...`
 * URLs (and, with `node --enable-source-maps`, `file:///app/src/...ts`).
 * Bugsnag's node notifier compares frame paths to `projectRoot` as plain
 * paths: with the `file://` prefix no frame starts with `/app/`, so none is
 * marked in-project, the project root isn't stripped, and Bugsnag headlines
 * and groups an error by its top frame, often inside node_modules (knex).
 *
 * Runs first in the config onError, before the notifier's own in-project and
 * strip-project-root callbacks (config callbacks run before plugin ones).
 */

import { fileURLToPath } from "node:url"

/** The app root in the image (Dockerfile WORKDIR). */
export const BUGSNAG_PROJECT_ROOT = "/app"

interface StackFrameLike {
  file?: unknown
}

interface ErrorLike {
  stacktrace?: StackFrameLike[]
}

function hasErrors(event: object): event is { errors: ErrorLike[] } {
  return "errors" in event && Array.isArray(event.errors)
}

function toPath(file: string): string {
  if (!file.startsWith("file://")) return file
  try {
    return fileURLToPath(file)
  } catch {
    return file
  }
}

/** Rewrites `file://` frame URLs to plain paths, in place. */
export function normaliseStackFramePaths(event: object): void {
  if (!hasErrors(event)) return
  for (const error of event.errors) {
    for (const frame of error.stacktrace ?? []) {
      if (typeof frame.file === "string") frame.file = toPath(frame.file)
    }
  }
}
