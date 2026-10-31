import { describe, it, expect } from "vitest"
import {
  cleanVerifiedOrgDescription,
  orgTextHasSentinel,
} from "./verification.js"

// Same shape as profiles/helpers get_sentinel()
const SENTINEL = "[sc-market.space:AB12CD34]"
const LINK_LINE =
  "Find our shop on SC Market: https://sc-market.space/contractor/TESTORG"

describe("org verification with the optional link-back line", () => {
  it("finds the sentinel with or without the link line", () => {
    expect(
      orgTextHasSentinel([`We fly. ${SENTINEL}\n${LINK_LINE}`, ""], SENTINEL),
    ).toBe(true)
    expect(
      orgTextHasSentinel(
        ["", "", "", `history ${SENTINEL.toLowerCase()}`],
        SENTINEL,
      ),
    ).toBe(true)
  })

  it("never treats the link line as the sentinel", () => {
    expect(orgTextHasSentinel([LINK_LINE, LINK_LINE, "", ""], SENTINEL)).toBe(
      false,
    )
    // Even an SID that looks like the code's hex part does not match.
    expect(
      orgTextHasSentinel(
        ["https://sc-market.space/contractor/AB12CD34"],
        SENTINEL,
      ),
    ).toBe(false)
  })

  it("stored description drops the sentinel and link line, keeps the rest", () => {
    expect(
      cleanVerifiedOrgDescription(`We haul cargo. ${SENTINEL}\n\n${LINK_LINE}`),
    ).toBe("We haul cargo.")
    expect(
      cleanVerifiedOrgDescription(`Haulers \\[sc-market.space:AB12CD34\\]`),
    ).toBe("Haulers")
    expect(
      cleanVerifiedOrgDescription(
        `One\n[Find our shop](https://sc-market.space/contractor/TESTORG)\nTwo`,
      ),
    ).toBe("One\n\nTwo")
    expect(cleanVerifiedOrgDescription("  Plain headline  ")).toBe(
      "Plain headline",
    )
  })
})
