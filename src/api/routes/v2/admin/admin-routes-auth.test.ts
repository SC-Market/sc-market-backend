/**
 * Every v2 admin route (every /admin/* operation in the generated spec,
 * including the ones moved from v1 /api/admin and /api/moderation/admin):
 * - anonymous -> 401
 * - signed-in non-admin -> 403
 * - an admin's API token without the `admin` scope -> 403
 * With admin MFA enforced, the step-up routes refuse a session that has not
 * stepped up and an admin-scoped API token (tokens can never step up), with
 * 403 MFA_STEP_UP_REQUIRED.
 * Positive controls: an admin gets past every gate (per route group), and a
 * session that just stepped up gets past the step-up.
 *
 * The rate limiters are stubbed, the caller is picked by header (a stand-in
 * for populate-user), and the database is a stub that throws: a request that
 * reaches a handler ends in 500, never in a real query.
 */
import { beforeAll, describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { User } from "../../v1/api-models.js"

const h = vi.hoisted(() => ({ enforcement: "off" as "off" | "enforce" }))

vi.mock("../../../middleware/tsoa-ratelimit.js", () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next()
  return {
    tsoaReadRateLimit: pass,
    tsoaWriteRateLimit: pass,
    tsoaCriticalRateLimit: pass,
  }
})

vi.mock("../../../../services/mfa/config.js", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, getMfaEnforcement: () => h.enforcement }
})

vi.mock("../../../../clients/database/knex-db.js", () => {
  const reached = (): never => {
    throw new Error("DB_REACHED")
  }
  // getKnex() itself works (callers pass it around); any query throws.
  const knex = new Proxy(function () {}, {
    apply: reached,
    get: (_t, prop) => (prop === "then" ? undefined : reached()),
  })
  return {
    getKnex: () => knex,
    createDedicatedKnex: reached,
    withPoolOverride: <T>(_knex: unknown, fn: () => T): T => fn(),
    KnexDatabase: class {},
    database: {
      get knex() {
        return reached()
      },
    },
  }
})

vi.mock("../../../../services/mfa/instance.js", () => ({
  getMfaService: () => ({
    mfaChangedAt: async () => null,
    isEnrolled: async () => true,
  }),
  setMfaService: () => {},
}))

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
  admin: makeUser({ role: "admin", username: "boss" }),
}

const ID = "11111111-1111-4111-8111-111111111111"

interface Operation {
  method: "get" | "post" | "put" | "patch" | "delete"
  path: string
}

const spec = JSON.parse(
  readFileSync(join(__dirname, "..", "generated", "swagger.json"), "utf-8"),
) as { paths: Record<string, Record<string, unknown>> }

const ADMIN_OPERATIONS: Operation[] = Object.entries(spec.paths)
  .filter(([path]) => path.startsWith("/admin/") || path === "/admin")
  .flatMap(([path, ops]) =>
    Object.keys(ops).map((method) => ({
      method: method as Operation["method"],
      path,
    })),
  )

function url(path: string): string {
  return "/api/v2" + path.replace(/\{[^}]+\}/g, ID)
}

