/**
 * Citizen ID sign-up when the RSI handle or Spectrum ID is already taken.
 * An unverified holder of the handle used to fall through to the insert,
 * hit accounts_username_key, and surface the raw Postgres error as a
 * generic login failure. Every holder is now USERNAME_TAKEN, and a race on
 * either unique constraint maps to the same handled errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { Roles, RSIClaimKeys } from "passport-citizenid"

const h = vi.hoisted(() => ({
  byUsername: null as unknown,
  bySpectrum: null as unknown,
  createError: null as unknown,
  created: 0,
}))

vi.mock("../routes/v1/profiles/database.js", () => ({
  getUserByProvider: async () => null,
  findUser: async (where: Record<string, string>) =>
    where.username ? h.byUsername : where.spectrum_user_id ? h.bySpectrum : null,
  createUserWithProvider: async () => {
    if (h.createError) throw h.createError
    h.created++
    return { user_id: "new-user" }
  },
  updateUser: async () => [],
  getUserProviders: async () => [],
  linkProvider: async () => ({}),
  getUser: async () => ({ user_id: "new-user" }),
}))
vi.mock("../../clients/cdn/cdn.js", () => ({ cdn: { createExternalResource: async () => null } }))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { createCitizenIDVerifyCallback } from "./passport-strategies.js"
import { CitizenIDErrorCodes } from "./auth-helpers.js"

const profile = {
  id: "cid-sub",
  roles: [Roles.STATUS_VERIFIED],
  rsi: { [RSIClaimKeys.USERNAME]: "Handle", [RSIClaimKeys.SPECTRUM_ID]: "1001" },
}

async function signUp(): Promise<{ error: (Error & { code?: string }) | null; user: unknown }> {
  const verify = createCitizenIDVerifyCallback(false)
  const req = { session: { citizenid_auth_action: "signup" }, language: "en" }
  return new Promise((resolve) => {
    void verify(req as never, "at", "rt", profile as never, ((error: Error | null, user: unknown) =>
      resolve({ error: error as (Error & { code?: string }) | null, user })) as never)
  })
}

beforeEach(() => {
  h.byUsername = null
  h.bySpectrum = null
  h.createError = null
  h.created = 0
})

describe("Citizen ID sign-up conflicts", () => {
  it("an unverified holder of the handle is USERNAME_TAKEN, not a database error", async () => {
    h.byUsername = { user_id: "holder", rsi_confirmed: false }
    const { error } = await signUp()
    expect(error?.code).toBe(CitizenIDErrorCodes.USERNAME_TAKEN)
    expect(h.created).toBe(0)
  })

  it("a verified holder is USERNAME_TAKEN, as before", async () => {
    h.byUsername = { user_id: "holder", rsi_confirmed: true }
    expect((await signUp()).error?.code).toBe(CitizenIDErrorCodes.USERNAME_TAKEN)
  })

  it("a Spectrum ID held elsewhere is ALREADY_LINKED, as before", async () => {
    h.bySpectrum = { user_id: "holder" }
    expect((await signUp()).error?.code).toBe(CitizenIDErrorCodes.ALREADY_LINKED)
  })

  it("a race on accounts_username_key maps to USERNAME_TAKEN", async () => {
    h.createError = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "accounts_username_key" })
    const { error } = await signUp()
    expect(error?.code).toBe(CitizenIDErrorCodes.USERNAME_TAKEN)
    expect(error?.message).not.toContain("duplicate key")
  })

  it("a race on accounts_spectrum_user_id_unique maps to ALREADY_LINKED", async () => {
    h.createError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "accounts_spectrum_user_id_unique",
    })
    expect((await signUp()).error?.code).toBe(CitizenIDErrorCodes.ALREADY_LINKED)
  })

  it("other database errors still fail the login", async () => {
    h.createError = Object.assign(new Error("boom"), { code: "57014", constraint: "x" })
    const { error } = await signUp()
    expect(error?.message).toBe("boom")
  })

  it("no conflict creates the account", async () => {
    const { error, user } = await signUp()
    expect(error).toBeNull()
    expect(user).toEqual({ user_id: "new-user" })
    expect(h.created).toBe(1)
  })
})
