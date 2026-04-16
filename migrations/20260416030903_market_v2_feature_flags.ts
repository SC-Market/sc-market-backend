import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  // Create user_preferences table for feature flags
  await knex.schema.createTable('user_preferences', (table) => {
    table.uuid('preference_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().unique();
    table.string('market_version', 10).notNullable().defaultTo('V1');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Add index on user_id for fast lookups
    table.index('user_id', 'idx_user_preferences_user_id');
    
    // Add check constraint for market_version
    table.check('market_version IN (\'V1\', \'V2\')', [], 'chk_market_version');
  });
  
  // Add comment to table
  await knex.raw(`
    COMMENT ON TABLE user_preferences IS 'User preferences including market version feature flag'
  `);
  
  await knex.raw(`
    COMMENT ON COLUMN user_preferences.market_version IS 'Market version preference: V1 (production) or V2 (beta)'
  `);
}


export async function down(knex: Knex): Promise<void> {
  // Drop user_preferences table
  await knex.schema.dropTableIfExists('user_preferences');
}

