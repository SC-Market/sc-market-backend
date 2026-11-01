/**
 * The mission list row: the columns and joins of a mission list (search, the
 * mission hubs) and its API shape (MissionSearchResult). Shared so every list
 * returns the same fields.
 */
import type { Knex } from "knex"
import type { HaulingOrder, MissionSearchResult } from "./missions.types.js"

/** Row shape returned by missionListQuery. Decimal columns come back from pg as strings. */
export interface MissionListRow {
  mission_id: string
  mission_code: string
  mission_name: string
  category: string
  career_type: string | null
  legal_status: "LEGAL" | "ILLEGAL" | "UNKNOWN" | null
  difficulty_level: number | null
  star_system: string | null
  planet_moon: string | null
  faction: string | null
  mission_giver_org: string | null
  credit_reward_min: string | number | null
  credit_reward_max: string | number | null
  community_difficulty_avg: string | null
  community_satisfaction_avg: string | null
  is_chain_starter: boolean | null
  is_chain_mission: boolean | null
  is_shareable: boolean | null
  is_unique_mission: boolean | null
  is_illegal: boolean | null
  reputation_reward: number | null
  reward_scope: string | null
  reputation_reward_faction: string | null
  associated_event: string | null
  blueprint_reward_count: number
  blueprint_reward_names: string[] | null
  ship_encounter_count: number
  hauling_orders: HaulingOrder[] | null
}

/**
 * `missions as m` with the list columns: blueprint reward count and names,
 * ship encounter count and hauling orders. `reward_counts.blueprint_count`
 * is available to filters.
 */
export function missionListQuery(knex: Knex): Knex.QueryBuilder<MissionListRow, MissionListRow[]> {
  return knex("missions as m")
    .leftJoin(
      knex("mission_blueprint_rewards as mbr")
        .select("mission_id")
        .count("* as blueprint_count")
        .groupBy("mission_id")
        .as("reward_counts"),
      "m.mission_id",
      "reward_counts.mission_id",
    )
    .leftJoin(
      knex("mission_ship_encounters as mse")
        .select("mission_id")
        .select(knex.raw("SUM((SELECT SUM((w->>'shipCount')::int) FROM jsonb_array_elements(mse.waves::jsonb) w)) as total_ships"))
        .groupBy("mission_id")
        .as("ship_counts"),
      "m.mission_id",
      "ship_counts.mission_id",
    )
    .select<MissionListRow[]>(
      "m.mission_id",
      "m.mission_code",
      "m.mission_name",
      "m.category",
      "m.career_type",
      "m.legal_status",
      "m.difficulty_level",
      "m.star_system",
      "m.planet_moon",
      "m.faction",
      "m.mission_giver_org",
      "m.credit_reward_min",
      "m.credit_reward_max",
      "m.community_difficulty_avg",
      "m.community_satisfaction_avg",
      "m.is_chain_starter",
      "m.is_chain_mission",
      "m.is_shareable",
      "m.is_unique_mission",
      "m.is_illegal",
      "m.reputation_reward",
      "m.reward_scope",
      "m.reputation_reward_faction",
      "m.associated_event",
      knex.raw("COALESCE(reward_counts.blueprint_count, 0)::integer as blueprint_reward_count"),
      knex.raw(`(
        SELECT json_agg(gi.name ORDER BY gi.name)
        FROM mission_blueprint_rewards mbr2
        JOIN blueprints b2 ON mbr2.blueprint_id = b2.blueprint_id
        JOIN game_items gi ON b2.output_game_item_id = gi.id
        WHERE mbr2.mission_id = m.mission_id
      ) as blueprint_reward_names`),
      knex.raw("COALESCE(ship_counts.total_ships, 0)::integer as ship_encounter_count"),
      knex.raw(`(SELECT json_agg(json_build_object('resource_name', mho.resource_name, 'min_scu', mho.min_scu, 'max_scu', mho.max_scu)) FROM mission_hauling_orders mho WHERE mho.mission_id = m.mission_id) as hauling_orders`),
    ) as unknown as Knex.QueryBuilder<MissionListRow, MissionListRow[]>
}

/** A decimal column as a number (pg returns numeric as a string); null/0 → undefined. */
function amount(value: string | number | null): number | undefined {
  if (value === null || value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n !== 0 ? n : undefined
}

/** One list row as the API's MissionSearchResult. */
export function toMissionSearchResult(row: MissionListRow): MissionSearchResult {
  return {
    mission_id: row.mission_id,
    mission_code: row.mission_code,
    mission_name: row.mission_name,
    category: row.category,
    career_type: row.career_type || undefined,
    legal_status: row.legal_status || undefined,
    difficulty_level: row.difficulty_level || undefined,
    star_system: row.star_system || undefined,
    planet_moon: row.planet_moon || undefined,
    faction: row.faction || undefined,
    credit_reward_min: amount(row.credit_reward_min),
    credit_reward_max: amount(row.credit_reward_max),
    blueprint_reward_count: row.blueprint_reward_count || 0,
    blueprint_reward_names: row.blueprint_reward_names || undefined,
    community_difficulty_avg: row.community_difficulty_avg
      ? parseFloat(row.community_difficulty_avg)
      : undefined,
    community_satisfaction_avg: row.community_satisfaction_avg
      ? parseFloat(row.community_satisfaction_avg)
      : undefined,
    is_chain_starter: row.is_chain_starter || false,
    is_chain_mission: row.is_chain_mission || false,
    is_shareable: row.is_shareable || false,
    is_unique_mission: row.is_unique_mission || false,
    is_illegal: row.is_illegal ?? undefined,
    reputation_reward: row.reputation_reward ?? undefined,
    reward_scope: row.reward_scope || undefined,
    reputation_reward_faction: row.reputation_reward_faction || undefined,
    mission_giver_org: row.mission_giver_org || undefined,
    associated_event: row.associated_event || undefined,
    ship_encounter_count: row.ship_encounter_count || 0,
    hauling_orders: row.hauling_orders || undefined,
  }
}
