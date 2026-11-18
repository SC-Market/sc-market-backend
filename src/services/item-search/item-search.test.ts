import { describe, expect, it } from "vitest"
import {
  ITEM_SEARCH_TIER,
  escapeLike,
  itemSearchSql,
  matchManufacturers,
  planItemSearch,
  searchWords,
  trigramSimilarity,
  type SearchManufacturer,
} from "./item-search.js"

const MANUFACTURERS: SearchManufacturer[] = [
  { code: "ksar", name: "Kastak Arms" },
  { code: "behr", name: "Behring" },
  { code: "kbar", name: "KnightBridge Arms" },
  { code: "grin", name: "Greycat Industrial" },
  { code: "grin_weapons", name: "Greycat Industrial" },
  { code: "aegs", name: "Aegis Dynamics" },
]

const COLS = { name: "name", nameKey: "name_key", manufacturer: "manufacturer" }

describe("trigramSimilarity (pg_trgm's measure)", () => {
  it("matches pg_trgm on known pairs", () => {
    expect(trigramSimilarity("kastak", "kastak")).toBe(1)
    // 4 shared of 10 distinct trigrams
    expect(trigramSimilarity("kastek", "kastak")).toBeCloseTo(0.4)
    expect(trigramSimilarity("abc", "xyz")).toBe(0)
    expect(trigramSimilarity("", "xyz")).toBe(0)
  })

  it("is case-insensitive and ignores punctuation", () => {
    expect(trigramSimilarity("KASTAK!", "kastak")).toBe(1)
  })
})

describe("searchWords / escapeLike", () => {
  it("splits on non-alphanumerics, lowercased", () => {
    expect(searchWords('Verdict "Derivation" LMG')).toEqual([
      "verdict",
      "derivation",
      "lmg",
    ])
    expect(searchWords("  P4-AR  ")).toEqual(["p4", "ar"])
  })

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("ksar_lmg 100%")).toBe("ksar\\_lmg 100\\%")
    expect(escapeLike("a\\b")).toBe("a\\\\b")
  })
})

describe("matchManufacturers", () => {
  it("matches a manufacturer by name word prefix or code", () => {
    expect(matchManufacturers(["kastak"], MANUFACTURERS)).toEqual([
      { codes: ["kastak arms", "ksar"], remainingWords: [] },
    ])
    expect(matchManufacturers(["ksar"], MANUFACTURERS)).toEqual([
      { codes: ["kastak arms", "ksar"], remainingWords: [] },
    ])
    expect(matchManufacturers(["kast"], MANUFACTURERS)[0].codes).toContain(
      "ksar",
    )
  })

  it("leaves the other words for the item name", () => {
    expect(matchManufacturers(["kastak", "lmg"], MANUFACTURERS)).toEqual([
      { codes: ["kastak arms", "ksar"], remainingWords: ["lmg"] },
    ])
  })

  it("keeps only the manufacturers that take the most words", () => {
    // "arms" alone would name Kastak Arms and KnightBridge Arms
    expect(matchManufacturers(["arms"], MANUFACTURERS)).toHaveLength(1)
    expect(matchManufacturers(["arms"], MANUFACTURERS)[0].codes).toEqual(
      expect.arrayContaining(["ksar", "kbar"]),
    )
    expect(matchManufacturers(["kastak", "arms"], MANUFACTURERS)).toEqual([
      { codes: ["kastak arms", "ksar"], remainingWords: [] },
    ])
  })

  it("merges codes that share a display name", () => {
    expect(matchManufacturers(["greycat"], MANUFACTURERS)[0].codes).toEqual([
      "greycat industrial",
      "grin",
      "grin_weapons",
    ])
  })

  it("keeps separate matches for words naming different manufacturers", () => {
    expect(matchManufacturers(["kastak", "behring"], MANUFACTURERS)).toEqual([
      { codes: ["kastak arms", "ksar"], remainingWords: ["behring"] },
      { codes: ["behr", "behring"], remainingWords: ["kastak"] },
    ])
  })

  it("ignores words shorter than 3 letters and words naming nothing", () => {
    expect(matchManufacturers(["ka"], MANUFACTURERS)).toEqual([])
    expect(matchManufacturers(["arrowhead"], MANUFACTURERS)).toEqual([])
  })

  it("with typo, matches near spellings only of words that name nothing exactly", () => {
    expect(matchManufacturers(["kastek", "lmg"], MANUFACTURERS)).toEqual([])
    expect(
      matchManufacturers(["kastek", "lmg"], MANUFACTURERS, { typo: true }),
    ).toEqual([{ codes: ["kastak arms", "ksar"], remainingWords: ["lmg"] }])
    // "kastak" names Kastak Arms exactly, so it is no typo of anything
    expect(
      matchManufacturers(["kastak"], MANUFACTURERS, { typo: true }),
    ).toEqual([])
    expect(
      matchManufacturers(["arrowhead"], MANUFACTURERS, { typo: true }),
    ).toEqual([])
  })
})

