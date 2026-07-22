import { getKnex } from "../../clients/database/knex-db.js"

/**
 * Shop badge computation.
 *
 * Badges are derived from a shop's own performance metrics (rating, volume,
 * streak, speed, consistency, responsiveness) plus owner-level signals
 * (donor duration, early adopter). Results are stored on `shops.badge_ids`
 * so read surfaces can just read the column instead of recomputing.
 *
 * Thresholds mirror the proven V1 materialized-view logic
 * (config/postgres/28-donor-badge.sql), adapted to shop metrics where the
 * order-count gate uses total_completed.
 */

interface BadgeInputs {
  avg_rating: number
  total_orders: number
  total_completed: number
  streak: number
  response_rate: number | null
  avg_completion_hours: number | null
  shop_created_at: Date | string
  owner_created_at: Date | string | null
  donor_start_date: Date | string | null
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  )
}

/**
 * Pure badge threshold logic. Exported for reuse (e.g. daily cron backfill).
 */
export function computeBadgeIdsFromInputs(m: BadgeInputs): string[] {
  const badges: string[] = []
  const now = new Date()

  // Rating — gated on total_completed >= 25
  if (m.total_completed >= 25) {
    if (m.avg_rating >= 4.995) badges.push("rating_99_9")
    else if (m.avg_rating >= 4.95) badges.push("rating_99")
    else if (m.avg_rating >= 4.75) badges.push("rating_95")
    else if (m.avg_rating >= 4.5) badges.push("rating_90")
  }

  // Volume — total_completed
  if (m.total_completed >= 5000) badges.push("volume_pro")
  else if (m.total_completed >= 1000) badges.push("volume_gold")
  else if (m.total_completed >= 500) badges.push("volume_silver")
  else if (m.total_completed >= 100) badges.push("volume_copper")

  // Streak
  if (m.streak >= 50) badges.push("streak_pro")
  else if (m.streak >= 25) badges.push("streak_gold")
  else if (m.streak >= 15) badges.push("streak_silver")
  else if (m.streak >= 5) badges.push("streak_copper")

  // Speed — gated on total_completed >= 10
  if (m.avg_completion_hours != null && m.total_completed >= 10) {
    if (m.avg_completion_hours <= 3) badges.push("speed_pro")
    else if (m.avg_completion_hours <= 6) badges.push("speed_gold")
    else if (m.avg_completion_hours <= 12) badges.push("speed_silver")
    else if (m.avg_completion_hours <= 24) badges.push("speed_copper")
  }

  // Consistency — shop age (months) + total_completed
  const shopAgeMonths = monthsBetween(new Date(m.shop_created_at), now)
  if (shopAgeMonths >= 36 && m.total_completed >= 50)
    badges.push("consistency_pro")
  else if (shopAgeMonths >= 24 && m.total_completed >= 30)
    badges.push("consistency_gold")
  else if (shopAgeMonths >= 12 && m.total_completed >= 15)
    badges.push("consistency_silver")
  else if (shopAgeMonths >= 6 && m.total_completed >= 5)
    badges.push("consistency_copper")

  // Responsive — total_orders >= 10 & response_rate >= 90
  if (m.response_rate != null && m.response_rate >= 90 && m.total_orders >= 10) {
    badges.push("responsive")
  }

  // Donor — owner's donor duration (30-day months, matching V1)
  if (m.donor_start_date) {
    const donorMonths = Math.floor(
      (now.getTime() - new Date(m.donor_start_date).getTime()) /
        (2592000 * 1000),
    )
    if (donorMonths >= 12) badges.push("donor_pro")
    else if (donorMonths >= 6) badges.push("donor_gold")
    else if (donorMonths >= 3) badges.push("donor_silver")
    else if (donorMonths >= 1) badges.push("donor_copper")
  }

  // Early adopter — owner account age >= 24 months
  if (m.owner_created_at) {
    const ownerAgeMonths = monthsBetween(new Date(m.owner_created_at), now)
    if (ownerAgeMonths >= 24) badges.push("early_adopter")
  }

  return badges
}

/**
 * Compute and persist badge_ids for a single shop from its stored metrics and
 * owner data. Returns the computed badge array.
 *
 * Should be called whenever a shop's metrics change (order fulfilled, review
 * left) and on the daily cron for time-based badges.
 */
export async function computeShopBadges(shopId: string): Promise<string[]> {
  const db = getKnex()

  const shop = await db("shops as s")
    .leftJoin("accounts as a", "s.owner_user_id", "a.user_id")
    .leftJoin("contractors as c", "s.owner_contractor_id", "c.contractor_id")
    .where("s.shop_id", shopId)
    .select(
      "s.shop_id",
      "s.total_orders",
      "s.total_completed",
      "s.avg_completion_hours",
      "s.streak",
      "s.response_rate",
      "s.created_at as shop_created_at",
      db.raw("COALESCE(a.created_at, c.created_at) as owner_created_at"),
      "a.donor_start_date as donor_start_date",
      db.raw(
        `COALESCE((SELECT AVG(sr.rating)::float FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as avg_rating`,
      ),
    )
    .first()

  if (!shop) return []

  const badgeIds = computeBadgeIdsFromInputs({
    avg_rating: Number(shop.avg_rating) || 0,
    total_orders: shop.total_orders || 0,
    total_completed: shop.total_completed || 0,
    streak: shop.streak || 0,
    response_rate:
      shop.response_rate != null ? Number(shop.response_rate) : null,
    avg_completion_hours:
      shop.avg_completion_hours != null
        ? Number(shop.avg_completion_hours)
        : null,
    shop_created_at: shop.shop_created_at,
    owner_created_at: shop.owner_created_at,
    donor_start_date: shop.donor_start_date,
  })

  await db("shops").where("shop_id", shopId).update({ badge_ids: badgeIds })

  return badgeIds
}

/**
 * Recompute badge_ids for all active shops. Used by the daily cron to refresh
 * time-based badges (early_adopter, consistency tiers, donor duration) that are
 * not triggered by order events. Kept cheap — one lightweight query per shop.
 */
export async function recomputeAllShopBadges(): Promise<number> {
  const db = getKnex()
  const shops = await db("shops")
    .where("status", "active")
    .select("shop_id")

  let updated = 0
  for (const { shop_id } of shops) {
    await computeShopBadges(shop_id)
    updated++
  }
  return updated
}
