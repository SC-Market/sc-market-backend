import type { Knex } from "knex"

/**
 * Lookups of the item acquisition hub (services/item-acquisition):
 *
 * - mission_item_reward_keys(item_rewards): the game-file keys of a mission's
 *   item rewards (`id:<p4k_id>`, `file:<record class name>`), with a GIN index
 *   on missions, so "missions that reward this item" doesn't scan every
 *   mission's jsonb. Mirrors rewardKeys() in reward-resolution.ts.
 * - lower(p4k_file) on game_items: resolving a reward's record class name to
 *   a game item.
 *
 * "Blueprints that make this item" is already indexed
 * (idx_blueprints_output_item, idx_mission_rewards_blueprint).
 *
 * Neither table is hot (migration-lock-rules.test.ts): both are written only
 * by the game data import. CREATE INDEX takes a SHARE lock (reads continue)
 * on a few thousand rows; lock_timeout makes it fail fast rather than queue.
 * Idempotent: CREATE OR REPLACE / IF NOT EXISTS.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(String.raw`
    CREATE OR REPLACE FUNCTION mission_item_reward_keys(rewards jsonb)
    RETURNS text[]
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $fn$
      SELECT COALESCE(array_agg(DISTINCT x.k ORDER BY x.k), '{}'::text[])
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(rewards) = 'array' THEN rewards ELSE '[]'::jsonb END
      ) AS e(v)
      CROSS JOIN LATERAL (VALUES
        (CASE
          WHEN jsonb_typeof(e.v) = 'object'
            AND (e.v->>'itemId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN 'id:' || lower(e.v->>'itemId')
        END),
        (CASE
          WHEN jsonb_typeof(e.v) = 'object' AND COALESCE(e.v->>'ref', '') <> ''
          THEN 'file:' || lower(regexp_replace(regexp_replace(e.v->>'ref', '^.*/', ''), '\.json$', '', 'i'))
        END)
      ) AS x(k)
      WHERE x.k IS NOT NULL AND x.k <> 'file:'
    $fn$
  `)
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_missions_item_reward_keys ON missions USING GIN (mission_item_reward_keys(item_rewards))",
  )
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_game_items_p4k_file_lower ON game_items (lower(p4k_file))",
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("DROP INDEX IF EXISTS idx_game_items_p4k_file_lower")
  await knex.raw("DROP INDEX IF EXISTS idx_missions_item_reward_keys")
  await knex.raw("DROP FUNCTION IF EXISTS mission_item_reward_keys(jsonb)")
}
