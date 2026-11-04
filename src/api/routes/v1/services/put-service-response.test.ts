/**
 * PUT /api/services/{id} answers 200 `{ data: { result: "Success" } }`, like
 * the other v1 updates; the spec said 204 (no content), which the route never
 * sent and the site's client does not expect.
 */

import { describe, it, expect, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"
import { createRequire } from "node:module"

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(), removeResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("./database.js", () => ({
  getService: vi.fn(async () => ({
    service_id: "s1",
    user_id: "owner",
    contractor_id: null,
  })),
  updateService: vi.fn(),
}))

const { services_put_service_id } = await import("./controller.js")
const { services_put_service_id_spec } = await import("./openapi.js")
const serviceDb = await import("./database.js")
const { get: getSchema } = createRequire(import.meta.url)(
  "@wesleytodd/openapi/lib/layer-schema.js",
) as { get: (m: unknown) => { responses: Record<string, any> } }

describe("PUT /api/services/{id}", () => {
  it("answers 200 with the data wrapper, and the spec says so", async () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response & { status: Mock; json: Mock }
    const req = {
      user: { user_id: "owner" },
      params: { service_id: "s1" },
      body: { service_name: "Hauling", cost: 100, payment_type: "one-time" },
    } as unknown as Request
    await services_put_service_id(req, res, vi.fn())
    expect(serviceDb.updateService).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ data: { result: "Success" } })

    const { responses } = getSchema(services_put_service_id_spec)
    expect(Object.keys(responses).filter((c) => c.startsWith("2"))).toEqual([
      "200",
    ])
    const schema = responses["200"].content["application/json"].schema
    expect(schema.required).toEqual(["data"])
    expect(schema.properties.data.properties.result.type).toBe("string")
  })
})
