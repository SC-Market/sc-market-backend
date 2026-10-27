import { describe, expect, it } from "vitest"
import { clampPagination, MAX_PAGE, MAX_PAGE_SIZE } from "./pagination.js"
import { ValidationError } from "../../v1/util/errors.js"

describe("clampPagination", () => {
  it("defaults to page 1 and the endpoint's default size", () => {
    expect(clampPagination(undefined, undefined)).toEqual({
      page: 1,
      page_size: 20,
      offset: 0,
    })
    expect(
      clampPagination(undefined, undefined, { defaultPageSize: 50 }),
    ).toEqual({
      page: 1,
      page_size: 50,
      offset: 0,
    })
  })

  it("computes the offset", () => {
    expect(clampPagination(3, 25)).toEqual({
      page: 3,
      page_size: 25,
      offset: 50,
    })
    expect(clampPagination("2", "10")).toEqual({
      page: 2,
      page_size: 10,
      offset: 10,
    })
  })

  it("clamps page_size to the endpoint maximum, never above MAX_PAGE_SIZE", () => {
    expect(clampPagination(1, 1000).page_size).toBe(MAX_PAGE_SIZE)
    expect(clampPagination(1, 80, { maxPageSize: 50 }).page_size).toBe(50)
    expect(clampPagination(1, 1000, { maxPageSize: 500 }).page_size).toBe(
      MAX_PAGE_SIZE,
    )
  })

  it.each([
    [0, 10],
    [-1, 10],
    [1.5, 10],
    [Number.NaN, 10],
    ["abc", 10],
    [1, 0],
    [1, -5],
    [1, 2.5],
    [MAX_PAGE + 1, 10],
  ])("rejects page=%s page_size=%s with a 400", (page, size) => {
    expect(() => clampPagination(page, size)).toThrow(ValidationError)
  })

  it("honours a lower page cap", () => {
    expect(() => clampPagination(11, 10, { maxPage: 10 })).toThrow(
      ValidationError,
    )
    expect(clampPagination(10, 10, { maxPage: 10 }).offset).toBe(90)
  })
})
