import { describe, expect, it, vi } from "vitest"

vi.mock("../../clients/database/knex-db.js", () => ({ getKnex: vi.fn() }))

import {
  MIN_REPLY_SAMPLE,
  lastSeenBucket,
  refreshStatsSql,
  replyTimeBucket,
  toSellerActivity,
} from "./seller-activity.service.js"

const now = new Date("2026-11-01T12:00:00Z")
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

describe("lastSeenBucket: coarse, never a timestamp", () => {
  it.each([
    [ago(5), "today"],
    [ago(23 * 60), "today"],
    [ago(25 * 60), "this_week"],
    [ago(6 * 24 * 60), "this_week"],
    [ago(8 * 24 * 60), "this_month"],
    [ago(29 * 24 * 60), "this_month"],
    [ago(31 * 24 * 60), "over_a_month"],
    [ago(400 * 24 * 60), "over_a_month"],
  ] as const)("%s -> %s", (at, bucket) => {
    expect(lastSeenBucket(at, now)).toBe(bucket)
  })

  it("no activity (or hidden by the seller: no stats row value) is null", () => {
    expect(lastSeenBucket(null, now)).toBeNull()
    expect(lastSeenBucket(undefined, now)).toBeNull()
    expect(lastSeenBucket("not a date", now)).toBeNull()
  })

  it("a clock skew into the future still reads as today", () => {
    expect(lastSeenBucket(new Date(now.getTime() + 60_000), now)).toBe("today")
  })
})

describe("replyTimeBucket", () => {
  it("hidden below the minimum sample size", () => {
    expect(replyTimeBucket(10, MIN_REPLY_SAMPLE - 1)).toBeNull()
    expect(replyTimeBucket(null, 50)).toBeNull()
  })

  it.each([
    [5, "within_hour"],
    [60, "within_hour"],
    [61, "within_hours"],
    [6 * 60, "within_hours"],
    [6 * 60 + 1, "within_day"],
    [24 * 60, "within_day"],
    [2 * 24 * 60, "within_days"],
    [72 * 60, "within_days"],
    [72 * 60 + 1, "slow"],
    [1e9, "slow"], // the median landed on an unanswered chat
  ] as const)("%d min -> %s", (minutes, bucket) => {
    expect(replyTimeBucket(minutes, MIN_REPLY_SAMPLE)).toBe(bucket)
  })
})

describe("toSellerActivity", () => {
  it("combines the stats row and completed orders", () => {
    expect(
      toSellerActivity(
        { last_active_at: ago(30), reply_median_minutes: 90, reply_sample_size: 12, total_completed: 7 },
        now,
      ),
    ).toEqual({ last_seen: "today", reply_time: "within_hours", reply_sample_size: 12, completed_orders: 7 })
  })

  it("no stats yet: nothing claimed", () => {
    expect(toSellerActivity(undefined, now)).toEqual({
      last_seen: null,
      reply_time: null,
      reply_sample_size: null,
      completed_orders: 0,
    })
  })

  it("does not reveal the sample size when the reply time is hidden", () => {
    const a = toSellerActivity({ last_active_at: null, reply_median_minutes: 30, reply_sample_size: 2 }, now)
    expect(a.reply_time).toBeNull()
    expect(a.reply_sample_size).toBeNull()
  })
})

describe("refreshStatsSql", () => {
  it("all active shops, or only the given ones (bound, not interpolated)", () => {
    const all = refreshStatsSql()
    expect(all.bindings).toEqual([])
    expect(all.sql).not.toContain("ANY(")
    const some = refreshStatsSql(["a5b4c3d2-0000-0000-0000-000000000000"])
    expect(some.sql).toContain("s.shop_id = ANY(?::uuid[])")
    expect(some.bindings).toEqual([["a5b4c3d2-0000-0000-0000-000000000000"]])
  })

  it("respects the hide-online-status setting and only counts members who manage orders", () => {
    const { sql } = refreshStatsSql()
    expect(sql).toContain("COALESCE(acs.hide_online_status, false) = false")
    expect(sql).toContain("cr.manage_orders = true")
    expect(sql).toContain("INTERVAL '90 days'")
  })
})
