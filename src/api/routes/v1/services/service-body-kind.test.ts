/**
 * The site labelled a service's type "(Optional)", but the spec only accepts
 * one of the order types, so an empty type was rejected anyway. A service's
 * kind sets its icon and the type filter, and becomes the kind of every order
 * placed from it (OrderBody.kind is required), so ServiceBody requires it too.
 */

import { describe, it, expect, vi } from "vitest"
import type { Request, Response } from "express"

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(), removeResource: vi.fn() },
  external_resource_regex: /^$/,
}))

const { services_post_root_spec, services_put_service_id_spec } =
  await import("./openapi.js")

const body = {
  service_name: "Hauling",
  service_description: "Cargo between Area18 and Lorville",
  title: "Haul",
  rush: false,
  description: "",
  kind: "Transport",
  collateral: 0,
  departure: null,
  destination: null,
  cost: 100,
  payment_type: "one-time",
  status: "active",
  photos: [],
}

async function validate(
  spec: typeof services_post_root_spec,
  b: Record<string, unknown>,
) {
  const req = {
    method: spec === services_post_root_spec ? "POST" : "PUT",
    headers: { "content-type": "application/json" },
    body: b,
    params: { service_id: "s1" },
    query: {},
    // The validator only runs on routed requests.
    route: { path: "/" },
  } as unknown as Request
  return new Promise<unknown>((resolve) =>
    spec(req, {} as Response, (err?: unknown) => resolve(err)),
  )
}

describe("ServiceBody.kind", () => {
  for (const [name, spec] of [
    ["POST /api/services", services_post_root_spec],
    ["PUT /api/services/{id}", services_put_service_id_spec],
  ] as const) {
    it(`${name} accepts an order type`, async () => {
      expect(await validate(spec, body)).toBeUndefined()
    })

    it(`${name} rejects a missing kind`, async () => {
      const withoutKind: Record<string, unknown> = { ...body }
      delete withoutKind.kind
      expect(await validate(spec, withoutKind)).toBeTruthy()
    })

    it(`${name} rejects an empty kind`, async () => {
      expect(await validate(spec, { ...body, kind: "" })).toBeTruthy()
    })
  }
})
