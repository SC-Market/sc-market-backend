/**
 * HTTP-level tests for DELETE /alert-subscriptions/:channel_id (bot
 * /unsubscribe alerts). Deleting used to key on channel_id alone, so anyone
 * who could run a slash command in an alert channel could switch it off.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import express from "express"
import request from "supertest"
import { createFakeKnex, type FakeKnex } from "../../test-utils/fake-knex-tables.js"

const state: { db: FakeKnex } = { db: createFakeKnex() }

vi.mock("../database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {},
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUserByDiscordId: vi.fn(),
}))
vi.mock("../../api/routes/v1/contractors/database.js", () => ({}))
vi.mock("../../api/routes/v1/util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(async () => false),
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { subscriptionRouter } from "./subscriptions.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"
import { has_permission } from "../../api/routes/v1/util/permissions.js"

const getUserByDiscordId = profileDb.getUserByDiscordId as unknown as Mock
const hasPermission = has_permission as unknown as Mock

const usersByDiscord: Record<string, unknown> = {
  "d-creator": { user_id: "creator-1", role: "user" },
  "d-owner": { user_id: "owner-1", role: "user" },
  "d-manager": { user_id: "manager-1", role: "user" },
  "d-member": { user_id: "member-1", role: "user" },
  "d-admin": { user_id: "admin-1", role: "admin" },
}

function seed() {
  state.db = createFakeKnex({
    order_alert_subscriptions: [
      {
        id: "sub-org",
        channel_id: "chan-org",
        guild_id: "g-1",
        contractor_id: "org-1",
        user_id: null,
        created_by_discord_id: "d-creator",
      },
      {
        id: "sub-user",
        channel_id: "chan-user",
        guild_id: "g-1",
        contractor_id: null,
        user_id: "owner-1",
        created_by_discord_id: "d-creator",
      },
    ],
  })
}

function app() {
  const a = express()
  a.use(express.json())
  a.use("/alert-subscriptions", subscriptionRouter)
  return a
}

const remaining = () =>
  state.db.tables.order_alert_subscriptions.map((s) => s.id).sort()

const unsubscribe = (channel: string, body?: object) => {
  const req = request(app()).delete(`/alert-subscriptions/${channel}`)
  return body ? req.send(body) : req
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
  getUserByDiscordId.mockImplementation(async (id: string) => usersByDiscord[id] ?? null)
  hasPermission.mockImplementation(
    async (contractorId: string, userId: string, perm: string) =>
      contractorId === "org-1" && userId === "manager-1" && perm === "manage_orders",
  )
})

describe("DELETE /alert-subscriptions/:channel_id", () => {
  it("rejects a request without discord_id (old bots) and deletes nothing", async () => {
    const res = await unsubscribe("chan-org")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/discord_id/)
    expect(remaining()).toEqual(["sub-org", "sub-user"])
  })

  it("forbids an org member without management rights", async () => {
    const res = await unsubscribe("chan-org", { discord_id: "d-member" })
    expect(res.status).toBe(403)
    expect(remaining()).toEqual(["sub-org", "sub-user"])
  })

  it("forbids a Discord user with no linked account", async () => {
    const res = await unsubscribe("chan-org", { discord_id: "d-unlinked" })
    expect(res.status).toBe(403)
    expect(remaining()).toEqual(["sub-org", "sub-user"])
  })

  it("lets the creator remove it", async () => {
    const res = await unsubscribe("chan-org", { discord_id: "d-creator" })
    expect(res.status).toBe(200)
    expect(remaining()).toEqual(["sub-user"])
  })

  it("lets an org manager remove an org subscription", async () => {
    const res = await unsubscribe("chan-org", { discord_id: "d-manager" })
    expect(res.status).toBe(200)
    expect(hasPermission).toHaveBeenCalledWith("org-1", "manager-1", "manage_orders")
    expect(remaining()).toEqual(["sub-user"])
  })

  it("does not let an org manager remove someone else's personal subscription", async () => {
    const res = await unsubscribe("chan-user", { discord_id: "d-manager" })
    expect(res.status).toBe(403)
    expect(remaining()).toEqual(["sub-org", "sub-user"])
  })

  it("lets the owner of a personal subscription remove it", async () => {
    const res = await unsubscribe("chan-user", { discord_id: "d-owner" })
    expect(res.status).toBe(200)
    expect(remaining()).toEqual(["sub-org"])
  })

  it("lets a site admin remove a personal subscription", async () => {
    const res = await unsubscribe("chan-user", { discord_id: "d-admin" })
    expect(res.status).toBe(200)
    expect(remaining()).toEqual(["sub-org"])
  })

  it("answers 404 for a channel with no subscription", async () => {
    const res = await unsubscribe("chan-none", { discord_id: "d-creator" })
    expect(res.status).toBe(404)
  })
})
