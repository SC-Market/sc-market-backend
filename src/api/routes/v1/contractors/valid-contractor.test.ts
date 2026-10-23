/**
 * Unit tests for the valid_contractor middleware — public GETs like
 * /api/contractors/:spectrum_id must answer 404 (not 400) for an unknown org.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

vi.mock("./database.js", () => ({
  getContractor: vi.fn(),
  getContractorSafe: vi.fn(),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(),
  is_member: vi.fn(),
}))

import { valid_contractor } from "./middleware.js"
import * as contractorDb from "./database.js"

const getContractorSafe = contractorDb.getContractorSafe as unknown as Mock

async function run(spectrum_id: string) {
  const req = { params: { spectrum_id } } as unknown as Request
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  const next = vi.fn()
  await valid_contractor(req, res, next)
  return { req, res, next }
}

describe("valid_contractor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("attaches the contractor and calls next when it exists", async () => {
    const contractor = { contractor_id: "c-1", spectrum_id: "SCMARKET" }
    getContractorSafe.mockResolvedValue(contractor)

    const { req, res, next } = await run("SCMARKET")

    expect(getContractorSafe).toHaveBeenCalledWith({ spectrum_id: "SCMARKET" })
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
    expect(req.contractor).toBe(contractor)
  })

  it("answers 404 NOT_FOUND for an unknown spectrum id", async () => {
    getContractorSafe.mockResolvedValue(undefined)

    const { res, next } = await run("DOES-NOT-EXIST")

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(404)
    const body = (res.json as unknown as Mock).mock.calls[0][0]
    expect(body.error.code).toBe("NOT_FOUND")
  })

  it("answers 500 (not 400/404) when the lookup itself fails", async () => {
    getContractorSafe.mockRejectedValue(new Error("connection reset"))

    const { res, next } = await run("SCMARKET")

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
