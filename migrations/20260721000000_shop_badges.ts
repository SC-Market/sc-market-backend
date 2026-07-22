import type { Knex } from "knex"

/**
 * Add badge_ids array column to shops and backfill from current metrics + owner data.
 *
 * Badges are computed server-side (see shop-badges.service.ts) and stored on the
 * shops table so read surfaces just read the column. This migration adds the column
 * and performs a one-time backfill using the same threshold math.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE shops ADD COLUMN IF NOT EXISTS badge_ids TEXT[] NOT NULL DEFAULT '{}'`,
  )

  await backfillBadges(knex)
}

/**
 * Compute badge_ids for every shop using its current metrics and owner data.
 * Duplicates the threshold logic from shop-badges.service.ts intentionally so
 * the migration is self-contained and does not depend on the runtime knex singleton.
 */
async function backfillBadges(knex: Knex): Promise<void> {
  const shops = await knex("shops as s")
    .leftJoin("accounts as a", "s.owner_user_id", "a.user_id")
    .leftJoin("contractors as c", "s.owner_contractor_id", "c.contractor_id")
    .select(
      "s.shop_id",
      "s.total_orders",
      "s.total_completed",
      "s.avg_completion_hours",
      "s.streak",
      "s.response_rate",
      "s.created_at as shop_created_at",
      knex.raw(
        "COALESCE(a.created_at, c.created_at) as owner_created_at",
      ),
      "a.donor_start_date as donor_start_date",
      knex.raw(
        `COALESCE((SELECT AVG(sr.rating)::float FROM shop_ratings sr WHERE sr.shop_id = s.shop_id), 0) as avg_rating`,
      ),
    )

  for (const shop of shops) {
    const badgeIds = computeBadgeIds({
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

    await knex("shops")
      .where("shop_id", shop.shop_id)
      .update({ badge_ids: badgeIds })
  }
}

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

function computeBadgeIds(m: BadgeInputs): string[] {
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
  if (
    m.response_rate != null &&
    m.response_rate >= 90 &&
    m.total_orders >= 10
  ) {
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

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("shops", (table) => {
    table.dropColumn("badge_ids")
  })
}
