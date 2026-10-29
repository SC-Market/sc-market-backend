/**
 * GET /game-data/blueprints/{id}/org-owners/{spectrum_id} (which members own
 * a blueprint) and GET /listings/inventory-summary?spectrum_id= (an org's
 * listed stock) answered any signed-in user, member or not. The site only
 * asks for the viewer's own org; they are members-only now, and an API token
 * needs the org in its grant (is_member applies it).
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => {
  process.env.B2_KEY_ID ||= "test"
  process.env.B2_APP_KEY ||= "test"
  return { db: null as unknown }
})
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../v1/contractors/database.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // "member" belongs to org-1; nobody else does.
  getContractorMembers: vi.fn(async ({ user_id }: { user_id: string }) =>
    user_id === "member" ? [{ user_id }] : [],
  ),
}))

const { BlueprintsController } = await import("../game-data/blueprints/BlueprintsController.js")
const { ListingsV2Controller } = await import("../listings/ListingsV2Controller.js")
const { withRequestContext } = await import("../../../util/request-context.js")

let tracker: Tracker
beforeEach(() => {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.select(/from "contractors"/).response([{ contractor_id: "org-1" }])
  tracker.on.select(() => true).response([])
})

type Who = "session" | "no-org" | "org-1"
function req(userId: string, who: Who) {
  return {
    user: { user_id: userId, role: "user", rsi_confirmed: true },
    __tokenInfo:
      who === "session"
        ? undefined
        : { id: "t", name: "t", scopes: ["market:read", "profile:read"], contractor_ids: who === "org-1" ? ["org-1"] : [] },
  } as never
}

const calls = {
  "org-owners": (r: never) => new BlueprintsController().getOrgBlueprintOwners(
    "00000000-0000-4000-8000-000000000001", "ORG1", r),
  "inventory-summary": (r: never) => new ListingsV2Controller().getInventorySummary("ORG1", r),
}

describe.each(Object.entries(calls))("%s for an org", (_name, call) => {
  const run = (userId: string, who: Who) => {
    const r = req(userId, who)
    return withRequestContext(r, () => call(r))
  }

  it("refuses non-members", async () => {
    await expect(run("stranger", "session")).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("refuses a member's token that wasn't granted the org", async () => {
    await expect(run("member", "no-org")).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("serves members: sessions and tokens granted the org", async () => {
    await expect(run("member", "session")).resolves.toBeDefined()
    await expect(run("member", "org-1")).resolves.toBeDefined()
  })
})

it("inventory-summary without spectrum_id still serves the personal shop", async () => {
  await expect(new ListingsV2Controller().getInventorySummary(undefined, req("stranger", "no-org"))).resolves.toEqual({
    materials: [],
  })
})
