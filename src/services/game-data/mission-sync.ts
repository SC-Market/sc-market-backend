/**
 * Mission import planning: which mission rows to insert, update, deactivate
 * or leave alone. Pure (no database), so the rules are unit-tested.
 *
 * Missions keep a stable identity across imports. A mission is keyed by
 * (version_id, mission_code); mission_code is the game record name, which is
 * also the public URL (/missions/<code>) and the key the reward and event
 * links resolve by. Its mission_id never changes once inserted: user data
 * (mission_completions, mission_ratings) references it.
 *
 * - new code: insert
 * - known code, content differs: update only the changed columns (and the
 *   changed child tables), same mission_id; updated_at moves
 * - known code, same content: no write at all, updated_at (sitemap lastmod)
 *   stays
 * - known code that was deactivated: reactivated with the same mission_id
 * - code missing from this import: deactivated (is_active = false,
 *   removed_in_version), never deleted, so its completions/ratings survive
 * - the same code twice in one import: the last one is used (it is what the
 *   old per-row upsert left in place), and the code is reported
 */
import type { P4KMission } from "./import.service.js"
import {
  changedColumns,
  intOrNull,
  sameRows,
  type ColumnKinds,
} from "./import-diff.js"

/** Column kinds of the missions columns the import writes. */
export const MISSION_COLUMNS: ColumnKinds = {
  mission_code: "str",
  mission_name: "str",
  mission_description: "str",
  category: "str",
  mission_type: "str",
  career_type: "str",
  template_name: "str",
  title_loc_key: "str",
  mission_giver_org: "str",
  credit_reward_min: "num",
  credit_reward_max: "num",
  min_standing: "str",
  max_standing: "str",
  min_standing_name: "str",
  min_standing_xp: "num",
  max_standing_name: "str",
  max_standing_xp: "num",
  reputation_reward_amount: "num",
  reputation_reward_scope: "str",
  reputation_reward_faction: "str",
  reputation_reward: "num",
  reward_scope: "str",
  is_shareable: "bool",
  is_unique_mission: "bool",
  available_in_prison: "bool",
  hide_in_mobiglas: "bool",
  accept_locations: "json",
  time_to_complete: "real",
  destinations: "json",
  item_rewards: "json",
  token_substitutions: "json",
  max_players_per_instance: "num",
  is_intro: "bool",
  linked_intros: "json",
  buy_in: "num",
  can_reaccept_after_failing: "bool",
  can_reaccept_after_abandoning: "bool",
  abandoned_cooldown_time: "real",
  personal_cooldown_time: "real",
  deadline_seconds: "real",
  has_blueprint_rewards: "bool",
  variant_count: "num",
  is_illegal: "bool",
  is_lawful: "bool",
  difficulty_from_broker: "num",
  star_system_derived: "str",
  star_system: "str",
  faction: "str",
  max_crimestat: "num",
  data_source: "str",
  is_verified: "bool",
}

export const MISSION_CHILD_KINDS = [
  "ships",
  "npcs",
  "hauling",
  "entities",
] as const
export type MissionChildKind = (typeof MISSION_CHILD_KINDS)[number]

/** Per child kind: its table and the columns the import writes (besides mission_id). */
export const MISSION_CHILD_TABLES: Readonly<
  Record<MissionChildKind, { table: string; columns: ColumnKinds }>
> = {
  ships: {
    table: "mission_ship_encounters",
    columns: {
      role: "str",
      alignment: "str",
      waves: "json",
      ship_pool: "json",
    },
  },
  npcs: {
    table: "mission_npc_encounters",
    columns: { name: "str", count: "num" },
  },
  hauling: {
    table: "mission_hauling_orders",
    columns: { resource_name: "str", min_scu: "num", max_scu: "num" },
  },
  entities: {
    table: "mission_entity_spawns",
    columns: { name: "str", count: "num" },
  },
}

export type MissionRecord = Record<string, unknown>
export type ChildRow = Record<string, unknown>
export type MissionChildren = Record<MissionChildKind, ChildRow[]>

