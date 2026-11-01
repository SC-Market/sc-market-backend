/**
 * Mission hubs: the active LIVE version's missions grouped by mission giver,
 * faction (whose reputation the mission pays), mission type and star system.
 * Each group with at least MIN_HUB_MISSIONS missions is a hub page on the
 * site (/missions/<kind>/<slug>), listed in the sitemap.
 *
 * Grouping is by slug, so spellings that only differ in case or punctuation
 * ("Citizens for Prosperity" / "Citizens For Prosperity") are one hub, named
 * after the most common spelling. Placeholder values from the game files
 * (`~mission(Contractor)`, `<= UNINITIALIZED =>`) are never a hub.
 *
 * One GROUP BY over a version's missions (a few thousand rows) answers the
 * index, a hub's related hubs and a mission's hub links.
 */
import type { Knex } from "knex"
import type { MissionHubKind, MissionHubLinks, MissionHubSummary } from "./missions.types.js"

export const MISSION_HUB_KINDS: readonly MissionHubKind[] = ["givers", "factions", "types", "systems"]

/** Fewest missions a group needs to be a hub page. */
export const MIN_HUB_MISSIONS = 2

/**
 * Mission types without a career_type in the game files, by category. Every
 * other mission's type is its career_type.
 */
const CATEGORY_TYPE_NAMES: Record<string, string> = {
  refueling: "Refueling",
  servicebeacon: "Service Beacon",
}

/** The SQL value a mission is grouped by, per hub kind (missions aliased `m`). */
export function hubColumnSql(kind: MissionHubKind): string {
  switch (kind) {
    case "givers":
      return "m.mission_giver_org"
    case "factions":
      return "m.reputation_reward_faction"
    case "systems":
      return "m.star_system"
    case "types": {
      const cases = Object.entries(CATEGORY_TYPE_NAMES)
        .map(([category, name]) => `WHEN '${category}' THEN '${name}'`)
        .join(" ")
      return `COALESCE(m.career_type, CASE m.category ${cases} END)`
    }
  }
}

/** Placeholder values in the game files that aren't a name (lowercased). */
const NOT_A_NAME = new Set(["<= uninitialized =>", "sender not found", "n/a", "unknown", "none", "null"])

/** "Rough & Ready" → "rough-and-ready", "Gilly's Flight School" → "gillys-flight-school". */
export function missionHubSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** The value as a hub name, or null for placeholders and empty values. */
export function hubName(raw: string | null | undefined): string | null {
  const name = raw?.trim()
  if (!name) return null
  if (name.includes("~mission") || name.startsWith("@") || NOT_A_NAME.has(name.toLowerCase())) return null
  return missionHubSlug(name) ? name : null
}

/** One GROUP BY row: a combination of the four hub values and its mission count. */
export interface HubRow {
  giver: string | null
  faction: string | null
  type: string | null
  system: string | null
  n: number
}

const ROW_FIELD: Record<MissionHubKind, keyof Omit<HubRow, "n">> = {
  givers: "giver",
  factions: "faction",
  types: "type",
  systems: "system",
}

/** The row's value for a hub kind, as a hub name (null: no hub). */
export function rowHubName(row: HubRow, kind: MissionHubKind): string | null {
  return hubName(row[ROW_FIELD[kind]])
}

/** One hub of the index: its display name, raw spellings and mission count. */
export interface HubEntry extends MissionHubSummary {
  /** Every raw value grouped under this slug (for the hub's mission query). */
  values: string[]
}

export type HubIndex = Record<MissionHubKind, HubEntry[]>

