/**
 * Unit tests for the valid_recruiting_post middleware.
 *
 * recruiting_posts.post_id is a uuid column: a malformed id must be answered
 * 404 up front rather than bound into the query, where Postgres rejects the
 * cast and the request surfaces as a 500.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

vi.mock("./database.js", () => ({ getRecruitingPost: vi.fn() }))
vi.mock("../util/permissions.js", () => ({ has_permission: vi.fn() }))

import { valid_recruiting_post } from "./middleware.js"
import * as recruitingDb from "./database.js"

const getRecruitingPost = recruitingDb.getRecruitingPost as unknown as Mock

const POST_ID = "0b3f1c2a-1234-4abc-9def-0123456789ab"

async function run(post_id: string) {
  const req = { params: { post_id } } as unknown as Request
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  const next = vi.fn()
  await valid_recruiting_post(req, res, next)
  return { req, res, next }
}

describe("valid_recruiting_post", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("answers 404 for a malformed post id without querying the database", async () => {
    getRecruitingPost.mockRejectedValue(
      new Error('invalid input syntax for type uuid: "not-a-uuid"'),
    )

    const { res, next } = await run("not-a-uuid")

    expect(getRecruitingPost).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(404)
    const body = (res.json as unknown as Mock).mock.calls[0][0]
    expect(body.error.code).toBe("NOT_FOUND")
  })

  it("answers 404 for a well-formed id with no post", async () => {
    getRecruitingPost.mockResolvedValue(undefined)

    const { res, next } = await run(POST_ID)

    expect(getRecruitingPost).toHaveBeenCalledWith({ post_id: POST_ID })
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it("attaches the post and calls next when it exists", async () => {
    const post = { post_id: POST_ID, title: "Hiring" }
    getRecruitingPost.mockResolvedValue(post)

    const { req, res, next } = await run(POST_ID)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
    expect(req.recruiting_post).toBe(post)
  })
})
