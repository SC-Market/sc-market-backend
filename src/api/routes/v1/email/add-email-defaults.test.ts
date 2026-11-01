/**
 * POST /api/v1/profile/email: adding an email with no notification types
 * picked (the onboarding page, or nothing ticked in the dialog) turns the key
 * email events on (services/notify/email-defaults.ts); a picked list is the
 * user's choice and gets no defaults.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  defaultsCalls: [] as string[],
  defaultsError: null as unknown,
  upserts: [] as unknown[][],
}))

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => () => ({}),
  database: { setStrategy: () => {} },
}))
vi.mock("../../../../services/notify/email-defaults.js", () => ({
  applyKeyEmailDefaults: async (userId: string) => {
    h.defaultsCalls.push(userId)
    if (h.defaultsError) throw h.defaultsError
    return ["order_status_fulfilled", "dm_reminder"]
  },
}))
vi.mock("./user-email-database.js", () => ({
  getPrimaryEmail: async () => null,
  getUserEmailByAddress: async () => null,
  createUserEmail: async (_u: string, email: string) => ({
    email_id: "e1",
    email,
    email_verified: false,
  }),
  deleteUserEmail: async () => true,
}))
vi.mock("./database.js", () => ({
  upsertEmailPreference: async (...args: unknown[]) => {
    h.upserts.push(args)
    return {}
  },
}))
vi.mock("../notifications/database.js", () => ({
  getAllNotificationActions: async () => [
    { action_type_id: "19", action: "offer_create" },
  ],
}))
vi.mock("../../../../services/email/email.service.js", () => ({
  emailService: {
    validateEmail: () => true,
    sendVerificationEmail: async () => undefined,
  },
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

import { addEmail } from "./controller.js"

function call(body: Record<string, unknown>) {
  const res: { statusCode?: number; body?: any; status: any; json: any } = {
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }
  const req = { user: { user_id: "u1" }, body } as any
  return (addEmail as any)(req, res, () => {}).then(() => res)
}

beforeEach(() => {
  h.defaultsCalls = []
  h.defaultsError = null
  h.upserts = []
})

describe("addEmail key email defaults", () => {
  it("no types picked: key defaults are applied for the user", async () => {
    const res = await call({ email: "a@example.com", notificationTypeIds: [] })
    expect(res.statusCode).toBe(201)
    expect(h.defaultsCalls).toEqual(["u1"])
    expect(h.upserts).toEqual([])
    expect(res.body.data.preferences_created).toBe(2)
  })

  it("no notificationTypeIds field at all: same as nothing picked", async () => {
    await call({ email: "a@example.com" })
    expect(h.defaultsCalls).toEqual(["u1"])
  })

  it("types picked: only the picked ones are written, no defaults", async () => {
    const res = await call({
      email: "a@example.com",
      notificationTypeIds: [19],
    })
    expect(res.statusCode).toBe(201)
    expect(h.defaultsCalls).toEqual([])
    expect(h.upserts).toHaveLength(1)
    expect(h.upserts[0].slice(0, 3)).toEqual(["u1", 19, true])
  })

  it("a failure writing defaults doesn't fail adding the email", async () => {
    h.defaultsError = new Error("db down")
    const res = await call({ email: "a@example.com", notificationTypeIds: [] })
    expect(res.statusCode).toBe(201)
    expect(res.body.data.preferences_created).toBe(0)
  })
})
