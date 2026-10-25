/**
 * The user loaders must carry `banned`: every ban check (populateUser,
 * userAuthorized, refresh, the v2 auth handler) reads it from what these
 * return, so leaving it out meant banned users were never blocked.
 */

import { describe, it, expect, vi } from "vitest"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const db = createFakeKnex({
  accounts: [
    { user_id: "u-banned", username: "banned", role: "user", banned: true },
    { user_id: "u-ok", username: "ok", role: "user", banned: false },
  ],
})

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => db,
  database: {},
}))

// The shared test setup mocks this module; these tests need the real loaders.
const { getUser, findUser, getLogin } =
  await vi.importActual<typeof import("./database.js")>("./database.js")

describe("user loaders expose banned", () => {
  it.each([
    ["getUser", getUser],
    ["findUser", findUser],
    ["getLogin", getLogin],
  ] as const)("%s", async (_name, load) => {
    expect((await load({ user_id: "u-banned" }))?.banned).toBe(true)
    expect((await load({ user_id: "u-ok" }))?.banned).toBe(false)
  })
})
