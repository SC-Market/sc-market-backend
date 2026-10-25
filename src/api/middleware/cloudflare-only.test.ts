import { describe, it, expect } from "vitest"
import express from "express"
import request from "supertest"
import {
  cloudflareOnly,
  isCloudflareIp,
  shouldEnforceCloudflareOrigin,
} from "./cloudflare-only.js"

// 104.16.0.0/13 and 2606:4700::/32 are published Cloudflare ranges;
// 203.0.113.0/24 is TEST-NET-3 (never Cloudflare).
const CF_V4 = "104.16.1.2"
const CF_V6 = "2606:4700:10::6816:102"
const NOT_CF = "203.0.113.7"

function buildApp(enforce: boolean) {
  const app = express()
  app.set("trust proxy", 2)
  app.use(cloudflareOnly({ enforce, exemptPaths: ["/api/languages"] }))
  app.get("/api/languages", (_req, res) => res.json({ ok: true }))
  app.get("/api/thing", (_req, res) => res.json({ ok: true }))
  return app
}

describe("cloudflare-only origin middleware", () => {
  const app = buildApp(true)

  it("allows a Cloudflare IPv4 last hop", async () => {
    const res = await request(app)
      .get("/api/thing")
      .set("X-Forwarded-For", `198.51.100.1, ${CF_V4}`)
    expect(res.status).toBe(200)
  })

  it("allows a Cloudflare IPv6 last hop", async () => {
    const res = await request(app)
      .get("/api/thing")
      .set("X-Forwarded-For", `198.51.100.1, ${CF_V6}`)
    expect(res.status).toBe(200)
  })

  it("rejects a non-Cloudflare last hop with a 403 JSON error", async () => {
    const res = await request(app)
      .get("/api/thing")
      .set("X-Forwarded-For", NOT_CF)
    expect(res.status).toBe(403)
    expect(res.body.error.message).toBe("Direct origin access is not allowed")
  })

  it("rejects a spoofed Cloudflare IP in an earlier position", async () => {
    const res = await request(app)
      .get("/api/thing")
      .set("X-Forwarded-For", `${CF_V4}, ${CF_V6}, ${NOT_CF}`)
    expect(res.status).toBe(403)
  })

  it("rejects an empty or unparseable last hop", async () => {
    const empty = await request(app)
      .get("/api/thing")
      .set("X-Forwarded-For", `${CF_V4}, `)
    expect(empty.status).toBe(403)
    const garbage = await request(app)
      .get("/api/thing")
      .set("X-Forwarded-For", "not-an-ip")
    expect(garbage.status).toBe(403)
  })

  it("allows requests with no X-Forwarded-For (internal traffic)", async () => {
    const res = await request(app).get("/api/thing")
    expect(res.status).toBe(200)
  })

  it("always allows the health check path", async () => {
    const res = await request(app)
      .get("/api/languages")
      .set("X-Forwarded-For", NOT_CF)
    expect(res.status).toBe(200)
  })

  it("allows everything when enforcement is off", async () => {
    const off = buildApp(false)
    const a = await request(off)
      .get("/api/thing")
      .set("X-Forwarded-For", NOT_CF)
    expect(a.status).toBe(200)
    const b = await request(off)
      .get("/api/thing")
      .set("X-Forwarded-For", `${CF_V4}, ${NOT_CF}`)
    expect(b.status).toBe(200)
  })

  it("treats IPv4-mapped IPv6 Cloudflare addresses as Cloudflare", () => {
    expect(isCloudflareIp(`::ffff:${CF_V4}`)).toBe(true)
    expect(isCloudflareIp(`::ffff:${NOT_CF}`)).toBe(false)
  })
})

describe("shouldEnforceCloudflareOrigin", () => {
  it("defaults on in production and off elsewhere", () => {
    expect(shouldEnforceCloudflareOrigin({ NODE_ENV: "production" })).toBe(true)
    expect(shouldEnforceCloudflareOrigin({ NODE_ENV: "development" })).toBe(
      false,
    )
    expect(shouldEnforceCloudflareOrigin({ NODE_ENV: "test" })).toBe(false)
  })

  it("honours an explicit flag and rejects invalid values", () => {
    expect(
      shouldEnforceCloudflareOrigin({
        NODE_ENV: "production",
        ENFORCE_CLOUDFLARE_ORIGIN: "false",
      }),
    ).toBe(false)
    expect(
      shouldEnforceCloudflareOrigin({
        NODE_ENV: "development",
        ENFORCE_CLOUDFLARE_ORIGIN: "true",
      }),
    ).toBe(true)
    expect(() =>
      shouldEnforceCloudflareOrigin({ ENFORCE_CLOUDFLARE_ORIGIN: "yes" }),
    ).toThrow("ENFORCE_CLOUDFLARE_ORIGIN")
  })
})
