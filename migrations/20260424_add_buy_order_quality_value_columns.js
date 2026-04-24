exports.up = async function(knex) {
  const has = await knex.schema.hasColumn('buy_orders_v2', 'quality_value_min')
  if (!has) {
    await knex.schema.alterTable('buy_orders_v2', (t) => {
      t.integer('quality_value_min').nullable()
      t.integer('quality_value_max').nullable()
    })
  }

  // Also add blueprint_name to user_blueprint_inventory if missing
  const hasBpName = await knex.schema.hasColumn('user_blueprint_inventory', 'blueprint_name')
  if (!hasBpName) {
    await knex.schema.alterTable('user_blueprint_inventory', (t) => {
      t.string('blueprint_name', 255).nullable()
    })
    await knex.raw(`
      UPDATE user_blueprint_inventory ubi
      SET blueprint_name = b.blueprint_name
      FROM blueprints b
      WHERE ubi.blueprint_id = b.blueprint_id AND ubi.blueprint_name IS NULL
    `)
  }
}

exports.down = async function() {}
