import type { Knex } from "knex"

/**
 * Watchlist price alerts:
 * - watchlist_items.game_item_id: set when the user picked a specific game item
 *   (bot `/watchlist add` autocomplete); such items match listings of exactly
 *   that item instead of a text match on the title.
 * - notification action `price_alert` (entity: V2 `listings`), so the alerts
 *   get push/email preferences through the existing per-action preference
 *   tables and show up in Settings -> Push / Email.
 * - notification_channel_preferences: per-user, per-action toggles for the
 *   channels that had no preference table yet (site notification, Discord DM).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("watchlist_items", (table) => {
    table
      .uuid("game_item_id")
      .nullable()
      .references("id")
      .inTable("game_items")
      .onDelete("CASCADE")
    table.index(["game_item_id"])
  })

  // notification_actions ids are assigned by hand (1-22, 81, 82 so far); take
  // the next free one rather than guessing a fixed id.
  await knex.raw(`
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           'price_alert', 'listings'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = 'price_alert')
  `)

  await knex.schema.createTable("notification_channel_preferences", (table) => {
    table
      .uuid("user_id")
      .notNullable()
      .references("user_id")
      .inTable("accounts")
      .onDelete("CASCADE")
    table
      .integer("action_type_id")
      .notNullable()
      .references("action_type_id")
      .inTable("notification_actions")
      .onDelete("CASCADE")
    table.string("channel", 16).notNullable()
    table.boolean("enabled").notNullable()
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())
    table.primary(["user_id", "action_type_id", "channel"])
  })
  await knex.raw(`
    ALTER TABLE notification_channel_preferences
    ADD CONSTRAINT notification_channel_preferences_channel_check
    CHECK (channel IN ('site', 'discord'))
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notification_channel_preferences")
  await knex("notification_actions").where("action", "price_alert").del()
  await knex.schema.alterTable("watchlist_items", (table) => {
    table.dropIndex(["game_item_id"])
    table.dropColumn("game_item_id")
  })
}
