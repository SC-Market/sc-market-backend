import type { Knex } from "knex"

/**
 * Migrate Discord thread channel configuration from user/org level to shop level.
 *
 * Adds official_server_id and discord_thread_channel_id to the shops table so
 * order/offer threads can be created in a per-shop Discord server + channel.
 * Backfills from the owning contractor (org shops) or owning account (user shops)
 * so existing behavior is preserved. Non-destructive: the source columns on
 * accounts/contractors are left in place and continue to serve as fallback.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("shops", (table) => {
    table.string("official_server_id", 30).nullable()
    table.string("discord_thread_channel_id", 30).nullable()
  })

  // Backfill org-owned shops from the owning contractor
  await knex.raw(`
    UPDATE shops s
    SET official_server_id = c.official_server_id,
        discord_thread_channel_id = c.discord_thread_channel_id
    FROM contractors c
    WHERE s.owner_contractor_id = c.contractor_id
      AND (c.official_server_id IS NOT NULL OR c.discord_thread_channel_id IS NOT NULL)
  `)

  // Backfill user-owned shops from the owning account
  await knex.raw(`
    UPDATE shops s
    SET official_server_id = a.official_server_id,
        discord_thread_channel_id = a.discord_thread_channel_id
    FROM accounts a
    WHERE s.owner_user_id = a.user_id
      AND (a.official_server_id IS NOT NULL OR a.discord_thread_channel_id IS NOT NULL)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("shops", (table) => {
    table.dropColumn("official_server_id")
    table.dropColumn("discord_thread_channel_id")
  })
}
