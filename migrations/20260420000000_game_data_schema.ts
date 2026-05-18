import type { Knex } from "knex";

/**
 * Game Data and Crafting System Schema
 * 
 * Creates 15 new tables for SC Game Data and Crafting System:
 * - game_versions: Track game version metadata (LIVE, PTU, EPTU)
 * - missions: Mission database with rewards and metadata
 * - blueprints: Blueprint/recipe database
 * - blueprint_ingredients: Recipe ingredients
 * - mission_blueprint_rewards: Mission reward pools
 * - crafting_recipes: Detailed crafting formulas
 * - user_blueprint_inventory: Player blueprint tracking
 * - organization_blueprint_inventory: Organization blueprint tracking
 * - wishlists: User wishlists
 * - wishlist_items: Items in wishlists
 * - mission_completions: Player mission tracking
 * - mission_ratings: Community mission ratings
 * - crafting_history: Player crafting records
 * - resources: Game resource database
 * 
 * Also creates:
 * - Database triggers for rating aggregation
 * - Indexes for search performance (GIN, composite, foreign keys)
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // DROP EXISTING OBJECTS (idempotent)
  // ============================================================================
  await knex.raw("DROP TRIGGER IF EXISTS trg_mission_ratings_update ON mission_ratings");
  await knex.raw("DROP FUNCTION IF EXISTS update_mission_ratings()");
  
  await knex.schema.dropTableIfExists("crafting_history");
  await knex.schema.dropTableIfExists("mission_ratings");
  await knex.schema.dropTableIfExists("mission_completions");
  await knex.schema.dropTableIfExists("wishlist_items");
  await knex.schema.dropTableIfExists("wishlists");
  // await knex.schema.dropTableIfExists("organization_blueprint_inventory"); // Commented out - not created
  await knex.schema.dropTableIfExists("user_blueprint_inventory");
  await knex.schema.dropTableIfExists("crafting_recipes");
  await knex.schema.dropTableIfExists("mission_blueprint_rewards");
  await knex.schema.dropTableIfExists("blueprint_ingredients");
  await knex.schema.dropTableIfExists("resources");
  await knex.schema.dropTableIfExists("blueprints");
  await knex.schema.dropTableIfExists("missions");
  await knex.schema.dropTableIfExists("game_versions");

  // ============================================================================
  // CREATE TABLES
  // ============================================================================

  // ============================================================================
  // GAME_VERSIONS TABLE
  // ============================================================================
  await knex.schema.createTable('game_versions', (table) => {
    table.uuid('version_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('version_type', 20).notNullable();
    table.string('version_number', 50).notNullable();
    table.string('build_number', 50);
    table.timestamp('release_date');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_data_update');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.unique(['version_type', 'version_number']);
    table.check("version_type IN ('LIVE', 'PTU', 'EPTU')", [], 'chk_game_versions_type');
  });

  await knex.raw(`
    CREATE INDEX idx_game_versions_type_active ON game_versions(version_type, is_active) WHERE is_active = true
  `);

  await knex.raw(`
    COMMENT ON TABLE game_versions IS 'Game version tracking for LIVE, PTU, EPTU'
  `);

  // ============================================================================
  // MISSIONS TABLE
  // ============================================================================
  await knex.schema.createTable('missions', (table) => {
    table.uuid('mission_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('version_id').notNullable().references('version_id').inTable('game_versions').onDelete('CASCADE');
    
    // Mission identification
    table.string('mission_code', 200).notNullable().unique();
    table.string('mission_name', 500).notNullable();
    table.text('mission_description');
    
    // Classification
    table.string('category', 100).notNullable();
    table.string('mission_type', 100);
    table.string('career_type', 100);
    table.string('legal_status', 20);
    table.integer('difficulty_level');
    
    // Location
    table.string('star_system', 100);
    table.string('planet_moon', 100);
    table.string('location_detail', 200);
    
    // Organization and faction
    table.string('mission_giver_org', 200);
    table.string('faction', 200);
    
    // Rewards
    table.bigInteger('credit_reward_min');
    table.bigInteger('credit_reward_max');
    table.integer('reputation_reward');
    
    // Availability
    table.boolean('is_shareable').defaultTo(false);
    table.string('availability_type', 50);
    table.string('associated_event', 100);
    table.integer('required_rank');
    table.integer('required_reputation');
    
    // Chain information
    table.boolean('is_chain_starter').defaultTo(false);
    table.boolean('is_chain_mission').defaultTo(false);
    table.boolean('is_unique_mission').defaultTo(false);
    table.jsonb('prerequisite_missions');
    
    // Metadata
    table.bigInteger('estimated_uec_per_hour');
    table.integer('estimated_rep_per_hour');
    table.integer('rank_index');
    table.string('reward_scope', 50);
    
    // Community ratings
    table.decimal('community_difficulty_avg', 3, 2);
    table.integer('community_difficulty_count').defaultTo(0);
    table.decimal('community_satisfaction_avg', 3, 2);
    table.integer('community_satisfaction_count').defaultTo(0);
    
    // Data source
    table.string('data_source', 50).defaultTo('extraction');
    table.boolean('is_verified').defaultTo(false);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.check("legal_status IN ('LEGAL', 'ILLEGAL', 'UNKNOWN') OR legal_status IS NULL", [], 'chk_missions_legal_status');
    table.check("difficulty_level BETWEEN 1 AND 5 OR difficulty_level IS NULL", [], 'chk_missions_difficulty');
  });

  // Indexes for missions
  await knex.schema.alterTable('missions', (table) => {
    table.index(['version_id'], 'idx_missions_version');
    table.index(['category'], 'idx_missions_category');
    table.index(['career_type'], 'idx_missions_career');
    table.index(['star_system', 'planet_moon'], 'idx_missions_location');
    table.index(['faction'], 'idx_missions_faction');
  });

  // Full-text search index for mission names
  await knex.raw(`
    CREATE INDEX idx_missions_name_fts ON missions USING GIN (to_tsvector('english', mission_name))
  `);

  await knex.raw(`
    COMMENT ON TABLE missions IS 'Mission database with rewards and metadata';
    COMMENT ON COLUMN missions.mission_code IS 'Unique identifier from game data';
  `);

  // ============================================================================
  // BLUEPRINTS TABLE
  // ============================================================================
  await knex.schema.createTable('blueprints', (table) => {
    table.uuid('blueprint_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('version_id').notNullable().references('version_id').inTable('game_versions').onDelete('CASCADE');
    
    // Blueprint identification
    table.string('blueprint_code', 200).notNullable();
    table.string('blueprint_name', 500).notNullable();
    table.text('blueprint_description');
    
    // Output item
    table.uuid('output_game_item_id').notNullable().references('id').inTable('game_items');
    table.integer('output_quantity').notNullable().defaultTo(1);
    
    // Classification
    table.string('item_category', 100);
    table.string('item_subcategory', 100);
    table.string('rarity', 50);
    table.integer('tier');
    
    // Crafting requirements
    table.string('crafting_station_type', 100);
    table.integer('crafting_time_seconds');
    table.integer('required_skill_level');
    
    // Metadata
    table.string('icon_url', 500);
    table.boolean('is_active').defaultTo(true);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.unique(['version_id', 'blueprint_code']);
    table.check("tier BETWEEN 1 AND 5 OR tier IS NULL", [], 'chk_blueprints_tier');
  });

  // Indexes for blueprints
  await knex.schema.alterTable('blueprints', (table) => {
    table.index(['version_id'], 'idx_blueprints_version');
    table.index(['output_game_item_id'], 'idx_blueprints_output_item');
    table.index(['item_category', 'item_subcategory'], 'idx_blueprints_category');
    table.index(['rarity'], 'idx_blueprints_rarity');
  });

  // Full-text search index for blueprint names
  await knex.raw(`
    CREATE INDEX idx_blueprints_name_fts ON blueprints USING GIN (to_tsvector('english', blueprint_name))
  `);

  await knex.raw(`
    COMMENT ON TABLE blueprints IS 'Blueprint database with crafting recipes'
  `);

  // ============================================================================
  // BLUEPRINT_INGREDIENTS TABLE
  // ============================================================================
  await knex.schema.createTable('blueprint_ingredients', (table) => {
    table.uuid('ingredient_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('blueprint_id').notNullable().references('blueprint_id').inTable('blueprints').onDelete('CASCADE');
    
    // Ingredient item
    table.uuid('ingredient_game_item_id').notNullable().references('id').inTable('game_items');
    table.integer('quantity_required').notNullable();
    
    // Quality requirements
    table.integer('min_quality_tier');
    table.integer('recommended_quality_tier');
    
    // Alternative ingredients
    table.boolean('is_alternative').defaultTo(false);
    table.integer('alternative_group');
    
    // Display
    table.integer('display_order').defaultTo(0);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    table.check("min_quality_tier BETWEEN 1 AND 5 OR min_quality_tier IS NULL", [], 'chk_ingredients_min_quality');
    table.check("recommended_quality_tier BETWEEN 1 AND 5 OR recommended_quality_tier IS NULL", [], 'chk_ingredients_rec_quality');
  });

  await knex.schema.alterTable('blueprint_ingredients', (table) => {
    table.index(['blueprint_id'], 'idx_blueprint_ingredients_blueprint');
    table.index(['ingredient_game_item_id'], 'idx_blueprint_ingredients_item');
  });

  await knex.raw(`
    COMMENT ON TABLE blueprint_ingredients IS 'Ingredients required for each blueprint'
  `);

  // ============================================================================
  // MISSION_BLUEPRINT_REWARDS TABLE
  // ============================================================================
  await knex.schema.createTable('mission_blueprint_rewards', (table) => {
    table.uuid('reward_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('mission_id').notNullable().references('mission_id').inTable('missions').onDelete('CASCADE');
    table.uuid('blueprint_id').notNullable().references('blueprint_id').inTable('blueprints').onDelete('CASCADE');
    
    // Reward pool information
    table.integer('reward_pool_id').notNullable().defaultTo(1);
    table.integer('reward_pool_size').notNullable();
    table.integer('selection_count').notNullable().defaultTo(1);
    
    // Probability
    table.decimal('drop_probability', 5, 2).notNullable();
    table.boolean('is_guaranteed').defaultTo(false);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('mission_blueprint_rewards', (table) => {
    table.index(['mission_id'], 'idx_mission_rewards_mission');
    table.index(['blueprint_id'], 'idx_mission_rewards_blueprint');
    table.index(['mission_id', 'reward_pool_id'], 'idx_mission_rewards_pool');
  });

  await knex.raw(`
    COMMENT ON TABLE mission_blueprint_rewards IS 'Blueprint rewards for missions';
    COMMENT ON COLUMN mission_blueprint_rewards.drop_probability IS 'Percentage chance (0-100)';
  `);

  // ============================================================================
  // CRAFTING_RECIPES TABLE
  // ============================================================================
  await knex.schema.createTable('crafting_recipes', (table) => {
    table.uuid('recipe_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('blueprint_id').notNullable().references('blueprint_id').inTable('blueprints').onDelete('CASCADE');
    table.uuid('version_id').notNullable().references('version_id').inTable('game_versions').onDelete('CASCADE');
    
    // Quality calculation formula
    table.string('quality_calculation_type', 50).notNullable().defaultTo('weighted_average');
    table.jsonb('quality_formula');
    
    // Output quality ranges
    table.integer('min_output_quality_tier').notNullable().defaultTo(1);
    table.integer('max_output_quality_tier').notNullable().defaultTo(5);
    
    // Crafting parameters
    table.decimal('base_success_rate', 5, 2).defaultTo(100.00);
    table.decimal('critical_success_chance', 5, 2).defaultTo(0.00);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.unique(['blueprint_id', 'version_id']);
  });

  await knex.schema.alterTable('crafting_recipes', (table) => {
    table.index(['blueprint_id'], 'idx_crafting_recipes_blueprint');
  });

  await knex.raw(`
    COMMENT ON TABLE crafting_recipes IS 'Crafting calculation formulas';
    COMMENT ON COLUMN crafting_recipes.quality_formula IS 'JSONB formula for quality calculation';
  `);

  // ============================================================================
  // USER_BLUEPRINT_INVENTORY TABLE
  // ============================================================================
  await knex.schema.createTable('user_blueprint_inventory', (table) => {
    table.uuid('inventory_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('user_id').inTable('accounts').onDelete('CASCADE');
    table.uuid('blueprint_id').notNullable().references('blueprint_id').inTable('blueprints').onDelete('CASCADE');
    
    // Acquisition tracking
    table.boolean('is_owned').notNullable().defaultTo(true);
    table.timestamp('acquisition_date');
    table.string('acquisition_method', 100);
    table.string('acquisition_location', 200);
    table.text('acquisition_notes');
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.unique(['user_id', 'blueprint_id']);
  });

  await knex.schema.alterTable('user_blueprint_inventory', (table) => {
    table.index(['user_id'], 'idx_user_blueprints_user');
  });

  await knex.raw(`
    CREATE INDEX idx_user_blueprints_owned ON user_blueprint_inventory(user_id, is_owned) WHERE is_owned = true
  `);

  await knex.raw(`
    COMMENT ON TABLE user_blueprint_inventory IS 'Player-owned blueprints'
  `);

  // ============================================================================
  // ORGANIZATION_BLUEPRINT_INVENTORY TABLE
  // ============================================================================
  // Note: This table is created but will only be functional when organizations table exists
  // For now, we skip creating this table until organizations are implemented
  /*
  await knex.schema.createTable('organization_blueprint_inventory', (table) => {
    table.uuid('inventory_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('organization_id').inTable('organizations').onDelete('CASCADE');
    table.uuid('blueprint_id').notNullable().references('blueprint_id').inTable('blueprints').onDelete('CASCADE');
    
    // Member ownership tracking
    table.specificType('owned_by_members', 'UUID[]').defaultTo('{}');
    
    // Organization ownership
    table.boolean('is_org_owned').defaultTo(false);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.unique(['organization_id', 'blueprint_id']);
  });

  await knex.schema.alterTable('organization_blueprint_inventory', (table) => {
    table.index(['organization_id'], 'idx_org_blueprints_org');
  });

  await knex.raw(`
    COMMENT ON TABLE organization_blueprint_inventory IS 'Organization blueprint tracking';
    COMMENT ON COLUMN organization_blueprint_inventory.owned_by_members IS 'Array of user_ids who own this blueprint';
  `);
  */

  // ============================================================================
  // WISHLISTS TABLE
  // ============================================================================
  await knex.schema.createTable('wishlists', (table) => {
    table.uuid('wishlist_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('user_id').inTable('accounts').onDelete('CASCADE');
    
    // Wishlist metadata
    table.string('wishlist_name', 200).notNullable();
    table.text('wishlist_description');
    
    // Sharing
    table.boolean('is_public').defaultTo(false);
    table.string('share_token', 100).unique();
    
    // Organization sharing (optional - will be NULL until organizations are implemented)
    table.uuid('organization_id'); // No foreign key constraint until organizations table exists
    table.boolean('is_collaborative').defaultTo(false);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('wishlists', (table) => {
    table.index(['user_id'], 'idx_wishlists_user');
    // Skip organization_id index until organizations table exists
    // table.index(['organization_id'], 'idx_wishlists_org');
  });

  await knex.raw(`
    CREATE INDEX idx_wishlists_share_token ON wishlists(share_token) WHERE share_token IS NOT NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE wishlists IS 'User wishlists for items and blueprints'
  `);

  // ============================================================================
  // WISHLIST_ITEMS TABLE
  // ============================================================================
  await knex.schema.createTable('wishlist_items', (table) => {
    table.uuid('item_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('wishlist_id').notNullable().references('wishlist_id').inTable('wishlists').onDelete('CASCADE');
    
    // Item reference
    table.uuid('game_item_id').notNullable().references('id').inTable('game_items');
    
    // Desired specifications
    table.integer('desired_quantity').notNullable().defaultTo(1);
    table.integer('desired_quality_tier');
    
    // Blueprint reference (if craftable)
    table.uuid('blueprint_id').references('blueprint_id').inTable('blueprints').onDelete('SET NULL');
    
    // Priority
    table.integer('priority').defaultTo(0);
    table.text('notes');
    
    // Status
    table.boolean('is_acquired').defaultTo(false);
    table.integer('acquired_quantity').defaultTo(0);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.check("desired_quality_tier BETWEEN 1 AND 5 OR desired_quality_tier IS NULL", [], 'chk_wishlist_items_quality');
  });

  await knex.schema.alterTable('wishlist_items', (table) => {
    table.index(['wishlist_id'], 'idx_wishlist_items_wishlist');
    table.index(['game_item_id'], 'idx_wishlist_items_game_item');
    table.index(['blueprint_id'], 'idx_wishlist_items_blueprint');
  });

  await knex.raw(`
    COMMENT ON TABLE wishlist_items IS 'Items in user wishlists'
  `);

  // ============================================================================
  // MISSION_COMPLETIONS TABLE
  // ============================================================================
  await knex.schema.createTable('mission_completions', (table) => {
    table.uuid('completion_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('user_id').inTable('accounts').onDelete('CASCADE');
    table.uuid('mission_id').notNullable().references('mission_id').inTable('missions').onDelete('CASCADE');
    
    // Completion tracking
    table.timestamp('completion_date').notNullable().defaultTo(knex.fn.now());
    table.specificType('blueprints_rewarded', 'UUID[]').defaultTo('{}');
    
    // Notes
    table.text('completion_notes');
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('mission_completions', (table) => {
    table.index(['user_id'], 'idx_mission_completions_user');
    table.index(['mission_id'], 'idx_mission_completions_mission');
    table.index(['user_id', 'completion_date'], 'idx_mission_completions_date');
  });

  await knex.raw(`
    COMMENT ON TABLE mission_completions IS 'Player mission completion tracking';
    COMMENT ON COLUMN mission_completions.blueprints_rewarded IS 'Array of blueprint_ids received';
  `);

  // ============================================================================
  // MISSION_RATINGS TABLE
  // ============================================================================
  await knex.schema.createTable('mission_ratings', (table) => {
    table.uuid('rating_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('user_id').inTable('accounts').onDelete('CASCADE');
    table.uuid('mission_id').notNullable().references('mission_id').inTable('missions').onDelete('CASCADE');
    
    // Ratings
    table.integer('difficulty_rating').notNullable();
    table.integer('satisfaction_rating').notNullable();
    
    // Optional feedback
    table.text('rating_comment');
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.unique(['user_id', 'mission_id']);
    table.check("difficulty_rating BETWEEN 1 AND 5", [], 'chk_mission_ratings_difficulty');
    table.check("satisfaction_rating BETWEEN 1 AND 5", [], 'chk_mission_ratings_satisfaction');
  });

  await knex.schema.alterTable('mission_ratings', (table) => {
    table.index(['mission_id'], 'idx_mission_ratings_mission');
  });

  await knex.raw(`
    COMMENT ON TABLE mission_ratings IS 'Community ratings for missions'
  `);

  // ============================================================================
  // CRAFTING_HISTORY TABLE
  // ============================================================================
  await knex.schema.createTable('crafting_history', (table) => {
    table.uuid('history_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('user_id').inTable('accounts').onDelete('CASCADE');
    table.uuid('blueprint_id').notNullable().references('blueprint_id').inTable('blueprints').onDelete('CASCADE');
    
    // Crafting details
    table.timestamp('crafting_date').notNullable().defaultTo(knex.fn.now());
    
    // Input materials (JSONB array of {game_item_id, quantity, quality_tier, quality_value})
    table.jsonb('input_materials').notNullable();
    
    // Output results
    table.integer('output_quality_tier').notNullable();
    table.decimal('output_quality_value', 5, 2).notNullable();
    table.integer('output_quantity').notNullable().defaultTo(1);
    
    // Success tracking
    table.boolean('was_critical_success').defaultTo(false);
    
    // Cost tracking
    table.bigInteger('total_material_cost');
    table.bigInteger('crafting_station_fee');
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('crafting_history', (table) => {
    table.index(['user_id'], 'idx_crafting_history_user');
    table.index(['blueprint_id'], 'idx_crafting_history_blueprint');
    table.index(['user_id', 'crafting_date'], 'idx_crafting_history_date');
  });

  await knex.raw(`
    COMMENT ON TABLE crafting_history IS 'Player crafting history'
  `);

  // ============================================================================
  // RESOURCES TABLE
  // ============================================================================
  await knex.schema.createTable('resources', (table) => {
    table.uuid('resource_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('version_id').notNullable().references('version_id').inTable('game_versions').onDelete('CASCADE');
    
    // Resource identification
    table.uuid('game_item_id').notNullable().references('id').inTable('game_items');
    
    // Classification
    table.string('resource_category', 100).notNullable();
    table.string('resource_subcategory', 100);
    
    // Properties
    table.integer('max_stack_size');
    table.bigInteger('base_value');
    
    // Acquisition methods
    table.boolean('can_be_mined').defaultTo(false);
    table.boolean('can_be_purchased').defaultTo(false);
    table.boolean('can_be_salvaged').defaultTo(false);
    table.boolean('can_be_looted').defaultTo(false);
    
    // Locations
    table.jsonb('mining_locations');
    table.jsonb('purchase_locations');
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.unique(['version_id', 'game_item_id']);
  });

  await knex.schema.alterTable('resources', (table) => {
    table.index(['version_id'], 'idx_resources_version');
    table.index(['resource_category', 'resource_subcategory'], 'idx_resources_category');
    table.index(['game_item_id'], 'idx_resources_game_item');
  });

  await knex.raw(`
    COMMENT ON TABLE resources IS 'Game resource database (178+ resources)'
  `);

  // ============================================================================
  // CREATE TRIGGERS
  // ============================================================================

  // Trigger function to update mission rating averages
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_mission_ratings()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE missions
      SET 
        community_difficulty_avg = (
          SELECT AVG(difficulty_rating)::DECIMAL(3,2)
          FROM mission_ratings
          WHERE mission_id = COALESCE(NEW.mission_id, OLD.mission_id)
        ),
        community_difficulty_count = (
          SELECT COUNT(*)
          FROM mission_ratings
          WHERE mission_id = COALESCE(NEW.mission_id, OLD.mission_id)
        ),
        community_satisfaction_avg = (
          SELECT AVG(satisfaction_rating)::DECIMAL(3,2)
          FROM mission_ratings
          WHERE mission_id = COALESCE(NEW.mission_id, OLD.mission_id)
        ),
        community_satisfaction_count = (
          SELECT COUNT(*)
          FROM mission_ratings
          WHERE mission_id = COALESCE(NEW.mission_id, OLD.mission_id)
        ),
        updated_at = NOW()
      WHERE mission_id = COALESCE(NEW.mission_id, OLD.mission_id);
      
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger on mission_ratings table
  await knex.raw(`
    CREATE TRIGGER trg_mission_ratings_update
    AFTER INSERT OR UPDATE OR DELETE ON mission_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_mission_ratings();
  `);
}


/**
 * Rollback migration - drops all game data tables and triggers
 */
export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  await knex.raw("DROP TRIGGER IF EXISTS trg_mission_ratings_update ON mission_ratings");
  await knex.raw("DROP FUNCTION IF EXISTS update_mission_ratings()");
  
  // Drop tables in reverse order (respecting foreign key dependencies)
  await knex.schema.dropTableIfExists("crafting_history");
  await knex.schema.dropTableIfExists("mission_ratings");
  await knex.schema.dropTableIfExists("mission_completions");
  await knex.schema.dropTableIfExists("wishlist_items");
  await knex.schema.dropTableIfExists("wishlists");
  // await knex.schema.dropTableIfExists("organization_blueprint_inventory"); // Commented out - not created
  await knex.schema.dropTableIfExists("user_blueprint_inventory");
  await knex.schema.dropTableIfExists("crafting_recipes");
  await knex.schema.dropTableIfExists("mission_blueprint_rewards");
  await knex.schema.dropTableIfExists("blueprint_ingredients");
  await knex.schema.dropTableIfExists("resources");
  await knex.schema.dropTableIfExists("blueprints");
  await knex.schema.dropTableIfExists("missions");
  await knex.schema.dropTableIfExists("game_versions");
}
