import { describe, expect, it } from "vitest"
import knexFactory from "knex"
import {
  buildHubIndex,
  hubColumnSql,
  hubName,
  loadHubRows,
  missionHubLinks,
  missionHubSlug,
  relatedHubs,
  type HubRow,
} from "./mission-hubs.js"

const row = (giver: string | null, faction: string | null, type: string | null, system: string | null, n: number): HubRow => ({
  giver,
  faction,
  type,
  system,
  n,
})

const ROWS: HubRow[] = [
  row("Headhunters", "Headhunters", "Mercenary", "Pyro", 30),
  row("Headhunters", "Headhunters", "Investigation", "Pyro", 5),
  row("Headhunters", null, "Mercenary", "Stanton", 2),
  row("Covalex Independent Contractors", "Covalex", "Hauling - Planetary", "Stanton", 40),
  row("Covalex", "Covalex", "Delivery", "Stanton", 6),
  row("Citizens for Prosperity", "Citizens For Prosperity", "Mercenary", "Pyro", 20),
  row("Citizens For Prosperity", "Citizens For Prosperity", "Mercenary", "Pyro", 3),
  row("~mission(Contractor|BountyFrom)", null, "Bounty Hunter", "Stanton", 9),
  row("<= UNINITIALIZED =>", null, "Priority", null, 4),
  row("Gloria Theolone", null, "Delivery", "Terra", 1),
]

describe("missionHubSlug", () => {
  it.each([
    ["Headhunters", "headhunters"],
    ["Rough & Ready", "rough-and-ready"],
    ["Gilly's Flight School", "gillys-flight-school"],
    ["Rayari Inc.", "rayari-inc"],
    ["Hauling - Planetary", "hauling-planetary"],
    ["Citizens For Prosperity", "citizens-for-prosperity"],
    ["Café Musain", "cafe-musain"],
  ])("%s → %s", (name, slug) => {
    expect(missionHubSlug(name)).toBe(slug)
  })
})

describe("hubName", () => {
  it("drops game-file placeholders and empty values", () => {
    for (const raw of ["~mission(Contractor)", "@mission_giver", "<= UNINITIALIZED =>", "SENDER NOT FOUND", "N/A", "", "  ", null, undefined, "???"]) {
      expect(hubName(raw), String(raw)).toBeNull()
    }
    expect(hubName(" Vaughn ")).toBe("Vaughn")
  })
})

describe("buildHubIndex", () => {
  const index = buildHubIndex(ROWS)

  it("groups spellings by slug under the most common one, most missions first", () => {
    expect(index.givers.map((h) => [h.slug, h.name, h.mission_count])).toEqual([
      ["covalex-independent-contractors", "Covalex Independent Contractors", 40],
      ["headhunters", "Headhunters", 37],
      ["citizens-for-prosperity", "Citizens for Prosperity", 23],
      ["covalex", "Covalex", 6],
    ])
    expect(index.givers.find((h) => h.slug === "citizens-for-prosperity")?.values).toEqual([
      "Citizens For Prosperity",
      "Citizens for Prosperity",
    ])
  })

  it("groups factions by the reputation faction, not the giver", () => {
    expect(index.factions.map((h) => [h.slug, h.mission_count])).toEqual([
      ["covalex", 46],
      ["headhunters", 35],
      ["citizens-for-prosperity", 23],
    ])
  })

  it("keeps only groups with two or more missions, and no placeholders", () => {
    expect(index.systems.map((h) => h.slug)).toEqual(["pyro", "stanton"])
    expect(index.types.map((h) => h.slug)).toEqual([
      "mercenary",
      "hauling-planetary",
      "bounty-hunter",
      "delivery",
      "investigation",
      "priority",
    ])
    expect(index.givers.some((h) => h.slug === "gloria-theolone" || h.slug === "uninitialized")).toBe(false)
  })
})

describe("relatedHubs", () => {
  const index = buildHubIndex(ROWS)

  it("lists the other kinds' hubs among a hub's missions, counted within it", () => {
    const related = relatedHubs(ROWS, index, "givers", "headhunters")
    expect(related.givers).toEqual([])
    expect(related.systems).toEqual([
      { slug: "pyro", name: "Pyro", mission_count: 35 },
      { slug: "stanton", name: "Stanton", mission_count: 2 },
    ])
    expect(related.types.map((h) => [h.slug, h.mission_count])).toEqual([
      ["mercenary", 32],
      ["investigation", 5],
    ])
    expect(related.factions).toEqual([{ slug: "headhunters", name: "Headhunters", mission_count: 35 }])
  })

  it("skips values that are not hubs", () => {
    const related = relatedHubs(ROWS, index, "types", "delivery")
    // Gloria Theolone (1 mission) and Terra (1 mission) are not hubs.
    expect(related.givers.map((h) => h.slug)).toEqual(["covalex"])
    expect(related.systems.map((h) => h.slug)).toEqual(["stanton"])
  })
})

describe("missionHubLinks", () => {
  it("links the mission's values that are hubs", () => {
    const index = buildHubIndex(ROWS)
    expect(
      missionHubLinks(index, { giver: "Citizens For Prosperity", faction: null, type: "Mercenary", system: "Terra" }),
    ).toEqual({
      giver: { slug: "citizens-for-prosperity", name: "Citizens for Prosperity", mission_count: 23 },
      faction: undefined,
      type: { slug: "mercenary", name: "Mercenary", mission_count: 55 },
      system: undefined,
    })
  })
})

describe("hub SQL", () => {
  it("types fall back to a named category when career_type is missing", () => {
    expect(hubColumnSql("types")).toBe(
      "COALESCE(m.career_type, CASE m.category WHEN 'refueling' THEN 'Refueling' WHEN 'servicebeacon' THEN 'Service Beacon' END)",
    )
  })

  it("groups one version's missions by the four hub values", async () => {
    const real = knexFactory({ client: "pg" })
    let sql = ""
    const db = ((table: string) => {
      const builder = real(table)
      Object.assign(builder, {
        then(resolve: (rows: unknown[]) => unknown) {
          sql = builder.toString()
          return Promise.resolve(resolve([{ giver: "Vaughn", faction: "Vaughn", type: "Investigation", system: "Stanton", n: "3" }]))
        },
      })
      return builder
    }) as unknown as typeof real
    Object.assign(db, { raw: real.raw.bind(real) })

    const rows = await loadHubRows(db, "v1")
    expect(rows).toEqual([{ giver: "Vaughn", faction: "Vaughn", type: "Investigation", system: "Stanton", n: 3 }])
    expect(sql).toContain(`where "m"."version_id" = 'v1'`)
    expect(sql).toContain("group by 1, 2, 3, 4")
    expect(sql).toContain("m.reputation_reward_faction as faction")
  })
})
