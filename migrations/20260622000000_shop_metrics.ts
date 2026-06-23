import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Add metrics columns to shops table
  await knex.schema.alterTable("shops", (table) => {
    table.integer("total_orders").notNullable().defaultTo(0)
    table.integer("total_completed").notNullable().defaultTo(0)
    table.decimal("avg_completion_hours", 8, 2).nullable().defaultTo(null)
    table.integer("streak").notNullable().defaultTo(0)
    table.decimal("response_rate", 5, 2).nullable().defaultTo(null)
  })

  // Backfill total_orders
  await knex.raw(`
    UPDATE shops s SET total_orders = (
      SELECT COUNT(*)::integer FROM orders o WHERE o.shop_id = s.shop_id
    )
  `)

  // Backfill total_completed
  await knex.raw(`
    UPDATE shops s SET total_completed = (
      SELECT COUNT(*)::integer FROM orders o WHERE o.shop_id = s.shop_id AND o.status = 'fulfilled'
    )
  `)

  // Backfill avg_completion_hours (time from order creation to fulfilled status)
  // Using order_comments with the status change to 'fulfilled' as the completion timestamp
  await knex.raw(`
    UPDATE shops s SET avg_completion_hours = sub.avg_hours
    FROM (
      SELECT
        o.shop_id,
        AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 3600)::numeric(8,2) as avg_hours
      FROM orders o
      WHERE o.status = 'fulfilled'
        AND o.shop_id IS NOT NULL
      GROUP BY o.shop_id
    ) sub
    WHERE s.shop_id = sub.shop_id
  `)

  // Backfill streak — computed in JS below
  await backfillStreaks(knex)
}

/**
 * Compute consecutive 5-star review streak for each shop.
 * Iterates ratings ordered by created_at DESC, counts until a non-5 rating.
 */
async function backfillStreaks(knex: Knex): Promise<void> {
  const shops = await knex("shops").select("shop_id")

  for (const shop of shops) {
    const ratings = await knex("shop_ratings")
      .where("shop_id", shop.shop_id)
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

    if (streak > 0) {
      await knex("shops").where("shop_id", shop.shop_id).update({ streak })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("shops", (table) => {
    table.dropColumn("total_orders")
    table.dropColumn("total_completed")
    table.dropColumn("avg_completion_hours")
    table.dropColumn("streak")
    table.dropColumn("response_rate")
  })
}
