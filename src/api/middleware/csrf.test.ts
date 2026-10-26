import { describe, it, expect } from "vitest"
import express from "express"
import request from "supertest"
import {
  csrfProtection,
  MULTIPART_UPLOAD_PATHS,
  CSRF_EXEMPT_PATHS,
} from "./csrf.js"
import { createSocketAllowRequest } from "./socket-origin.js"

const ALLOWED = new Set([
  "https://sc-market.space",
  "https://api.sc-market.space",
  "https://shop.example-org.com", // a registered custom domain
])

function app() {
  const a = express()
  a.use(
    csrfProtection({
      isOriginAllowed: async (origin) => ALLOWED.has(origin),
    }),
  )
  a.all("*", express.json(), (_req, res) => {
    res.json({ ok: true })
  })
  return a
}

const COOKIE = "scmarket.access=jwt; other=1"

describe("csrfProtection", () => {
  describe("safe methods", () => {
    it.each(["GET", "HEAD", "OPTIONS"])("%s passes from any origin", async (m) => {
      const res = await request(app())
        [m.toLowerCase() as "get"]("/api/profile")
        .set("Origin", "https://evil.example")
        .set("Cookie", COOKIE)
      expect(res.status).toBe(m === "OPTIONS" ? 200 : 200)
    })
  })

  describe("origin check", () => {
    it.each(["post", "put", "patch", "delete"] as const)(
      "%s from the frontend with a cookie passes",
      async (m) => {
        const res = await request(app())
          [m]("/api/v2/accounts/settings")
          .set("Origin", "https://sc-market.space")
          .set("Cookie", COOKIE)
          .send({ a: 1 })
        expect(res.status).toBe(200)
      },
    )

    it("allows a registered https custom domain", async () => {
      const res = await request(app())
        .post("/api/v2/orders")
        .set("Origin", "https://shop.example-org.com")
        .set("Cookie", COOKIE)
        .send({ a: 1 })
      expect(res.status).toBe(200)
    })

    it.each([
      "https://evil.example",
      "http://sc-market.space",
      "http://shop.example-org.com",
      "null",
      "https://sc-market.space.evil.example",
    ])("rejects origin %s with 403", async (origin) => {
      const res = await request(app())
        .post("/api/v2/orders")
        .set("Origin", origin)
        .set("Cookie", COOKIE)
        .send({ a: 1 })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("rejects a foreign origin even without cookies", async () => {
      const res = await request(app())
        .post("/api/v2/orders")
        .set("Origin", "https://evil.example")
        .send({ a: 1 })
      expect(res.status).toBe(403)
    })

    it("falls back to Referer only when Origin is absent", async () => {
      const ok = await request(app())
        .post("/logout")
        .set("Referer", "https://sc-market.space/settings?x=1")
        .set("Cookie", COOKIE)
      expect(ok.status).toBe(200)

      const bad = await request(app())
        .post("/logout")
        .set("Referer", "https://evil.example/page")
        .set("Cookie", COOKIE)
      expect(bad.status).toBe(403)

      const originWins = await request(app())
        .post("/logout")
        .set("Origin", "https://evil.example")
        .set("Referer", "https://sc-market.space/")
        .set("Cookie", COOKIE)
      expect(originWins.status).toBe(403)
    })

    it("rejects a cookie-bearing request with neither Origin nor Referer", async () => {
      const res = await request(app())
        .post("/api/auth/refresh")
        .set("Cookie", "scmarket.refresh=r")
      expect(res.status).toBe(403)
    })

    it.each(["scmarket.access", "scmarket.refresh", "scmarket.sid"])(
      "treats %s as a credential cookie",
      async (name) => {
        const res = await request(app())
          .post("/auth/jwt-logout")
          .set("Cookie", `${name}=x`)
        expect(res.status).toBe(403)
      },
    )

    it("lets cookieless requests without Origin through (server-to-server)", async () => {
      const res = await request(app()).post("/api/email/unsubscribe/abc")
      expect(res.status).toBe(200)
    })

    it("ignores unrelated cookies when deciding whether a request is credentialed", async () => {
      const res = await request(app())
        .post("/api/x")
        .set("Cookie", "__cf_bm=1; theme=dark")
      expect(res.status).toBe(200)
    })
  })

  describe("bearer tokens", () => {
    it("exempts Bearer requests without auth cookies, whatever the origin", async () => {
      const res = await request(app())
        .post("/api/v2/listings")
        .set("Authorization", "Bearer scm_abc")
        .set("Origin", "https://evil.example")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send("a=1")
      expect(res.status).toBe(200)
    })

    it("still checks Bearer requests that also carry an auth cookie", async () => {
      const res = await request(app())
        .post("/api/v2/listings")
        .set("Authorization", "Bearer scm_abc")
        .set("Cookie", COOKIE)
        .set("Origin", "https://evil.example")
        .send({ a: 1 })
      expect(res.status).toBe(403)
    })
  })

  describe("content types", () => {
    const post = (path: string) =>
      request(app())
        .post(path)
        .set("Origin", "https://sc-market.space")
        .set("Cookie", COOKIE)

    it("accepts application/json with a charset", async () => {
      const res = await post("/api/x")
        .set("Content-Type", "application/json; charset=utf-8")
        .send(JSON.stringify({ a: 1 }))
      expect(res.status).toBe(200)
    })

    it("accepts an empty body without a content type", async () => {
      const res = await post("/api/auth/refresh")
      expect(res.status).toBe(200)
    })

    it.each([
      "application/x-www-form-urlencoded",
      "text/plain",
      "multipart/form-data; boundary=x",
      "application/xml",
    ])("rejects %s on a JSON route with 415", async (type) => {
      const res = await post("/api/v2/accounts/settings")
        .set("Content-Type", type)
        .send("a=1")
      expect(res.status).toBe(415)
    })

    it.each([
      "/api/profile/avatar",
      "/api/v1/profile/banner",
      "/api/contractors/SCMARKET/avatar",
      "/api/v1/contractors/SCMARKET/banner",
      "/api/market/listing/abc/photos",
      "/api/services/abc/photos",
      "/api/v2/admin/import-game-data",
      "/api/v2/listings/abc/photos",
      "/api/v2/images/upload",
    ])("accepts multipart on upload route %s", async (path) => {
      const res = await post(path).attach("photo", Buffer.from("x"), "a.png")
      expect(res.status).toBe(200)
    })

    it("still requires a valid Origin on upload routes", async () => {
      const res = await request(app())
        .post("/api/v2/images/upload")
        .set("Origin", "https://evil.example")
        .set("Cookie", COOKIE)
        .attach("photo", Buffer.from("x"), "a.png")
      expect(res.status).toBe(403)
    })

    it("does not accept urlencoded on upload routes", async () => {
      const res = await post("/api/v2/images/upload")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send("a=1")
      expect(res.status).toBe(415)
    })

    it("upload patterns don't match neighbouring routes", () => {
      for (const path of [
        "/api/profile/avatar/x",
        "/api/v2/images/upload/extra",
        "/api/v2/listings/a/b/photos",
        "/apix/profile/avatar",
      ]) {
        expect(MULTIPART_UPLOAD_PATHS.some((re) => re.test(path))).toBe(false)
      }
    })
  })

  describe("exempt paths", () => {
    it("lets the SCMDB ingest webhook post text/plain from scmdb.net", async () => {
      const res = await request(app())
        .post("/api/v2/integrations/scmdb/ingest/sometoken")
        .set("Origin", "https://scmdb.net")
        .set("Content-Type", "text/plain")
        .send('{"event":"x"}')
      expect(res.status).toBe(200)
    })

    it("lets browsers post CSP violation reports", async () => {
      const res = await request(app())
        .post("/api/csp-report")
        .set("Cookie", COOKIE)
        .set("Content-Type", "application/csp-report")
        .send('{"csp-report":{}}')
      expect(res.status).toBe(200)
    })

    it("only exempts the ingest route, not the rest of the integration", () => {
      expect(
        CSRF_EXEMPT_PATHS.some((re) =>
          re.test("/api/v2/integrations/scmdb/connect"),
        ),
      ).toBe(false)
    })
  })

  it("fails closed when the origin lookup throws", async () => {
    const a = express()
    a.use(
      csrfProtection({
        isOriginAllowed: async () => {
          throw new Error("db down")
        },
      }),
    )
    a.post("*", (_req, res) => res.json({ ok: true }))
    const res = await request(a)
      .post("/api/x")
      .set("Origin", "https://sc-market.space")
      .set("Cookie", COOKIE)
    expect(res.status).toBe(403)
  })
})

describe("socket.io allowRequest (cross-site WebSocket hijacking)", () => {
  const allow = createSocketAllowRequest({
    enforceCloudflare: false,
    isFromCloudflare: () => true,
    isOriginAllowed: async (o) => ALLOWED.has(o),
  })
  const decide = (headers: Record<string, string>) =>
    new Promise<boolean>((resolve) =>
      allow({ headers } as never, (_err, ok) => resolve(ok)),
    )

  it("accepts the frontend and registered custom domains", async () => {
    expect(await decide({ origin: "https://sc-market.space" })).toBe(true)
    expect(await decide({ origin: "https://shop.example-org.com" })).toBe(true)
  })

  it("rejects foreign and http origins", async () => {
    expect(await decide({ origin: "https://evil.example" })).toBe(false)
    expect(await decide({ origin: "http://sc-market.space" })).toBe(false)
  })

  it("accepts handshakes without Origin (non-browser clients)", async () => {
    expect(await decide({})).toBe(true)
  })

  it("still enforces Cloudflare-only when configured", async () => {
    const cf = createSocketAllowRequest({
      enforceCloudflare: true,
      isFromCloudflare: () => false,
      isOriginAllowed: async () => true,
    })
    const ok = await new Promise<boolean>((resolve) =>
      cf({ headers: { origin: "https://sc-market.space" } } as never, (_e, s) =>
        resolve(s),
      ),
    )
    expect(ok).toBe(false)
  })
})
