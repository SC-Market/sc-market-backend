/**
 * track500Responses reports 500s to Bugsnag with the request path. Per-call
 * notify callbacks run after the config onError, so the callback itself must
 * scrub: /api/v2/integrations/scmdb/ingest/{token} carries a token in the path.
 */

import { describe, it, expect, vi } from "vitest"
import express from "express"
import request from "supertest"

const notify = vi.hoisted(() => vi.fn())
vi.mock("@bugsnag/js", () => ({
  default: { isStarted: () => true, notify },
}))

import { track500Responses } from "./error-handler.js"

describe("track500Responses Bugsnag report", () => {
  it("scrubs the token from the error message and request metadata", async () => {
    const app = express()
    app.use(track500Responses)
    app.post("/api/v2/integrations/scmdb/ingest/:token", (_req, res) => {
      res.status(500).json({ error: { message: "boom" } })
    })

    await request(app).post(
      "/api/v2/integrations/scmdb/ingest/SECRETTOKEN?code=SECRETCODE",
    )
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1))

    const [error, onError] = notify.mock.calls[0]
    const event = {
      errors: [{ errorMessage: (error as Error).message }],
      _metadata: {} as Record<string, unknown>,
      addMetadata(section: string, values: Record<string, unknown>) {
        this._metadata[section] = values
      },
    }
    onError(event)

    const json = JSON.stringify(event)
    expect(json).not.toMatch(/SECRETTOKEN|SECRETCODE/)
    expect(event._metadata.request).toMatchObject({
      path: "/api/v2/integrations/scmdb/ingest/[REDACTED]",
      method: "POST",
    })
    expect(event.errors[0].errorMessage).toBe(
      "[500] POST /api/v2/integrations/scmdb/ingest/[REDACTED]: boom",
    )
  })
})
