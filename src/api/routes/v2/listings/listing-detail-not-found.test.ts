/**
 * GET /api/v2/listings/{id} with an id that is neither a UUID nor a short-slug
 * (e.g. "does-not-exist") must be a 404. The short-slug middleware lets such
 * ids through untouched, and binding them to listings.listing_id (uuid) makes
 * Postgres throw — which used to surface as a 500.
 *
 * Named without "Controller" so it is not swept up by the vitest exclusion for
 * DB-backed v2 controller tests.
 */

import { describe, it, expect, vi } from "vitest"

const queried = vi.hoisted(() => [] as string[])

vi.mock("../../../../clients/database/knex-db.js", () => {
  const knex: any = (table: string) => {
    queried.push(table)
    throw new Error(`unexpected query on ${table}`)
  }
  knex.raw = () => ({})
  return { getKnex: () => knex, database: { knex } }
})
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

import { ListingsV2Controller } from "./ListingsV2Controller.js"
import { NotFoundError } from "../../v1/util/errors.js"

describe("ListingsV2Controller.getListingDetail", () => {
  it.each(["does-not-exist", "123", "not-a-uuid-at-all"])(
    "throws NotFound for malformed id %s without touching the database",
    async (id) => {
      await expect(new ListingsV2Controller().getListingDetail(id)).rejects.toBeInstanceOf(
        NotFoundError,
      )
      expect(queried).toEqual([])
    },
  )
})