describe("planItemSearch", () => {
  it("plans a plain name search", () => {
    const plan = planItemSearch("  Arrowhead ", MANUFACTURERS)
    expect(plan).toMatchObject({
      text: "Arrowhead",
      prefixTsquery: "Arrowhead:*",
      keyTerm: null,
      words: ["arrowhead"],
      manufacturers: [],
      fuzzyManufacturers: [],
      fuzzy: true,
    })
  })

  it("plans a localization key search", () => {
    const plan = planItemSearch(
      "@item_Nameksar_lmg_energy_01_tint02",
      MANUFACTURERS,
    )
    expect(plan.keyTerm).toBe("item_Nameksar_lmg_energy_01_tint02")
  })

  it("plans manufacturer and typo matches", () => {
    expect(planItemSearch("kastak lmg", MANUFACTURERS).manufacturers).toEqual([
      { codes: ["kastak arms", "ksar"], remainingWords: ["lmg"] },
    ])
    expect(planItemSearch("kastek", MANUFACTURERS).fuzzyManufacturers).toEqual([
      { codes: ["kastak arms", "ksar"], remainingWords: [] },
    ])
  })

  it("skips the typo tier for queries under 3 characters", () => {
    expect(planItemSearch("ab", MANUFACTURERS).fuzzy).toBe(false)
  })
})

describe("itemSearchSql", () => {
  /** The tier numbers the CASE expression can yield, in order. */
  function tiersOf(sql: string): number[] {
    return [...sql.matchAll(/(?:THEN|ELSE) (\d)/g)].map((m) => Number(m[1]))
  }

  it("ranks exact > prefix > word prefix > substring > key > manufacturer > typo", () => {
    const plan = planItemSearch("ksar_lmg", MANUFACTURERS)
    // Make every tier present: a key-like query that also names a manufacturer
    plan.manufacturers = [{ codes: ["ksar"], remainingWords: [] }]
    const { tier } = itemSearchSql(plan, COLS)
    expect(tiersOf(tier.sql)).toEqual([
      ITEM_SEARCH_TIER.exact,
      ITEM_SEARCH_TIER.prefix,
      ITEM_SEARCH_TIER.wordPrefix,
      ITEM_SEARCH_TIER.substring,
      ITEM_SEARCH_TIER.locKey,
      ITEM_SEARCH_TIER.manufacturer,
      ITEM_SEARCH_TIER.fuzzy,
    ])
  })

  it("binds one value per placeholder", () => {
    for (const q of [
      "Arrowhead",
      "kastak lmg",
      "kastek lmg",
      "@item_Nameksar_lmg_energy_01",
      "a",
      "*",
    ]) {
      const { where, orderBy } = itemSearchSql(
        planItemSearch(q, MANUFACTURERS),
        COLS,
      )
      expect(where.sql.match(/\?/g)?.length).toBe(where.bindings.length)
      expect(orderBy.sql.match(/\?/g)?.length).toBe(orderBy.bindings.length)
    }
  })

  it("matches names literally (wildcards escaped)", () => {
    const { where } = itemSearchSql(planItemSearch("100%", MANUFACTURERS), COLS)
    expect(where.bindings).toContain("100\\%")
    expect(where.bindings).toContain("100\\%%")
    expect(where.bindings).toContain("%100\\%%")
  })

  it("requires the leftover words in the name for a manufacturer match", () => {
    const { tier } = itemSearchSql(
      planItemSearch("kastak lmg", MANUFACTURERS),
      COLS,
    )
    expect(tier.sql).toMatch(
      /WHEN \(+lower\(manufacturer\) IN \(\?, \?\)\) AND \(name ILIKE \?\)+ THEN 5/,
    )
    expect(tier.bindings).toEqual(
      expect.arrayContaining(["kastak arms", "ksar", "%lmg%"]),
    )
  })

  it("leaves out tiers that don't apply", () => {
    const { tier } = itemSearchSql(planItemSearch("ab", MANUFACTURERS), COLS)
    // no key, no manufacturer, no typo tier: substring is the last (ELSE)
    expect(tiersOf(tier.sql)).toEqual([0, 1, 2, 3])
    const punct = itemSearchSql(planItemSearch("*", MANUFACTURERS), COLS)
    expect(punct.tier.sql).not.toContain("to_tsquery")
  })

  it("orders by tier, then closeness, then name", () => {
    const { orderBy } = itemSearchSql(
      planItemSearch("verdikt", MANUFACTURERS),
      COLS,
    )
    expect(orderBy.sql).toMatch(
      /^CASE .* END, word_similarity\(\?, name\) DESC, similarity\(\?, name\) DESC, name ASC$/,
    )
  })

  it("uses the given column references", () => {
    const { where } = itemSearchSql(planItemSearch("kastak", MANUFACTURERS), {
      name: "gi.name",
      nameKey: "gi.name_key",
      manufacturer: "gi.manufacturer",
    })
    expect(where.sql).toContain("lower(gi.manufacturer) IN")
    expect(where.sql).toContain("gi.name %> ?")
    expect(where.sql).not.toMatch(/(^|[^.])\bname ILIKE/)
  })
})
