/**
 * Characterization: the offer access rules as they behave today, through the
 * real helpers (userRelatedToOffer, is_related_to_offer,
 * can_respond_to_offer_helper). Written before the rules moved into
 * services/orders/, so the move can't change who may do what.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

const h = vi.hoisted(() => ({ perms: {} as Record<string, string[]> }))

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async (org: string, user: string, perm: string) =>
    (h.perms[user] ?? []).includes(`${org}:${perm}`),
  ),
  is_member: vi.fn(),
}))
vi.mock("../orders/helpers.js", () => ({ createOffer: vi.fn() }))

const { userRelatedToOffer, is_related_to_offer, can_respond_to_offer_helper } =
  await import("./helpers.js")

type Actor =
  | "admin"
  | "assignee"
  | "customer"
  | "manager"
  | "claimer"
  | "stranger"
const ACTORS: Actor[] = [
  "admin",
  "assignee",
  "customer",
  "manager",
  "claimer",
  "stranger",
]
const USERS: Record<Actor, { user_id: string; role: string }> = {
  admin: { user_id: "admin", role: "admin" },
  assignee: { user_id: "assignee", role: "user" },
  customer: { user_id: "customer", role: "user" },
  manager: { user_id: "manager", role: "user" },
  claimer: { user_id: "claimer", role: "user" },
  stranger: { user_id: "stranger", role: "user" },
}

function session(kind: "personal" | "org", status = "active") {
  return {
    id: "s1",
    customer_id: "customer",
    assigned_id: "assignee",
    contractor_id: kind === "org" ? "org-1" : null,
    status,
  } as never
}

beforeEach(() => {
  h.perms = {
    manager: ["org-1:manage_orders"],
    claimer: ["org-1:claim_orders"],
  }
})

describe("offer access", () => {
  it("userRelatedToOffer (offer routes, public API): customer, assignee, admin, or org manage_orders / claim_orders", async () => {
    const rows: string[] = []
    for (const kind of ["personal", "org"] as const)
      for (const a of ACTORS)
        rows.push(
          `${kind} ${a}: ${await userRelatedToOffer(session(kind), USERS[a] as never)}`,
        )
    expect(rows).toMatchInlineSnapshot(`
      [
        "personal admin: true",
        "personal assignee: true",
        "personal customer: true",
        "personal manager: false",
        "personal claimer: false",
        "personal stranger: false",
        "org admin: true",
        "org assignee: true",
        "org customer: true",
        "org manager: true",
        "org claimer: true",
        "org stranger: false",
      ]
    `)
  })

  it("is_related_to_offer (chat access): customer, assignee, or org manage_orders; no admin bypass of its own", async () => {
    const rows: string[] = []
    for (const kind of ["personal", "org"] as const)
      for (const a of ACTORS)
        rows.push(
          `${kind} ${a}: ${await is_related_to_offer(USERS[a].user_id, session(kind))}`,
        )
    expect(rows).toMatchInlineSnapshot(`
      [
        "personal admin: false",
        "personal assignee: true",
        "personal customer: true",
        "personal manager: false",
        "personal claimer: false",
        "personal stranger: false",
        "org admin: false",
        "org assignee: true",
        "org customer: true",
        "org manager: true",
        "org claimer: false",
        "org stranger: false",
      ]
    `)
  })

  it("can_respond_to_offer_helper: whose turn it is", async () => {
    const rows: string[] = []
    for (const kind of ["personal", "org"] as const)
      for (const lastBy of ["customer", "assignee"])
        for (const a of ACTORS)
          rows.push(
            `${kind} last=${lastBy} ${a}: ${await can_respond_to_offer_helper(
              session(kind),
              { actor_id: lastBy } as never,
              USERS[a] as never,
            )}`,
          )
    // On an org offer the assignee does NOT get a turn of their own: only
    // manage_orders (which an acting admin has through has_permission).
    expect(rows).toMatchInlineSnapshot(`
      [
        "personal last=customer admin: false",
        "personal last=customer assignee: true",
        "personal last=customer customer: false",
        "personal last=customer manager: false",
        "personal last=customer claimer: false",
        "personal last=customer stranger: false",
        "personal last=assignee admin: false",
        "personal last=assignee assignee: false",
        "personal last=assignee customer: true",
        "personal last=assignee manager: false",
        "personal last=assignee claimer: false",
        "personal last=assignee stranger: false",
        "org last=customer admin: false",
        "org last=customer assignee: false",
        "org last=customer customer: false",
        "org last=customer manager: true",
        "org last=customer claimer: false",
        "org last=customer stranger: false",
        "org last=assignee admin: false",
        "org last=assignee assignee: false",
        "org last=assignee customer: true",
        "org last=assignee manager: false",
        "org last=assignee claimer: false",
        "org last=assignee stranger: false",
      ]
    `)
  })

  it("can_respond_to_offer_helper: nobody may respond to a session that isn't active", async () => {
    for (const status of ["closed", "accepted", "rejected"])
      for (const a of ACTORS)
        expect(
          await can_respond_to_offer_helper(
            session("personal", status),
            { actor_id: "customer" } as never,
            USERS[a] as never,
          ),
        ).toBe(false)
  })
})
