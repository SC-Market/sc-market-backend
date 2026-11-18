import { describe, expect, it } from "vitest"
import {
  blueprintsByMission,
  buildHubFacts,
  listedPayout,
  missionTypeSlug,
  resolveStanding,
  resolveStandings,
  selectHubMissions,
  type HubBlueprintRow,
  type HubFactMission,
  type RankRow,
} from "./mission-hub-facts.js"

const rank = (scope: string, code: string, name: string, threshold: number, index: number): RankRow => ({
  scope_code: scope,
  scope_display_name: scope === "factionreputationscope" ? "Standing" : "Hauling",
  standing_code: code,
  standing_display_name: name,
  threshold,
  rank_index: index,
})

const RANKS: RankRow[] = [
  rank("factionreputationscope", "fr0", "Neutral", 0, 0),
  rank("factionreputationscope", "fr1", "Jr. Contractor", 800, 1),
  rank("factionreputationscope", "fr2", "Contractor", 2200, 2),
  rank("reputationscope_hauling", "h2", "Junior", 250, 3),
  rank("reputationscope_delivery_roughandready", "h2", "Junior", 250, 3),
]

const mission = (id: string, over: Partial<HubFactMission> = {}): HubFactMission => ({
  mission_id: id,
  mission_code: id.toUpperCase(),
  mission_name: `Mission ${id}`,
  type: "Mercenary",
  star_system: "Nyx",
  min_standing: null,
  reward_scope: "factionreputationscope",
  reputation_reward: null,
  credit_reward_min: null,
  credit_reward_max: null,
  ...over,
})

const bp = (missionId: string, item: string, itemId = item): HubBlueprintRow => ({
  mission_id: missionId,
  blueprint_code: `code-${item}`,
  blueprint_name: `BP_${item}`,
  game_item_id: `${itemId}0000-0000`,
  item_name: item,
})

describe("resolveStanding", () => {
  it("prefers the mission's own reward scope for a shared standing code", () => {
    expect(resolveStanding(RANKS, "h2", "reputationscope_hauling")?.scope_code).toBe("reputationscope_hauling")
    expect(resolveStanding(RANKS, "h2", "reputationscope_delivery_roughandready")?.scope_code).toBe(
      "reputationscope_delivery_roughandready",
    )
  })
  it("falls back to the first ladder by scope code", () => {
    expect(resolveStanding(RANKS, "h2", "other")?.scope_code).toBe("reputationscope_delivery_roughandready")
  })
  it("is null without a code or a matching rank", () => {
    expect(resolveStanding(RANKS, null, "x")).toBeNull()
    expect(resolveStanding(RANKS, "nope", "x")).toBeNull()
  })
  it("carries the rank's name, threshold and index", () => {
    expect(resolveStanding(RANKS, "fr1", "factionreputationscope")).toEqual({
      scope_code: "factionreputationscope",
      scope_display_name: "Standing",
      standing_code: "fr1",
      display_name: "Jr. Contractor",
      threshold: 800,
      rank_index: 1,
    })
  })
})

describe("listedPayout / missionTypeSlug", () => {
  it("uses max, else min, and treats 0 as not listed", () => {
    expect(listedPayout({ credit_reward_min: 100, credit_reward_max: 500 })).toBe(500)
    expect(listedPayout({ credit_reward_min: 100, credit_reward_max: 0 })).toBe(100)
    expect(listedPayout({ credit_reward_min: 0, credit_reward_max: null })).toBeNull()
  })
  it("slugs types; placeholders and empties are none", () => {
    expect(missionTypeSlug("Hauling - Planetary")).toBe("hauling-planetary")
    expect(missionTypeSlug(null)).toBe("none")
    expect(missionTypeSlug("<= UNINITIALIZED =>")).toBe("none")
  })
})

