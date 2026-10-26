import { describe, it, expect } from "vitest"
import { redactToken } from "./redact.js"

describe("redactToken", () => {
  it("never returns the token", () => {
    const token = "a3f9c1e2d4b5a6978877665544332211"
    const out = redactToken(token)!
    expect(out).not.toContain(token.slice(4))
    expect(out).toBe("a3f9…[32]")
  })

  it("passes through missing values", () => {
    expect(redactToken(undefined)).toBeUndefined()
    expect(redactToken("")).toBeUndefined()
  })
})
