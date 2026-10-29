/**
 * Public API token management is browser-session only and main-site only:
 * a legacy token is refused there (tokens can't mint or revoke tokens), and a
 * custom shop domain's JavaScript can't reach it (POST returns a raw token).
 * Public tokens are refused on every non-public route (public-api-authz.test.ts).
 */
import { describe, it, expect } from "vitest"
import { isSessionOnlyPath } from "../middleware/tsoa-auth.js"
import { matchCustomOriginDenylist } from "../../../middleware/custom-origin.js"

describe("public API token management", () => {
  it("is session-only on v2", () => {
    expect(isSessionOnlyPath("public-api-tokens")).toBe(true)
    expect(isSessionOnlyPath("/public-api-tokens/options")).toBe(true)
    expect(isSessionOnlyPath("public-api-tokens/abc/revoke")).toBe(true)
  })

  it("is closed to custom shop domains", () => {
    expect(matchCustomOriginDenylist("POST", "/api/v2/public-api-tokens")).toBeTruthy()
    expect(matchCustomOriginDenylist("GET", "/api/v2/public-api-tokens/options")).toBeTruthy()
  })
})
