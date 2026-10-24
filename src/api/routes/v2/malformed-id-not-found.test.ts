/**
 * By-id GETs on uuid columns must answer 404 — not 500 — for ids that are
 * neither a UUID nor a resolvable short-slug (Postgres throws 22P02 when such a
 * value is bound to a uuid column). The guard must run before any query.
 *
 * Named without "Controller" so it is not swept up by the vitest exclusion for
 * DB-backed v2 controller tests.
 */

import { describe, it, expect, vi } from "vitest"
import type { Request as ExpressRequest } from "express"

const queried = vi.hoisted(() => [] as string[])

vi.mock("../../../clients/database/knex-db.js", () => {
  const knex: any = (table: string) => {
    queried.push(table)
    throw new Error(`unexpected query on ${table}`)
  }
  knex.raw = () => ({})
  return { getKnex: () => knex, database: { knex } }
})

vi.mock("../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))

import { GameItemsV2Controller } from "./game-items/GameItemsV2Controller.js"
import { ResourcesController } from "./game-data/resources/ResourcesController.js"
import { BuyOrdersV2Controller } from "./buy-orders/BuyOrdersV2Controller.js"
import { NotFoundError } from "../v1/util/errors.js"

const MALFORMED = ["does-not-exist", "123", "not-a-uuid-at-all"]

describe("malformed ids answer 404 without touching the database", () => {
  it.each(MALFORMED)("GET /game-items/%s/listings", async (id) => {
    await expect(new GameItemsV2Controller().getListings(id)).rejects.toBeInstanceOf(NotFoundError)
    expect(queried).toEqual([])
  })

  it.each(MALFORMED)("GET /game-data/resources/%s", async (id) => {
    await expect(new ResourcesController().getResource(id)).rejects.toBeInstanceOf(NotFoundError)
    expect(queried).toEqual([])
  })

  it.each(MALFORMED)("GET /buy-orders/%s", async (id) => {
    await expect(
      new BuyOrdersV2Controller().getBuyOrderDetail({} as ExpressRequest, id),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(queried).toEqual([])
  })
})
