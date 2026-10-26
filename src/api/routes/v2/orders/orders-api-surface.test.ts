/**
 * POST /api/v2/orders was removed: no client called it, and it could not
 * create an order anyway (it wrote created_at/updated_at, which orders does
 * not have, and left out the required kind and cost). Orders come from
 * accepted offers (cart checkout), Buy now (POST /buy-orders) and buy-order
 * fulfilment. The generated spec is what the frontend client is built from.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const spec = JSON.parse(
  readFileSync(new URL("../generated/swagger.json", import.meta.url), "utf8"),
) as { paths: Record<string, Record<string, unknown>> }

describe("v2 orders API surface", () => {
  it("has no POST /orders", () => {
    expect(Object.keys(spec.paths["/orders"])).toEqual(["get"])
  })
})
