import { describe, expect, it, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"
import { createRequire } from "node:module"
import type { AddressInfo } from "node:net"
import express from "express"
import BugsnagPluginExpress from "@bugsnag/plugin-express"
import { scrubBugsnagEvent } from "./bugsnag-scrub.js"
import { REDACTED } from "./format.js"

describe("scrubBugsnagEvent", () => {
  it("scrubs token-in-path URLs, secret query params, params and body", () => {
    const event = {
      context: "POST /api/v2/integrations/scmdb/ingest/s3cr3t-token",
      request: {
        url: "https://api.sc-market.space/api/v2/integrations/scmdb/ingest/s3cr3t-token?x=1",
        path: "/api/v2/integrations/scmdb/ingest/s3cr3t-token",
        httpMethod: "POST",
        headers: { "user-agent": "ua" },
        params: { token: "s3cr3t-token" },
        query: { code: "oauth-code", state: "st" },
        body: { share_token: "abc", title: "ok" },
      },
      errors: [
        { errorMessage: "[500] GET /api/email/unsubscribe/unsub-tok: boom" },
      ],
      breadcrumbs: [
        {
          message: "GET /auth/discord/callback?code=c0de&state=s7",
          metadata: { url: "/x?token=t0k", access_token: "eyJa.eyJb.c" },
        },
      ],
      _metadata: {
        request: {
          url: "/auth/citizenid/callback?code=c0de&state=s7",
          query: { token: "t" },
        },
      },
    }

    expect(scrubBugsnagEvent(event)).toBe(true)

    const json = JSON.stringify(event)
    for (const secret of [
      "s3cr3t-token",
      "oauth-code",
      "unsub-tok",
      "c0de",
      "s7",
      "t0k",
      "eyJa",
    ]) {
      expect(json).not.toContain(secret)
    }
    expect(event.request.url).toBe(
      `https://api.sc-market.space/api/v2/integrations/scmdb/ingest/${REDACTED}?x=1`,
    )
    expect(event.request.params).toEqual({ token: REDACTED })
    expect(event.request.query).toEqual({ code: REDACTED, state: REDACTED })
    expect(event.request.body).toEqual({ share_token: REDACTED, title: "ok" })
    expect(event.request.headers).toEqual({ "user-agent": "ua" })
    expect(event.request.httpMethod).toBe("POST")
    expect(event.context).toBe(
      `POST /api/v2/integrations/scmdb/ingest/${REDACTED}`,
    )
  })

  it("handles events with no request info", () => {
    const event = { errors: [{ errorMessage: "plain" }] }
    expect(scrubBugsnagEvent(event)).toBe(true)
    expect(event.errors[0].errorMessage).toBe("plain")
  })
})

describe("with the real @bugsnag/plugin-express", () => {
  it("no token from the path or query reaches the delivered event", async () => {
    const require = createRequire(import.meta.url)
    const Bugsnag = require("@bugsnag/js")
    const sent: unknown[] = []
    const client = Bugsnag.createClient({
      apiKey: "a".repeat(32),
      plugins: [BugsnagPluginExpress],
      releaseStage: "production",
      enabledReleaseStages: ["production"],
      autoTrackSessions: false,
      logger: null,
      onError: scrubBugsnagEvent,
    })
    client._delivery = {
      sendEvent: (payload: unknown, cb: (err: null) => void) => {
        sent.push(payload)
        cb(null)
      },
      sendSession: (_: unknown, cb: (err: null) => void) => cb(null),
    }
    const plugin = client.getPlugin("express")
    const app = express()
    app.use(plugin.requestHandler)
    app.get("/api/v2/integrations/scmdb/ingest/:token", () => {
      throw new Error("boom")
    })
    app.use(plugin.errorHandler)
    app.use((_e: unknown, _req: Request, res: Response, _n: NextFunction) => {
      res.status(500).end()
    })
    const server = app.listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    const { port } = server.address() as AddressInfo
    await fetch(
      `http://127.0.0.1:${port}/api/v2/integrations/scmdb/ingest/SECRETTOKEN?code=SECRETCODE&state=SECRETSTATE`,
    )
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    server.close()

    const json = JSON.stringify(sent)
    expect(json).toContain("scmdb/ingest/[REDACTED]")
    expect(json).not.toMatch(/SECRETTOKEN|SECRETCODE|SECRETSTATE/)
  })
})
