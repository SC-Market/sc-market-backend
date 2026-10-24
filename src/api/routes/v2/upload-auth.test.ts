import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest"
import express from "express"
import request from "supertest"
import fs from "node:fs"
import type { User } from "../v1/api-models.js"

/**
 * Upload routes must authenticate BEFORE multer parses the body.
 *
 * multer is registered in api-router.ts ahead of RegisterRoutes() because it
 * has to populate req.file / req.files for the TSOA handler — which means it
 * runs before TSOA's own @Security check. Without an explicit auth gate in
 * front of it, anonymous requests were parsed and written to disk (up to 50 MB
 * on the admin import route).
 *
 * The real multer instances are swapped for instrumented ones that record each
 * invocation, write to a private temp dir, and short-circuit with 202 once
 * multer is done so the TSOA controllers (CDN, database) never run. That makes
 * "was the body parsed / was a file written" directly observable.
 */

const h = vi.hoisted(() => ({
  calls: [] as string[],
  dest: "",
}))

vi.mock("../v1/util/upload.js", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  const { default: multer } = await import("multer")
  const os = await import("node:os")
  const nodeFs = await import("node:fs")
  const path = await import("node:path")
  h.dest = nodeFs.mkdtempSync(path.join(os.tmpdir(), "v2-upload-auth-"))

  type Mw = express.RequestHandler
  const instrument =
    (label: string, real: Mw): Mw =>
    (req, res, next) => {
      h.calls.push(label)
      real(req, res, (err?: unknown) => {
        if (err) return next(err)
        const files = [
          ...(req.file ? [req.file] : []),
          ...((req.files as Express.Multer.File[] | undefined) ?? []),
        ]
        res.status(202).json({
          reachedAfterMulter: true,
          files: files.map((f) => f.path),
        })
      })
    }

  const instrumented = (name: string, fileSize: number) => {
    const real = multer({ dest: h.dest, limits: { fileSize } })
    return {
      single: (field: string) =>
        instrument(`${name}.single(${field})`, real.single(field)),
      array: (field: string, max?: number) =>
        instrument(`${name}.array(${field})`, real.array(field, max)),
    }
  }

  return {
    ...original,
    gameDataZipUpload: instrumented("gameDataZipUpload", 50 * 1000 * 1000),
    multiplePhotoUpload: instrumented("multiplePhotoUpload", 5 * 1000 * 1000),
  }
})

function makeUser(overrides: Partial<User> = {}): User {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    username: "tester",
    role: "user",
    banned: false,
    rsi_confirmed: true,
    ...overrides,
  } as User
}

const USERS: Record<string, User> = {
  user: makeUser(),
  admin: makeUser({ role: "admin" }),
  banned: makeUser({ banned: true }),
}

const UPLOAD_ROUTES = [
  { path: "/api/v2/admin/import-game-data", field: "file", name: "a.zip" },
  {
    path: "/api/v2/listings/11111111-1111-1111-1111-111111111111/photos",
    field: "photos",
    name: "a.png",
  },
  { path: "/api/v2/images/upload", field: "photo", name: "a.png" },
]

describe("v2 upload routes: auth runs before multer", () => {
  let app: express.Express

  beforeAll(async () => {
    // The generated routes transitively import the CDN client, which throws at
    // module load without B2 credentials (see route-ordering.test.ts).
    process.env.B2_KEY_ID ||= "test-key-id"
    process.env.B2_APP_KEY ||= "test-app-key"

    const { apiV2Router } = await import("./api-router.js")
    app = express()
    // Stand-in for populate-user: the real one resolves sessions/tokens from
    // the database. Here the test picks the caller via a header.
    app.use((req, _res, next) => {
      const who = req.header("x-test-user")
      if (who) req.user = USERS[who]
      next()
    })
    app.use("/api/v2", apiV2Router)
  })

  beforeEach(() => {
    h.calls.length = 0
    for (const f of fs.readdirSync(h.dest)) fs.rmSync(`${h.dest}/${f}`)
  })

  afterAll(() => {
    fs.rmSync(h.dest, { recursive: true, force: true })
  })

  const filePayload = Buffer.alloc(4096, 0x41)

  describe.each(UPLOAD_ROUTES)("POST $path", ({ path, field, name }) => {
    it("anonymous multipart request -> 401, multer never runs, nothing written", async () => {
      const res = await request(app).post(path).attach(field, filePayload, name)

      expect(res.status).toBe(401)
      expect(res.body?.error?.code).toBe("UNAUTHORIZED")
      expect(h.calls).toEqual([])
      expect(fs.readdirSync(h.dest)).toEqual([])
    })

    it("banned user -> rejected before multer", async () => {
      const res = await request(app)
        .post(path)
        .set("x-test-user", "banned")
        .attach(field, filePayload, name)

      expect(res.status).toBe(401)
      expect(h.calls).toEqual([])
      expect(fs.readdirSync(h.dest)).toEqual([])
    })
  })

  it("non-admin on the admin import route -> 403 before multer", async () => {
    const res = await request(app)
      .post("/api/v2/admin/import-game-data")
      .set("x-test-user", "user")
      .attach("file", filePayload, "a.zip")

    expect(res.status).toBe(403)
    expect(res.body?.error?.code).toBe("FORBIDDEN")
    expect(h.calls).toEqual([])
    expect(fs.readdirSync(h.dest)).toEqual([])
  })

  // Positive controls: with a permitted caller multer does run and does write a
  // temp file, so the "nothing written" assertions above are meaningful.
  it.each([
    ["admin", UPLOAD_ROUTES[0], "gameDataZipUpload.single(file)"],
    ["user", UPLOAD_ROUTES[1], "multiplePhotoUpload.array(photos)"],
    ["user", UPLOAD_ROUTES[2], "multiplePhotoUpload.single(photo)"],
  ] as const)(
    "%s caller reaches multer on %s",
    async (who, { path, field, name }, label) => {
      const res = await request(app)
        .post(path)
        .set("x-test-user", who)
        .attach(field, filePayload, name)

      expect(res.status).toBe(202)
      expect(h.calls).toEqual([label])
      expect(res.body.files).toHaveLength(1)
      expect(fs.readdirSync(h.dest)).toHaveLength(1)
    },
  )

  it("admin import job listing (GET) is not routed through multer", async () => {
    // Previously multer was mounted with .use() and so sat on every method and
    // sub-path of /admin/import-game-data. Unauthenticated GET goes straight to
    // TSOA's own @Security check.
    const res = await request(app).get("/api/v2/admin/import-game-data")
    expect(res.status).toBe(401)
    expect(h.calls).toEqual([])
  })

  it("the removed dev import route is gone (404), in any NODE_ENV", async () => {
    expect(process.env.NODE_ENV).not.toBe("production")

    const res = await request(app)
      .post("/api/v2/dev/import-game-data")
      .attach("file", filePayload, "a.zip")

    expect(res.status).toBe(404)
    expect(h.calls).toEqual([])
    expect(fs.readdirSync(h.dest)).toEqual([])
  })
})
