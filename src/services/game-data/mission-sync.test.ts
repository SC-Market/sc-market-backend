/**
 * Mission import planning: missions keep their mission_id across imports
 * (completions and ratings reference it), unchanged imports write nothing,
 * dropped missions are deactivated, never deleted.
 */
import { describe, it, expect } from "vitest"
import type { P4KMission } from "./import.service.js"
import {
  MISSION_CHILD_TABLES,
  MISSION_COLUMNS,
  buildMissionChildren,
  buildMissionRecord,
  buildMissionRewardRows,
  emptyMissionChildren,
  planMissionSync,
  planRewardLinkSync,
  type ExistingMission,
  type IncomingMission,
  type MissionChildren,
  type RewardLinkRow,
} from "./mission-sync.js"

function p4kMission(
  overrides: Partial<P4KMission> & { name: string },
): P4KMission {
  return {
    id: `rec-${overrides.name}`,
    title: `Title ${overrides.name}`,
    titleKey: null,
    description: "Do the thing",
    missionGiver: "Hurston Dynamics",
    type: "Delivery",
    template: null,
    career: "Delivery",
    reward: { uec: 20000, max: 25000 },
    reputationRewards: [
      {
        faction: "f",
        factionName: "Hurston",
        scope: "rep_scope",
        reward: "r",
        amount: 1000,
      },
    ],
    blueprintRewards: null,
    minStanding: { code: "s1", displayName: "Applicant", xp: 0 },
    maxStanding: null,
    canBeShared: true,
    notForRelease: false,
    workInProgress: false,
    onceOnly: false,
    canReacceptAfterFailing: true,
    canReacceptAfterAbandoning: null,
    abandonedCooldownTime: 123.456789,
    personalCooldownTime: null,
    deadline: 0.1,
    availableInPrison: false,
    hideInMobiGlas: false,
    illegal: false,
    lawful: true,
    starSystem: "Stanton",
    acceptLocations: ["Lorville", "Area18"],
    tokenSubstitutions: { b: "2", a: "1" },
    timeToComplete: 1800.5,
    shipEncounters: [
      {
        role: "Enemy Ships",
        alignment: "hostile",
        waves: [{ name: "Wave 1", minShips: 2, maxShips: 4 }],
        shipPool: ["Cutlass", "Arrow"],
      },
    ],
    npcEncounters: [{ name: "Squad A", count: 3 }],
    haulingOrders: [{ resource: "Gold", minSCU: 4, maxSCU: 8 }],
    ...overrides,
  }
}

function incoming(m: P4KMission): IncomingMission {
  return {
    code: m.name,
    record: buildMissionRecord(m, "delivery"),
    children: buildMissionChildren(m),
  }
}

/**
 * The row as pg hands it back: bigint/decimal as strings, real as its
 * shortest float4 text, jsonb parsed with its own key order. The planner
 * must see this as identical to the record it came from.
 */
function asStoredValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (column === "credit_reward_min" || column === "credit_reward_max")
    return String(value)
  if (MISSION_COLUMNS[column] === "real")
    return Number(Math.fround(value as number).toPrecision(8))
  if (MISSION_COLUMNS[column] === "json")
    return reverseKeys(JSON.parse(JSON.stringify(value)))
  return value
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([k, v]) => [k, reverseKeys(v)]),
    )
  }
  return value
}

function storedChildren(children: MissionChildren): MissionChildren {
  const out = emptyMissionChildren()
  for (const kind of Object.keys(children) as Array<keyof MissionChildren>) {
    // Stored order is arbitrary (no ORDER BY): reverse it.
    out[kind] = [...children[kind]].reverse().map((row) => ({
      mission_id: "ignored",
      ...(reverseKeys(row) as Record<string, unknown>),
    }))
  }
  return out
}

function stored(
  m: P4KMission,
  missionId: string,
  isActive = true,
): ExistingMission {
  const inc = incoming(m)
  const values: Record<string, unknown> = {
    mission_id: missionId,
    is_active: isActive,
  }
  for (const [column, value] of Object.entries(inc.record))
    values[column] = asStoredValue(column, value)
  return {
    mission_id: missionId,
    mission_code: m.name,
    is_active: isActive,
    values,
    children: storedChildren(inc.children),
  }
}

const A = p4kMission({ name: "PU_Delivery_A" })
const B = p4kMission({
  name: "PU_Bounty_B",
  type: "Bounty",
  reward: { uec: 30000000, max: 30000001 },
})
const C = p4kMission({
  name: "PU_Salvage_C",
  shipEncounters: undefined,
  haulingOrders: undefined,
})

