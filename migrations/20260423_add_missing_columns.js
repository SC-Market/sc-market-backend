/**
 * Add missing columns across multiple tables.
 * Safe to run multiple times — uses IF NOT EXISTS pattern.
 */
exports.up = async function(knex) {
  // buy_orders_v2: quality_value_min/max
  const hasBuyOrderQV = await knex.schema.hasColumn('buy_orders_v2', 'quality_value_min')
  if (!hasBuyOrderQV) {
    await knex.schema.alterTable('buy_orders_v2', (t) => {
      t.integer('quality_value_min').nullable()
      t.integer('quality_value_max').nullable()
    })
  }

  // user_blueprint_inventory: blueprint_name
  const hasUBIName = await knex.schema.hasColumn('user_blueprint_inventory', 'blueprint_name')
  if (!hasUBIName) {
    await knex.schema.alterTable('user_blueprint_inventory', (t) => {
      t.string('blueprint_name', 255).nullable()
    })
    // Backfill from blueprints table
    await knex.raw(`
      UPDATE user_blueprint_inventory ubi
      SET blueprint_name = b.blueprint_name
      FROM blueprints b
      WHERE ubi.blueprint_id = b.blueprint_id
        AND ubi.blueprint_name IS NULL
    `)
  }

  // missions: time_to_complete, destinations, item_rewards, token_substitutions
  const hasTTC = await knex.schema.hasColumn('missions', 'time_to_complete')
  if (!hasTTC) {
    await knex.schema.alterTable('missions', (t) => {
      t.integer('time_to_complete').nullable()
      t.jsonb('destinations').nullable()
      t.jsonb('item_rewards').nullable()
      t.jsonb('token_substitutions').nullable()
    })
  }

  // blueprints: source
  const hasBPSource = await knex.schema.hasColumn('blueprints', 'source')
  if (!hasBPSource) {
    await knex.schema.alterTable('blueprints', (t) => {
      t.string('source', 50).nullable()
    })
  }

  // mission_ship_encounters: alignment, ship_pool
  const hasAlignment = await knex.schema.hasColumn('mission_ship_encounters', 'alignment')
  if (!hasAlignment) {
    await knex.schema.alterTable('mission_ship_encounters', (t) => {
      t.string('alignment', 20).defaultTo('neutral')
      t.jsonb('ship_pool').nullable()
    })
  }

  // mission_blueprint_rewards: pool_name, pool_chance
  const hasPoolName = await knex.schema.hasColumn('mission_blueprint_rewards', 'pool_name')
  if (!hasPoolName) {
    await knex.schema.alterTable('mission_blueprint_rewards', (t) => {
      t.string('pool_name', 255).nullable()
      t.decimal('pool_chance', 5, 4).nullable()
    })
  }
}

exports.down = async function(knex) {
  // Reverse is optional — these are additive columns
}