/** Most-used spelling first, then alphabetical. */
function displayName(spellings: Map<string, number>): string {
  return [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

/** Group rows into hubs per kind (count desc, then name), keeping groups with MIN_HUB_MISSIONS+. */
export function buildHubIndex(rows: readonly HubRow[]): HubIndex {
  const index = {} as HubIndex
  for (const kind of MISSION_HUB_KINDS) {
    const bySlug = new Map<string, { spellings: Map<string, number>; count: number }>()
    for (const row of rows) {
      const name = rowHubName(row, kind)
      if (!name) continue
      const slug = missionHubSlug(name)
      const group = bySlug.get(slug) ?? { spellings: new Map<string, number>(), count: 0 }
      group.spellings.set(name, (group.spellings.get(name) ?? 0) + row.n)
      group.count += row.n
      bySlug.set(slug, group)
    }
    index[kind] = [...bySlug.entries()]
      .filter(([, group]) => group.count >= MIN_HUB_MISSIONS)
      .map(([slug, group]) => ({
        slug,
        name: displayName(group.spellings),
        mission_count: group.count,
        values: [...group.spellings.keys()].sort(),
      }))
      .sort((a, b) => b.mission_count - a.mission_count || a.name.localeCompare(b.name))
  }
  return index
}

export function findHub(index: HubIndex, kind: MissionHubKind, slug: string): HubEntry | undefined {
  return index[kind].find((hub) => hub.slug === slug)
}

/** A hub without its raw spellings (the API shape). */
export function hubSummary(hub: HubEntry): MissionHubSummary {
  return { slug: hub.slug, name: hub.name, mission_count: hub.mission_count }
}

/**
 * The other kinds' hubs among one hub's missions, each with the number of
 * this hub's missions in it (most first): a giver's systems, types and
 * factions; a type's givers; and so on. Only groups that are hubs.
 */
export function relatedHubs(
  rows: readonly HubRow[],
  index: HubIndex,
  kind: MissionHubKind,
  slug: string,
): Record<MissionHubKind, MissionHubSummary[]> {
  const mine = rows.filter((row) => {
    const name = rowHubName(row, kind)
    return name !== null && missionHubSlug(name) === slug
  })
  const related = {} as Record<MissionHubKind, MissionHubSummary[]>
  for (const other of MISSION_HUB_KINDS) {
    if (other === kind) {
      related[other] = []
      continue
    }
    const counts = new Map<string, number>()
    for (const row of mine) {
      const name = rowHubName(row, other)
      if (!name) continue
      const otherSlug = missionHubSlug(name)
      counts.set(otherSlug, (counts.get(otherSlug) ?? 0) + row.n)
    }
    related[other] = [...counts.entries()]
      .map(([otherSlug, count]) => {
        const hub = findHub(index, other, otherSlug)
        return hub ? { slug: hub.slug, name: hub.name, mission_count: count } : null
      })
      .filter((hub): hub is MissionHubSummary => hub !== null)
      .sort((a, b) => b.mission_count - a.mission_count || a.name.localeCompare(b.name))
  }
  return related
}

/** The hubs one mission belongs to (its values that are hubs). */
export function missionHubLinks(
  index: HubIndex,
  mission: { giver: string | null; faction: string | null; type: string | null; system: string | null },
): MissionHubLinks {
  const link = (kind: MissionHubKind): MissionHubSummary | undefined => {
    const name = rowHubName({ ...mission, n: 1 }, kind)
    const hub = name ? findHub(index, kind, missionHubSlug(name)) : undefined
    return hub ? hubSummary(hub) : undefined
  }
  return { giver: link("givers"), faction: link("factions"), type: link("types"), system: link("systems") }
}

/** The active LIVE game version (the one hubs are built from). */
export interface LiveVersion {
  version_id: string
  last_data_update: Date | string | null
}

/** The active LIVE game version, or null when there is none. */
export async function activeLiveVersion(knex: Knex): Promise<LiveVersion | null> {
  const rows: LiveVersion[] = await knex("game_versions")
    .select("version_id", "last_data_update")
    .where("version_type", "LIVE")
    .where("is_active", true)
    .orderBy("created_at", "desc")
    .limit(1)
  return rows[0] ?? null
}

/** The active LIVE game version's id, or null when there is none. */
export async function activeLiveVersionId(knex: Knex): Promise<string | null> {
  return (await activeLiveVersion(knex))?.version_id ?? null
}

/** The version's missions grouped by their four hub values. */
export async function loadHubRows(knex: Knex, versionId: string): Promise<HubRow[]> {
  const rows = await knex("missions as m")
    .where("m.version_id", versionId)
    .select<Array<Omit<HubRow, "n"> & { n: string | number }>>(
      knex.raw(`${hubColumnSql("givers")} as giver`),
      knex.raw(`${hubColumnSql("factions")} as faction`),
      knex.raw(`${hubColumnSql("types")} as type`),
      knex.raw(`${hubColumnSql("systems")} as system`),
      knex.raw("count(*)::integer as n"),
    )
    .groupByRaw("1, 2, 3, 4")
  return rows.map((row) => ({ ...row, n: Number(row.n) }))
}

/** The version's hub index. */
export async function loadHubIndex(knex: Knex, versionId: string): Promise<HubIndex> {
  return buildHubIndex(await loadHubRows(knex, versionId))
}

/** Site path of a hub: /missions/givers/headhunters. */
export function missionHubPath(kind: MissionHubKind, slug: string): string {
  return `/missions/${kind}/${slug}`
}
