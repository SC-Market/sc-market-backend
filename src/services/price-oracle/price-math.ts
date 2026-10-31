/**
 * Price oracle math (design: drafts/price-oracle-design.md).
 *
 * Pure functions, no DB: everything that turns eligible asks into the numbers
 * the public price feed and the aggregate pages show. The SQL side
 * (price-oracle.service.ts) decides which listings are eligible; this side
 * decides which numbers are trustworthy enough to publish.
 *
 * Unit of sampling: one SELLER, not one listing. Each seller (shop) counts
 * once per game item, at its lowest eligible ask, so a seller posting ten
 * cheap listings moves the median no more than one listing would.
 */

/** The rules the feed's methodology note states. Change them here only. */
export const PRICE_ORACLE_RULES = {
  /** Listings younger than this are not counted (fake-low-price bait). */
  minListingAgeHours: 24,
  /** Asks at or below this many aUEC are placeholders (PLACEHOLDER_PRICE_MAX). */
  placeholderPriceMax: 1,
  /** Outlier trimming only runs with at least this many sellers. */
  minSellersForTrim: 4,
  /** Tukey fence multiplier, applied to ln(price). */
  iqrMultiplier: 1.5,
  /** A median ask needs at least this many sellers (after trimming). */
  minSellersForMedian: 3,
  /** "high" confidence from this many sellers ("medium" from minSellersForMedian). */
  minSellersForHighConfidence: 6,
  /** 30-day median and % change need this many days with a daily median. */
  minDaysForTrend: 7,
  /** Trend window, in days, including today. */
  trendWindowDays: 30,
  /** A sale median needs at least this many completed sales in the window. */
  minSalesForMedian: 3,
} as const

/** One seller's best eligible ask for one game item. */
export interface SellerAsk {
  /** Lowest eligible per-unit ask of this seller, in aUEC. */
  price: number
  /** Eligible listings of this seller for the item. */
  listingCount: number
  /** Units available across those listings. */
  quantity: number
}

export interface AskStats {
  /** Listings counted (sellers kept after trimming). */
  askCount: number
  /** Sellers counted (after trimming). */
  sellerCount: number
  quantityAvailable: number
  /** Null when no seller is counted. */
  lowestAsk: number | null
  /** Null below minSellersForMedian sellers. */
  medianAsk: number | null
  highestAsk: number | null
  /** Sellers dropped as outliers. */
  outliersExcluded: number
}

/**
 * How much weight the numbers can bear, from the counted sellers:
 * - none: no counted seller;
 * - low: below minSellersForMedian: no median, show the listings instead;
 * - medium: a median, from few sellers;
 * - high: minSellersForHighConfidence or more sellers.
 */
export type PriceConfidence = "none" | "low" | "medium" | "high"

export function priceConfidence(
  sellerCount: number,
  rules: Pick<
    typeof PRICE_ORACLE_RULES,
    "minSellersForMedian" | "minSellersForHighConfidence"
  > = PRICE_ORACLE_RULES,
): PriceConfidence {
  if (sellerCount <= 0) return "none"
  if (sellerCount < rules.minSellersForMedian) return "low"
  if (sellerCount < rules.minSellersForHighConfidence) return "medium"
  return "high"
}

/** Linear-interpolation quantile (type 7) of an ascending, non-empty array. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new Error("quantile of an empty array")
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  )
}

/**
 * Tukey-fence trimming on ln(price): keeps prices within
 * [Q1 - k*IQR, Q3 + k*IQR] of the log prices. Log space because item prices
 * are multiplicative (a fake 10x-low ask is as far out as a 10x-high one).
 * Below `minSellersForTrim` values nothing is trimmed: quartiles of three
 * points say nothing.
 */
export function trimOutliers<T>(
  items: readonly T[],
  price: (t: T) => number,
  rules: Pick<
    typeof PRICE_ORACLE_RULES,
    "minSellersForTrim" | "iqrMultiplier"
  > = PRICE_ORACLE_RULES,
): { kept: T[]; excluded: T[] } {
  if (items.length < rules.minSellersForTrim)
    return { kept: [...items], excluded: [] }
  const logs = items.map((t) => Math.log(price(t))).sort((a, b) => a - b)
  const q1 = quantile(logs, 0.25)
  const q3 = quantile(logs, 0.75)
  const iqr = q3 - q1
  const lo = q1 - rules.iqrMultiplier * iqr
  const hi = q3 + rules.iqrMultiplier * iqr
  const kept: T[] = []
  const excluded: T[] = []
  for (const t of items) {
    const l = Math.log(price(t))
    // Tiny epsilon: identical prices give iqr = 0 and must all be kept.
    if (l >= lo - 1e-9 && l <= hi + 1e-9) kept.push(t)
    else excluded.push(t)
  }
  return { kept, excluded }
}

/** Stats of one game item's seller asks (already eligibility-filtered). */
export function computeAskStats(
  asks: readonly SellerAsk[],
  rules: typeof PRICE_ORACLE_RULES = PRICE_ORACLE_RULES,
): AskStats {
  const valid = asks.filter(
    (a) => Number.isFinite(a.price) && a.price > rules.placeholderPriceMax,
  )
  const { kept, excluded } = trimOutliers(valid, (a) => a.price, rules)
  const prices = kept.map((a) => a.price).sort((a, b) => a - b)
  const med = kept.length >= rules.minSellersForMedian ? median(prices) : null
  return {
    askCount: kept.reduce((n, a) => n + a.listingCount, 0),
    sellerCount: kept.length,
    quantityAvailable: kept.reduce((n, a) => n + a.quantity, 0),
    lowestAsk: prices.length ? prices[0] : null,
    medianAsk: med === null ? null : Math.round(med),
    highestAsk: prices.length ? prices[prices.length - 1] : null,
    outliersExcluded: excluded.length + (asks.length - valid.length),
  }
}

/** One day of the trend: a day (YYYY-MM-DD) and its median ask, if any. */
export interface DailyMedian {
  day: string
  medianAsk: number | null
}

export interface TrendStats {
  /** Days in the window that had a published median. */
  daysWithMedian: number
  /** Median of the daily medians; null below minDaysForTrend days. */
  median30d: number | null
  /**
   * % change from the first to the last daily median in the window, one
   * decimal; null below minDaysForTrend days or when the two are less than
   * minDaysForTrend - 1 days apart.
   */
  changePct: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Trend over the daily medians of the window (any order). */
export function computeTrend(
  days: readonly DailyMedian[],
  rules: Pick<
    typeof PRICE_ORACLE_RULES,
    "minDaysForTrend"
  > = PRICE_ORACLE_RULES,
): TrendStats {
  const points = days
    .filter(
      (d): d is { day: string; medianAsk: number } =>
        d.medianAsk !== null && d.medianAsk > 0,
    )
    .sort((a, b) => a.day.localeCompare(b.day))
  if (points.length < rules.minDaysForTrend) {
    return { daysWithMedian: points.length, median30d: null, changePct: null }
  }
  const first = points[0]
  const last = points[points.length - 1]
  const spanDays = (Date.parse(last.day) - Date.parse(first.day)) / DAY_MS
  const med = median(points.map((p) => p.medianAsk))
  return {
    daysWithMedian: points.length,
    median30d: med === null ? null : Math.round(med),
    changePct:
      spanDays >= rules.minDaysForTrend - 1
        ? Math.round(
            ((last.medianAsk - first.medianAsk) / first.medianAsk) * 1000,
          ) / 10
        : null,
  }
}
