/**
 * What a mission hub page shows besides its list: every hub mission's
 * required rank (min_standing resolved on its reputation ladder), the
 * reputation and aUEC ranges, the type mix, the hub's reputation ladders
 * (missions and newly rewarded blueprints per rank) and the blueprint
 * rewards. Built from one query over all the hub's active missions, so the
 * numbers cover the whole hub, not just the page shown.
 *
 * The page's missions are picked here too (filter, sort, slice) so a
 * filtered hub paginates over the right missions.
 */
import type { Knex } from "knex"
import { formatShortSlug } from "../../util/short-slug.js"
import { hubColumnSql, hubName, missionHubSlug } from "./mission-hubs.js"
import type {
  MissionHubBlueprintItem,
  MissionHubBlueprintReward,
  MissionHubKind,
  MissionHubLadder,
  MissionHubSort,
  MissionHubTypeCount,
} from "./missions.types.js"

/** One hub mission: the columns the hub's facts and ordering need. */
export interface HubFactMission {
  mission_id: string
  mission_code: string
  mission_name: string
  /** Mission type (career type, or the category's type name) */
  type: string | null
  star_system: string | null
  min_standing: string | null
  reward_scope: string | null
  reputation_reward: number | null
  credit_reward_min: number | null
  credit_reward_max: number | null
}

/** One blueprint a mission can reward, with its crafted item. */
export interface HubBlueprintRow {
  mission_id: string
  blueprint_code: string
  blueprint_name: string
  game_item_id: string
  item_name: string
}

/** One row of the reputation_ranks table. */
export interface RankRow {
  scope_code: string
  scope_display_name: string
  standing_code: string
  standing_display_name: string
  threshold: number
  rank_index: number
}

/** A mission's required rank, resolved on a ladder. */
export interface ResolvedStanding {
  scope_code: string
  scope_display_name: string
  standing_code: string
  display_name: string
  threshold: number
  rank_index: number
}

/**
 * The rank a min_standing code is on. The same standing code is on several
 * ladders (the hauling ranks are shared by three delivery scopes), all with
 * the same name and threshold; the mission's own reward scope wins, then the
 * first ladder by scope code. Null without a code or when no ladder has it.
 */
export function resolveStanding(
  ranks: readonly RankRow[],
  minStanding: string | null,
  rewardScope: string | null,
): ResolvedStanding | null {
  if (!minStanding) return null
  const matches = ranks
    .filter((r) => r.standing_code === minStanding)
    .sort(
      (a, b) =>
        Number(b.scope_code === rewardScope) - Number(a.scope_code === rewardScope) ||
        a.scope_code.localeCompare(b.scope_code),
    )
  const rank = matches[0]
  if (!rank) return null
  return {
    scope_code: rank.scope_code,
    scope_display_name: rank.scope_display_name,
    standing_code: rank.standing_code,
    display_name: rank.standing_display_name,
    threshold: rank.threshold,
    rank_index: rank.rank_index,
  }
}

