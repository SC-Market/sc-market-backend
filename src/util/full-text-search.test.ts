import { describe, it, expect } from "vitest"
import { buildPrefixTsquery, locKeySearchTerm } from "./full-text-search.js"

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

describe("locKeySearchTerm", () => {
  it("takes a pasted localization key, without its @", () => {
    expect(locKeySearchTerm("@item_Nameksar_lmg_energy_01_tint02")).toBe(
      "item_Nameksar_lmg_energy_01_tint02",
    )
  })

  it("takes a class name", () => {
    expect(locKeySearchTerm(" ksar_lmg_energy_01 ")).toBe("ksar_lmg_energy_01")
  })

  it("ignores ordinary names", () => {
    expect(locKeySearchTerm("Verdict LMG")).toBeNull()
    expect(locKeySearchTerm("verdict")).toBeNull()
    expect(locKeySearchTerm("a_")).toBeNull()
  })
})
