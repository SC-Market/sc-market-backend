import { describe, it, expect } from "vitest"
import { resolveSameOriginRedirect, validateRedirectPath } from "./oauth-state.js"

const BASE = new URL("https://sc-market.space")

describe("validateRedirectPath", () => {
  it.each(["", "/", "/market", "/market/abc?tab=2#x", "/shops/foo-bar"])("accepts %j", (p) => {
    expect(validateRedirectPath(p)).toBe(true)
  })

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "\\\\evil.com",
    "/\tevil.com",
    "/\n/evil.com",
    "/x\0y",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
  ])("rejects %j", (p) => {
    expect(validateRedirectPath(p)).toBe(false)
  })
})

describe("resolveSameOriginRedirect", () => {
  it("resolves same-origin paths", () => {
    expect(resolveSameOriginRedirect("/market?x=1", BASE)).toBe("https://sc-market.space/market?x=1")
    expect(resolveSameOriginRedirect("", BASE)).toBe("https://sc-market.space/")
  })

  it.each(["//evil.com", "/\\evil.com", "https://evil.com/x"])(
    "falls back to the base root for off-origin %j",
    (p) => {
      expect(resolveSameOriginRedirect(p, BASE)).toBe("https://sc-market.space/")
    },
  )
})
