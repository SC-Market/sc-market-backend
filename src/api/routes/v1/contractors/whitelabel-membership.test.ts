import { describe, it, expect } from "vitest"
import { effectiveRequireMembership } from "./whitelabel-rules.js"

/**
 * "Require org membership" was saved in Public mode, where the site lets
 * anyone browse and the setting does nothing. It's now only stored on for an
 * Internal site, matching the settings UI (which only offers it there).
 */
describe("effectiveRequireMembership", () => {
  it("keeps it on for an Internal site", () => {
    expect(effectiveRequireMembership("internal", true)).toBe(true)
  })
  it("turns it off for a Public site", () => {
    expect(effectiveRequireMembership("public", true)).toBe(false)
  })
  it("stays off when not asked for", () => {
    expect(effectiveRequireMembership("internal", false)).toBe(false)
  })
})