/** A positive amount, else null (0 means "not listed" in the game files). */
function positive(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

/** The mission's listed aUEC payout (max, else min), or null. */
export function listedPayout(m: Pick<HubFactMission, "credit_reward_min" | "credit_reward_max">): number | null {
  return positive(m.credit_reward_max) ?? positive(m.credit_reward_min)
}

/** "mercenary", or "none" for a mission without a type. */
export function missionTypeSlug(type: string | null): string {
  const name = hubName(type)
  return name ? missionHubSlug(name) : "none"
}

/** The hub-wide numbers of the hub response. */
export interface HubFacts {
  reputation_min?: number
  reputation_max?: number
  reputation_mission_count: number
  reward_mission_count: number
  type_counts: MissionHubTypeCount[]
  untyped_count: number
  unlisted_system_count: number
  ladders: MissionHubLadder[]
  unranked_mission_count: number
  blueprint_rewards: MissionHubBlueprintItem[]
}

/** Each mission's resolved rank (by mission id; missing: no rank). */
export function resolveStandings(
  missions: readonly HubFactMission[],
  ranks: readonly RankRow[],
): Map<string, ResolvedStanding> {
  const out = new Map<string, ResolvedStanding>()
  for (const m of missions) {
    const standing = resolveStanding(ranks, m.min_standing, m.reward_scope)
    if (standing) out.set(m.mission_id, standing)
  }
  return out
}

/** Blueprint rewards by mission id, by item name. */
export function blueprintsByMission(rows: readonly HubBlueprintRow[]): Map<string, MissionHubBlueprintReward[]> {
  const out = new Map<string, MissionHubBlueprintReward[]>()
  for (const row of rows) {
    const list = out.get(row.mission_id) ?? []
    list.push({
      blueprint_code: row.blueprint_code,
      blueprint_name: row.blueprint_name,
      game_item_id: row.game_item_id,
      item_name: row.item_name,
      item_slug: formatShortSlug(row.game_item_id, row.item_name),
    })
    out.set(row.mission_id, list)
  }
  for (const list of out.values()) list.sort((a, b) => a.item_name.localeCompare(b.item_name))
  return out
}

/**
 * The hub's facts. Ladders: one per reputation scope its missions' required
 * ranks are on, most missions first, each with every rank of the scope, the
 * missions that need exactly that rank and how many blueprint items are
 * first rewarded there (an item's lowest rank among its missions on that
 * ladder). Blueprint rewards: each crafted item once, most missions first,
 * with its lowest rank on the main (first) ladder.
 */
export function buildHubFacts(
  missions: readonly HubFactMission[],
  blueprints: readonly HubBlueprintRow[],
  ranks: readonly RankRow[],
  standings: Map<string, ResolvedStanding> = resolveStandings(missions, ranks),
): HubFacts {
  const reps = missions.map((m) => positive(m.reputation_reward)).filter((r): r is number => r !== null)
  const paid = missions.filter((m) => listedPayout(m) !== null).length

  const types = new Map<string, MissionHubTypeCount>()
  let untyped = 0
  for (const m of missions) {
    const name = hubName(m.type)
    if (!name) {
      untyped++
      continue
    }
    const slug = missionHubSlug(name)
    const entry = types.get(slug) ?? { slug, name, mission_count: 0 }
    entry.mission_count++
    types.set(slug, entry)
  }

  // Ladders: missions per scope, then per rank.
  const scopeCounts = new Map<string, number>()
  for (const s of standings.values()) scopeCounts.set(s.scope_code, (scopeCounts.get(s.scope_code) ?? 0) + 1)
  const scopes = [...scopeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([scope]) => scope)

  // Each item's lowest rank per scope.
  const itemMinRank = new Map<string, Map<string, number>>()
  for (const row of blueprints) {
    const s = standings.get(row.mission_id)
    if (!s) continue
    const perScope = itemMinRank.get(row.game_item_id) ?? new Map<string, number>()
    const prev = perScope.get(s.scope_code)
    if (prev === undefined || s.rank_index < prev) perScope.set(s.scope_code, s.rank_index)
    itemMinRank.set(row.game_item_id, perScope)
  }

  const ladders: MissionHubLadder[] = scopes.map((scope) => {
    const scopeRanks = ranks.filter((r) => r.scope_code === scope).sort((a, b) => a.rank_index - b.rank_index)
    const counts = new Map<number, number>()
    for (const s of standings.values()) {
      if (s.scope_code === scope) counts.set(s.rank_index, (counts.get(s.rank_index) ?? 0) + 1)
    }
    const newItems = new Map<number, number>()
    for (const perScope of itemMinRank.values()) {
      const idx = perScope.get(scope)
      if (idx !== undefined) newItems.set(idx, (newItems.get(idx) ?? 0) + 1)
    }
    return {
      scope_code: scope,
      scope_display_name: scopeRanks[0]?.scope_display_name ?? scope,
      mission_count: scopeCounts.get(scope) ?? 0,
      ranks: scopeRanks.map((r) => ({
        rank_index: r.rank_index,
        standing_code: r.standing_code,
        display_name: r.standing_display_name,
        threshold: r.threshold,
        mission_count: counts.get(r.rank_index) ?? 0,
        new_blueprint_count: newItems.get(r.rank_index) ?? 0,
      })),
    }
  })

  const mainScope = scopes[0]
  const items = new Map<string, MissionHubBlueprintItem & { missions: Set<string> }>()
  for (const row of blueprints) {
    const item = items.get(row.game_item_id) ?? {
      blueprint_code: row.blueprint_code,
      blueprint_name: row.blueprint_name,
      game_item_id: row.game_item_id,
      item_name: row.item_name,
      item_slug: formatShortSlug(row.game_item_id, row.item_name),
      mission_count: 0,
      missions: new Set<string>(),
    }
    item.missions.add(row.mission_id)
    items.set(row.game_item_id, item)
  }
  const blueprintRewards: MissionHubBlueprintItem[] = [...items.values()]
    .map(({ missions: ids, ...item }) => {
      const minRank = mainScope ? itemMinRank.get(item.game_item_id)?.get(mainScope) : undefined
      return { ...item, mission_count: ids.size, ...(minRank !== undefined ? { min_rank_index: minRank } : {}) }
    })
    .sort(
      (a, b) =>
        b.mission_count - a.mission_count ||
        (a.min_rank_index ?? 99) - (b.min_rank_index ?? 99) ||
        a.item_name.localeCompare(b.item_name),
    )

  return {
    ...(reps.length ? { reputation_min: Math.min(...reps), reputation_max: Math.max(...reps) } : {}),
    reputation_mission_count: reps.length,
    reward_mission_count: paid,
    type_counts: [...types.values()].sort((a, b) => b.mission_count - a.mission_count || a.name.localeCompare(b.name)),
    untyped_count: untyped,
    unlisted_system_count: missions.filter((m) => !hubName(m.star_system)).length,
    ladders,
    unranked_mission_count: missions.length - standings.size,
    blueprint_rewards: blueprintRewards,
  }
}

/** The hub list's filters (all optional). */
export interface HubMissionFilters {
  /** Type slug ("mercenary"), or "none" for missions without a type */
  type?: string
  /** Missions open at this rank of the main ladder (its rank_index or below) */
  max_rank?: number
  /** Only missions that can reward a blueprint */
  has_blueprints?: boolean
}

const byName = (a: HubFactMission, b: HubFactMission) =>
  a.mission_name.localeCompare(b.mission_name) || a.mission_code.localeCompare(b.mission_code)

/**
 * The hub's missions after its filters, in the list's order: by name; by
 * required rank (main ladder first, by rank; other ladders; no rank last);
 * by reputation or by aUEC payout (highest first, not listed last).
 */
export function selectHubMissions(
  missions: readonly HubFactMission[],
  standings: Map<string, ResolvedStanding>,
  blueprintMissionIds: ReadonlySet<string>,
  mainScope: string | undefined,
  filters: HubMissionFilters,
  sort: MissionHubSort,
): HubFactMission[] {
  const list = missions.filter((m) => {
    if (filters.type && missionTypeSlug(m.type) !== filters.type) return false
    if (filters.has_blueprints && !blueprintMissionIds.has(m.mission_id)) return false
    if (filters.max_rank !== undefined) {
      const s = standings.get(m.mission_id)
      if (!s || s.scope_code !== mainScope || s.rank_index > filters.max_rank) return false
    }
    return true
  })
  const rankKey = (m: HubFactMission): [number, string, number] => {
    const s = standings.get(m.mission_id)
    if (!s) return [2, "", 0]
    return [s.scope_code === mainScope ? 0 : 1, s.scope_code, s.rank_index]
  }
  const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1)
  const compare: Record<MissionHubSort, (a: HubFactMission, b: HubFactMission) => number> = {
    name: byName,
    rank: (a, b) => {
      const [ga, sa, ia] = rankKey(a)
      const [gb, sb, ib] = rankKey(b)
      return ga - gb || sa.localeCompare(sb) || ia - ib || byName(a, b)
    },
    reputation: (a, b) => desc(positive(a.reputation_reward), positive(b.reputation_reward)) || byName(a, b),
    reward: (a, b) => desc(listedPayout(a), listedPayout(b)) || byName(a, b),
  }
  return list.sort(compare[sort])
}

