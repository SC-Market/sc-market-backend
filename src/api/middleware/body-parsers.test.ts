import { describe, it, expect, beforeAll, afterAll } from "vitest"
import express from "express"
import http from "node:http"
import type { AddressInfo } from "node:net"
import zlib from "node:zlib"
import { bodyParsers } from "./body-parsers.js"

/**
 * Regression test for GHSA-27r3-jxmh-p828 (body-parser < 1.20.9).
 *
 * A gzip body made of one valid frame followed by trailing bytes used to crash
 * the whole process: the parser finished reading the frame, left the gunzip
 * stream piped with no error listener, and the trailing bytes then made it emit
 * an unhandled 'error'. Body parsing runs before routing and auth, so any
 * anonymous client could take the server down with one request.
 *
 * Against body-parser 1.20.6 the gunzip stream throws an uncaught Z_DATA_ERROR
 * (in production: process exit). The test records uncaught exceptions and
 * asserts there were none; vitest additionally fails the run on them.
 * The patched parser discards the trailing bytes and answers normally (200 on
 * Node >= 11, where zlib ends the stream at the end of the frame); a 4xx would
 * also be acceptable. What must hold is: no 5xx, no crash, server keeps serving.
 */
describe("body parsers (GHSA-27r3-jxmh-p828 regression)", () => {
  let server: http.Server
  let port: number
  const uncaught: unknown[] = []
  const recordUncaught = (err: unknown) => uncaught.push(err)

  beforeAll(async () => {
    process.on("uncaughtException", recordUncaught)
    const app = express()
    app.use(bodyParsers())
    app.post("/echo", (req, res) => {
      res.json({ body: req.body })
    })
    app.get("/ping", (_req, res) => {
      res.send("pong")
    })
    server = http.createServer(app)
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    )
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    process.off("uncaughtException", recordUncaught)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  function post(
    path: string,
    body: Buffer,
    headers: Record<string, string>,
  ): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path,
          agent: false,
          headers: { ...headers, "Content-Length": String(body.length) },
        },
        (res) => {
          let text = ""
          res.setEncoding("utf8")
          res.on("data", (chunk) => (text += chunk))
          res.on("end", () => resolve({ status: res.statusCode!, text }))
        },
      )
      req.on("error", reject)
      req.end(body)
    })
  }

  async function ping(): Promise<number> {
    const res = await fetch(`http://127.0.0.1:${port}/ping`)
    return res.status
  }

  // The payload from the upstream fix's own test: frame, NUL, 100 KB of junk.
  const payload = Buffer.concat([
    zlib.gzipSync(JSON.stringify({ a: 1 })),
    Buffer.from([0x00]),
    Buffer.alloc(100 * 1024, 0x58),
  ])

  it.each([
    ["application/json", "/echo"],
    // Parsing happens before routing: an unknown route is just as exposed.
    ["application/json", "/no-such-route"],
    ["application/x-www-form-urlencoded", "/echo"],
    ["text/plain", "/echo"],
  ])(
    "survives a gzip %s body with trailing bytes (POST %s)",
    async (contentType, path) => {
      const res = await post(path, payload, {
        "Content-Type": contentType,
        "Content-Encoding": "gzip",
      })
      expect(res.status).toBeLessThan(500)

      // Give a late zlib 'error' a chance to fire before declaring victory.
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(uncaught).toEqual([])
      expect(await ping()).toBe(200)
    },
  )

  it("still parses a well-formed gzip JSON body", async () => {
    const res = await post("/echo", zlib.gzipSync(JSON.stringify({ a: 1 })), {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
    })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.text)).toEqual({ body: { a: 1 } })
  })

  it("rejects a corrupt gzip body with 400 and keeps serving", async () => {
    const res = await post("/echo", Buffer.from("not gzip at all"), {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
    })
    expect(res.status).toBe(400)
    expect(await ping()).toBe(200)
  })
})