describe("planMissionSync", () => {
  it("an unchanged import plans zero writes", () => {
    const plan = planMissionSync([A, B, C].map(incoming), [
      stored(A, "id-a"),
      stored(B, "id-b"),
      stored(C, "id-c"),
    ])
    expect(plan.inserts).toEqual([])
    expect(plan.updates).toEqual([])
    expect(plan.deactivations).toEqual([])
    expect(plan.unchanged).toBe(3)
    expect(plan.duplicateCodes).toEqual([])
  })

  it("a first import inserts every mission", () => {
    const plan = planMissionSync([A, B].map(incoming), [])
    expect(plan.inserts.map((m) => m.code)).toEqual([
      "PU_Delivery_A",
      "PU_Bounty_B",
    ])
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toBe(0)
  })

  it("a changed field updates only that column of that mission, keeping its id", () => {
    const changedA = p4kMission({
      name: "PU_Delivery_A",
      reward: { uec: 20000, max: 26000 },
    })
    const plan = planMissionSync([changedA, B].map(incoming), [
      stored(A, "id-a"),
      stored(B, "id-b"),
    ])
    expect(plan.inserts).toEqual([])
    expect(plan.deactivations).toEqual([])
    expect(plan.unchanged).toBe(1)
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toMatchObject({
      missionId: "id-a",
      code: "PU_Delivery_A",
      changes: { credit_reward_max: 26000 },
      reactivate: false,
      childKinds: [],
    })
  })

  it("a changed child table is the only one replaced", () => {
    const changedA = p4kMission({
      name: "PU_Delivery_A",
      npcEncounters: [{ name: "Squad A", count: 4 }],
    })
    const plan = planMissionSync([incoming(changedA)], [stored(A, "id-a")])
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].changes).toEqual({})
    expect(plan.updates[0].childKinds).toEqual(["npcs"])
    expect(plan.updates[0].missionId).toBe("id-a")
  })

  it("a mission missing from the import is deactivated, not deleted", () => {
    const plan = planMissionSync([A].map(incoming), [
      stored(A, "id-a"),
      stored(B, "id-b"),
    ])
    expect(plan.deactivations).toEqual([
      { missionId: "id-b", code: "PU_Bounty_B" },
    ])
    expect(plan.inserts).toEqual([])
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it("an already inactive mission still missing is left alone", () => {
    const plan = planMissionSync([A].map(incoming), [
      stored(A, "id-a"),
      stored(B, "id-b", false),
    ])
    expect(plan.deactivations).toEqual([])
    expect(plan.updates).toEqual([])
  })

  it("a re-added mission is reactivated with the same id", () => {
    const plan = planMissionSync([A, B].map(incoming), [
      stored(A, "id-a"),
      stored(B, "id-b", false),
    ])
    expect(plan.inserts).toEqual([])
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toMatchObject({
      missionId: "id-b",
      reactivate: true,
      changes: {},
      childKinds: [],
    })
  })

  it("a re-added mission that also changed is reactivated and updated in one write", () => {
    const changedB = p4kMission({
      name: "PU_Bounty_B",
      type: "Bounty",
      reward: { uec: 1, max: 2 },
    })
    const plan = planMissionSync(
      [incoming(changedB)],
      [stored(B, "id-b", false)],
    )
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toMatchObject({
      missionId: "id-b",
      reactivate: true,
      changes: { credit_reward_min: 1, credit_reward_max: 2 },
    })
  })

  it("duplicate codes in one import: the last one is used and the code is reported", () => {
    const first = p4kMission({ name: "PU_Delivery_A", description: "first" })
    const last = p4kMission({ name: "PU_Delivery_A", description: "last" })
    const plan = planMissionSync([first, B, last].map(incoming), [
      stored(B, "id-b"),
    ])
    expect(plan.duplicateCodes).toEqual(["PU_Delivery_A"])
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].record.mission_description).toBe("last")
    expect(plan.unchanged).toBe(1)
  })

  it("duplicate codes matching the stored (last) one plan no write", () => {
    const first = p4kMission({ name: "PU_Delivery_A", description: "first" })
    const plan = planMissionSync([first, A].map(incoming), [stored(A, "id-a")])
    expect(plan.duplicateCodes).toEqual(["PU_Delivery_A"])
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it("a code stored twice in one version is an error, not a guess", () => {
    expect(() =>
      planMissionSync([incoming(A)], [stored(A, "id-1"), stored(A, "id-2")]),
    ).toThrow(/share code PU_Delivery_A/)
  })

  it("a stored row missing an imported column counts as a change (no silent skip)", () => {
    const row = stored(A, "id-a")
    delete row.values.time_to_complete
    const plan = planMissionSync([incoming(A)], [row])
    expect(plan.updates[0].changes).toEqual({ time_to_complete: 1800.5 })
  })
})

