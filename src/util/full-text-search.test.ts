import { describe, it, expect } from "vitest"
import { buildPrefixTsquery } from "./full-text-search.js"

describe("buildPrefixTsquery", () => {
  it("adds a prefix marker to each word", () => {
    expect(buildPrefixTsquery("behring")).toBe("behring:*")
    expect(buildPrefixTsquery("behring rifle")).toBe("behring:* & rifle:*")
  })

  it("strips non-word characters from within tokens", () => {
    // The reported crash: a leading '*' produced ":*Behring". After stripping,
    // the lexeme is clean and no bare ":*" is emitted.
    expect(buildPrefixTsquery("*Behring")).toBe("Behring:*")
    expect(buildPrefixTsquery("P4-AR")).toBe("P4AR:*")
  })

  it("drops tokens that reduce to empty instead of emitting a bare ':*'", () => {
    expect(buildPrefixTsquery("* behring")).toBe("behring:*")
    expect(buildPrefixTsquery("behring & rifle")).toBe("behring:* & rifle:*")
    expect(buildPrefixTsquery("behring   rifle")).toBe("behring:* & rifle:*")
  })

  it("returns empty string when nothing usable survives", () => {
    expect(buildPrefixTsquery("*")).toBe("")
    expect(buildPrefixTsquery("& * !")).toBe("")
    expect(buildPrefixTsquery("   ")).toBe("")
    expect(buildPrefixTsquery("")).toBe("")
  })
})