describe("buildHubFacts", () => {
  const missions = [
    mission("a", { min_standing: "fr0", reputation_reward: 200, credit_reward_min: 4000, credit_reward_max: 6000 }),
    mission("b", { min_standing: "fr1", reputation_reward: 1500, type: "Collection" }),
    mission("c", { min_standing: "fr1", reputation_reward: 300 }),
    mission("d", { min_standing: "h2", reward_scope: "reputationscope_hauling", type: null, star_system: null }),
    mission("e", { reputation_reward: 0 }),
  ]
  const blueprints = [bp("a", "Pistol"), bp("b", "Pistol"), bp("b", "Helmet"), bp("c", "Armor"), bp("e", "Armor")]
  const facts = buildHubFacts(missions, blueprints, RANKS)

  it("counts reputation and payouts over every mission", () => {
    expect(facts.reputation_min).toBe(200)
    expect(facts.reputation_max).toBe(1500)
    expect(facts.reputation_mission_count).toBe(3)
    expect(facts.reward_mission_count).toBe(1)
  })
  it("counts types, untyped missions and missions without a system", () => {
    expect(facts.type_counts).toEqual([
      { slug: "mercenary", name: "Mercenary", mission_count: 3 },
      { slug: "collection", name: "Collection", mission_count: 1 },
    ])
    expect(facts.untyped_count).toBe(1)
    expect(facts.unlisted_system_count).toBe(1)
  })
  it("builds ladders, most missions first, with every rank and its unlocks", () => {
    expect(facts.ladders.map((l) => [l.scope_code, l.mission_count])).toEqual([
      ["factionreputationscope", 3],
      ["reputationscope_hauling", 1],
    ])
    const main = facts.ladders[0]
    expect(main.scope_display_name).toBe("Standing")
    expect(main.ranks.map((r) => [r.display_name, r.mission_count, r.new_blueprint_count])).toEqual([
      ["Neutral", 1, 1], // Pistol (a)
      ["Jr. Contractor", 2, 2], // Helmet (b), Armor (c); Pistol already at Neutral
      ["Contractor", 0, 0],
    ])
    expect(facts.unranked_mission_count).toBe(1)
  })
  it("lists each blueprint item once with its missions and lowest main-ladder rank", () => {
    expect(facts.blueprint_rewards.map((i) => [i.item_name, i.mission_count, i.min_rank_index])).toEqual([
      ["Pistol", 2, 0],
      ["Armor", 2, 1],
      ["Helmet", 1, 1],
    ])
    expect(facts.blueprint_rewards[0].item_slug).toBe("Pistol00--pistol")
    expect(facts.blueprint_rewards[0].blueprint_name).toBe("BP_Pistol")
  })
  it("leaves ranges out when nothing lists them", () => {
    const sparse = buildHubFacts([mission("x"), mission("y")], [], RANKS)
    expect(sparse.reputation_min).toBeUndefined()
    expect(sparse.ladders).toEqual([])
    expect(sparse.blueprint_rewards).toEqual([])
    expect(sparse.unranked_mission_count).toBe(2)
  })
})

describe("blueprintsByMission", () => {
  it("groups by mission, by item name", () => {
    const map = blueprintsByMission([bp("b", "Pistol"), bp("b", "Helmet")])
    expect(map.get("b")?.map((r) => r.item_name)).toEqual(["Helmet", "Pistol"])
  })
})

describe("selectHubMissions", () => {
  const missions = [
    mission("a", { mission_name: "Zulu", min_standing: "fr2", reputation_reward: 50, credit_reward_max: 100 }),
    mission("b", { mission_name: "Alpha", min_standing: "fr0", reputation_reward: 500, type: "Collection" }),
    mission("c", { mission_name: "Mike", min_standing: "h2", reward_scope: "reputationscope_hauling" }),
    mission("d", { mission_name: "Bravo", credit_reward_max: 9000 }),
  ]
  const standings = resolveStandings(missions, RANKS)
  const select = (filters = {}, sort: "name" | "rank" | "reputation" | "reward" = "name") =>
    selectHubMissions(missions, standings, new Set(["a", "d"]), "factionreputationscope", filters, sort).map(
      (m) => m.mission_id,
    )

  it("sorts by name, rank, reputation and payout", () => {
    expect(select()).toEqual(["b", "d", "c", "a"])
    expect(select({}, "rank")).toEqual(["b", "a", "c", "d"])
    expect(select({}, "reputation")).toEqual(["b", "a", "d", "c"])
    expect(select({}, "reward")).toEqual(["d", "a", "b", "c"])
  })
  it("filters by type, blueprints and rank on the main ladder", () => {
    expect(select({ type: "collection" })).toEqual(["b"])
    expect(select({ type: "none" })).toEqual([])
    expect(select({ has_blueprints: true })).toEqual(["d", "a"])
    expect(select({ max_rank: 1 })).toEqual(["b"])
    expect(select({ max_rank: 2 })).toEqual(["b", "a"])
  })
})
