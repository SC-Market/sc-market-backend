import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"
import {
  BUGSNAG_PROJECT_ROOT,
  normaliseStackFramePaths,
} from "./bugsnag-stack.js"

const require = createRequire(import.meta.url)
const Bugsnag = require("@bugsnag/js")

interface Frame {
  file: string
  lineNumber: number
  inProject?: boolean
}

// What a knex query failure looks like from the ESM server with
// --enable-source-maps: file:// URLs, knex frames on top.
function knexStyleError(): Error {
  const error = new Error('select * from "contracts" - relation does not exist')
  error.stack = [
    `error: ${error.message}`,
    "    at Function.makeKnex (file:///app/node_modules/knex/lib/knex-builder/make-knex.js:112:24)",
    "    at loadContract (file:///app/src/api/routes/v1/contracts/middleware.ts:14:22)",
    "    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)",
  ].join("\n")
  return error
}

describe("normaliseStackFramePaths", () => {
  it("lets Bugsnag mark our frames in-project and strip the project root", async () => {
    const client = Bugsnag.createClient({
      apiKey: "0".repeat(32),
      projectRoot: BUGSNAG_PROJECT_ROOT,
      autoDetectErrors: false,
      autoTrackSessions: false,
      sendCode: false,
      logger: null,
      onError: normaliseStackFramePaths,
    })
    const frames = await new Promise<Frame[]>((resolve) => {
      // The per-call callback runs after the notifier's in-project and
      // strip-project-root callbacks; returning false sends nothing.
      client.notify(
        knexStyleError(),
        (event: { errors: { stacktrace: Frame[] }[] }) => {
          resolve(event.errors[0].stacktrace)
          return false
        },
      )
    })

    expect(frames.map((f) => [f.file, f.lineNumber, f.inProject])).toEqual([
      ["node_modules/knex/lib/knex-builder/make-knex.js", 112, false],
      ["src/api/routes/v1/contracts/middleware.ts", 14, true],
      ["node:internal/process/task_queues", 105, false],
    ])
  })

  it("leaves plain paths and non-file URLs alone", () => {
    const event = {
      errors: [
        {
          stacktrace: [
            { file: "/app/dist/src/server.js" },
            { file: "node:internal/x" },
            { file: "file:///app/src/a%20b.ts" },
            {},
          ],
        },
      ],
    }
    normaliseStackFramePaths(event)
    expect(event.errors[0].stacktrace).toEqual([
      { file: "/app/dist/src/server.js" },
      { file: "node:internal/x" },
      { file: "/app/src/a b.ts" },
      {},
    ])
  })
})
