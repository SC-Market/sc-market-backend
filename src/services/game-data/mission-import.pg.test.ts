/**
 * The mission and blueprint imports on the FULL schema: re-importing keeps
 * every mission_id/blueprint_id, so mission_completions and mission_ratings
 * survive; an unchanged import writes nothing (updated_at, the sitemap
 * lastmod, stays); a dropped mission is deactivated, never deleted; and the
 * user-data foreign keys refuse a delete instead of cascading.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"
import type { P4KMission, P4KRawBlueprint } from "./import.service.js"

process.env.TZ = "UTC"

const DB = "pgtest_mission_import"
const state: { db: Knex | null } = { db: null }

vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { gameDataImportService: svc } = await import("./import.service.js")

const VERSION = "a0000000-0000-4000-8000-000000000001"
const USER = "b0000000-0000-4000-8000-000000000001"
const ITEM = "c0000000-0000-4000-8000-000000000001"
const ORE = "c0000000-0000-4000-8000-000000000002"

function db() {
  return state.db!
}

function mission(
  name: string,
  overrides: Partial<P4KMission> = {},
): P4KMission {
  return {
    id: `rec-${name}`,
    name,
    title: `Title ${name}`,
    titleKey: null,
    description: "desc",
    missionGiver: "Hurston Dynamics",
    type: "Delivery",
    template: null,
    career: "Delivery",
    reward: { uec: 30000000, max: 30000000 },
    reputationRewards: [
      {
        faction: "f",
        factionName: "Hurston",
        scope: "s",
        reward: "r",
        amount: 100,
      },
    ],
    blueprintRewards: [
      {
        blueprintId: "bp-1",
        blueprint: "BP One",
        weight: 1,
        totalWeight: 3,
        chance: 0.5,
        poolName: "P",
      },
    ],
    minStanding: null,
    maxStanding: null,
    canBeShared: true,
    notForRelease: false,
    workInProgress: false,
    onceOnly: false,
    canReacceptAfterFailing: null,
    canReacceptAfterAbandoning: null,
    abandonedCooldownTime: 123.456789,
    personalCooldownTime: null,
    deadline: 0.1,
    availableInPrison: false,
    hideInMobiGlas: false,
    illegal: false,
    starSystem: "Stanton",
    acceptLocations: ["Lorville"],
    tokenSubstitutions: { b: "2", a: "1" },
    timeToComplete: 1800.5,
    shipEncounters: [
      {
        role: "Enemy",
        alignment: "hostile",
        waves: [{ name: "W", minShips: 1, maxShips: 2 }],
      },
    ],
    npcEncounters: [{ name: "Squad", count: 3 }],
    haulingOrders: [{ resource: "Gold", minSCU: 1, maxSCU: 2 }],
    entitySpawns: [{ name: "Box", count: 2 }],
    ...overrides,
  }
}

const BLUEPRINT: P4KRawBlueprint = {
  id: "bp-1",
  name: "BP One",
  category: "Weapons",
  craftedItem: "bp_output_item",
  craftTimeSeconds: 90,
  slots: [
    {
      type: "slot",
      name: "frame",
      displayName: "Frame",
      ingredients: [
        { type: "resource", resource: "Iron Ore", quantity_scu: 0.5 },
      ],
      modifiers: [
        {
          property: "dmg",
          startQuality: 0,
          endQuality: 1000,
          modifierAtStart: 0.9,
          modifierAtEnd: 1.1,
        },
      ],
    },
  ],
  optionalCosts: [],
} as P4KRawBlueprint

async function importAll(
  missions: P4KMission[],
  blueprints: P4KRawBlueprint[] = [BLUEPRINT],
) {
  const bp = await svc.importBlueprints(db(), { blueprints }, VERSION)
  const m = await svc.importMissions(db(), { missions }, VERSION, "4.0-test")
  await svc.linkMissionRewards(db(), { missions }, VERSION)
  return { bp, m }
}

async function missionRows() {
  const rows: Array<{
    mission_id: string
    mission_code: string
    is_active: boolean
    removed_in_version: string | null
    updated_at: Date
  }> = await db()("missions")
    .where("version_id", VERSION)
    .select(
      "mission_id",
      "mission_code",
      "is_active",
      "removed_in_version",
      "updated_at",
    )
    .orderBy("mission_code")
  return Object.fromEntries(rows.map((r) => [r.mission_code, r]))
}

describe.skipIf(!PG_TEST_URL)(
  "mission import keeps identity (real SQL)",
  () => {
    beforeAll(async () => {
      const conn = await createTestDatabase(DB)
      await buildSchema(conn)
      state.db = knexFactory({
        client: "pg",
        connection: conn,
        pool: { min: 0, max: 4 },
      })
      await db()("game_versions").insert({
        version_id: VERSION,
        version_type: "LIVE",
        version_number: "4.0-test",
        is_active: true,
      })
      await db()("accounts").insert({
        user_id: USER,
        username: "mi_user",
        display_name: "MI User",
      })
      await db()("game_items").insert([
        {
          id: ITEM,
          name: "MI Output Item",
          type: "Other",
          p4k_file: "bp_output_item",
        },
        { id: ORE, name: "Iron Ore", type: "Commodity" },
      ])
    }, 240_000)

    afterAll(async () => {
      await state.db?.destroy()
      await dropTestDatabase(DB)
    })

    it("re-imports keep mission ids, user data, and updated_at when nothing changed", async () => {
      const first = await importAll([
        mission("M_A"),
        mission("M_B"),
        mission("M_C"),
      ])
      expect(first.m).toMatchObject({
        inserted: 3,
        updated: 0,
        unchanged: 0,
        deactivated: 0,
      })
      expect(first.bp).toMatchObject({ inserted: 1 })
      const before = await missionRows()

      await db()("mission_completions").insert({
        user_id: USER,
        mission_id: before.M_A.mission_id,
      })
      await db()("mission_ratings").insert({
        user_id: USER,
        mission_id: before.M_B.mission_id,
        difficulty_rating: 3,
        satisfaction_rating: 4,
      })
      // The ratings trigger touches updated_at; read the baseline after it.
      const baseline = await missionRows()
      const bpBaseline = await db()("blueprints")
        .where("version_id", VERSION)
        .first("blueprint_id", "updated_at")
      const linksBefore = await db()("mission_blueprint_rewards")
        .select("reward_id")
        .orderBy("reward_id")

      const second = await importAll([
        mission("M_A"),
        mission("M_B"),
        mission("M_C"),
      ])
      expect(second.m).toMatchObject({
        inserted: 0,
        updated: 0,
        unchanged: 3,
        deactivated: 0,
      })
      expect(second.bp).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 })

      const after = await missionRows()
      for (const code of ["M_A", "M_B", "M_C"]) {
        expect(after[code].mission_id).toBe(baseline[code].mission_id)
        expect(after[code].updated_at.getTime()).toBe(
          baseline[code].updated_at.getTime(),
        )
      }
      const bpAfter = await db()("blueprints")
        .where("version_id", VERSION)
        .first("blueprint_id", "updated_at")
      expect(bpAfter).toEqual(bpBaseline)
      expect(
        await db()("mission_blueprint_rewards")
          .select("reward_id")
          .orderBy("reward_id"),
      ).toEqual(linksBefore)
      expect(await db()("mission_completions").count("* as n").first()).toEqual(
        { n: "1" },
      )
      expect(await db()("mission_ratings").count("* as n").first()).toEqual({
        n: "1",
      })
    })

    it("a changed mission is updated in place; only its updated_at moves", async () => {
      const before = await missionRows()
      const result = await importAll([
        mission("M_A", { description: "changed" }),
        mission("M_B"),
        mission("M_C", { npcEncounters: [{ name: "Squad", count: 4 }] }),
      ])
      expect(result.m).toMatchObject({ inserted: 0, updated: 2, unchanged: 1 })
      const after = await missionRows()
      expect(after.M_A.mission_id).toBe(before.M_A.mission_id)
      expect(after.M_A.updated_at.getTime()).toBeGreaterThan(
        before.M_A.updated_at.getTime(),
      )
      expect(after.M_B.updated_at.getTime()).toBe(
        before.M_B.updated_at.getTime(),
      )
      const npc = await db()("mission_npc_encounters")
        .where("mission_id", before.M_C.mission_id)
        .select("count")
      expect(npc).toEqual([{ count: 4 }])
    })

    it("a dropped mission is deactivated with its user data; re-adding reactivates the same id", async () => {
      const before = await missionRows()
      const dropped = await importAll([
        mission("M_A", { description: "changed" }),
        mission("M_C", { npcEncounters: [{ name: "Squad", count: 4 }] }),
      ])
      expect(dropped.m).toMatchObject({ deactivated: 1, unchanged: 2 })
      const mid = await missionRows()
      expect(mid.M_B).toMatchObject({
        mission_id: before.M_B.mission_id,
        is_active: false,
        removed_in_version: "4.0-test",
      })
      expect(
        await db()("mission_ratings")
          .where("mission_id", before.M_B.mission_id)
          .count("* as n")
          .first(),
      ).toEqual({
        n: "1",
      })

      const back = await importAll([
        mission("M_A", { description: "changed" }),
        mission("M_B"),
        mission("M_C", { npcEncounters: [{ name: "Squad", count: 4 }] }),
      ])
      expect(back.m).toMatchObject({
        inserted: 0,
        reactivated: 1,
        deactivated: 0,
      })
      const after = await missionRows()
      expect(after.M_B).toMatchObject({
        mission_id: before.M_B.mission_id,
        is_active: true,
        removed_in_version: null,
      })
    })

    it("deleting a mission or blueprint with user data is refused, not cascaded", async () => {
      const rows = await missionRows()
      await expect(
        db()("missions").where("mission_id", rows.M_A.mission_id).delete(),
      ).rejects.toThrow(/foreign key/)
      const bp = await db()("blueprints")
        .where("version_id", VERSION)
        .first("blueprint_id")
      await db()("user_blueprint_inventory").insert({
        user_id: USER,
        blueprint_id: bp.blueprint_id,
      })
      await expect(
        db()("blueprints").where("blueprint_id", bp.blueprint_id).delete(),
      ).rejects.toThrow(/foreign key/)
      expect(await db()("mission_completions").count("* as n").first()).toEqual(
        { n: "1" },
      )
    })
  },
)
