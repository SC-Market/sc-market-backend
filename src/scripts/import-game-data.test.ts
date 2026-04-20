/**
 * Unit tests for import-game-data.ts helper functions
 */

import { describe, it, expect } from "vitest"

// --- Helper Functions (copied from import-game-data.ts for testing) ---

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function normalize(name: string): string {
  return name.toLowerCase().trim()
}

function isCoreItem(name: string): boolean {
  const normalized = name.toLowerCase()
  return (
    normalized.includes(" core ") &&
    !normalized.match(/\b(life|thermal|power|reactor)core\b/)
  )
}

// --- Tests ---

describe("import-game-data helpers", () => {
  describe("levenshtein", () => {
    it("should return 0 for identical strings", () => {
      expect(levenshtein("hello", "hello")).toBe(0)
      expect(levenshtein("", "")).toBe(0)
    })

    it("should return length for empty string comparison", () => {
      expect(levenshtein("hello", "")).toBe(5)
      expect(levenshtein("", "world")).toBe(5)
    })

    it("should calculate distance for single character difference", () => {
      expect(levenshtein("hello", "hallo")).toBe(1)
      expect(levenshtein("cat", "bat")).toBe(1)
    })

    it("should calculate distance for multiple differences", () => {
      expect(levenshtein("kitten", "sitting")).toBe(3)
      expect(levenshtein("saturday", "sunday")).toBe(3)
    })

    it("should handle case-sensitive comparison", () => {
      expect(levenshtein("Hello", "hello")).toBe(1)
      expect(levenshtein("HELLO", "hello")).toBe(5)
    })

    it("should calculate distance for common item name variations", () => {
      expect(levenshtein("quantanium", "quantainium")).toBe(1) // Insert 'i'
      expect(levenshtein("behr rifle", "behr riffle")).toBe(1) // Replace 'i' with 'f'
    })
  })

  describe("normalize", () => {
    it("should convert to lowercase", () => {
      expect(normalize("HELLO")).toBe("hello")
      expect(normalize("Hello World")).toBe("hello world")
    })

    it("should trim whitespace", () => {
      expect(normalize("  hello  ")).toBe("hello")
      expect(normalize("\thello\n")).toBe("hello")
    })

    it("should handle empty strings", () => {
      expect(normalize("")).toBe("")
      expect(normalize("   ")).toBe("")
    })

    it("should normalize item names consistently", () => {
      expect(normalize("Behr Rifle")).toBe("behr rifle")
      expect(normalize("  Behr Rifle  ")).toBe("behr rifle")
      expect(normalize("BEHR RIFLE")).toBe("behr rifle")
    })
  })

  describe("isCoreItem", () => {
    it("should identify Core armor items", () => {
      expect(isCoreItem("Pembroke Core Helmet")).toBe(true)
      expect(isCoreItem("Novikov Core Torso")).toBe(true)
      expect(isCoreItem("RSI Core Arms")).toBe(true)
    })

    it("should reject non-Core items", () => {
      expect(isCoreItem("Pembroke Helmet")).toBe(false)
      expect(isCoreItem("Novikov Torso")).toBe(false)
      expect(isCoreItem("RSI Arms")).toBe(false)
    })

    it("should reject reactor/power core items", () => {
      expect(isCoreItem("Powercore Generator")).toBe(false)
      expect(isCoreItem("Reactorcore System")).toBe(false)
      expect(isCoreItem("Thermalcore Cooler")).toBe(false)
      expect(isCoreItem("Lifecore Medical")).toBe(false)
    })

    it("should be case-insensitive", () => {
      expect(isCoreItem("PEMBROKE CORE HELMET")).toBe(true)
      expect(isCoreItem("pembroke core helmet")).toBe(true)
      expect(isCoreItem("Pembroke CORE Helmet")).toBe(true)
    })

    it("should handle Full Set items", () => {
      expect(isCoreItem("Pembroke - Full Set")).toBe(false)
      expect(isCoreItem("Novikov Core - Full Set")).toBe(true) // Contains " core "
    })
  })
})
