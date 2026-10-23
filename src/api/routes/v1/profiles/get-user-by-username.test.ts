/**
 * HTTP-level tests for GET /api/profile/user/:username (profile_get_user_username).
 *
 * An unknown username is a missing resource: it must answer 404 NOT_FOUND,
 * not the legacy 400 {"error":"Invalid user"}.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("./database.js", () => ({ findUser: vi.fn(), getUser: vi.fn() }))
vi.mock("./serializers.js", () => ({
  serializePublicProfile: vi.fn(async (user: { username: string }) => ({
    username: user.username,
  })),
  serializeDetailedProfile: vi.fn(),
}))

import { profile_get_user_username } from "./controller.js"
import * as profileDb from "./database.js"
import { serializePublicProfile } from "./serializers.js"

const findUser = profileDb.findUser as unknown as Mock
const serialize = serializePublicProfile as unknown as Mock

function app() {
  const a = express()
  a.get("/user/:username", profile_get_user_username)
  return a
}

describe("GET /user/:username", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the public profile for a known user", async () => {
    findUser.mockResolvedValue({ user_id: "u-1", username: "alice" })

    const res = await request(app()).get("/user/alice")

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ username: "alice" })
    expect(findUser).toHaveBeenCalledWith({ username: "alice" }, { noBalance: true })
  })

  it("returns 404 NOT_FOUND for an unknown username", async () => {
    findUser.mockResolvedValue(null)

    const res = await request(app()).get("/user/nobody-here")

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe("NOT_FOUND")
    expect(serialize).not.toHaveBeenCalled()
  })

  it("returns 500 when serialization fails for an existing user", async () => {
    findUser.mockResolvedValue({ user_id: "u-1", username: "alice" })
    serialize.mockRejectedValueOnce(new Error("boom"))

    const res = await request(app()).get("/user/alice")

    expect(res.status).toBe(500)
  })
})
