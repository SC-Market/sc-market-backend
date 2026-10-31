/**
 * Price oracle math: which numbers are trustworthy enough to publish
 * (design: drafts/price-oracle-design.md).
 */
import { describe, expect, it } from "vitest"
import {
  PRICE_ORACLE_RULES,
  computeAskStats,
  computeTrend,
  median,
  quantile,
  trimOutliers,
  type SellerAsk,
} from "./price-math.js"

const ask = (price: number, listingCount = 1, quantity = 1): SellerAsk => ({
  price,
  listingCount,
  quantity,
})

describe("quantile / median", () => {
  it("interpolates linearly", () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
    expect(quantile([1, 2, 3, 4], 0.75)).toBe(3.25)
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe("trimOutliers (Tukey fences on ln(price))", () => {
  it("drops a fake 10x-low and a 10x-high ask", () => {
    const prices = [1000, 10_000, 11_000, 12_000, 13_000, 14_000, 150_000]
    const { kept, excluded } = trimOutliers(prices, (p) => p)
    expect(excluded.sort((a, b) => a - b)).toEqual([1000, 150_000])
    expect(kept).toEqual([10_000, 11_000, 12_000, 13_000, 14_000])
  })

  it("keeps everything below the minimum seller count for trimming", () => {
    const prices = [10, 10_000, 1_000_000]
    expect(PRICE_ORACLE_RULES.minSellersForTrim).toBe(4)
    expect(trimOutliers(prices, (p) => p).kept).toEqual(prices)
  })

  it("keeps identical prices (IQR 0)", () => {
    const prices = [5000, 5000, 5000, 5000, 5000]
    expect(trimOutliers(prices, (p) => p).excluded).toEqual([])
  })
})

describe("computeAskStats", () => {
  it("counts each seller once, at its lowest ask, and sums listings and units", () => {
    const s = computeAskStats([
      ask(12_000, 3, 10),
      ask(10_000, 1, 2),
      ask(15_000, 2, 5),
    ])
    expect(s).toEqual({
      askCount: 6,
      sellerCount: 3,
      quantityAvailable: 17,
      lowestAsk: 10_000,
      medianAsk: 12_000,
      highestAsk: 15_000,
      outliersExcluded: 0,
    })
  })

  it("publishes no median below the minimum seller count", () => {
    const s = computeAskStats([ask(10_000), ask(12_000)])
    expect(s.medianAsk).toBeNull()
    expect(s.lowestAsk).toBe(10_000)
    expect(s.sellerCount).toBe(2)
  })

  it("ignores placeholder prices (<= 1 aUEC) and counts them as excluded", () => {
    const s = computeAskStats([ask(1), ask(10_000), ask(11_000), ask(12_000)])
    expect(s.lowestAsk).toBe(10_000)
    expect(s.sellerCount).toBe(3)
    expect(s.outliersExcluded).toBe(1)
  })

  it("a fake low seller cannot set the lowest ask or the median once there are enough sellers", () => {
    const s = computeAskStats([
      ask(500, 20),
      ask(10_000),
      ask(11_000),
      ask(12_000),
      ask(13_000),
    ])
    expect(s.lowestAsk).toBe(10_000)
    expect(s.medianAsk).toBe(11_500)
    expect(s.askCount).toBe(4)
    expect(s.outliersExcluded).toBe(1)
  })

  it("is empty without asks", () => {
    expect(computeAskStats([])).toEqual({
      askCount: 0,
      sellerCount: 0,
      quantityAvailable: 0,
      lowestAsk: null,
      medianAsk: null,
      highestAsk: null,
      outliersExcluded: 0,
    })
  })
})

describe("computeTrend", () => {
  const days = (medians: (number | null)[], start = "2026-10-01") =>
    medians.map((m, i) => ({
      day: new Date(Date.parse(start) + i * 86_400_000)
        .toISOString()
        .slice(0, 10),
      medianAsk: m,
    }))

  it("needs the minimum number of days with a median", () => {
    const t = computeTrend(days([100, 110, null, 120, 130, 140]))
    expect(t).toEqual({ daysWithMedian: 5, median30d: null, changePct: null })
  })

  it("median of daily medians and first-to-last % change", () => {
    const t = computeTrend(days([100, 90, 95, 105, 110, 100, 120, 80]))
    expect(t.daysWithMedian).toBe(8)
    expect(t.median30d).toBe(100)
    expect(t.changePct).toBe(-20)
  })

  it("orders by day whatever the input order", () => {
    const t = computeTrend(days([200, 200, 200, 200, 200, 200, 250]).reverse())
    expect(t.changePct).toBe(25)
  })
})
