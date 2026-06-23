import { getKnex } from "../../clients/database/knex-db.js"

export interface ShopMetrics {
  total_orders: number
  total_completed: number
  avg_completion_hours: number | null
  streak: number
  response_rate: number | null
}

/**
 * Recompute and persist metrics for a given shop.
 *
 * Should be called after:
 * - An order is completed/fulfilled
 * - A review is submitted
 */
export async function refreshShopMetrics(shopId: string): Promise<void> {
  const db = getKnex()

  // total_orders
  const [{ count: totalOrders }] = await db("orders")
    .where("shop_id", shopId)
    .count("* as count")

  // total_completed
  const [{ count: totalCompleted }] = await db("orders")
    .where("shop_id", shopId)
    .where("status", "fulfilled")
    .count("* as count")

  // avg_completion_hours (time from creation to last update for fulfilled orders)
  const avgResult = await db("orders")
    .where("shop_id", shopId)
    .where("status", "fulfilled")
    .select(
      db.raw(
        "AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::numeric(8,2) as avg_hours",
      ),
    )
    .first()

  const avgCompletionHours = avgResult?.avg_hours
    ? parseFloat(avgResult.avg_hours)
    : null

  // streak: consecutive 5-star reviews (most recent first)
  const ratings = await db("shop_ratings")
    .where("shop_id", shopId)
    .orderBy("created_at", "desc")
    .select("rating")

  let streak = 0
  for (const r of ratings) {
    if (r.rating === 5) {
      streak++
    } else {
      break
    }
  }

  // response_rate: percentage of orders responded to within 24 hours
  // "Responded" = order moved from 'assigned' status within 24h of creation
  const responseResult = await db.raw(
    `
    SELECT
      COUNT(*) FILTER (WHERE updated_at - created_at <= INTERVAL '24 hours')::integer as responded,
      COUNT(*)::integer as total
    FROM orders
    WHERE shop_id = ?
      AND status != 'assigned'
    `,
    [shopId],
  )

  let responseRate: number | null = null
  if (responseResult.rows[0]?.total > 0) {
    responseRate = parseFloat(
      (
        (responseResult.rows[0].responded / responseResult.rows[0].total) *
        100
      ).toFixed(2),
    )
  }

  await db("shops").where("shop_id", shopId).update({
    total_orders: parseInt(String(totalOrders), 10),
    total_completed: parseInt(String(totalCompleted), 10),
    avg_completion_hours: avgCompletionHours,
    streak,
    response_rate: responseRate,
  })
}

/**
 * Read cached metrics from the shops table for a given shop.
 */
export async function getShopMetrics(shopId: string): Promise<ShopMetrics> {
  const db = getKnex()
  const row = await db("shops")
    .where("shop_id", shopId)
    .select("total_orders", "total_completed", "avg_completion_hours", "streak", "response_rate")
    .first()

  if (!row) {
    return {
      total_orders: 0,
      total_completed: 0,
      avg_completion_hours: null,
      streak: 0,
      response_rate: null,
    }
  }

  return {
    total_orders: row.total_orders,
    total_completed: row.total_completed,
    avg_completion_hours: row.avg_completion_hours
      ? parseFloat(String(row.avg_completion_hours))
      : null,
    streak: row.streak,
    response_rate: row.response_rate
      ? parseFloat(String(row.response_rate))
      : null,
  }
}