describe("v2 admin routes: auth", () => {
  let app: express.Express

  beforeAll(async () => {
    // The generated routes import the CDN client, which needs B2 keys at load.
    process.env.B2_KEY_ID ||= "test-key-id"
    process.env.B2_APP_KEY ||= "test-app-key"
    const { apiV2Router } = await import("../api-router.js")
    const { errorHandler } =
      await import("../../../middleware/error-handler.js")
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      const who = req.header("x-test-user")
      if (who) req.user = USERS[who]
      const scopes = req.header("x-test-token-scopes")
      if (scopes !== undefined) {
        req.__tokenInfo = {
          id: "tok",
          name: "test",
          scopes: scopes.split(","),
          contractor_ids: [],
        }
        req.auth = {
          method: "token",
          tokenKind: "legacy",
          tokenScopes: scopes.split(","),
          tokenMfaAt: new Date(),
        }
      }
      if (req.header("x-test-stepped-up")) {
        req.auth = { method: "session", mfaAt: Date.now() / 1000 }
      }
      next()
    })
    app.use("/api/v2", apiV2Router)
    // Coded errors (MFA_STEP_UP_REQUIRED…) are rendered by the main handler.
    app.use(errorHandler)
  })

  it("covers the routes moved from v1", () => {
    const keys = new Set(ADMIN_OPERATIONS.map((o) => `${o.method} ${o.path}`))
    for (const moved of [
      "get /admin/activity",
      "get /admin/users",
      "get /admin/membership/analytics",
      "get /admin/offers/analytics",
      "get /admin/audit-logs",
      "post /admin/notifications/test",
      "get /admin/alerts",
      "post /admin/alerts",
      "get /admin/alerts/{alert_id}",
      "patch /admin/alerts/{alert_id}",
      "delete /admin/alerts/{alert_id}",
      "get /admin/premium",
      "get /admin/premium/{spectrum_id}",
      "put /admin/premium/{spectrum_id}",
      "patch /admin/premium/{spectrum_id}/domain",
      "delete /admin/premium/{spectrum_id}",
      "get /admin/spectrum-migration/status",
      "post /admin/spectrum-migration/simulate",
      "post /admin/spectrum-migration/migrate",
      "post /admin/spectrum-migration/rollback",
      "get /admin/moderation/reports",
      "put /admin/moderation/reports/{report_id}",
    ]) {
      expect(keys).toContain(moved)
    }
  })

  describe.each(ADMIN_OPERATIONS)("$method $path", ({ method, path }) => {
    it("anonymous -> 401", async () => {
      const res = await request(app)[method](url(path)).send({})
      expect(res.status).toBe(401)
    })

    it("non-admin -> 403", async () => {
      const res = await request(app)
        [method](url(path))
        .set("x-test-user", "user")
        .send({})
      expect(res.status).toBe(403)
      expect(res.body?.error?.code).toBe("FORBIDDEN")
    })

    it("admin's token without the admin scope -> 403", async () => {
      const res = await request(app)
        [method](url(path))
        .set("x-test-user", "admin")
        .set("x-test-token-scopes", "full")
        .send({})
      expect(res.status).toBe(403)
    })
  })

  // Positive controls: one read per moved controller (and the older admin
  // groups), as an admin session. Reaching the handler (the DB stub makes it
  // a 500) proves the gates let an admin through, so the 403s above are not
  // a gate that refuses everyone.
  it.each([
    "/admin/activity",
    "/admin/users",
    "/admin/membership/analytics",
    "/admin/offers/analytics",
    "/admin/audit-logs",
    "/admin/alerts",
    "/admin/alerts/{alert_id}",
    "/admin/premium",
    "/admin/premium/{spectrum_id}",
    "/admin/spectrum-migration/status",
    "/admin/moderation/reports",
    "/admin/orders/analytics",
    "/admin/storefront-enquiries",
  ])("admin session passes the gates on GET %s", async (path) => {
    const res = await request(app).get(url(path)).set("x-test-user", "admin")
    expect([401, 403]).not.toContain(res.status)
  })

  it("an admin token with the admin scope passes the gates on a read", async () => {
    const res = await request(app)
      .get(url("/admin/activity"))
      .set("x-test-user", "admin")
      .set("x-test-token-scopes", "admin")
    expect([401, 403]).not.toContain(res.status)
  })

  describe("step-up routes (admin MFA enforced)", () => {
    const STEP_UP: Array<Operation & { body?: object }> = [
      {
        method: "put",
        path: "/admin/premium/{spectrum_id}",
        body: { tier: "white_label" },
      },
      {
        method: "patch",
        path: "/admin/premium/{spectrum_id}/domain",
        body: { custom_domain: null },
      },
      { method: "delete", path: "/admin/premium/{spectrum_id}" },
      { method: "post", path: "/admin/spectrum-migration/migrate", body: {} },
      {
        method: "post",
        path: "/admin/spectrum-migration/rollback",
        body: { confirm: true },
      },
      {
        method: "put",
        path: "/admin/moderation/reports/{report_id}",
        body: { status: "resolved" },
      },
      {
        method: "post",
        path: "/admin/alerts",
        body: { title: "T", content: "C", target_type: "admins_only" },
      },
      {
        method: "patch",
        path: "/admin/alerts/{alert_id}",
        body: { active: false },
      },
      { method: "delete", path: "/admin/alerts/{alert_id}" },
      {
        method: "post",
        path: "/admin/notifications/test",
        body: { notification_type: "admin_alert", target_username: "someone" },
      },
    ]

    async function call(
      { method, path, body }: Operation & { body?: object },
      headers: Record<string, string>,
    ) {
      h.enforcement = "enforce"
      try {
        let req = request(app)[method](url(path))
        for (const [k, v] of Object.entries(headers)) req = req.set(k, v)
        return await req.send(body ?? {})
      } finally {
        h.enforcement = "off"
      }
    }

    it.each(STEP_UP)(
      "$method $path: session without a recent MFA -> 403 MFA_STEP_UP_REQUIRED",
      async (op) => {
        const res = await call(op, { "x-test-user": "admin" })
        expect(res.status).toBe(403)
        expect(res.body?.error?.code).toBe("MFA_STEP_UP_REQUIRED")
      },
    )

    it.each(STEP_UP)(
      "$method $path: admin-scoped API token -> 403 MFA_STEP_UP_REQUIRED",
      async (op) => {
        const res = await call(op, {
          "x-test-user": "admin",
          "x-test-token-scopes": "admin",
        })
        expect(res.status).toBe(403)
        expect(res.body?.error?.code).toBe("MFA_STEP_UP_REQUIRED")
      },
    )

    it.each(STEP_UP)(
      "$method $path: session that just stepped up gets past the step-up",
      async (op) => {
        const res = await call(op, {
          "x-test-user": "admin",
          "x-test-stepped-up": "1",
        })
        expect([401, 403]).not.toContain(res.status)
      },
    )
  })
})