/** All of a hub's active missions (the facts' columns). */
export async function loadHubFactMissions(
  knex: Knex,
  versionId: string,
  kind: MissionHubKind,
  values: readonly string[],
): Promise<HubFactMission[]> {
  const rows = await knex("missions as m")
    .where("m.version_id", versionId)
    .where("m.is_active", true)
    .whereRaw(`${hubColumnSql(kind)} = ANY(?)`, [values])
    .select<
      Array<Omit<HubFactMission, "credit_reward_min" | "credit_reward_max"> & {
        credit_reward_min: string | number | null
        credit_reward_max: string | number | null
      }>
    >(
      "m.mission_id",
      "m.mission_code",
      "m.mission_name",
      knex.raw(`${hubColumnSql("types")} as type`),
      "m.star_system",
      "m.min_standing",
      "m.reward_scope",
      "m.reputation_reward",
      "m.credit_reward_min",
      "m.credit_reward_max",
    )
  const num = (v: string | number | null) => (v === null || v === undefined ? null : Number(v))
  return rows.map((r) => ({ ...r, credit_reward_min: num(r.credit_reward_min), credit_reward_max: num(r.credit_reward_max) }))
}

/** The blueprints the missions can reward, with their crafted items. */
export async function loadHubBlueprintRows(knex: Knex, missionIds: readonly string[]): Promise<HubBlueprintRow[]> {
  if (missionIds.length === 0) return []
  return knex("mission_blueprint_rewards as mbr")
    .join("blueprints as b", "mbr.blueprint_id", "b.blueprint_id")
    .join("game_items as gi", "b.output_game_item_id", "gi.id")
    .whereIn("mbr.mission_id", missionIds)
    .distinct<HubBlueprintRow[]>(
      "mbr.mission_id",
      "b.blueprint_code",
      "b.blueprint_name",
      "b.output_game_item_id as game_item_id",
      "gi.name as item_name",
    )
}

/** Every reputation rank (a few hundred rows). */
export async function loadRankRows(knex: Knex): Promise<RankRow[]> {
  return knex("reputation_ranks").select<RankRow[]>(
    "scope_code",
    "scope_display_name",
    "standing_code",
    "standing_display_name",
    "threshold",
    "rank_index",
  )
}