export interface IncomingMission {
  code: string
  record: MissionRecord
  children: MissionChildren
}

export interface ExistingMission {
  mission_id: string
  mission_code: string
  is_active: boolean
  /** The stored row (at least the MISSION_COLUMNS). */
  values: Record<string, unknown>
  children: MissionChildren
}

export interface MissionUpdate {
  missionId: string
  code: string
  /** Only the changed MISSION_COLUMNS, with their new values. */
  changes: MissionRecord
  /** Was inactive and is back in this import. */
  reactivate: boolean
  /** Child tables whose rows differ: replace that mission's rows in each. */
  childKinds: MissionChildKind[]
  children: MissionChildren
}

export interface MissionSyncPlan {
  inserts: IncomingMission[]
  updates: MissionUpdate[]
  deactivations: Array<{ missionId: string; code: string }>
  unchanged: number
  /** Codes that appeared more than once in the import (the last one is used). */
  duplicateCodes: string[]
}

export function emptyMissionChildren(): MissionChildren {
  return { ships: [], npcs: [], hauling: [], entities: [] }
}

/** The first of each key, like the unique (mission_id, key) constraints require. */
function firstByKey<T>(rows: T[] | undefined, key: (row: T) => unknown): T[] {
  if (!rows?.length) return []
  const seen = new Set<unknown>()
  return rows.filter((row) => {
    const k = key(row)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * The missions row an import writes for one extracted mission (no version_id,
 * timestamps or is_active: the sync owns those). jsonb columns hold native
 * values; serialize with serializeJsonColumns before writing.
 */
export function buildMissionRecord(
  mission: P4KMission,
  category: string,
): MissionRecord {
  const rep = mission.reputationRewards?.[0]
  return {
    mission_code: mission.name,
    mission_name: mission.title || mission.name,
    mission_description: mission.description ?? null,
    category,
    mission_type: mission.type ?? null,
    career_type: mission.career ?? null,
    template_name: mission.template ?? null,
    title_loc_key: mission.titleKey ?? null,
    mission_giver_org: mission.missionGiver ?? null,
    credit_reward_min: intOrNull(mission.reward?.uec || null),
    credit_reward_max: intOrNull(
      mission.reward?.max || mission.reward?.uec || null,
    ),
    min_standing: mission.minStanding?.code || null,
    max_standing: mission.maxStanding?.code || null,
    min_standing_name: mission.minStanding?.displayName || null,
    min_standing_xp: intOrNull(mission.minStanding?.xp),
    max_standing_name: mission.maxStanding?.displayName || null,
    max_standing_xp: intOrNull(mission.maxStanding?.xp),
    reputation_reward_amount: intOrNull(rep?.amount),
    reputation_reward_scope: rep?.scope ?? null,
    reputation_reward_faction: rep?.factionName || null,
    reputation_reward: intOrNull(rep?.amount),
    reward_scope: rep?.scope ?? null,
    is_shareable: mission.canBeShared ?? false,
    is_unique_mission: mission.onceOnly ?? false,
    available_in_prison: mission.availableInPrison ?? false,
    hide_in_mobiglas: mission.hideInMobiGlas ?? false,
    accept_locations: mission.acceptLocations?.length
      ? mission.acceptLocations
      : null,
    time_to_complete: mission.timeToComplete ?? null,
    destinations: mission.destinations?.length ? mission.destinations : null,
    item_rewards: mission.itemRewards?.length ? mission.itemRewards : null,
    token_substitutions:
      mission.tokenSubstitutions &&
      Object.keys(mission.tokenSubstitutions).length
        ? mission.tokenSubstitutions
        : null,
    max_players_per_instance: intOrNull(mission.maxPlayersPerInstance),
    is_intro: mission.isIntro ?? false,
    linked_intros: mission.linkedIntros ?? null,
    buy_in: intOrNull(mission.buyIn),
    can_reaccept_after_failing: mission.canReacceptAfterFailing ?? false,
    can_reaccept_after_abandoning: mission.canReacceptAfterAbandoning ?? false,
    abandoned_cooldown_time: mission.abandonedCooldownTime ?? null,
    personal_cooldown_time: mission.personalCooldownTime ?? null,
    deadline_seconds: mission.deadline ?? null,
    has_blueprint_rewards: (mission.blueprintRewards?.length ?? 0) > 0,
    variant_count: intOrNull(mission.variantCount || null),
    is_illegal: mission.illegal ?? null,
    is_lawful: mission.lawful ?? null,
    difficulty_from_broker: intOrNull(mission.difficulty),
    star_system_derived: mission.starSystem || null,
    star_system: mission.starSystem || null,
    faction: mission.missionGiver || null,
    max_crimestat: intOrNull(mission.maxCrimestat),
    data_source: "extraction",
    is_verified: false,
  }
}

/** The child-table rows (without mission_id) for one extracted mission. */
export function buildMissionChildren(mission: P4KMission): MissionChildren {
  return {
    ships: firstByKey(mission.shipEncounters, (e) => e.role).map((e) => ({
      role: e.role,
      alignment: e.alignment || "neutral",
      waves: e.waves,
      ship_pool: e.shipPool?.length ? e.shipPool : null,
    })),
    npcs: firstByKey(mission.npcEncounters, (e) => e.name).map((e) => ({
      name: e.name,
      count: Math.round(e.count),
    })),
    hauling: firstByKey(mission.haulingOrders, (e) => e.resource).map((e) => ({
      resource_name: e.resource,
      min_scu: Math.round(e.minSCU),
      max_scu: Math.round(e.maxSCU),
    })),
    entities: firstByKey(mission.entitySpawns, (e) => e.name).map((e) => ({
      name: e.name,
      count: Math.round(e.count),
    })),
  }
}

/** Plan the writes that bring a version's missions in line with one import. */
export function planMissionSync(
  incoming: ReadonlyArray<IncomingMission>,
  existing: ReadonlyArray<ExistingMission>,
): MissionSyncPlan {
  // Last occurrence of a code wins.
  const byCode = new Map<string, IncomingMission>()
  const duplicates = new Set<string>()
  for (const mission of incoming) {
    if (byCode.has(mission.code)) {
      duplicates.add(mission.code)
      byCode.delete(mission.code) // keep first-seen order stable for the last value
    }
    byCode.set(mission.code, mission)
  }

  const existingByCode = new Map<string, ExistingMission>()
  for (const row of existing) {
    if (existingByCode.has(row.mission_code)) {
      throw new Error(
        `Two stored missions share code ${row.mission_code} in one version`,
      )
    }
    existingByCode.set(row.mission_code, row)
  }

  const plan: MissionSyncPlan = {
    inserts: [],
    updates: [],
    deactivations: [],
    unchanged: 0,
    duplicateCodes: [...duplicates].sort(),
  }

  for (const mission of byCode.values()) {
    const stored = existingByCode.get(mission.code)
    if (!stored) {
      plan.inserts.push(mission)
      continue
    }
    const changes = changedColumns(
      stored.values,
      mission.record,
      MISSION_COLUMNS,
    )
    const childKinds = MISSION_CHILD_KINDS.filter(
      (kind) =>
        !sameRows(
          stored.children[kind],
          mission.children[kind],
          MISSION_CHILD_TABLES[kind].columns,
        ),
    )
    const reactivate = !stored.is_active
    if (
      Object.keys(changes).length === 0 &&
      childKinds.length === 0 &&
      !reactivate
    ) {
      plan.unchanged++
      continue
    }
    plan.updates.push({
      missionId: stored.mission_id,
      code: mission.code,
      changes,
      reactivate,
      childKinds,
      children: mission.children,
    })
  }

  for (const stored of existing) {
    if (stored.is_active && !byCode.has(stored.mission_code)) {
      plan.deactivations.push({
        missionId: stored.mission_id,
        code: stored.mission_code,
      })
    }
  }

  return plan
}

/** mission_blueprint_rewards columns the import writes (besides the mission/blueprint key). */
export const MISSION_REWARD_COLUMNS: ColumnKinds = {
  reward_pool_id: "num",
  reward_pool_size: "num",
  selection_count: "num",
  pool_name: "str",
  pool_chance: "num",
  drop_probability: "num",
  is_guaranteed: "bool",
}

export interface RewardLinkRow extends Record<string, unknown> {
  mission_id: string
  blueprint_id: string
}

/**
 * One mission's blueprint reward links. `bpIdByCode` maps the extracted
 * blueprint id (blueprint_code) to blueprint_id; unknown blueprints and
 * repeats are left out.
 */
export function buildMissionRewardRows(
  mission: Pick<P4KMission, "blueprintRewards">,
  missionId: string,
  bpIdByCode: ReadonlyMap<string, string>,
): RewardLinkRow[] {
  const rewards = mission.blueprintRewards || []
  const poolIdMap = new Map<string, number>()
  let nextPoolId = 1
  for (const br of rewards) {
    if (br.poolName && !poolIdMap.has(br.poolName))
      poolIdMap.set(br.poolName, nextPoolId++)
  }
  const seen = new Set<string>()
  const rows: RewardLinkRow[] = []
  for (const br of rewards) {
    const bpId = br.blueprintId ? bpIdByCode.get(br.blueprintId) : undefined
    if (!bpId || seen.has(bpId)) continue
    seen.add(bpId)
    const poolChance = br.chance ?? 1
    const weight = br.weight ?? 1
    const totalWeight = br.totalWeight ?? 1
    const dropProbability = poolChance * (weight / totalWeight) * 100
    rows.push({
      mission_id: missionId,
      blueprint_id: bpId,
      reward_pool_id: br.poolName ? (poolIdMap.get(br.poolName) ?? 1) : 1,
      reward_pool_size: 1,
      selection_count: 1,
      pool_name: br.poolName || null,
      pool_chance: Math.round(poolChance * 100) / 100,
      drop_probability: Math.round(dropProbability * 100) / 100,
      is_guaranteed: false,
    })
  }
  return rows
}

export interface RewardLinkPlan {
  inserts: RewardLinkRow[]
  updates: Array<{
    mission_id: string
    blueprint_id: string
    changes: Record<string, unknown>
  }>
  deletes: Array<{ mission_id: string; blueprint_id: string }>
}

/**
 * Bring the stored reward links of the imported missions in line with the
 * desired ones: keyed by (mission_id, blueprint_id), unchanged links get no
 * write. `stored` must only hold links of missions in this import (links of
 * missions the import does not contain are left alone).
 */
export function planRewardLinkSync(
  stored: ReadonlyArray<RewardLinkRow>,
  desired: ReadonlyArray<RewardLinkRow>,
): RewardLinkPlan {
  const key = (r: { mission_id: string; blueprint_id: string }) =>
    `${r.mission_id}|${r.blueprint_id}`
  const storedByKey = new Map(stored.map((r) => [key(r), r]))
  const desiredKeys = new Set<string>()
  const plan: RewardLinkPlan = { inserts: [], updates: [], deletes: [] }
  for (const row of desired) {
    const k = key(row)
    desiredKeys.add(k)
    const prev = storedByKey.get(k)
    if (!prev) {
      plan.inserts.push(row)
      continue
    }
    const values: Record<string, unknown> = {}
    for (const column of Object.keys(MISSION_REWARD_COLUMNS))
      values[column] = row[column]
    const changes = changedColumns(prev, values, MISSION_REWARD_COLUMNS)
    if (Object.keys(changes).length)
      plan.updates.push({
        mission_id: row.mission_id,
        blueprint_id: row.blueprint_id,
        changes,
      })
  }
  for (const row of stored) {
    if (!desiredKeys.has(key(row)))
      plan.deletes.push({
        mission_id: row.mission_id,
        blueprint_id: row.blueprint_id,
      })
  }
  return plan
}