describe("buildMissionRecord / buildMissionChildren", () => {
  it("every record column has a declared kind", () => {
    expect(Object.keys(buildMissionRecord(A, "delivery")).sort()).toEqual(
      Object.keys(MISSION_COLUMNS).sort(),
    )
  })

  it("keeps jsonb values native and rounds integer columns", () => {
    const r = buildMissionRecord(
      p4kMission({
        name: "X",
        minStanding: { code: "s", displayName: "d", xp: 2.6 },
      }),
      "c",
    )
    expect(r.accept_locations).toEqual(["Lorville", "Area18"])
    expect(r.min_standing_xp).toBe(3)
    expect(r.credit_reward_min).toBe(20000)
    expect(r.mission_name).toBe("Title X")
  })

  it("child rows: first of each key, alignment default, ship_pool null when empty", () => {
    const children = buildMissionChildren(
      p4kMission({
        name: "X",
        shipEncounters: [
          { role: "R", alignment: "" as "neutral", waves: [], shipPool: [] },
          { role: "R", alignment: "hostile", waves: [], shipPool: ["dup"] },
        ],
        npcEncounters: [
          { name: "N", count: 1 },
          { name: "N", count: 9 },
        ],
      }),
    )
    expect(children.ships).toEqual([
      { role: "R", alignment: "neutral", waves: [], ship_pool: null },
    ])
    expect(children.npcs).toEqual([{ name: "N", count: 1 }])
    for (const kind of Object.keys(children) as Array<keyof MissionChildren>) {
      for (const row of children[kind]) {
        expect(Object.keys(row).sort()).toEqual(
          Object.keys(MISSION_CHILD_TABLES[kind].columns).sort(),
        )
      }
    }
  })
})

describe("reward links", () => {
  const bpIds = new Map([
    ["bp-code-1", "bp-1"],
    ["bp-code-2", "bp-2"],
  ])
  const withRewards = p4kMission({
    name: "PU_Delivery_A",
    blueprintRewards: [
      {
        blueprintId: "bp-code-1",
        blueprint: "x",
        weight: 1,
        totalWeight: 3,
        chance: 0.5,
        poolName: "P1",
      },
      {
        blueprintId: "bp-code-2",
        blueprint: "y",
        weight: 2,
        totalWeight: 3,
        chance: 0.5,
        poolName: "P2",
      },
      {
        blueprintId: "bp-code-1",
        blueprint: "x",
        weight: 1,
        totalWeight: 3,
        chance: 0.5,
        poolName: "P1",
      },
      {
        blueprintId: "unknown",
        blueprint: "z",
        weight: 1,
        totalWeight: 1,
        chance: 1,
        poolName: "P3",
      },
    ],
  })

  it("builds one row per known blueprint", () => {
    const rows = buildMissionRewardRows(withRewards, "id-a", bpIds)
    expect(
      rows.map((r) => [r.blueprint_id, r.reward_pool_id, r.drop_probability]),
    ).toEqual([
      ["bp-1", 1, 16.67],
      ["bp-2", 2, 33.33],
    ])
  })

  it("unchanged links plan no write (decimal columns come back as strings)", () => {
    const desired = buildMissionRewardRows(withRewards, "id-a", bpIds)
    const storedRows: RewardLinkRow[] = desired.map((r) => ({
      ...r,
      pool_chance: Number(r.pool_chance).toFixed(2),
      drop_probability: Number(r.drop_probability).toFixed(2),
    }))
    expect(planRewardLinkSync(storedRows, desired)).toEqual({
      inserts: [],
      updates: [],
      deletes: [],
    })
  })

  it("adds, changes and removes only what differs", () => {
    const desired = buildMissionRewardRows(withRewards, "id-a", bpIds)
    const storedRows: RewardLinkRow[] = [
      { ...desired[0], drop_probability: "10.00" },
      { ...desired[0], blueprint_id: "bp-old" },
    ]
    const plan = planRewardLinkSync(storedRows, desired)
    expect(plan.inserts.map((r) => r.blueprint_id)).toEqual(["bp-2"])
    expect(plan.updates).toEqual([
      {
        mission_id: "id-a",
        blueprint_id: "bp-1",
        changes: { drop_probability: 16.67 },
      },
    ])
    expect(plan.deletes).toEqual([
      { mission_id: "id-a", blueprint_id: "bp-old" },
    ])
  })
})
