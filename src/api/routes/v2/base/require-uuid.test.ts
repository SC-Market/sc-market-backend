/**
 * BaseController.requireUuid: v2 controllers guard client-supplied ids bound
 * to uuid columns, so a malformed id is a 404 NOT_FOUND (NotFoundError)
 * rather than a Postgres 22P02 cast failure.
 */

import { describe, it, expect } from "vitest"
import { BaseController } from "./BaseController.js"
import { NotFoundError } from "../../v1/util/errors.js"

class Probe extends BaseController {
  check(value: unknown) {
    this.requireUuid(value, "Thing")
    return "ok"
  }
}

describe("BaseController.requireUuid", () => {
  it("passes a canonical uuid", () => {
    expect(new Probe().check("0b3f1c2a-1234-4abc-9def-0123456789ab")).toBe("ok")
  })

  it.each(["{id}`", "not-a-uuid", "", "0b3f1c2a-1234-junk", undefined])(
    "throws NotFoundError for %j",
    (value) => {
      expect(() => new Probe().check(value)).toThrow(NotFoundError)
    },
  )
})
